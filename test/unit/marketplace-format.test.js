import assert from 'node:assert/strict';
import test from 'node:test';

import { formatCOP, priceMinorFromCOP, sportLabel } from '../../src/lib/format.js';

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
