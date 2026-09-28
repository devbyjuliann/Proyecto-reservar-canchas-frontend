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

import { formatCOP, todayInTimeZone } from '../../src/lib/format.js';

const BACKEND = 'http://localhost:3000';
const ORIGIN = 'http://localhost:5177';
const INITIAL_PRICE = 9000000;
const UPDATED_PRICE = 9200000;

test('owner real: configuración, horario y precio hasta el marketplace público', async ({ page }) => {
  test.setTimeout(150_000);
  const config = loadDatabaseConfig();
  if (config.environment !== 'test' || !config.database.endsWith('_test')) {
    throw new Error('El E2E operativo exige una base _test');
  }
  const pool = createMySqlPool(config);
  const fixture = { adminId: null, createdAdmin: false, ownerId: null,
    facilityIds: [], courtIds: [] };
  let original;
  let restored = false;
  const modified = { configuration: false, schedule: false, price: false };

  try {
    const credentials = await prepareOwnerFixture(pool, fixture);
    const [facilityId, foreignFacilityId] = fixture.facilityIds;
    const [courtId, foreignCourtId] = fixture.courtIds;
    const api = page.context().request;

    await page.goto('/acceso');
    await page.getByLabel('Correo').fill(credentials.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(credentials.password);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
    await expect(page.getByRole('link', { name: 'Mi negocio', exact: true })).toBeVisible();
    expect((await page.context().cookies(BACKEND)).some((cookie) => cookie.httpOnly)).toBe(true);
    const foreign = await api.get(`${BACKEND}/api/v1/owner/courts/${foreignCourtId}`);
    expect(foreign.status()).toBe(404);

    await page.getByRole('link', { name: 'Mi negocio', exact: true }).click();
    const facilityResponse = await api.get(`${BACKEND}/api/v1/owner/facilities?limit=25`);
    expect(facilityResponse.status()).toBe(200);
    expect((await facilityResponse.json()).items.map((item) => item.id)).toEqual([facilityId]);
    const facilityName = (await (await api.get(`${BACKEND}/api/v1/owner/facilities/${facilityId}`)).json()).facility.name;
    await page.locator('.owner-facility-row').filter({ hasText: facilityName }).click();
    await expect(page.getByRole('heading', { name: facilityName })).toBeVisible();
    const courtName = (await (await api.get(`${BACKEND}/api/v1/owner/courts/${courtId}`)).json()).court.name;
    await page.locator('.owner-court-row').filter({ hasText: courtName }).click();
    await expect(page.getByRole('heading', { name: courtName })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/owner/canchas/${courtId}$`));

    const configurationPath = `${BACKEND}/api/v1/owner/courts/${courtId}/booking-configuration`;
    const schedulePath = `${BACKEND}/api/v1/owner/courts/${courtId}/weekly-schedule`;
    const pricesPath = `${BACKEND}/api/v1/owner/courts/${courtId}/prices`;
    const configuration = await api.get(configurationPath);
    const schedule = await api.get(schedulePath);
    const prices = await api.get(pricesPath);
    expect([configuration.status(), schedule.status(), prices.status()]).toEqual([200, 200, 200]);
    original = {
      configuration: await configuration.json(),
      schedule: (await schedule.json()).weeklySchedule,
      price: (await prices.json()).items.find((item) => item.durationMinutes === 60),
    };
    expect(original.price.priceMinor).toBe(INITIAL_PRICE);

    await page.getByRole('button', { name: 'Configuración', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Configuración de Reserva' })).toBeVisible();
    const nextSeparation = original.configuration.minimumSeparationMinutes + 1;
    modified.configuration = true;
    await page.getByLabel('Separación mínima (minutos)').fill(String(nextSeparation));
    await page.getByRole('button', { name: 'Guardar configuración' }).click();
    await expect(page.getByText('Configuración de Reserva actualizada.')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: courtName })).toBeVisible();
    await page.getByRole('button', { name: 'Horarios', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Horario semanal' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Editar horario' }).click();
    modified.schedule = true;
    await page.getByLabel('Fin', { exact: true }).fill('21:00');
    await page.getByRole('button', { name: 'Reemplazar horario' }).click();
    await page.getByRole('button', { name: 'Confirmar reemplazo' }).click();
    await expect(page.getByText('Horario semanal actualizado.')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: courtName })).toBeVisible();
    await page.getByRole('button', { name: 'Precios', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Precios por Duración' })).toBeVisible({ timeout: 30_000 });
    modified.price = true;
    await page.getByLabel('Precio para 60 minutos (COP)').fill('92000');
    await page.getByRole('button', { name: 'Actualizar precio' }).click();
    await expect(page.getByText('Precio en COP guardado.')).toBeVisible();

    await page.reload();
    await page.getByRole('button', { name: 'Configuración', exact: true }).click();
    await expect(page.getByLabel('Separación mínima (minutos)')).toHaveValue(String(nextSeparation));
    await page.reload();
    await expect(page.getByRole('heading', { name: courtName })).toBeVisible();
    await page.getByRole('button', { name: 'Horarios', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Horario semanal' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('08:00–21:00')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: courtName })).toBeVisible();
    await page.getByRole('button', { name: 'Precios', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Precios por Duración' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(formatCOP(UPDATED_PRICE))).toBeVisible();

    const persistedConfig = (await (await api.get(configurationPath)).json());
    const persistedSchedule = (await (await api.get(schedulePath)).json()).weeklySchedule;
    const persistedPrice = (await (await api.get(pricesPath)).json()).items.find((item) => item.durationMinutes === 60);
    expect(persistedConfig.minimumSeparationMinutes).toBe(nextSeparation);
    expect(persistedSchedule.periods[0].endTime).toBe('21:00:00');
    expect(persistedPrice.priceMinor).toBe(UPDATED_PRICE);

    await page.getByRole('link', { name: 'Marketplace' }).click();
    await page.getByRole('searchbox', { name: 'Busca una cancha o establecimiento' }).fill(facilityName);
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.getByRole('link', { name: `Ver establecimiento ${facilityName}` }).click();
    await page.getByRole('link', { name: `Ver cancha ${courtName} de ${facilityName}` }).click();
    await expect(page.getByRole('heading', { name: courtName })).toBeVisible();
    await expect(page.getByText(formatCOP(UPDATED_PRICE)).first()).toBeVisible();
    const publicCourt = await api.get(`${BACKEND}/api/v1/courts/${courtId}`);
    expect(publicCourt.status()).toBe(200);
    expect((await publicCourt.json()).court.prices.find((item) => item.durationMinutes === 60).priceMinor)
      .toBe(UPDATED_PRICE);
    expect((await api.get(`${BACKEND}/api/v1/owner/courts/${foreignCourtId}`)).status()).toBe(404);
    expect(foreignFacilityId).not.toBe(facilityId);
  } finally {
    try {
      if (original && modified.configuration && fixture.courtIds[0]) {
        const ownerAPI = page.context().request;
        const courtId = fixture.courtIds[0];
        const ownerPath = `${BACKEND}/api/v1/owner/courts/${courtId}`;
        if (modified.configuration) {
          const response = await ownerAPI.put(`${ownerPath}/booking-configuration`, {
            data: original.configuration, headers: { Origin: ORIGIN },
          });
          expect(response.status()).toBe(200);
        }
        if (modified.schedule) {
          const response = await ownerAPI.put(`${ownerPath}/weekly-schedule`, {
            data: { periods: original.schedule.periods }, headers: { Origin: ORIGIN },
          });
          expect(response.status()).toBe(200);
        }
        if (modified.price) {
          const response = await ownerAPI.put(`${ownerPath}/prices/60`, {
            data: { priceMinor: original.price.priceMinor, currency: 'COP' },
            headers: { Origin: ORIGIN },
          });
          expect(response.status()).toBe(200);
        }
        restored = (await (await ownerAPI.get(`${ownerPath}/booking-configuration`)).json()).minimumSeparationMinutes
          === original.configuration.minimumSeparationMinutes
          && (await (await ownerAPI.get(`${ownerPath}/weekly-schedule`)).json()).weeklySchedule.periods[0].endTime
          === original.schedule.periods[0].endTime
          && (await (await ownerAPI.get(`${ownerPath}/prices`)).json()).items[0].priceMinor
          === original.price.priceMinor;
        expect(restored).toBe(true);
      }
    } finally {
      try { await removeFixture(pool, fixture); }
      finally { await pool.end(); }
    }
  }
});

function futureWeekday() {
  const date = new Date(`${todayInTimeZone('America/Bogota')}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 3);
  return date.getUTCDay() || 7;
}

async function prepareOwnerFixture(pool, fixture) {
  const clock = createSystemClock();
  const [admins] = await pool.execute(
    `SELECT u.id FROM users u JOIN user_roles r ON r.user_id = u.id
     WHERE r.role_code = 'ADMINISTRADOR' AND u.deactivated_at IS NULL LIMIT 1`,
  );
  const auth = createAuthModule({ adapter: createMySqlAuthAdapter({ pool }), clock });
  const admin = admins.length ? { id: String(admins[0].id), roles: ['USUARIO', 'ADMINISTRADOR'] }
    : await auth.bootstrapAdministrator({ name: 'Admin de fixture',
      email: `owner-ops-admin-${randomUUID()}@example.test`, password: `Admin-${randomUUID()}!` });
  fixture.adminId = admin.id;
  fixture.createdAdmin = admins.length === 0;
  const email = `owner-ops-${randomUUID()}@example.test`;
  const password = `Owner-${randomUUID()}!`;
  const owner = await auth.register({ name: 'Propietario operativo', email, password });
  fixture.ownerId = owner.id;
  const applications = createOwnerApplicationsModule({
    adapter: createMySqlOwnerApplicationsAdapter({ pool }), clock,
  });
  const application = await applications.create({ actor: owner,
    businessName: 'Fixture operativa', message: null });
  await applications.approve({ actor: admin, applicationId: application.id });

  const facilities = createFacilitiesModule({ adapter: createMySqlFacilitiesAdapter({ pool }), clock });
  const membership = createFacilityMembershipsModule({
    adapter: createMySqlFacilityMembershipsAdapter({ pool }), clock,
  });
  const booking = createBookingModule({ adapter: createMySqlBookingAdapter({ pool }), clock });
  const pricing = createCourtPricingModule({
    adapter: createMySqlCourtPricingAdapter({ pool }), memberships: membership,
  });
  for (const name of ['Negocio Propietario', 'Negocio ajeno']) {
    const result = await facilities.createFacility({ actor: admin,
      name: `${name} ${randomUUID().slice(0, 8)}`, timeZone: 'America/Bogota',
      city: 'Bogotá', address: 'Calle 10 #20-30', description: 'Cancha cubierta para pruebas.',
      minimumAdvanceMinutes: 15, maximumAdvanceMinutes: 43200 });
    fixture.facilityIds.push(result.facility.id);
  }
  await membership.assignMembership({ actor: admin,
    facilityId: fixture.facilityIds[0], userId: owner.id });
  for (const [index, facilityId] of fixture.facilityIds.entries()) {
    const created = await booking.createCourt({ actor: admin, facilityId,
      name: index === 0 ? 'Cancha principal' : 'Cancha ajena',
      description: 'Cubierta', sportCode: 'FUTBOL_5',
      minimumSeparationMinutes: 0, startIntervalMinutes: 30,
      allowedDurationsMinutes: [60] });
    fixture.courtIds.push(created.court.id);
  }
  await pricing.setPrice({ actor: admin, scope: 'admin',
    courtId: fixture.courtIds[0], durationMinutes: 60, priceMinor: INITIAL_PRICE });
  await booking.replaceWeeklySchedule({ actor: admin, courtId: fixture.courtIds[0],
    periods: [{ weekday: futureWeekday(), startTime: '08:00:00', endTime: '22:00:00' }] });
  const catalog = createPublicCatalogModule({
    adapter: createMySqlPublicCatalogAdapter({ pool }), clock,
  });
  expect((await catalog.publish({ actor: admin, facilityId: fixture.facilityIds[0] })).changed).toBe(true);
  return { email, password };
}

async function removeFixture(pool, fixture) {
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
  if (fixture.createdAdmin) {
    await pool.execute('DELETE FROM user_credentials WHERE user_id = ?', [fixture.adminId]);
    await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [fixture.adminId]);
    await pool.execute('DELETE FROM users WHERE id = ?', [fixture.adminId]);
  }
}
