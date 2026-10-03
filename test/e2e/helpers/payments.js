import { randomUUID } from 'node:crypto';

const API = 'http://localhost:3000';

export async function approvePendingBooking(request, { booking, checkout }) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('La aprobación de pagos E2E solo está disponible en NODE_ENV=test');
  }
  const amountMinor = checkout?.amountDueMinor
    ?? Math.max(0, (booking.depositAmountMinor ?? 0) - (booking.amountPaidMinor ?? 0));
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 1) {
    throw new Error('La reserva no tiene un anticipo pendiente aprobable');
  }
  const response = await request.post(`${API}/api/v1/test/bookings/${booking.id}/payments/approve`, {
    data: { amountMinor, providerReference: `e2e-${randomUUID()}` },
  });
  if (!response.ok()) {
    throw new Error(`No se pudo aprobar el pago de prueba (${response.status()}): ${await response.text()}`);
  }
  return response.json();
}
