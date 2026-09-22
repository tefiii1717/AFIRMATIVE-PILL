'use client';

/**
 * Escenario A — Exploración eficiente del catálogo.
 * Query "Catalog": sólo pide los campos de la tarjeta (sin información clínica)
 * => respuesta liviana para redes móviles. Filtros facetados + paginación por
 * cursor con fetchMore (la typePolicy concatena páginas en la caché).
 */
import { useQuery, useSubscription } from '@apollo/client/react';
import { useEffect, useMemo, useState } from 'react';
import { MedicationCard } from '@/components/MedicationCard';
import { CATALOG_QUERY, CATEGORIES_QUERY, MEDICATION_STOCK_CHANGED, type CatalogVars } from '@/graphql/operations';

const PAGE_SIZE = 12;

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function CatalogPage() {
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [prescription, setPrescription] = useState<'all' | 'otc' | 'rx'>('all');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [sort, setSort] = useState('NAME:ASC');
  const debouncedSearch = useDebounced(search);

  const variables = useMemo<CatalogVars>(() => {
    const [field, direction] = sort.split(':') as [NonNullable<CatalogVars['sort']>['field'], 'ASC' | 'DESC'];
    return {
      filter: {
        search: debouncedSearch || undefined,
        categoryId: categoryId || undefined,
        requiresPrescription: prescription === 'all' ? undefined : prescription === 'rx',
        onlyAvailable,
      },
      sort: { field, direction },
      first: PAGE_SIZE,
    };
  }, [debouncedSearch, categoryId, prescription, onlyAvailable, sort]);

  const { data, loading, error, fetchMore } = useQuery(CATALOG_QUERY, { variables });
  const { data: categories } = useQuery(CATEGORIES_QUERY);
  // Stock en vivo: el resultado trae Medication {id, availability, stockAvailable}
  // y la caché normalizada actualiza cada tarjeta automáticamente.
  useSubscription(MEDICATION_STOCK_CHANGED);

  const connection = data?.medications;
  const [loadingMore, setLoadingMore] = useState(false);

  async function loadMore() {
    if (!connection?.pageInfo.endCursor) return;
    setLoadingMore(true);
    try {
      await fetchMore({ variables: { ...variables, after: connection.pageInfo.endCursor } });
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section>
      <div className="page-header">
        <h1>Catálogo de medicamentos</h1>
        <p className="muted">Busca por nombre comercial, principio activo, laboratorio o categoría terapéutica.</p>
      </div>

      <div className="filters card">
        <input
          className="input search"
          type="search"
          placeholder="Ej. acetaminofén, losartán, Genfar…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Buscar medicamentos"
        />
        <select className="input" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} aria-label="Categoría terapéutica">
          <option value="">Todas las categorías</option>
          {categories?.therapeuticCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name} ({category.medicationCount})
            </option>
          ))}
        </select>
        <select className="input" value={prescription} onChange={(event) => setPrescription(event.target.value as typeof prescription)} aria-label="Tipo de venta">
          <option value="all">Venta libre y con fórmula</option>
          <option value="otc">Sólo venta libre (OTC)</option>
          <option value="rx">Sólo con fórmula (Rx)</option>
        </select>
        <select className="input" value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Ordenar">
          <option value="NAME:ASC">Nombre A-Z</option>
          <option value="PRICE:ASC">Precio: menor a mayor</option>
          <option value="PRICE:DESC">Precio: mayor a menor</option>
          <option value="STOCK:DESC">Mayor disponibilidad</option>
        </select>
        <label className="checkbox">
          <input type="checkbox" checked={onlyAvailable} onChange={(event) => setOnlyAvailable(event.target.checked)} />
          Ocultar agotados
        </label>
      </div>

      {error && <div className="alert alert-error">Error consultando el catálogo: {error.message}</div>}
      {connection && (
        <p className="muted result-count">
          {connection.totalCount} medicamento(s) · mostrando {connection.edges.length}
        </p>
      )}
      {loading && !connection && <p className="muted">Cargando catálogo…</p>}

      <div className="grid">
        {connection?.edges.map(({ node }) => <MedicationCard key={node.id} medication={node} />)}
      </div>

      {connection && connection.edges.length === 0 && !loading && (
        <p className="empty">No encontramos medicamentos con esos filtros.</p>
      )}

      {connection?.pageInfo.hasNextPage && (
        <div className="center">
          <button className="btn" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? 'Cargando…' : 'Cargar más'}
          </button>
        </div>
      )}
    </section>
  );
}
