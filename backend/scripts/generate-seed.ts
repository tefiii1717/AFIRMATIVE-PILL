/**
 * Genera supabase/seed.sql a partir de supabase/dataset/medications.csv.
 *
 *   npm run db:generate-seed                     # usa el CSV por defecto
 *   npm run db:generate-seed -- ruta/al/otro.csv # usa el dataset oficial del taller
 *
 * El seed resultante es SQL puro e idempotente: puede ejecutarse con
 * `npm run db:seed`, con `supabase db reset` o pegándolo en el SQL Editor de
 * Supabase. Además de poblar el write_model, reconstruye las proyecciones del
 * read_model (catálogo, laboratorios y categorías).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './csv.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// INIT_CWD: directorio desde el que se invocó npm (permite rutas relativas desde la raíz).
const csvPath = process.argv[2]
  ? resolve(process.env.INIT_CWD ?? process.cwd(), process.argv[2])
  : resolve(root, 'supabase/dataset/medications.csv');
const outPath = resolve(root, 'supabase/seed.sql');

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'Analgésicos y antipiréticos': 'Alivio del dolor y control de la fiebre.',
  'Antiinflamatorios no esteroideos': 'AINE para dolor e inflamación.',
  'Cardiovascular - antiagregantes': 'Prevención de eventos trombóticos arteriales.',
  Gastrointestinales: 'Acidez, reflujo, espasmos y trastornos digestivos.',
  Antibióticos: 'Tratamiento de infecciones bacterianas. Requieren fórmula médica.',
  Antihipertensivos: 'Control de la presión arterial.',
  Antidiabéticos: 'Control glucémico en diabetes mellitus.',
  Hipolipemiantes: 'Control del colesterol y los triglicéridos.',
  Antihistamínicos: 'Manejo de alergias y urticaria.',
  Respiratorios: 'Asma, EPOC y enfermedades de las vías respiratorias.',
  'Sistema nervioso central': 'Antidepresivos, ansiolíticos y anticonvulsivantes.',
  Anticoagulantes: 'Prevención y tratamiento de trombosis venosa.',
  'Hormonas y tiroides': 'Terapia hormonal y corticoides.',
  'Vitaminas y suplementos': 'Suplementación vitamínica y mineral.',
  Dermatológicos: 'Tratamientos tópicos para afecciones de la piel.',
};

// Acepta nombres de columna alternativos para poder cargar el dataset oficial
// aunque sus encabezados difieran ligeramente.
const ALIASES: Record<string, string[]> = {
  sku: ['sku', 'codigo', 'code', 'id'],
  commercial_name: ['commercial_name', 'nombre_comercial', 'name', 'nombre'],
  active_ingredient: ['active_ingredient', 'principio_activo'],
  concentration: ['concentration', 'concentracion'],
  dosage_form: ['dosage_form', 'forma_farmaceutica'],
  presentation: ['presentation', 'presentacion'],
  laboratory: ['laboratory', 'laboratorio'],
  laboratory_country: ['laboratory_country', 'pais_laboratorio', 'pais'],
  category: ['category', 'categoria', 'categoria_terapeutica', 'therapeutic_category'],
  price: ['price', 'precio'],
  stock: ['stock', 'inventario'],
  requires_prescription: ['requires_prescription', 'requiere_formula', 'requiere_prescripcion'],
  indications: ['indications', 'indicaciones'],
  contraindications: ['contraindications', 'contraindicaciones'],
};

function pick(row: Record<string, string>, key: string, fallback = ''): string {
  for (const alias of ALIASES[key] ?? [key]) {
    if (row[alias] !== undefined && row[alias] !== '') return row[alias];
  }
  return fallback;
}

const sql = (value: string) => `'${value.replace(/'/g, "''")}'`;
const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
/** '12900', '12900.50', '$ 12.900', '12.900,50' -> número. */
function parsePrice(raw: string): number {
  const value = raw.replace(/[$\s]/g, '');
  if (/^\d+(\.\d{1,2})?$/.test(value)) return Number.parseFloat(value);
  return Number.parseFloat(value.replace(/\./g, '').replace(',', '.'));
}
const truthy = (value: string) => ['true', 't', '1', 'si', 'sí', 'yes', 'x'].includes(value.toLowerCase());

const rows = parseCsv(readFileSync(csvPath, 'utf8'));
if (rows.length === 0) throw new Error(`El dataset ${csvPath} está vacío`);

