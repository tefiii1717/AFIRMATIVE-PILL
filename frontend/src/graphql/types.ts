/** Tipos TypeScript de las operaciones (espejo del schema SDL del backend). */
export type OrderStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'DISPATCHED' | 'CANCELLED';
export type StockAvailability = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
export type PrescriptionStatus = 'NOT_REQUIRED' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';

export interface MedicationCardData {
  __typename: 'Medication';
  id: string;
  commercialName: string;
  presentation: string;
  price: number;
  requiresPrescription: boolean;
  availability: StockAvailability;
  stockAvailable: number;
}

export interface MedicationDetailData extends MedicationCardData {
  sku: string;
  activeIngredient: string;
  concentration: string;
  dosageForm: string;
  laboratory: { __typename: 'Laboratory'; id: string; name: string; country: string };
  category: { __typename: 'TherapeuticCategory'; id: string; name: string };
  clinicalInfo: { __typename: 'ClinicalInformation'; indications: string; contraindications: string };
}

export interface UserErrorData {
  __typename: string;
  code: string;
  message: string;
  path: string[] | null;
  field?: string;
  requested?: number;
  available?: number;
  medication?: { id: string; commercialName: string };
  medications?: { id: string; commercialName: string }[];
  reason?: string;
}

export interface CartData {
  __typename: 'Cart';
  id: string;
  status: 'OPEN' | 'CHECKED_OUT';
  itemCount: number;
  subtotal: number;
  requiresPrescription: boolean;
  items: {
    __typename: 'CartItem';
    quantity: number;
    lineTotal: number;
    medication: MedicationCardData & { activeIngredient: string };
  }[];
}

export interface OrderReceiptData {
  __typename: 'OrderReceipt';
  orderId: string;
  status: OrderStatus;
  total: number;
  requiresPrescription: boolean;
  acceptedAt: string;
  eventVersion: number;
}

export interface OrderData {
  __typename: 'Order';
  id: string;
  status: OrderStatus;
  statusReason: string | null;
  total: number;
  itemCount: number;
  requiresPrescription: boolean;
  prescriptionStatus: PrescriptionStatus;
  prescriptionRejectionReason: string | null;
  placedAt: string;
  updatedAt: string;
  projectionVersion: number;
  customer: { fullName: string; email: string };
  prescription: { number: string; doctorName: string; doctorLicense: string; issuedAt: string } | null;
  items: {
    commercialName: string;
    presentation: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    medication: { __typename: 'Medication'; id: string; availability: StockAvailability };
  }[];
  timeline: { status: OrderStatus; note: string | null; occurredAt: string }[];
}

export interface OrderRowData {
  __typename: 'Order';
  id: string;
  status: OrderStatus;
  total: number;
  itemCount: number;
  requiresPrescription: boolean;
  prescriptionStatus: PrescriptionStatus;
  statusReason: string | null;
  placedAt: string;
  projectionVersion: number;
  customer: { fullName: string; email: string };
}

export interface Connection<T> {
  totalCount: number;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  edges: { cursor: string; node: T }[];
}
