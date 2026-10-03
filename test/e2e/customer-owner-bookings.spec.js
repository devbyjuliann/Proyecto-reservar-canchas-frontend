import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

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

import { formatCOP, todayInTimeZone } from '../../src/lib/format.js';
import { approvePendingBooking } from './helpers/payments.js';

const BACKEND = 'http://localhost:3000';
const PRICE_MINOR = 9000000;
const OUTBOX = fileURLToPath(new URL('../../../backend/.password-reset-outbox.jsonl', import.meta.url));

async function bookingEmails(email, type) {
  const content = await readFile(OUTBOX, 'utf8').catch((error) => error.code === 'ENOENT' ? '' : Promise.reject(error));
  return content.split('\n').filter(Boolean).map((line) => JSON.parse(line))
    .filter((message) => message.email === email && message.type === type);
}

test('cliente reserva y propietario ve únicamente su turno recibido', async ({ page }) => {
  test.setTimeout(150_000);
  page.setDefaultTimeout(10_000);
  const database = loadDatabaseConfig();
  if (database.environment !== 'test' || !database.database.endsWith('_test')) {
    throw new Error('Este E2E exige una base MySQL _test');
  }
  const pool = createMySqlPool(database);
  const fixture = { adminId: null, createdAdmin: false, ownerId: null, foreignOwnerId: null, buyerId: null,
    foreignBuyerId: null, facilityIds: [], courtIds: [], bookingId: null };

  try {
    const setup = await prepareFixture(pool, fixture);
    const forbiddenAdminRequests = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/v1/admin/')) forbiddenAdminRequests.push(request.url());
    });

    await page.goto('/');
    await page.getByRole('searchbox', { name: 'Buscar' }).fill(setup.facility.name);
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.getByRole('link', { name: `Ver establecimiento ${setup.facility.name}` }).click();
    await page.getByRole('link', { name: `Ver cancha ${setup.court.name} de ${setup.facility.name}` }).click();
    await page.getByLabel('Fecha para jugar').fill(setup.date);
    const availabilityResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/v1/courts/${setup.court.id}/availability`
      && new URL(response.url()).searchParams.get('date') === setup.date);
    await page.getByRole('button', { name: 'Ver turnos' }).click();
    const availability = await (await availabilityResponse).json();
    const option = availability.options.find((item) => item.startTime === '08:00:00'
      && item.durationMinutes === 60 && item.priceMinor === PRICE_MINOR && item.currency === 'COP');
    expect(option).toBeDefined();
    await page.locator('.slot-option').filter({ hasText: '08:00' }).filter({ hasText: '60 min' }).click();
    await expect(page.locator('.ticket-body')).toContainText(formatCOP(PRICE_MINOR));
    await expect(page.getByLabel('Resumen de la reserva')).toContainText('08:00 – 09:00');
    await page.getByRole('button', { name: 'Iniciar sesión para continuar' }).click();
    await page.getByRole('tab', { name: 'Crear cuenta' }).click();
    await page.getByLabel('Nombre').fill('Cliente E2E');
    await page.getByLabel('Correo').fill(setup.buyer.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(setup.buyer.password);
    const registerResponse = page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/registrations'));
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    const registration = await registerResponse;
    expect(registration.status()).toBe(201);
    fixture.buyerId = (await registration.json()).user.id;
    await page.getByLabel('Contraseña', { exact: true }).fill(setup.buyer.password);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Continuar al anticipo' })).toBeVisible();
    expect((await page.context().cookies(BACKEND)).some((cookie) => cookie.httpOnly)).toBe(true);
    const confirmationResponse = page.waitForResponse((response) => response.url().endsWith('/api/v1/bookings') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Continuar al anticipo' }).click();
    const confirmation = await confirmationResponse;
    expect(confirmation.status()).toBe(201);
    expect(confirmation.request().headers()['x-user-id']).toBeUndefined();
    const created = await confirmation.json();
    const { booking, checkout } = created;
    fixture.bookingId = booking.id;
    expect(booking).toMatchObject({ facility: { id: setup.facility.id, name: setup.facility.name }, court: { id: setup.court.id, name: setup.court.name }, priceMinor: PRICE_MINOR, currency: 'COP', status: 'PENDIENTE_PAGO' });
    await expect(page.getByRole('heading', { name: 'Anticipo pendiente' })).toBeVisible();
    await expect(page.locator('.checkout-pending')).toContainText('Anticipo requerido');
    await expect(page.locator('.checkout-pending')).toContainText('Anticipo restante');
    await expect(page.locator('.checkout-countdown')).not.toHaveText('Tiempo vencido');
    expect((await approvePendingBooking(page.context().request, { booking, checkout })).booking.status).toBe('CONFIRMADA');
    await expect.poll(async () => (await bookingEmails(setup.buyer.email, 'booking-confirmation')).length).toBe(1);
    await expect.poll(async () => (await bookingEmails(setup.owner.email, 'owner-booking-confirmation')).length).toBe(1);
    const [ownerConfirmation] = await bookingEmails(setup.owner.email, 'owner-booking-confirmation');
    expect(ownerConfirmation.text).toContain(setup.facility.name);
    expect(ownerConfirmation.text).toContain(setup.court.name);
    expect(ownerConfirmation.text).toContain('Cliente E2E');
    expect(ownerConfirmation.text).toContain('$90.000 COP');
    expect(ownerConfirmation.text).toContain('/owner/reservas');
    await page.getByRole('link', { name: 'Mis reservas', exact: true }).click();
    const customerRow = page.locator('.booking-row').filter({ hasText: setup.court.name });
    await expect(customerRow).toContainText('Confirmada');
    await expect(customerRow).toContainText(formatCOP(PRICE_MINOR));
    await customerRow.getByRole('button', { name: 'Cambiar horario' }).click();
    await customerRow.getByLabel('Nueva fecha').fill(setup.date);
    await customerRow.getByRole('button', { name: 'Ver horarios' }).click();
    const nextSlot = customerRow.getByRole('group', { name: 'Nuevos horarios' }).getByRole('button')
      .filter({ hasText: '09:00' });
    await expect(nextSlot).toBeVisible();
    await nextSlot.click();
    await customerRow.getByRole('button', { name: 'Confirmar nuevo horario y precio' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Reserva actualizada.' })).toBeVisible();
    await customerRow.getByRole('button', { name: 'Historial' }).click();
    await expect(customerRow.getByText('Reprogramada', { exact: false })).toBeVisible();
    await expect.poll(async () => (await bookingEmails(setup.buyer.email, 'booking-reschedule')).length).toBe(1);
    await expect.poll(async () => (await bookingEmails(setup.owner.email, 'owner-booking-reschedule')).length).toBe(1);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page.getByRole('link', { name: 'Iniciar sesión' })).toBeVisible();

    await page.goto('/acceso');
    await page.getByLabel('Correo').fill(setup.owner.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(setup.owner.password);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await page.getByRole('link', { name: 'Mi negocio', exact: true }).click();
    await page.getByRole('link', { name: 'Reservas', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Reservas recibidas' })).toBeVisible();
    const facilitiesResponse = await page.context().request.get(`${BACKEND}/api/v1/owner/facilities?limit=100`);
    expect(facilitiesResponse.status()).toBe(200);
    expect((await facilitiesResponse.json()).items.map((item) => item.id)).toEqual([setup.facility.id]);
    const ownerBookingsResponse = await page.context().request.get(`${BACKEND}/api/v1/owner/bookings?limit=25`);
    expect(ownerBookingsResponse.status()).toBe(200);
    const received = await ownerBookingsResponse.json();
    expect(received.items).toHaveLength(1);
    expect(received.items[0]).toMatchObject({ id: booking.id, facility: { id: setup.facility.id }, court: { id: setup.court.id }, priceMinor: PRICE_MINOR, currency: 'COP', status: 'CONFIRMADA' });
    expect(received.items.map((item) => item.id)).not.toContain(setup.foreignBookingId);
    const ownerRow = page.locator('.owner-booking-row').filter({ hasText: setup.court.name });
    await expect(ownerRow).toContainText(setup.facility.name);
    await expect(ownerRow).toContainText(setup.court.name);
    await expect(ownerRow).toContainText('09:00');
    await expect(ownerRow).toContainText('10:00');
    await expect(ownerRow).toContainText(formatCOP(PRICE_MINOR));
    await expect(ownerRow).toContainText('Confirmada');
    await expect(ownerRow).not.toContainText(setup.foreignCourt.name);
    await page.getByRole('combobox', { name: 'Instalación' }).selectOption(setup.facility.id);
    await expect(page.getByRole('combobox', { name: 'Instalación' })).toHaveValue(setup.facility.id);
    await expect(ownerRow).toBeVisible();
    await page.getByRole('combobox', { name: 'Cancha' }).selectOption(setup.court.id);
    await expect(ownerRow).toBeVisible();
    await page.getByRole('combobox', { name: 'Estado' }).selectOption('CONFIRMADA');
    await expect(ownerRow).toBeVisible();
    expect(forbiddenAdminRequests).toEqual([]);

    await page.getByRole('link', { name: 'Mis reservas', exact: true }).click();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.goto('/acceso');
    await page.getByLabel('Correo').fill(setup.buyer.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(setup.buyer.password);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await page.getByRole('link', { name: 'Mis reservas', exact: true }).click();
    await pool.execute('UPDATE bookings SET cancellation_min_minutes = 5000 WHERE id = ?', [booking.id]);
    await page.reload();
    const cleanupRow = page.locator('.booking-row').filter({ hasText: setup.court.name });
    await expect(cleanupRow).toContainText('El plazo normal para cancelar o cambiar esta reserva ya terminó.');
    await cleanupRow.getByRole('button', { name: 'Solicitar excepción' }).click();
    await cleanupRow.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Solicitud de excepción enviada' })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.goto('/acceso');
    await page.getByLabel('Correo').fill(setup.owner.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(setup.owner.password);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Mi negocio', exact: true })).toBeVisible();
    await page.goto('/owner/reservas');
    await expect(page.getByRole('heading', { name: 'Solicitudes de excepción' })).toBeVisible();
    await page.getByRole('button', { name: 'Aprobar' }).click();
    await expect.poll(async () => (await bookingEmails(setup.buyer.email, 'booking-exception-decision')).length).toBe(1);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.goto('/acceso');
    await page.getByLabel('Correo').fill(setup.buyer.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(setup.buyer.password);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Mis reservas', exact: true })).toBeVisible();
    await page.goto('/reservas');
    const approvedRow = page.locator('.booking-row').filter({ hasText: setup.court.name });
    await approvedRow.getByRole('button', { name: 'Cancelar con excepción aprobada' }).click();
    await expect(approvedRow).toContainText('Cancelada');
    await expect.poll(async () => (await bookingEmails(setup.buyer.email, 'booking-cancellation')).length).toBe(1);
    await expect.poll(async () => (await bookingEmails(setup.owner.email, 'owner-booking-cancellation')).length).toBe(1);
    const [ownerCancellation] = await bookingEmails(setup.owner.email, 'owner-booking-cancellation');
    expect(ownerCancellation.text).toContain('$90.000 COP');
    expect(ownerCancellation.text).toContain('El horario vuelve a quedar sujeto a la disponibilidad actual de la cancha.');
    await page.goto(`/canchas/${setup.court.id}`);
    await page.getByLabel('Fecha para jugar').fill(setup.date);
    await page.getByRole('button', { name: 'Ver turnos' }).click();
    await page.locator('.slot-option').filter({ hasText: '10:00' }).filter({ hasText: '60 min' }).click();
    const expiredResponse = page.waitForResponse((response) => response.url().endsWith('/api/v1/bookings') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Continuar al anticipo' }).click();
    const expiredCheckout = await (await expiredResponse).json();
    expect(expiredCheckout.booking.status).toBe('PENDIENTE_PAGO');
    await pool.execute('UPDATE bookings SET payment_expires_at = UTC_TIMESTAMP(6) - INTERVAL 1 SECOND WHERE id = ?', [expiredCheckout.booking.id]);
    await page.goto('/reservas');
    await expect(page.getByText('Pago vencido', { exact: true })).toBeVisible();
    await expect(page.getByText('El anticipo no se completó a tiempo y el horario fue liberado.')).toBeVisible();
    const [cancelled] = await pool.execute('SELECT status FROM bookings WHERE id = ?', [booking.id]);
    expect(cancelled[0].status).toBe('CANCELADA');
  } finally {
    try { await removeFixture(pool, fixture); }
    finally { await pool.end(); }
  }
});

function futureDate() {
  const date = new Date(`${todayInTimeZone('America/Bogota')}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 3);
  return { date: date.toISOString().slice(0, 10), weekday: date.getUTCDay() || 7 };
}