const medications = rows.map((row, index) => {
  const price = parsePrice(pick(row, 'price'));
  const stock = Number.parseInt(pick(row, 'stock', '0'), 10);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`Precio inválido en la fila ${index + 2}`);
  if (!Number.isInteger(stock) || stock < 0) throw new Error(`Stock inválido en la fila ${index + 2}`);
  return {
    sku: pick(row, 'sku', `AP-${String(index + 1).padStart(3, '0')}`),
    commercialName: pick(row, 'commercial_name'),
    activeIngredient: pick(row, 'active_ingredient'),
    concentration: pick(row, 'concentration', 'N/A'),
    dosageForm: pick(row, 'dosage_form', 'N/A'),
    presentation: pick(row, 'presentation', 'N/A'),
    laboratory: pick(row, 'laboratory', 'Sin laboratorio'),
    laboratoryCountry: pick(row, 'laboratory_country', 'N/D'),
    category: pick(row, 'category', 'General'),
    price,
    stock,
    requiresPrescription: truthy(pick(row, 'requires_prescription', 'false')),
    indications: pick(row, 'indications'),
    contraindications: pick(row, 'contraindications'),
  };
});

const laboratories = new Map(medications.map((m) => [m.laboratory, m.laboratoryCountry]));
const categories = [...new Set(medications.map((m) => m.category))];

const out: string[] = [];
out.push(`-- =============================================================================
-- Afirmative Pill · SEED (generado por backend/scripts/generate-seed.ts)
-- Fuente: ${csvPath.replace(root + '/', '')} (${medications.length} medicamentos)
-- NO editar a mano: modifica el CSV y ejecuta \`npm run db:generate-seed\`.
-- =============================================================================

begin;

-- 1. WRITE MODEL ---------------------------------------------------------------
insert into write_model.laboratories (name, country) values
${[...laboratories].map(([name, country]) => `  (${sql(name)}, ${sql(country)})`).join(',\n')}
on conflict (name) do nothing;

insert into write_model.therapeutic_categories (name, slug, description) values
${categories.map((name) => `  (${sql(name)}, ${sql(slugify(name))}, ${sql(CATEGORY_DESCRIPTIONS[name] ?? name)})`).join(',\n')}
on conflict (name) do nothing;

insert into write_model.medications
  (sku, commercial_name, active_ingredient, concentration, dosage_form, presentation,
   laboratory_id, category_id, price, stock, requires_prescription, indications, contraindications)
select v.sku, v.commercial_name, v.active_ingredient, v.concentration, v.dosage_form, v.presentation,
       l.id, c.id, v.price, v.stock, v.requires_prescription, v.indications, v.contraindications
from (values
${medications
  .map(
    (m) =>
      `  (${[m.sku, m.commercialName, m.activeIngredient, m.concentration, m.dosageForm, m.presentation, m.laboratory, m.category]
        .map(sql)
        .join(', ')}, ${m.price.toFixed(2)}::numeric, ${m.stock}, ${m.requiresPrescription}, ${sql(m.indications)}, ${sql(m.contraindications)})`,
  )
  .join(',\n')}
) as v (sku, commercial_name, active_ingredient, concentration, dosage_form, presentation,
        laboratory, category, price, stock, requires_prescription, indications, contraindications)
join write_model.laboratories l on l.name = v.laboratory
join write_model.therapeutic_categories c on c.name = v.category
on conflict (sku) do nothing;

-- 2. READ MODEL (reconstrucción completa de las proyecciones de catálogo) -------
insert into read_model.laboratory_view (id, name, country)
select id, name, country from write_model.laboratories
on conflict (id) do update set name = excluded.name, country = excluded.country;

insert into read_model.category_view (id, name, slug, description, medication_count)
select c.id, c.name, c.slug, c.description, count(m.id)
from write_model.therapeutic_categories c
left join write_model.medications m on m.category_id = c.id
group by c.id
on conflict (id) do update set
  name = excluded.name, slug = excluded.slug,
  description = excluded.description, medication_count = excluded.medication_count;

insert into read_model.medication_catalog
  (id, sku, commercial_name, active_ingredient, concentration, dosage_form, presentation, price,
   stock_available, availability, requires_prescription, laboratory_id, category_id,
   indications, contraindications, search_text, updated_at)
select m.id, m.sku, m.commercial_name, m.active_ingredient, m.concentration, m.dosage_form,
       m.presentation, m.price, m.stock,
       case when m.stock = 0 then 'OUT_OF_STOCK' when m.stock <= 10 then 'LOW_STOCK' else 'IN_STOCK' end,
       m.requires_prescription, m.laboratory_id, m.category_id, m.indications, m.contraindications,
       -- Misma normalización que normalizeSearchText() en el backend.
       translate(lower(concat_ws(' ', m.commercial_name, m.active_ingredient, l.name, c.name, m.sku)),
                 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
       now()
from write_model.medications m
join write_model.laboratories l on l.id = m.laboratory_id
join write_model.therapeutic_categories c on c.id = m.category_id
on conflict (id) do update set
  price = excluded.price, stock_available = excluded.stock_available,
  availability = excluded.availability, search_text = excluded.search_text,
  updated_at = excluded.updated_at;

commit;
`);

writeFileSync(outPath, out.join('\n'));
console.log(`✔ seed.sql generado con ${medications.length} medicamentos, ${laboratories.size} laboratorios y ${categories.length} categorías.`);
