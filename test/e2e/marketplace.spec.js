import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { loadDatabaseConfig } from '../../../backend/src/config/database.js';
import { createMySqlPool } from '../../../backend/src/database/pool.js';
import { createAuthModule, createMySqlAuthAdapter } from '../../../backend/src/modules/auth/index.js';
import { createBookingModule, createMySqlBookingAdapter } from '../../../backend/src/modules/booking/index.js';
import { createCourtPricingModule, createMySqlCourtPricingAdapter } from '../../../backend/src/modules/court-pricing/index.js';
import { createFacilitiesModule, createMySqlFacilitiesAdapter } from '../../../backend/src/modules/facilities/index.js';
import { createFacilityMembershipsModule, createMySqlFacilityMembershipsAdapter } from '../../../backend/src/modules/facility-memberships/index.js';
import { createOwnerApplicationsModule, createMySqlOwnerApplicationsAdapter } from '../../../backend/src/modules/owner-applications/index.js';
import { createPublicCatalogModule, createMySqlPublicCatalogAdapter } from '../../../backend/src/modules/public-catalog/index.js';
import { createSystemClock } from '../../../backend/src/shared/clock.js';

import { todayInTimeZone } from '../../src/lib/format.js';

const BACKEND = 'http://localhost:3107';
const PRICE_MINOR = 9000000;

