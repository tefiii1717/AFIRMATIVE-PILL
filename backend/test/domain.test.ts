import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  availabilityFor,
  checkTransition,
  money,
  validatePrescription,
  verifyAgainstRegistry,
} from '../src/write/domain/order.js';

const today = new Date('2026-09-22T12:00:00Z');
const valid = {
  number: 'RX-001',
  doctorName: 'Dra. Marta Ruiz',
  doctorLicense: 'RM-12345',
  patientDocument: '1020304050',
  issuedAt: '2026-09-20',
};

describe('Máquina de estados de la orden', () => {
  it('permite las transiciones del ciclo de vida', () => {
    assert.equal(checkTransition('PENDING_APPROVAL', 'APPROVED'), null);
    assert.equal(checkTransition('APPROVED', 'DISPATCHED'), null);
    assert.equal(checkTransition('APPROVED', 'CANCELLED'), null);
  });

  it('rechaza transiciones inválidas con un error tipado', () => {
    const error = checkTransition('DISPATCHED', 'CANCELLED');
    assert.equal(error?.__typename, 'InvalidStateTransitionError');
    assert.equal(checkTransition('PENDING_APPROVAL', 'DISPATCHED')?.code, 'INVALID_STATE_TRANSITION');
    assert.notEqual(checkTransition('CANCELLED', 'APPROVED'), null);
  });
});

describe('Validación de la fórmula médica', () => {
  it('acepta una fórmula vigente y bien formada', () => {
    assert.deepEqual(validatePrescription(valid, today), []);
  });

  it('rechaza fórmulas vencidas (> 30 días) o con fecha futura', () => {
    const expired = validatePrescription({ ...valid, issuedAt: '2026-07-01' }, today);
    assert.equal(expired[0].__typename, 'InvalidPrescriptionError');
    const future = validatePrescription({ ...valid, issuedAt: '2026-10-01' }, today);
    assert.match(future[0].message, /futuro/);
  });

  it('reporta cada campo inválido con su ruta', () => {
    const errors = validatePrescription(
      { ...valid, doctorLicense: '??', patientDocument: 'abc', number: '' },
      today,
    );
    const fields = errors.map((error) => (error.__typename === 'ValidationError' ? error.field : null));
    assert.deepEqual(fields.sort(), ['doctorLicense', 'number', 'patientDocument']);
  });

  it('simula el registro RETHUS (licencias terminadas en 000 no existen)', () => {
    assert.equal(verifyAgainstRegistry('RM-1000').valid, false);
    assert.equal(verifyAgainstRegistry('RM-12345').valid, true);
  });
});

describe('Utilidades', () => {
  it('calcula la disponibilidad del catálogo', () => {
    assert.equal(availabilityFor(0), 'OUT_OF_STOCK');
    assert.equal(availabilityFor(10), 'LOW_STOCK');
    assert.equal(availabilityFor(11), 'IN_STOCK');
  });

  it('opera montos en centavos sin errores de coma flotante', () => {
    assert.equal(money.fromCents(money.toCents('0.10') * 3), '0.30');
    assert.equal(money.fromCents(money.toCents('12900.00') * 2), '25800.00');
  });
});
