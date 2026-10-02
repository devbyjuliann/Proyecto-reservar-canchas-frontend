import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { loadDatabaseConfig } from '../../../backend/src/config/database.js';
import { createAuthModule, createMySqlAuthAdapter } from '../../../backend/src/modules/auth/index.js';
import { createBookingModule, createMySqlBookingAdapter } from '../../../backend/src/modules/booking/index.js';
import { createCourtPricingModule, createMySqlCourtPricingAdapter } from '../../../backend/src/modules/court-pricing/index.js';
import { createFacilitiesModule, createMySqlFacilitiesAdapter } from '../../../backend/src/modules/facilities/index.js';
import { createFacilityMembershipsModule, createMySqlFacilityMembershipsAdapter } from '../../../backend/src/modules/facility-memberships/index.js';
import { createOwnerApplicationsModule, createMySqlOwnerApplicationsAdapter } from '../../../backend/src/modules/owner-applications/index.js';
import { createPublicCatalogModule, createMySqlPublicCatalogAdapter } from '../../../backend/src/modules/public-catalog/index.js';
import { createMySqlPool } from '../../../backend/src/database/pool.js';
import { createSystemClock } from '../../../backend/src/shared/clock.js';

import { todayInTimeZone } from '../../src/lib/format.js';

const API = 'http://localhost:3000';
const ORIGIN = 'http://localhost:5177';
const INITIAL_PRICE = 5000000;
const UPDATED_PRICE = 6500000;

test('dos clientes ven el mismo slot y el segundo recibe disponibilidad actualizada', async ({ browser }) => {
  test.setTimeout(120_000);
  const pool = testPool();
  const fixture = await prepareFixture(pool);
  const buyerA = await browser.newContext();
  const buyerB = await browser.newContext();
  const pageA = await buyerA.newPage();
  const pageB = await buyerB.newPage();
  try {
    await login(pageA, fixture.buyers[0]);
    await login(pageB, fixture.buyers[1]);
    const optionA = await openAndSelect(pageA, fixture);
    const optionB = await openAndSelect(pageB, fixture);
    expect(optionA.startTime).toBe(optionB.startTime);

    const confirmed = pageA.waitForResponse(bookingResponse);
    await pageA.getByRole('button', { name: 'Confirmar reserva' }).click();
    expect((await confirmed).status()).toBe(201);
    await expect(pageA.getByRole('heading', { name: 'Reserva confirmada' })).toBeVisible();

    const rejected = pageB.waitForResponse(bookingResponse);
    await pageB.getByRole('button', { name: 'Confirmar reserva' }).click();
    const response = await rejected;
    expect(response.status()).toBe(409);
    expect(['booking_conflict', 'option_not_available']).toContain((await response.json()).error.code);
    await expect(pageB.getByRole('alert')).toContainText('Este horario acaba de dejar de estar disponible.');
    await expect(pageB.getByText('Tu turno aparecerá aquí')).toBeVisible();
    await expect(pageB.getByRole('button', { name: new RegExp(`${optionB.startTime.slice(0, 5)}.*60 min`) })).toHaveCount(0);

    const [rows] = await pool.execute(
      "SELECT COUNT(*) AS total FROM bookings WHERE court_id = ? AND start_at = ? AND status = 'CONFIRMADA'",
      [fixture.courtId, optionA.startAt],
    );
    expect(Number(rows[0].total)).toBe(1);
  } finally {
    await buyerA.close();
    await buyerB.close();
    await removeFixture(pool, fixture);
    await pool.end();
  }
});

