import assert from 'node:assert/strict';
import test from 'node:test';

import { toWompiWidgetConfig } from '../../src/lib/wompi.js';

test('passes the backend integrity hash as the nested WidgetCheckout signature', () => {
  const config = toWompiWidgetConfig({ config: {
    publicKey: 'pub_test_example', currency: 'COP', amountInCents: 2700000,
    reference: 'RC-BKG-1-example', expirationTime: '2026-10-03T12:10:00.000Z',
    redirectUrl: 'https://app.example.test/reservas/pago',
    signature: { integrity: 'a'.repeat(64) },
  } });
  assert.deepEqual(config.signature, { integrity: 'a'.repeat(64) });
  assert.equal(config.integrity, undefined);
});

test('rejects checkout data without a nested integrity signature', () => {
  assert.throws(() => toWompiWidgetConfig({ config: { integrity: 'legacy-flat-hash' } }), /signature/);
});
