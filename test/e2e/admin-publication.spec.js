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
import { createSystemClock } from '../../../backend/src/shared/clock.js';

test('administrador publica y despublica una instalación preparada', async ({ page }) => {
  test.setTimeout(90_000);
  const config = loadDatabaseConfig();
  if (config.environment !== 'test' || !config.database.endsWith('_test')) throw new Error('El E2E exige MySQL _test');
  const pool = createMySqlPool(config);
  const ids = {};
  try {
    const fixture = await prepare(pool, ids);
    await page.goto('/acceso');
    await page.getByLabel('Correo').fill(fixture.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(fixture.password);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Administración' })).toBeVisible();
    await page.goto(`/admin/instalaciones/${fixture.facilityId}`);
    await expectAdminResponsiveLayout(page);
    await page.goto(`/admin/canchas/${ids.court}`);
    await expect(page.getByRole('heading', { name: 'Cancha Test' })).toBeVisible();
    await expectAdminResponsiveLayout(page);
    await page.goto(`/admin/instalaciones/${fixture.facilityId}`);
    await expect(page.getByText('BORRADOR', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publicar instalación' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Despublicar instalación' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Publicar instalación' }).click();
    await expect(page.getByText('PUBLICADA', { exact: true })).toBeVisible();
    await expect(page.getByText('La Instalación ya aparece en el marketplace.')).toBeVisible();
    expect((await page.context().request.get(`http://localhost:3000/api/v1/facilities/${fixture.facilityId}`)).status()).toBe(200);
    await page.getByRole('button', { name: 'Suspender instalación' }).click();
    await expect(page.getByText('Suspendida', { exact: true })).toBeVisible();
    await expect(page.getByText('PUBLICADA', { exact: true })).toBeVisible();
    expect((await page.context().request.get(`http://localhost:3000/api/v1/facilities/${fixture.facilityId}`)).status()).toBe(404);
    await page.getByRole('button', { name: 'Reactivar instalación' }).click();
    await expect(page.locator('.policy-strip').getByText('Activa', { exact: true })).toBeVisible();
    expect((await page.context().request.get(`http://localhost:3000/api/v1/facilities/${fixture.facilityId}`)).status()).toBe(200);
    await page.getByRole('button', { name: 'Despublicar instalación' }).click();
    await expect(page.getByText('BORRADOR', { exact: true })).toBeVisible();
    await expect(page.getByText('La Instalación dejó de aparecer en el marketplace.')).toBeVisible();
    expect((await page.context().request.get(`http://localhost:3000/api/v1/facilities/${fixture.facilityId}`)).status()).toBe(404);
    await pool.execute('DELETE FROM court_prices WHERE court_id = ?', [ids.court]);
    await page.getByRole('button', { name: 'Publicar instalación' }).click();
    await expect(page.getByText(/aún no está lista para publicar/i)).toBeVisible();
    await expect(page.getByText('BORRADOR', { exact: true })).toBeVisible();
  } finally { await cleanup(pool, ids); await pool.end(); }
});

async function prepare(pool, ids) {
  const clock = createSystemClock(); const auth = createAuthModule({ adapter: createMySqlAuthAdapter({ pool }), clock });
  const email = `publication-admin-${randomUUID()}@example.test`; const password = `Admin-${randomUUID()}!`;
  const admin = await auth.register({ name: 'Admin publicación', email, password }); ids.admin = admin.id;
  await pool.execute('INSERT INTO user_roles (user_id, role_code) VALUES (?, ?)', [admin.id, 'ADMINISTRADOR']);
  const owner = await auth.register({ name: 'Owner publicación', email: `publication-owner-${randomUUID()}@example.test`, password: `Owner-${randomUUID()}!` }); ids.owner = owner.id;
  const applications = createOwnerApplicationsModule({ adapter: createMySqlOwnerApplicationsAdapter({ pool }), clock });
  const application = await applications.create({ actor: owner, businessName: 'Negocio', message: null }); await applications.approve({ actor: { ...admin, roles: ['USUARIO', 'ADMINISTRADOR'] }, applicationId: application.id });
  const facilities = createFacilitiesModule({ adapter: createMySqlFacilitiesAdapter({ pool }), clock });
  const facility = await facilities.createFacility({ actor: { ...admin, roles: ['USUARIO', 'ADMINISTRADOR'] }, name: `Test Cancha ${randomUUID().slice(0, 8)}`, timeZone: 'America/Bogota', city: 'Ibagué', address: 'Calle 1', description: 'Cancha de prueba', minimumAdvanceMinutes: 0, maximumAdvanceMinutes: 43200 }); ids.facility = facility.facility.id;
  const membership = createFacilityMembershipsModule({ adapter: createMySqlFacilityMembershipsAdapter({ pool }), clock }); await membership.assignMembership({ actor: { ...admin, roles: ['USUARIO', 'ADMINISTRADOR'] }, facilityId: ids.facility, userId: owner.id });
  const booking = createBookingModule({ adapter: createMySqlBookingAdapter({ pool }), clock }); const court = await booking.createCourt({ actor: { ...admin, roles: ['USUARIO', 'ADMINISTRADOR'] }, facilityId: ids.facility, name: 'Cancha Test', description: 'Fútbol', sportCode: 'FUTBOL_5', minimumSeparationMinutes: 0, startIntervalMinutes: 30, allowedDurationsMinutes: [60] }); ids.court = court.court.id;
  const pricing = createCourtPricingModule({ adapter: createMySqlCourtPricingAdapter({ pool }), memberships: membership }); await pricing.setPrice({ actor: { ...admin, roles: ['USUARIO', 'ADMINISTRADOR'] }, scope: 'admin', courtId: ids.court, durationMinutes: 60, priceMinor: 5000000 });
  return { email, password, facilityId: ids.facility };
}

async function expectAdminResponsiveLayout(page) {
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

async function cleanup(pool, ids) { if (ids.court) { await pool.execute('DELETE FROM operational_conflicts WHERE operational_change_id IN (SELECT id FROM operational_changes WHERE court_id = ?)', [ids.court]); await pool.execute('DELETE FROM operational_changes WHERE court_id = ?', [ids.court]); await pool.execute('DELETE FROM court_prices WHERE court_id = ?', [ids.court]); await pool.execute('DELETE FROM court_allowed_durations WHERE court_id = ?', [ids.court]); await pool.execute('DELETE FROM courts WHERE id = ?', [ids.court]); } if (ids.facility) { await pool.execute('DELETE FROM facility_memberships WHERE facility_id = ?', [ids.facility]); await pool.execute('DELETE FROM facilities WHERE id = ?', [ids.facility]); } for (const id of [ids.owner, ids.admin]) if (id) { await pool.execute('DELETE FROM owner_applications WHERE user_id = ?', [id]); await pool.execute('DELETE FROM sessions WHERE user_id = ?', [id]); await pool.execute('DELETE FROM user_credentials WHERE user_id = ?', [id]); await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [id]); await pool.execute('DELETE FROM users WHERE id = ?', [id]); } }
