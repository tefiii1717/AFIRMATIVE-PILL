/** Objetos de vista que el read side entrega a los resolvers GraphQL. */
export interface MedicationView {
  id: string;
  sku: string;
  commercialName: string;
  activeIngredient: string;
  concentration: string;
  dosageForm: string;
  presentation: string;
  price: string;
  requiresPrescription: boolean;
  availability: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  stockAvailable: number;
  laboratoryId: string;
  categoryId: string;
  updatedAt: Date;
}

export interface ClinicalInfoView {
  indications: string;
  contraindications: string;
}

export interface LaboratoryView {
  id: string;
  name: string;
  country: string;
}

export interface CategoryView {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  medicationCount: number;
}

export interface CartView {
  id: string;
  status: 'OPEN' | 'CHECKED_OUT';
  updatedAt: Date;
}

export interface CartLineView {
  medicationId: string;
  quantity: number;
}

export interface OrderView {
  id: string;
  status: string;
  statusReason: string | null;
  customer: { fullName: string; email: string };
  itemCount: number;
  total: string;
  requiresPrescription: boolean;
  prescriptionStatus: string;
  prescriptionRejectionReason: string | null;
  prescription: { number: string; doctorName: string; doctorLicense: string; issuedAt: string } | null;
  placedAt: Date;
  updatedAt: Date;
  projectionVersion: number;
}

export interface OrderLineView {
  medicationId: string;
  commercialName: string;
  presentation: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
}

export interface OrderTimelineView {
  status: string;
  note: string | null;
  occurredAt: Date;
}