async function prepareFixture(pool, fixture) {
  const clock = createSystemClock();
  const [admins] = await pool.execute(`SELECT u.id FROM users u JOIN user_roles r ON r.user_id = u.id WHERE r.role_code = 'ADMINISTRADOR' AND u.deactivated_at IS NULL LIMIT 1`);
  const auth = createAuthModule({ adapter: createMySqlAuthAdapter({ pool }), clock });
  const admin = admins.length ? { id: String(admins[0].id), roles: ['USUARIO', 'ADMINISTRADOR'] }
    : await auth.bootstrapAdministrator({ name: 'Admin E2E', email: `admin-${randomUUID()}@example.test`, password: `Admin-${randomUUID()}!` });
  fixture.adminId = admin.id;
  fixture.createdAdmin = admins.length === 0;
  const owner = { email: `owner-${randomUUID()}@example.test`, password: `Owner-${randomUUID()}!` };
  const ownerAccount = await auth.register({ name: 'Propietario E2E', ...owner });
  fixture.ownerId = ownerAccount.id;
  const applications = createOwnerApplicationsModule({ adapter: createMySqlOwnerApplicationsAdapter({ pool }), clock });
  const application = await applications.create({ actor: ownerAccount, businessName: 'Negocio E2E', message: null });
  await applications.approve({ actor: admin, applicationId: application.id });
  const foreignOwner = await auth.register({ name: 'Propietario ajeno', email: `foreign-owner-${randomUUID()}@example.test`, password: `Foreign-owner-${randomUUID()}!` });
  fixture.foreignOwnerId = foreignOwner.id;
  const foreignApplication = await applications.create({ actor: foreignOwner, businessName: 'Negocio ajeno E2E', message: null });
  await applications.approve({ actor: admin, applicationId: foreignApplication.id });
  const facilities = createFacilitiesModule({ adapter: createMySqlFacilitiesAdapter({ pool }), clock });
  const membership = createFacilityMembershipsModule({ adapter: createMySqlFacilityMembershipsAdapter({ pool }), clock });
  const booking = createBookingModule({ adapter: createMySqlBookingAdapter({ pool }), clock });
  const pricing = createCourtPricingModule({ adapter: createMySqlCourtPricingAdapter({ pool }), memberships: membership });
  const catalog = createPublicCatalogModule({ adapter: createMySqlPublicCatalogAdapter({ pool }), clock });
  const date = futureDate();
  const created = [];
  for (const prefix of ['Instalación del propietario', 'Instalación ajena']) {
    const facility = await facilities.createFacility({ actor: admin, name: `${prefix} ${randomUUID().slice(0, 8)}`, timeZone: 'America/Bogota', city: 'Bogotá', address: 'Calle 10 #20-30', description: 'Fixture real E2E.', minimumAdvanceMinutes: 15, maximumAdvanceMinutes: 43200 });
    fixture.facilityIds.push(facility.facility.id);
    await membership.assignMembership({ actor: admin, facilityId: facility.facility.id,
      userId: prefix === 'Instalación del propietario' ? ownerAccount.id : foreignOwner.id });
    const court = await booking.createCourt({ actor: admin, facilityId: facility.facility.id, name: `${prefix} cancha`, description: 'Cancha cubierta.', sportCode: 'FUTBOL_5', minimumSeparationMinutes: 0, startIntervalMinutes: 30, allowedDurationsMinutes: [60] });
    fixture.courtIds.push(court.court.id);
    await facilities.updateCourt({ actor: admin, courtId: court.court.id, sportCode: 'FUTBOL_5' });
    await pricing.setPrice({ actor: admin, scope: 'admin', courtId: court.court.id, durationMinutes: 60, priceMinor: PRICE_MINOR });
    await booking.replaceWeeklySchedule({ actor: admin, courtId: court.court.id, periods: [{ weekday: date.weekday, startTime: '08:00:00', endTime: '22:00:00' }] });
    await catalog.publish({ actor: admin, facilityId: facility.facility.id });
    created.push({ facility: facility.facility, court: court.court });
  }
  const foreignBuyer = await auth.register({ name: 'Cliente ajeno', email: `foreign-${randomUUID()}@example.test`, password: `Foreign-${randomUUID()}!` });
  fixture.foreignBuyerId = foreignBuyer.id;
  const foreignBooking = await booking.confirmBooking({ actor: foreignBuyer, idempotencyKey: randomUUID(), request: { courtId: created[1].court.id, localDate: date.date, startTime: '08:00:00', durationMinutes: 60, expectedPriceMinor: PRICE_MINOR, currency: 'COP' } });
  return { owner, buyer: { email: `buyer-${randomUUID()}@example.test`, password: `Buyer-${randomUUID()}!` }, date: date.date, facility: created[0].facility, court: created[0].court, foreignCourt: created[1].court, foreignBookingId: foreignBooking.booking.id };
}

