/**
 * Consultas del catálogo. SÓLO lee read_model (proyecciones). Las columnas
 * pesadas (indicaciones/contraindicaciones) no se traen en la búsqueda: se
 * cargan bajo demanda y en lote con el DataLoader clinicalInfoByMedicationId.
 */
import { query } from '../db/pool.js';
import { normalizeSearchText } from '../db/text.js';
import type { CategoryView, ClinicalInfoView, LaboratoryView, MedicationView } from './views.js';

const CARD_COLUMNS = `id, sku, commercial_name, active_ingredient, concentration, dosage_form, presentation,
  price::text as price, requires_prescription, availability, stock_available, laboratory_id, category_id, updated_at`;

interface MedicationRow {
  id: string;
  sku: string;
  commercial_name: string;
  active_ingredient: string;
  concentration: string;
  dosage_form: string;
  presentation: string;
  price: string;
  requires_prescription: boolean;
  availability: MedicationView['availability'];
  stock_available: number;
  laboratory_id: string;
  category_id: string;
  updated_at: Date;
}

const toMedication = (row: MedicationRow): MedicationView => ({
  id: row.id,
  sku: row.sku,
  commercialName: row.commercial_name,
  activeIngredient: row.active_ingredient,
  concentration: row.concentration,
  dosageForm: row.dosage_form,
  presentation: row.presentation,
  price: row.price,
  requiresPrescription: row.requires_prescription,
  availability: row.availability,
  stockAvailable: row.stock_available,
  laboratoryId: row.laboratory_id,
  categoryId: row.category_id,
  updatedAt: row.updated_at,
});

export interface MedicationSearch {
  filter?: {
    search?: string | null;
    activeIngredient?: string | null;
    categoryId?: string | null;
    laboratoryId?: string | null;
    requiresPrescription?: boolean | null;
    onlyAvailable?: boolean | null;
  } | null;
  sort?: { field: 'NAME' | 'PRICE' | 'STOCK'; direction: 'ASC' | 'DESC' } | null;
  limit: number;
  offset: number;
}

const SORT_COLUMNS = { NAME: 'commercial_name', PRICE: 'price', STOCK: 'stock_available' } as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string) => UUID_RE.test(value);

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);

export const catalogReadRepository = {
  async search({ filter, sort, limit, offset }: MedicationSearch) {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: (placeholder: string) => string, value: unknown) => {
      params.push(value);
      where.push(sql(`$${params.length}`));
    };

    // Cada término debe aparecer (AND) en el texto normalizado => índice GIN trigram.
    for (const term of normalizeSearchText(filter?.search ?? '').split(' ').filter(Boolean)) {
      add((p) => `search_text like ${p}`, `%${escapeLike(term)}%`);
    }
    if (filter?.activeIngredient?.trim()) {
      add((p) => `lower(active_ingredient) like ${p}`, `%${escapeLike(filter.activeIngredient.trim().toLowerCase())}%`);
    }
    if (filter?.categoryId) {
      if (!isUuid(filter.categoryId)) return { rows: [], totalCount: 0 };
      add((p) => `category_id = ${p}`, filter.categoryId);
    }
    if (filter?.laboratoryId) {
      if (!isUuid(filter.laboratoryId)) return { rows: [], totalCount: 0 };
      add((p) => `laboratory_id = ${p}`, filter.laboratoryId);
    }
    if (typeof filter?.requiresPrescription === 'boolean') {
      add((p) => `requires_prescription = ${p}`, filter.requiresPrescription);
    }
    if (filter?.onlyAvailable) where.push("availability <> 'OUT_OF_STOCK'");

    const column = SORT_COLUMNS[sort?.field ?? 'NAME'];
    const direction = sort?.direction === 'DESC' ? 'desc' : 'asc';
    params.push(limit, offset);

    const { rows } = await query<MedicationRow & { total_count: number }>(
      `select ${CARD_COLUMNS}, count(*) over()::int as total_count
       from read_model.medication_catalog
       ${where.length ? `where ${where.join(' and ')}` : ''}
       order by ${column} ${direction}, id
       limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    let totalCount = rows[0]?.total_count ?? 0;
    if (rows.length === 0 && offset > 0) {
      const { rows: countRows } = await query<{ total: number }>(
        `select count(*)::int as total from read_model.medication_catalog ${where.length ? `where ${where.join(' and ')}` : ''}`,
        params.slice(0, -2),
      );
      totalCount = countRows[0].total;
    }
    return { rows: rows.map(toMedication), totalCount };
  },

  async findByIds(ids: readonly string[]): Promise<MedicationView[]> {
    const { rows } = await query<MedicationRow>(
      `select ${CARD_COLUMNS} from read_model.medication_catalog where id = any($1::uuid[])`,
      [ids],
    );
    return rows.map(toMedication);
  },

  async clinicalInfoByIds(ids: readonly string[]): Promise<(ClinicalInfoView & { id: string })[]> {
    const { rows } = await query<{ id: string; indications: string; contraindications: string }>(
      'select id, indications, contraindications from read_model.medication_catalog where id = any($1::uuid[])',
      [ids],
    );
    return rows;
  },

  /** Relación 1:N en lote: los N primeros medicamentos de cada laboratorio. */
  async byLaboratoryIds(ids: readonly string[], perLaboratory: number): Promise<MedicationView[]> {
    const { rows } = await query<MedicationRow>(
      `select ${CARD_COLUMNS} from (
         select *, row_number() over (partition by laboratory_id order by commercial_name) as rn
         from read_model.medication_catalog
         where laboratory_id = any($1::uuid[])
       ) ranked
       where rn <= $2
       order by commercial_name`,
      [ids, perLaboratory],
    );
    return rows.map(toMedication);
  },

  async laboratoriesByIds(ids: readonly string[]): Promise<LaboratoryView[]> {
    const { rows } = await query<LaboratoryView>(
      'select id, name, country from read_model.laboratory_view where id = any($1::uuid[])',
      [ids],
    );
    return rows;
  },

  async categoriesByIds(ids: readonly string[]): Promise<CategoryView[]> {
    const { rows } = await query<{ id: string; name: string; slug: string; description: string | null; medication_count: number }>(
      'select id, name, slug, description, medication_count from read_model.category_view where id = any($1::uuid[])',
      [ids],
    );
    return rows.map((row) => ({ ...row, medicationCount: row.medication_count }));
  },

  async listLaboratories(): Promise<LaboratoryView[]> {
    const { rows } = await query<LaboratoryView>('select id, name, country from read_model.laboratory_view order by name');
    return rows;
  },

  async listCategories(): Promise<CategoryView[]> {
    const { rows } = await query<{ id: string; name: string; slug: string; description: string | null; medication_count: number }>(
      'select id, name, slug, description, medication_count from read_model.category_view order by name',
    );
    return rows.map((row) => ({ ...row, medicationCount: row.medication_count }));
  },
};
