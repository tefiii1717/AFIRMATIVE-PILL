import Link from 'next/link';
import type { MedicationCardData } from '@/graphql/types';
import { formatMoney } from '@/lib/format';
import { AddToCartButton } from './AddToCartButton';
import { AvailabilityBadge, RxBadge } from './StatusBadge';

/** Vista condensada: sólo los campos del fragmento MedicationCard. */
export function MedicationCard({ medication }: { medication: MedicationCardData }) {
  const outOfStock = medication.availability === 'OUT_OF_STOCK';
  return (
    <article className="card medication-card">
      <div className="card-badges">
        <AvailabilityBadge availability={medication.availability} stock={medication.stockAvailable} />
        {medication.requiresPrescription && <RxBadge />}
      </div>
      <Link href={`/medications/${medication.id}`} className="medication-name">
        {medication.commercialName}
      </Link>
      <p className="muted">{medication.presentation}</p>
      <p className="price">{formatMoney(medication.price)}</p>
      <AddToCartButton medicationId={medication.id} disabled={outOfStock} compact />
    </article>
  );
}
