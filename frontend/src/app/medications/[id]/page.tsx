'use client';

/**
 * Ficha técnica. Pide laboratorio, categoría e información clínica, que el
 * backend resuelve con DataLoaders. Si el medicamento ya estaba en caché (vino
 * del catálogo), la typePolicy Query.medication lo muestra de inmediato.
 */
import { useQuery } from '@apollo/client/react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AddToCartButton } from '@/components/AddToCartButton';
import { AvailabilityBadge, RxBadge } from '@/components/StatusBadge';
import { MEDICATION_DETAIL_QUERY } from '@/graphql/operations';
import { formatMoney } from '@/lib/format';

export default function MedicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error } = useQuery(MEDICATION_DETAIL_QUERY, { variables: { id } });
  const medication = data?.medication;

  if (error) return <div className="alert alert-error">Error: {error.message}</div>;
  if (loading && !medication) return <p className="muted">Cargando ficha técnica…</p>;
  if (!medication) {
    return (
      <div className="empty">
        Medicamento no encontrado. <Link href="/">Volver al catálogo</Link>
      </div>
    );
  }

  return (
    <article className="detail">
      <Link href="/" className="back">
        ← Catálogo
      </Link>
      <div className="detail-grid">
        <div className="card">
          <div className="card-badges">
            <AvailabilityBadge availability={medication.availability} stock={medication.stockAvailable} />
            {medication.requiresPrescription && <RxBadge />}
          </div>
          <h1>{medication.commercialName}</h1>
          <p className="muted">
            {medication.activeIngredient} · {medication.concentration}
          </p>
          <p className="price big">{formatMoney(medication.price)}</p>
          {medication.requiresPrescription && (
            <div className="alert alert-warning">
              Este medicamento requiere <strong>fórmula médica</strong>. Te pediremos sus datos al confirmar el
              pedido; la orden quedará pendiente hasta que el químico farmacéutico la verifique.
            </div>
          )}
          <AddToCartButton medicationId={medication.id} disabled={medication.availability === 'OUT_OF_STOCK'} />
        </div>

        <div className="card">
          <h2>Ficha técnica</h2>
          <dl className="specs">
            <dt>SKU</dt>
            <dd>{medication.sku}</dd>
            <dt>Principio activo</dt>
            <dd>{medication.activeIngredient}</dd>
            <dt>Concentración</dt>
            <dd>{medication.concentration}</dd>
            <dt>Forma farmacéutica</dt>
            <dd>{medication.dosageForm}</dd>
            <dt>Presentación</dt>
            <dd>{medication.presentation}</dd>
            <dt>Laboratorio</dt>
            <dd>
              {medication.laboratory.name} ({medication.laboratory.country})
            </dd>
            <dt>Categoría terapéutica</dt>
            <dd>{medication.category.name}</dd>
            <dt>Venta</dt>
            <dd>{medication.requiresPrescription ? 'Bajo fórmula médica' : 'Libre (OTC)'}</dd>
          </dl>
          <h3>Indicaciones</h3>
          <p>{medication.clinicalInfo.indications}</p>
          <h3>Contraindicaciones</h3>
          <p>{medication.clinicalInfo.contraindications}</p>
        </div>
      </div>
    </article>
  );
}
