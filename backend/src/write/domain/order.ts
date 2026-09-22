/**
 * Reglas de dominio puras (sin I/O) del agregado Orden. Se testean en
 * aislamiento y las usan los command handlers.
 */
import { invalidPrescription, invalidTransition, validation, type UserError } from './errors.js';

export const ORDER_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'DISPATCHED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type PrescriptionStatus = 'NOT_REQUIRED' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';

/** Máquina de estados de la orden. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_APPROVAL: ['APPROVED', 'CANCELLED'],
  APPROVED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: [],
  CANCELLED: [],
};

export function checkTransition(current: OrderStatus, target: OrderStatus): UserError | null {
  return TRANSITIONS[current].includes(target) ? null : invalidTransition(current, target);
}

/** Máximo de unidades por línea (política de dispensación). */
export const MAX_UNITS_PER_LINE = 20;
/** Vigencia máxima de una fórmula médica, en días. */
export const PRESCRIPTION_VALIDITY_DAYS = 30;
/** Umbral a partir del cual la proyección muestra LOW_STOCK. */
export const LOW_STOCK_THRESHOLD = 10;

export function availabilityFor(stock: number): 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' {
  if (stock <= 0) return 'OUT_OF_STOCK';
  if (stock <= LOW_STOCK_THRESHOLD) return 'LOW_STOCK';
  return 'IN_STOCK';
}

export interface PrescriptionData {
  number: string;
  doctorName: string;
  doctorLicense: string;
  patientDocument: string;
  issuedAt: string; // YYYY-MM-DD
}

const LICENSE_RE = /^[A-Z0-9-]{4,20}$/i;

/** Invariantes sincrónicas de la fórmula médica (formato y vigencia). */
export function validatePrescription(input: PrescriptionData, now = new Date()): UserError[] {
  const errors: UserError[] = [];
  const base = ['input', 'prescription'];
  if (input.number.trim().length < 3) {
    errors.push(validation('number', 'El número de la fórmula es obligatorio.', [...base, 'number']));
  }
  if (input.doctorName.trim().length < 3) {
    errors.push(validation('doctorName', 'El nombre del médico es obligatorio.', [...base, 'doctorName']));
  }
  if (!LICENSE_RE.test(input.doctorLicense.trim())) {
    errors.push(
      validation('doctorLicense', 'El registro médico debe tener entre 4 y 20 caracteres alfanuméricos.', [
        ...base,
        'doctorLicense',
      ]),
    );
  }
  if (!/^\d{5,12}$/.test(input.patientDocument.trim())) {
    errors.push(
      validation('patientDocument', 'El documento del paciente debe tener entre 5 y 12 dígitos.', [
        ...base,
        'patientDocument',
      ]),
    );
  }

  const issued = new Date(`${input.issuedAt}T00:00:00Z`);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const ageDays = Math.floor((today.getTime() - issued.getTime()) / 86_400_000);
  if (ageDays < 0) {
    errors.push(invalidPrescription('La fecha de expedición no puede estar en el futuro.', [...base, 'issuedAt']));
  } else if (ageDays > PRESCRIPTION_VALIDITY_DAYS) {
    errors.push(
      invalidPrescription(
        `La fórmula está vencida: tiene ${ageDays} días y la vigencia máxima es de ${PRESCRIPTION_VALIDITY_DAYS}.`,
        [...base, 'issuedAt'],
      ),
    );
  }
  return errors;
}

/**
 * Verificación "externa" simulada contra el registro de profesionales de la
 * salud (RETHUS). Regla determinista para la demo: los registros terminados en
 * "000" no existen => la fórmula se rechaza y la orden se cancela.
 */
export function verifyAgainstRegistry(doctorLicense: string): { valid: true } | { valid: false; reason: string } {
  if (doctorLicense.trim().endsWith('000')) {
    return { valid: false, reason: `El registro médico ${doctorLicense} no aparece en RETHUS.` };
  }
  return { valid: true };
}

/** Aritmética monetaria en centavos para evitar errores de coma flotante. */
export const money = {
  toCents: (value: string | number) => Math.round(Number(value) * 100),
  fromCents: (cents: number) => (cents / 100).toFixed(2),
};