test('marketplace real: explorar → reservar con precio → cancelar', async ({ page, request }) => {
  test.setTimeout(90_000);
  const database = loadDatabaseConfig();
  if (database.environment !== 'test' || !database.database.endsWith('_test')) {
    throw new Error('Este recorrido exige una base _test');
  }
  const pool = createMySqlPool(database);
  let createdFixture;
  let buyerId;
  try {
    let listing = await findAvailablePublicCourt(request);
    if (!listing) {
      createdFixture = await prepareMinimumListing(pool);
      listing = await findAvailablePublicCourt(request, createdFixture.facilityId);
      expect(listing, 'La fixture publicada debe ofrecer un turno futuro con precio').not.toBeNull();
    }
    const { facility, court, date, option } = listing;
    const email = `market-buyer-${randomUUID()}@example.test`;
    const password = 'Marketplace-E2E-2026!';

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Encuentra tu próxima cancha.' })).toBeVisible();
    await page.getByRole('searchbox', { name: 'Busca una cancha o establecimiento' }).fill(facility.name.slice(0, 100));
    await page.getByLabel('Ciudad').fill(facility.city);
    await page.getByLabel('Deporte').fill(court.sportCode);
    await page.getByLabel('Precio máximo en COP').fill(String(Math.ceil(option.priceMinor / 100)));
    const catalogResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/api/v1/facilities' && url.searchParams.has('q');
    });
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    const catalog = await (await catalogResponse).json();
    expect(catalog.items.some((item) => item.id === facility.id && item.fromPriceMinor <= option.priceMinor)).toBe(true);
    await page.getByRole('link', { name: `Ver establecimiento ${facility.name}` }).click();
    await expect(page.getByRole('heading', { name: facility.name })).toBeVisible();
    await expect(page.getByText(facility.address)).toBeVisible();
    await page.getByRole('link', { name: `Ver cancha ${court.name} de ${facility.name}` }).click();
    await expect(page.getByRole('heading', { name: court.name })).toBeVisible();
    await expect(page.getByText('COP', { exact: false }).first()).toBeVisible();

    await page.getByLabel('Fecha para jugar').fill(date);
    const availabilityResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname === `/api/v1/courts/${court.id}/availability`
      && new URL(response.url()).searchParams.get('date') === date);
    await page.getByRole('button', { name: 'Ver turnos' }).click();
    const availability = await (await availabilityResponse).json();
    expect(availability.options.some((candidate) => candidate.startTime === option.startTime
      && candidate.durationMinutes === option.durationMinutes
      && candidate.priceMinor === option.priceMinor && candidate.currency === 'COP')).toBe(true);
    await page.locator('.slot-option').filter({ hasText: `${option.durationMinutes} min` })
      .filter({ hasText: option.startTime.slice(0, 5) }).first().click();
    await expect(page.locator('.ticket-body')).toContainText('COP');
    await page.getByRole('button', { name: 'Ingresar para reservar' }).click();
    await expect(page).toHaveURL(/\/acceso$/);
    await page.getByRole('tab', { name: 'Crear cuenta' }).click();
    await page.getByLabel('Nombre').fill('Comprador Marketplace');
    await page.getByLabel('Correo').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    const registrationResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/registrations'));
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    const registration = await registrationResponse;
    expect(registration.status()).toBe(201);
    buyerId = (await registration.json()).user.id;
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
    await expect(page).toHaveURL(new RegExp(`/canchas/${court.id}$`));
    await expect(page.getByRole('button', { name: 'Confirmar reserva' })).toBeVisible();
    await expect(page.locator('.ticket-body')).toContainText('COP');
    expect((await page.context().cookies(BACKEND)).some((cookie) => cookie.httpOnly)).toBe(true);

    const confirmationResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/bookings') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Confirmar reserva' }).click();
    const confirmation = await confirmationResponse;
    expect(confirmation.status()).toBe(201);
    expect(confirmation.request().postDataJSON()).toMatchObject({
      courtId: court.id, durationMinutes: option.durationMinutes,
      expectedPriceMinor: option.priceMinor, currency: 'COP',
    });
    expect(confirmation.request().headers()['x-user-id']).toBeUndefined();
    const { booking } = await confirmation.json();
    expect(booking.priceMinor).toBe(option.priceMinor);
    expect(booking.currency).toBe('COP');
    await expect(page.getByRole('heading', { name: 'Reserva confirmada' })).toBeVisible();

    await page.getByRole('link', { name: 'Mis reservas', exact: true }).click();
    const row = page.locator('.booking-row').filter({ hasText: booking.court.name });
    await expect(row).toContainText('Confirmada');
    await expect(row).toContainText('COP');
    const [persisted] = await pool.execute('SELECT status, price_amount_minor, price_currency FROM bookings WHERE id = ?',
      [booking.id]);
    assertBooking(persisted[0], 'CONFIRMADA', option.priceMinor);

    await row.getByRole('button', { name: 'Cancelar', exact: true }).click();
    const cancellationResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/api/v1/bookings/${booking.id}/cancellation`)
      && response.request().method() === 'POST');
    await row.getByRole('button', { name: 'Sí, cancelar' }).click();
    expect((await (await cancellationResponse).json()).booking.status).toBe('CANCELADA');
    await expect(row).toContainText('Cancelada');
    await page.reload();
    await expect(page.locator('.booking-row').filter({ hasText: booking.court.name })).toContainText('Cancelada');
    const [cancelled] = await pool.execute('SELECT status, price_amount_minor, price_currency FROM bookings WHERE id = ?',
      [booking.id]);
    assertBooking(cancelled[0], 'CANCELADA', option.priceMinor);
  } finally {
    try { if (buyerId) await removeBuyer(pool, buyerId); }
    finally {
      try { if (createdFixture) await removeFixture(pool, createdFixture); }
      finally { await pool.end(); }
    }
  }
});

function assertBooking(row, status, priceMinor) {
  expect(row.status).toBe(status);
  expect(Number(row.price_amount_minor)).toBe(priceMinor);
  expect(row.price_currency).toBe('COP');
}

function futureDate(timeZone, days) {
  const today = todayInTimeZone(timeZone);
  const future = new Date(`${today}T12:00:00.000Z`);
  future.setUTCDate(future.getUTCDate() + days);
  return { date: future.toISOString().slice(0, 10), weekday: future.getUTCDay() || 7 };
}

async function findAvailablePublicCourt(request, facilityId) {
  const response = await request.get(`${BACKEND}/api/v1/facilities?limit=100`);
  expect(response.status()).toBe(200);
  for (const facility of (await response.json()).items) {
    if (facilityId && facility.id !== facilityId) continue;
    const courtsResponse = await request.get(`${BACKEND}/api/v1/facilities/${facility.id}/courts?limit=100`);
    if (courtsResponse.status() !== 200) continue;
    for (const listedCourt of (await courtsResponse.json()).items) {
      const detail = await request.get(`${BACKEND}/api/v1/courts/${listedCourt.id}`);
      if (detail.status() !== 200) continue;
      const court = (await detail.json()).court;
      for (const days of [3, 4, 5]) {
        const { date } = futureDate(court.timeZone, days);
        const availability = await request.get(`${BACKEND}/api/v1/courts/${court.id}/availability?date=${date}`);
        if (availability.status() !== 200) continue;
        const option = (await availability.json()).options.find((item) => item.currency === 'COP'
          && Number.isSafeInteger(item.priceMinor) && item.priceMinor > 0);
        if (option) {
          const facilityDetail = await request.get(`${BACKEND}/api/v1/facilities/${facility.id}`);
          return { facility: (await facilityDetail.json()).facility, court, date, option };
        }
      }
    }
  }
  return null;
}

async function prepareMinimumListing(pool) {
  const clock = createSystemClock();
  const adminRows = await pool.execute(
    `SELECT u.id FROM users u JOIN user_roles r ON r.user_id = u.id
     WHERE r.role_code = 'ADMINISTRADOR' AND u.deactivated_at IS NULL LIMIT 1`,
  );
  const auth = createAuthModule({ adapter: createMySqlAuthAdapter({ pool }), clock });
  const createdAdmin = adminRows[0].length === 0;
  const admin = createdAdmin
    ? await auth.bootstrapAdministrator({ name: 'Administrador de fixture',
      email: `market-admin-${randomUUID()}@example.test`, password: `Admin-${randomUUID()}!` })
    : { id: String(adminRows[0][0].id), roles: ['USUARIO', 'ADMINISTRADOR'] };
  const owner = await auth.register({ name: 'Propietario de fixture',
    email: `market-owner-${randomUUID()}@example.test`, password: `Owner-${randomUUID()}!` });
  const applications = createOwnerApplicationsModule({
    adapter: createMySqlOwnerApplicationsAdapter({ pool }), clock,
  });
  const application = await applications.create({ actor: owner,
    businessName: 'Instalación de prueba', message: null });
  await applications.approve({ actor: admin, applicationId: application.id });
  const facilities = createFacilitiesModule({ adapter: createMySqlFacilitiesAdapter({ pool }), clock });
  const name = `Cancha de barrio ${randomUUID().slice(0, 8)}`;
  const created = await facilities.createFacility({ actor: admin, name,
    timeZone: 'America/Bogota', city: 'Bogotá', address: 'Calle 10 # 20-30',
    description: 'Cancha deportiva cubierta con turnos de una hora.',
    minimumAdvanceMinutes: 15, maximumAdvanceMinutes: 43200 });
  const facilityId = created.facility.id;
  const membership = createFacilityMembershipsModule({
    adapter: createMySqlFacilityMembershipsAdapter({ pool }), clock,
  });
  await membership.assignMembership({ actor: admin, facilityId, userId: owner.id });
  const booking = createBookingModule({ adapter: createMySqlBookingAdapter({ pool }), clock });
  const courtCreated = await booking.createCourt({ actor: admin, facilityId,
    name: 'Cancha principal', description: 'Espacio cubierto para fútbol 5.',
    minimumSeparationMinutes: 0, startIntervalMinutes: 30,
    allowedDurationsMinutes: [60] });
  const courtId = courtCreated.court.id;
  await facilities.updateCourt({ actor: admin, courtId, sportCode: 'FUTBOL_5' });
  const pricing = createCourtPricingModule({
    adapter: createMySqlCourtPricingAdapter({ pool }), memberships: membership,
  });
  await pricing.setPrice({ actor: admin, scope: 'admin', courtId,
    durationMinutes: 60, priceMinor: PRICE_MINOR });
  const { weekday } = futureDate('America/Bogota', 3);
  await booking.replaceWeeklySchedule({ actor: admin, courtId,
    periods: [{ weekday, startTime: '08:00:00', endTime: '22:00:00' }] });
  const catalog = createPublicCatalogModule({ adapter: createMySqlPublicCatalogAdapter({ pool }), clock });
  expect((await catalog.publish({ actor: admin, facilityId })).changed).toBe(true);
  return { adminId: admin.id, createdAdmin, ownerId: owner.id, facilityId, courtId };
}

async function removeBuyer(pool, userId) {
  await pool.execute('DELETE FROM idempotency_records WHERE user_id = ?', [userId]);
  await pool.execute('DELETE FROM operational_conflicts WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ?)', [userId]);
  await pool.execute('DELETE FROM bookings WHERE user_id = ?', [userId]);
  await pool.execute('DELETE FROM sessions WHERE user_id = ?', [userId]);
  await pool.execute('DELETE FROM user_credentials WHERE user_id = ?', [userId]);
  await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
  await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
}

async function removeFixture(pool, fixture) {
  await pool.execute('DELETE FROM operational_conflicts WHERE operational_change_id IN (SELECT id FROM operational_changes WHERE court_id = ?)', [fixture.courtId]);
  await pool.execute('DELETE FROM operational_changes WHERE court_id = ?', [fixture.courtId]);
  await pool.execute('DELETE FROM court_weekly_periods WHERE court_id = ?', [fixture.courtId]);
  await pool.execute('DELETE FROM court_prices WHERE court_id = ?', [fixture.courtId]);
  await pool.execute('DELETE FROM court_allowed_durations WHERE court_id = ?', [fixture.courtId]);
  await pool.execute('DELETE FROM courts WHERE id = ?', [fixture.courtId]);
  await pool.execute('DELETE FROM facility_memberships WHERE facility_id = ?', [fixture.facilityId]);
  await pool.execute('DELETE FROM facilities WHERE id = ?', [fixture.facilityId]);
  await pool.execute('DELETE FROM owner_applications WHERE user_id = ?', [fixture.ownerId]);
  await pool.execute('DELETE FROM user_credentials WHERE user_id = ?', [fixture.ownerId]);
  await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [fixture.ownerId]);
  await pool.execute('DELETE FROM users WHERE id = ?', [fixture.ownerId]);
  if (fixture.createdAdmin) {
    await pool.execute('DELETE FROM user_credentials WHERE user_id = ?', [fixture.adminId]);
    await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [fixture.adminId]);
    await pool.execute('DELETE FROM users WHERE id = ?', [fixture.adminId]);
  }
}
