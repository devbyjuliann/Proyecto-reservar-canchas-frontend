import assert from 'node:assert/strict';
import test from 'node:test';

import { refundPresentation } from '../../src/lib/refunds.js';

test('only persisted eligible cancellations expose the refund action', () => {
  assert.equal(refundPresentation({ status: 'CANCELADA', cancellationReason: 'CLIENTE_A_TIEMPO',
    economicOutcome: 'NON_REFUNDABLE' }).canRequestRefund, false);
  assert.deepEqual(refundPresentation({ status: 'CANCELADA', cancellationReason: 'CANCELLED_BY_OWNER',
    economicOutcome: 'FULL_REFUND_OR_RESCHEDULE' }),
  { canReschedule: true, canRequestRefund: true, status: null });
  assert.equal(refundPresentation({ status: 'CANCELADA', cancellationReason: 'CLIENTE_EXCEPCION',
    economicOutcome: 'REFUND_ALLOWED' }).canRequestRefund, true);
});

test('pending and failed provider states never claim a refund has completed', () => {
  for (const refundState of ['REFUND_PENDING', 'DECLINED', 'ERROR']) {
    assert.notEqual(refundPresentation({ refundState }).status, 'Reembolso procesado');
  }
  assert.equal(refundPresentation({ refundState: 'REFUNDED' }).status, 'Reembolso procesado');
});