async function removeFixture(pool, fixture) {
  for (const userId of [fixture.buyerId, fixture.foreignBuyerId]) {
    if (!userId) continue;
    await pool.execute('DELETE FROM idempotency_records WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM operational_conflicts WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ?)', [userId]);
    await pool.execute('DELETE FROM booking_changes WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ?)', [userId]);
    await pool.execute('DELETE FROM booking_exception_requests WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ?)', [userId]);
    await pool.execute('DELETE FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ?)', [userId]);
    await pool.execute('DELETE FROM customer_credit_ledger WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ?)', [userId]);
    await pool.execute('DELETE FROM customer_credit_balances WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM bookings WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM sessions WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM user_credentials WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
  }
  for (const courtId of fixture.courtIds) {
    await pool.execute('DELETE FROM operational_conflicts WHERE operational_change_id IN (SELECT id FROM operational_changes WHERE court_id = ?)', [courtId]);
    await pool.execute('DELETE FROM operational_changes WHERE court_id = ?', [courtId]);
    await pool.execute('DELETE FROM court_weekly_periods WHERE court_id = ?', [courtId]);
    await pool.execute('DELETE FROM court_prices WHERE court_id = ?', [courtId]);
    await pool.execute('DELETE FROM court_allowed_durations WHERE court_id = ?', [courtId]);
    await pool.execute('DELETE FROM courts WHERE id = ?', [courtId]);
  }
  for (const facilityId of fixture.facilityIds) {
    await pool.execute('DELETE FROM facility_memberships WHERE facility_id = ?', [facilityId]);
    await pool.execute('DELETE FROM facilities WHERE id = ?', [facilityId]);
  }
  if (fixture.ownerId) {
    await pool.execute('DELETE FROM owner_applications WHERE user_id = ?', [fixture.ownerId]);
    await pool.execute('DELETE FROM sessions WHERE user_id = ?', [fixture.ownerId]);
    await pool.execute('DELETE FROM user_credentials WHERE user_id = ?', [fixture.ownerId]);
    await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [fixture.ownerId]);
    await pool.execute('DELETE FROM users WHERE id = ?', [fixture.ownerId]);
  }
  if (fixture.foreignOwnerId) {
    await pool.execute('DELETE FROM owner_applications WHERE user_id = ?', [fixture.foreignOwnerId]);
    await pool.execute('DELETE FROM sessions WHERE user_id = ?', [fixture.foreignOwnerId]);
    await pool.execute('DELETE FROM user_credentials WHERE user_id = ?', [fixture.foreignOwnerId]);
    await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [fixture.foreignOwnerId]);
    await pool.execute('DELETE FROM users WHERE id = ?', [fixture.foreignOwnerId]);
  }
  if (fixture.createdAdmin) {
    await pool.execute('DELETE FROM user_credentials WHERE user_id = ?', [fixture.adminId]);
    await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [fixture.adminId]);
    await pool.execute('DELETE FROM users WHERE id = ?', [fixture.adminId]);
  }
}
