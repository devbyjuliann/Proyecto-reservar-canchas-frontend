import assert from 'node:assert/strict';
import test from 'node:test';

import { parseDurations, parsePriceMinor, priceInputValue } from '../../src/lib/owner-forms.js';

test('Duration input accepts valid unique minutes and rejects unsupported values', () => {
  assert.deepEqual(parseDurations('30, 60,90'), [30, 60, 90]);
  assert.equal(parseDurations('30, 30'), null);
  assert.equal(parseDurations('0, 60'), null);
  assert.equal(parseDurations('45.5'), null);
  assert.equal(parseDurations('65536'), null);
  assert.equal(parseDurations(''), null);
});

test('COP price input preserves cents without floating-point money rounding', () => {
  assert.equal(parsePriceMinor('90000'), 9000000);
  assert.equal(parsePriceMinor('90000,01'), 9000001);
  assert.equal(parsePriceMinor('0,01'), 1);
  assert.equal(priceInputValue(9000001), '90000.01');
  assert.equal(parsePriceMinor('0'), null);
  assert.equal(parsePriceMinor('-1'), null);
  assert.equal(parsePriceMinor('1.999'), null);
  assert.equal(parsePriceMinor('9007199254740992'), null);
});
