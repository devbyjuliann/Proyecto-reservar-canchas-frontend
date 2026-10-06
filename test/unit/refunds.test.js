import assert from 'node:assert/strict';
import test from 'node:test';

import { refundPresentation } from '../../src/lib/refunds.js';

test('only persisted eligible cancellations expose the refund action', () => {
  assert.equal(refundPresentation({ refundEligible: false, rescheduleEligible: false }).canRequestRefund, false);
  assert.deepEqual(refundPresentation({ refundEligible: true, rescheduleEligible: true }),
  { canReschedule: true, canRequestRefund: true, status: null });
  assert.equal(refundPresentation({ refundEligible: true, rescheduleEligible: false }).canRequestRefund, true);
});

test('pending and failed provider states never claim a refund has completed', () => {
  for (const refundState of ['REFUND_PENDING', 'DECLINED', 'ERROR']) {
    assert.notEqual(refundPresentation({ refundState }).status, 'Reembolso procesado');
  }
  assert.equal(refundPresentation({ refundState: 'REFUNDED' }).status, 'Reembolso procesado');
});
