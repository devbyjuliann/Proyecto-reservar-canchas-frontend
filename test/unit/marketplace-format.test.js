import assert from 'node:assert/strict';
import test from 'node:test';

import { errorCopy, formatCancellationWindow, formatCOP, formatPaymentCountdown, priceMinorFromCOP, sportLabel } from '../../src/lib/format.js';

test('explains cancellation policy before confirmation in human units', () => {
  assert.equal(formatCancellationWindow(120), '2 horas antes del inicio');
  assert.equal(formatCancellationWindow(30), '30 minutos antes del inicio');
  assert.equal(formatCancellationWindow(0), 'hasta el inicio');
  assert.match(errorCopy({ code: 'booking_cancellation_window_closed' }), /plazo de cancelación/i);
});

test('formats the backend amount in COP and does not invent legacy prices', () => {
  assert.match(formatCOP(9000000), /COP/);
  assert.match(formatCOP(9000000), /90[.,\s\u00a0]*000/);
  assert.equal(formatCOP(null), 'Precio no disponible');
  assert.equal(formatCOP(undefined), 'Precio no disponible');
});

test('converts a user-entered COP maximum to safe minor units', () => {
  assert.equal(priceMinorFromCOP('90000'), 9000000);
  assert.equal(priceMinorFromCOP(''), undefined);
  assert.equal(priceMinorFromCOP('0'), null);
  assert.equal(priceMinorFromCOP('-1'), null);
  assert.equal(priceMinorFromCOP('1.5'), null);
  assert.equal(priceMinorFromCOP('90071992547410'), null);
});

test('renders an API sport code without changing the search identifier', () => {
  assert.equal(sportLabel('FUTBOL_5'), 'Futbol 5');
  assert.equal(sportLabel(null), 'Deporte no indicado');
});

test('maps customer-facing booking conflicts without exposing API codes', () => {
  assert.match(errorCopy({ code: 'booking_price_changed' }), /precio de este turno cambió/i);
  assert.match(errorCopy({ code: 'booking_conflict' }), /dejar de estar disponible/i);
  assert.match(errorCopy({ code: 'option_not_available' }), /Elige otro turno/i);
  assert.match(errorCopy({ code: 'booking_already_started' }), /no se puede cancelar/i);
  assert.doesNotMatch(errorCopy({ code: 'booking_conflict' }), /booking_conflict|HTTP 409/i);
});

test('derives the payment countdown from the server expiration instant', () => {
  const now = Date.parse('2026-10-03T12:00:00.000Z');
  assert.equal(formatPaymentCountdown('2026-10-03T12:09:42.000Z', now), '09:42');
  assert.equal(formatPaymentCountdown('2026-10-03T11:59:59.000Z', now), '00:00');
  assert.match(errorCopy({ code: 'payment_expired' }), /tiempo para completar/i);
});

test('explains a rejected publication without inventing publication rules', () => {
  assert.match(errorCopy({ code: 'facility_not_publishable' }), /datos públicos/i);
  assert.match(errorCopy({ code: 'facility_not_publishable' }), /precio COP/i);
});