test('un cambio de precio obliga a volver a seleccionar antes de confirmar', async ({ browser }) => {
  test.setTimeout(120_000);
  const pool = testPool();
  const fixture = await prepareFixture(pool);
  const buyer = await browser.newContext();
  const owner = await browser.newContext();
  const buyerPage = await buyer.newPage();
  const ownerPage = await owner.newPage();
  try {
    await login(buyerPage, fixture.buyers[0]);
    const original = await openAndSelect(buyerPage, fixture);
    await expect(buyerPage.getByLabel('Resumen de la reserva')).toContainText('COP 50.000');

    await login(ownerPage, fixture.owner);
    const priceResponse = await ownerPage.context().request.put(
      `${API}/api/v1/owner/courts/${fixture.courtId}/prices/60`,
      { data: { priceMinor: UPDATED_PRICE, currency: 'COP' }, headers: { Origin: ORIGIN } },
    );
    expect(priceResponse.status()).toBe(200);

    const rejected = buyerPage.waitForResponse(bookingResponse);
    await buyerPage.getByRole('button', { name: 'Confirmar reserva' }).click();
    const response = await rejected;
    expect(response.status()).toBe(409);
    expect((await response.json()).error.code).toBe('booking_price_changed');
    await expect(buyerPage.getByRole('alert')).toContainText('El precio de este turno cambió desde que lo seleccionaste.');
    await expect(buyerPage.getByText('Tu turno aparecerá aquí')).toBeVisible();

    const [oldBookings] = await pool.execute('SELECT COUNT(*) AS total FROM bookings WHERE court_id = ?', [fixture.courtId]);
    expect(Number(oldBookings[0].total)).toBe(0);
    await buyerPage.getByRole('button', { name: new RegExp(`${original.startTime.slice(0, 5)}.*60 min`) }).click();
    await expect(buyerPage.getByLabel('Resumen de la reserva')).toContainText('COP 65.000');
    const confirmed = buyerPage.waitForResponse(bookingResponse);
    await buyerPage.getByRole('button', { name: 'Confirmar reserva' }).click();
    const booked = await confirmed;
    expect(booked.status()).toBe(201);
    const { booking } = await booked.json();
    expect(booking.priceMinor).toBe(UPDATED_PRICE);
    expect(booking.currency).toBe('COP');
  } finally {
    await buyer.close();
    await owner.close();
    await removeFixture(pool, fixture);
    await pool.end();
  }
});

function testPool() {
  const config = loadDatabaseConfig();
  if (config.environment !== 'test' || !config.database.endsWith('_test')) {
    throw new Error('Estos E2E requieren una base MySQL _test');
  }
  return createMySqlPool(config);
}

async function prepareFixture(pool) {
  const clock = createSystemClock();
  const auth = createAuthModule({ adapter: createMySqlAuthAdapter({ pool }), clock });
  const admin = await auth.register(credentials('Admin conflicto'));
  await pool.execute("INSERT INTO user_roles (user_id, role_code) VALUES (?, 'ADMINISTRADOR')", [admin.id]);
  const adminActor = { ...admin, roles: ['USUARIO', 'ADMINISTRADOR'] };
  const ownerCredentials = credentials('Owner conflicto');
  const owner = await auth.register(ownerCredentials);
  const applications = createOwnerApplicationsModule({ adapter: createMySqlOwnerApplicationsAdapter({ pool }), clock });
  const application = await applications.create({ actor: owner, businessName: 'Fixture conflictos', message: null });
  await applications.approve({ actor: adminActor, applicationId: application.id });
  const buyers = [credentials('Cliente A'), credentials('Cliente B')];
  const buyerAccounts = await Promise.all(buyers.map((account) => auth.register(account)));
  const facilities = createFacilitiesModule({ adapter: createMySqlFacilitiesAdapter({ pool }), clock });
  const facility = await facilities.createFacility({ actor: adminActor, name: `Conflictos ${randomUUID().slice(0, 8)}`,
    timeZone: 'America/Bogota', city: 'Bogotá', address: 'Calle 1', description: 'Fixture de conflictos.',
    minimumAdvanceMinutes: 15, maximumAdvanceMinutes: 43200 });
  const memberships = createFacilityMembershipsModule({ adapter: createMySqlFacilityMembershipsAdapter({ pool }), clock });
  await memberships.assignMembership({ actor: adminActor, facilityId: facility.facility.id, userId: owner.id });
  const booking = createBookingModule({ adapter: createMySqlBookingAdapter({ pool }), clock });
  const court = await booking.createCourt({ actor: adminActor, facilityId: facility.facility.id,
    name: 'Cancha de conflictos', description: 'Cancha cubierta.', sportCode: 'FUTBOL_5',
    minimumSeparationMinutes: 0, startIntervalMinutes: 30, allowedDurationsMinutes: [60] });
  const pricing = createCourtPricingModule({ adapter: createMySqlCourtPricingAdapter({ pool }), memberships });
  await pricing.setPrice({ actor: adminActor, scope: 'admin', courtId: court.court.id, durationMinutes: 60, priceMinor: INITIAL_PRICE });
  const current = new Date(`${todayInTimeZone('America/Bogota')}T12:00:00.000Z`);
  current.setUTCDate(current.getUTCDate() + 3);
  const date = current.toISOString().slice(0, 10);
  await booking.replaceWeeklySchedule({ actor: adminActor, courtId: court.court.id,
    periods: [{ weekday: current.getUTCDay() || 7, startTime: '08:00:00', endTime: '12:00:00' }] });
  const catalog = createPublicCatalogModule({ adapter: createMySqlPublicCatalogAdapter({ pool }), clock });
  await catalog.publish({ actor: adminActor, facilityId: facility.facility.id });
  return { adminId: admin.id, ownerId: owner.id, buyerIds: buyerAccounts.map((account) => account.id),
    facilityId: facility.facility.id, courtId: court.court.id, date, owner: ownerCredentials, buyers };
}

