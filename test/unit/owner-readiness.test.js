import assert from 'node:assert/strict';
import test from 'node:test';

import { ownerReadiness } from '../../src/lib/owner-readiness.js';

const facility = { id: '12', name: 'Club', city: 'Bogotá', address: 'Calle 1', description: 'Cancha cubierta', publicationState: 'DRAFT' };
const court = { id: '22', name: 'Cancha 1', description: 'Cubierta', state: 'active', sportCode: 'FUTBOL_5', allowedDurationsMinutes: [60] };

test('Owner readiness guides a new business to create its first court', () => {
  const result = ownerReadiness(facility, [], []);
  assert.equal(result.ready, false);
  assert.equal(result.nextAction.label, 'Crear Cancha');
  assert.equal(result.checks.find((check) => check.key === 'court').complete, false);
});

test('Owner readiness identifies pending price and schedule independently', () => {
  const pricePending = ownerReadiness(facility, [court], [{ prices: [{ durationMinutes: 60, priceMinor: null }], schedule: { periods: [] } }]);
  assert.equal(pricePending.nextAction.label, 'Configurar tarifas');
  const schedulePending = ownerReadiness(facility, [court], [{ prices: [{ durationMinutes: 60, priceMinor: 5000000, currency: 'COP' }], schedule: { periods: [] } }]);
  assert.equal(schedulePending.nextAction.label, 'Definir horario');
  assert.equal(schedulePending.nextAction.section, 'schedule');
});

test('Owner readiness distinguishes a business ready for review from a published business', () => {
  const details = [{ prices: [{ durationMinutes: 60, priceMinor: 5000000, currency: 'COP' }], schedule: { periods: [{ weekday: 1 }] } }];
  assert.equal(ownerReadiness(facility, [court], details).nextAction.message, 'Tu negocio está preparado. Falta la revisión y publicación del Administrador.');
  assert.equal(ownerReadiness({ ...facility, publicationState: 'PUBLISHED' }, [court], details).nextAction.message, 'Tu negocio está publicado y visible en el marketplace.');
});

test('readiness never combines the sport, price and schedule of different courts', () => {
  const other = { ...court, id: '23', sportCode: null };
  const state = ownerReadiness(facility, [court, other], [
    { prices: [{ durationMinutes: 60, priceMinor: null, currency: null }], schedule: { periods: [] } },
    { prices: [{ durationMinutes: 60, priceMinor: 5000000, currency: 'COP' }], schedule: { periods: [{ weekday: 1 }] } },
  ]);
  assert.equal(state.ready, false);
  assert.equal(state.checks.find((check) => check.key === 'price').complete, false);
  assert.equal(state.nextAction.section, 'prices');
  assert.equal(state.nextAction.to, '/owner/canchas/22');
});

test('an inactive court cannot make the business appear prepared', () => {
  const state = ownerReadiness(facility, [{ ...court, state: 'inactive' }], [
    { prices: [{ durationMinutes: 60, priceMinor: 5000000, currency: 'COP' }], schedule: { periods: [{ weekday: 1 }] } },
  ]);
  assert.equal(state.ready, false);
  assert.equal(state.nextAction.label, 'Ver Canchas');
});

test('a suspended facility has no operational next step even with a configured court', () => {
  const state = ownerReadiness({ ...facility, state: 'inactive' }, [court], [
    { prices: [{ durationMinutes: 60, priceMinor: 5000000, currency: 'COP' }], schedule: { periods: [{ weekday: 1 }] } },
  ]);
  assert.equal(state.ready, false);
  assert.equal(state.nextAction.label, 'Ver estado');
});