function credentials(name) {
  const token = randomUUID();
  return { name, email: `${token}@example.test`, password: `Password-${token}!` };
}

async function login(page, account) {
  await page.goto('/acceso');
  await page.getByLabel('Correo').fill(account.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
}

async function openAndSelect(page, fixture) {
  await page.goto(`/canchas/${fixture.courtId}`);
  await page.getByLabel('Fecha para jugar').fill(fixture.date);
  const available = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/v1/courts/${fixture.courtId}/availability`
    && new URL(response.url()).searchParams.get('date') === fixture.date);
  await page.getByRole('button', { name: 'Ver turnos' }).click();
  const option = (await (await available).json()).options.find((item) => item.startTime === '08:00:00' && item.durationMinutes === 60);
  expect(option).toBeDefined();
  await page.getByRole('button', { name: new RegExp(`${option.startTime.slice(0, 5)}.*60 min`) }).click();
  return option;
}

function bookingResponse(response) {
  return response.url().endsWith('/api/v1/bookings') && response.request().method() === 'POST';
}

async function removeFixture(pool, fixture) {
  if (!fixture) return;
  await pool.execute('DELETE FROM idempotency_records WHERE user_id IN (?, ?)', fixture.buyerIds);
  await pool.execute('DELETE FROM operational_conflicts WHERE booking_id IN (SELECT id FROM bookings WHERE court_id = ?)', [fixture.courtId]);
  await pool.execute('DELETE FROM bookings WHERE court_id = ?', [fixture.courtId]);
  await pool.execute('DELETE FROM operational_changes WHERE court_id = ?', [fixture.courtId]);
  await pool.execute('DELETE FROM court_weekly_periods WHERE court_id = ?', [fixture.courtId]);
  await pool.execute('DELETE FROM court_prices WHERE court_id = ?', [fixture.courtId]);
  await pool.execute('DELETE FROM court_allowed_durations WHERE court_id = ?', [fixture.courtId]);
  await pool.execute('DELETE FROM courts WHERE id = ?', [fixture.courtId]);
  await pool.execute('DELETE FROM facility_memberships WHERE facility_id = ?', [fixture.facilityId]);
  await pool.execute('DELETE FROM facilities WHERE id = ?', [fixture.facilityId]);
  for (const userId of [fixture.ownerId, ...fixture.buyerIds, fixture.adminId]) {
    await pool.execute('DELETE FROM owner_applications WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM sessions WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM user_credentials WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
  }
}
