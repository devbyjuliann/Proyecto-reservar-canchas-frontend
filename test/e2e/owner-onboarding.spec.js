import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { loadDatabaseConfig } from '../../../backend/src/config/database.js';
import { createMySqlPool } from '../../../backend/src/database/pool.js';
import { createAuthModule, createMySqlAuthAdapter } from '../../../backend/src/modules/auth/index.js';
import { createFacilitiesModule, createMySqlFacilitiesAdapter } from '../../../backend/src/modules/facilities/index.js';
import { createSystemClock } from '../../../backend/src/shared/clock.js';
import { createMySqlUsersAdapter } from '../../../backend/src/modules/users/index.js';

const BACKEND = 'http://localhost:3107';

test('onboarding real: solicitud → aprobación → membresía → Mi negocio', async ({ page }) => {
  test.setTimeout(120_000);
  const config = loadDatabaseConfig();
  if (config.environment !== 'test' || !config.database.endsWith('_test')) {
    throw new Error('El E2E de Propietario exige una base _test');
  }
  const pool = createMySqlPool(config);
  const fixture = { adminId: null, createdFacilityIds: [], facilityIds: [], applicantId: null };
  const applicantEmail = `owner-onboarding-${randomUUID()}@example.test`;
  const applicantPassword = 'Marketplace-Owner-E2E-2026!';
  const businessName = `Negocio de prueba ${randomUUID().slice(0, 8)}`;
  try {
    const { adminEmail, adminPassword } = await prepareMinimumAdminAndFacilities(pool, fixture);
    const [assignedId, unassignedId] = fixture.facilityIds;

    await page.goto('/');
    await expect(page.getByRole('heading', { name: '¿Eres dueño de una cancha? Registra tu negocio' })).toBeVisible();
    await page.getByRole('link', { name: 'Conocer el próximo paso' }).click();
    await expect(page).toHaveURL(/\/acceso$/);
    await page.getByRole('tab', { name: 'Crear cuenta' }).click();
    await page.getByLabel('Nombre').fill('Propietario en revisión');
    await page.getByLabel('Correo').fill(applicantEmail);
    await page.getByLabel('Contraseña', { exact: true }).fill(applicantPassword);
    const registrationResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/auth/registrations'));
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    const registration = await registrationResponse;
    expect(registration.status()).toBe(201);
    fixture.applicantId = (await registration.json()).user.id;
    await page.getByLabel('Contraseña', { exact: true }).fill(applicantPassword);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
    await expect(page).toHaveURL(/\/propietarios$/);
    await expect(page.getByLabel('Nombre comercial')).toBeVisible();
    expect((await page.context().cookies(BACKEND)).some((cookie) => cookie.httpOnly)).toBe(true);

    await page.getByLabel('Nombre comercial').fill(businessName);
    await page.getByLabel('Mensaje para el Administrador (opcional)').fill('Quiero registrar mi negocio.');
    const creationResponse = page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/me/owner-applications')
      && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    const creation = await creationResponse;
    expect(creation.status()).toBe(201);
    expect(creation.request().headers()['x-user-id']).toBeUndefined();
    const application = (await creation.json()).ownerApplication;
    expect(application.status).toBe('PENDIENTE');
    await expect(page.getByText('Solicitud enviada')).toBeVisible();
    await expect(page.locator('.owner-history-item').filter({ hasText: businessName })).toContainText('Pendiente');
    const [pendingRows] = await pool.execute(
      'SELECT status, decided_at FROM owner_applications WHERE id = ? AND user_id = ?',
      [application.id, fixture.applicantId],
    );
    expect(pendingRows[0].status).toBe('PENDIENTE');
    expect(pendingRows[0].decided_at).toBeNull();
    expect(await userRoles(pool, fixture.applicantId)).toEqual(['USUARIO']);
    expect(await membershipIds(pool, fixture.applicantId)).toEqual([]);

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.getByRole('link', { name: 'Iniciar sesión' }).click();
    await page.getByLabel('Correo').fill(adminEmail);
    await page.getByLabel('Contraseña', { exact: true }).fill(adminPassword);
    await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
    await expect(page.getByRole('link', { name: 'Administración' })).toBeVisible();
    expect((await page.context().cookies(BACKEND)).some((cookie) => cookie.httpOnly)).toBe(true);
    await page.getByRole('link', { name: 'Administración' }).click();
    await page.getByRole('link', { name: 'Solicitudes de Propietario' }).click();
    await expect(page.getByRole('heading', { name: 'Solicitudes de Propietario' })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Cargando solicitudes' })).toBeHidden();

    const pendingItem = page.locator('.application-row').filter({ hasText: businessName });
    for (let pageNumber = 0; pageNumber < 10 && !await pendingItem.isVisible(); pageNumber += 1) {
      await expect(page.getByRole('button', { name: 'Ver más solicitudes' })).toBeVisible();
      await page.getByRole('button', { name: 'Ver más solicitudes' }).click();
    }
    await expect(pendingItem).toBeVisible();
    await pendingItem.click();
    await expect(page.getByRole('button', { name: 'Aprobar solicitud' })).toBeVisible();
    const approvalResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/api/v1/admin/owner-applications/${application.id}/approval`)
      && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Aprobar solicitud' }).click();
    const approval = await approvalResponse;
    expect(approval.status()).toBe(200);
    expect((await approval.json()).user.roles).toContain('PROPIETARIO');
    await expect(page.getByText('Rol PROPIETARIO concedido')).toBeVisible();
    const [approvedRows] = await pool.execute(
      'SELECT status, decided_at, decided_by_user_id FROM owner_applications WHERE id = ?',
      [application.id],
    );
    expect(approvedRows[0].status).toBe('APROBADA');
    expect(approvedRows[0].decided_at).not.toBeNull();
    expect(String(approvedRows[0].decided_by_user_id)).toBe(fixture.adminId);
    expect(await userRoles(pool, fixture.applicantId)).toEqual(['PROPIETARIO', 'USUARIO']);
    expect(await membershipIds(pool, fixture.applicantId)).toEqual([]);

    await page.goto(`/admin/instalaciones/${assignedId}`);
    await expect(page.getByRole('heading', { name: 'Propietarios de la Instalación' })).toBeVisible();
    await page.getByLabel('Propietario aprobado').selectOption(fixture.applicantId);
    const membershipResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/api/v1/admin/facilities/${assignedId}/memberships`)
      && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Asignar a esta Instalación' }).click();
    const assignment = await membershipResponse;
    expect(assignment.status()).toBe(201);
    const membership = (await assignment.json()).membership;
    expect(membership.active).toBe(true);
    await expect(page.getByText('Membresía asignada.', { exact: false })).toBeVisible();
    expect(await membershipIds(pool, fixture.applicantId)).toEqual([assignedId]);

    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.getByRole('link', { name: 'Iniciar sesión' }).click();
    await page.getByLabel('Correo').fill(applicantEmail);
    await page.getByLabel('Contraseña', { exact: true }).fill(applicantPassword);
    const ownerLogin = page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/sessions'));
    await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
    expect((await (await ownerLogin).json()).user.roles).toContain('PROPIETARIO');
    await expect(page.getByRole('link', { name: 'Mi negocio', exact: true })).toBeVisible();
    const ownedResponse = page.waitForResponse((response) =>
      response.url().includes('/api/v1/owner/facilities?') && response.request().method() === 'GET');
    await page.getByRole('link', { name: 'Mi negocio', exact: true }).click();
    const ownList = await ownedResponse;
    expect(ownList.status()).toBe(200);
    expect(ownList.request().headers()['x-user-id']).toBeUndefined();
    const owned = (await ownList.json()).items;
    expect(owned.map((item) => item.id)).toEqual([assignedId]);
    const [assignedFacility] = await pool.execute('SELECT name FROM facilities WHERE id = ?', [assignedId]);
    const [unassignedFacility] = await pool.execute('SELECT name FROM facilities WHERE id = ?', [unassignedId]);
    await expect(page.getByText(assignedFacility[0].name)).toBeVisible();
    await expect(page.getByText(unassignedFacility[0].name)).toHaveCount(0);
    const foreign = await page.context().request.get(`${BACKEND}/api/v1/owner/facilities/${unassignedId}`);
    expect(foreign.status()).toBe(404);
    await page.locator('.owner-dashboard-facility').filter({ hasText: assignedFacility[0].name }).getByRole('link', { name: 'Abrir negocio' }).click();
    await expect(page).toHaveURL(new RegExp(`/owner/instalaciones/${assignedId}$`));
    await expect(page.getByRole('heading', { name: assignedFacility[0].name })).toBeVisible();
  } finally {
    await cleanFixture(pool, fixture);
    await pool.end();
  }
});

async function prepareMinimumAdminAndFacilities(pool, fixture) {
  const clock = createSystemClock();
  const auth = createAuthModule({ adapter: createMySqlAuthAdapter({ pool }), clock });
  const users = createMySqlUsersAdapter({ pool });
  const [existing] = await pool.execute(
    `SELECT u.id FROM users u JOIN user_roles r ON r.user_id = u.id
     WHERE r.role_code = 'ADMINISTRADOR' AND u.deactivated_at IS NULL LIMIT 1`,
  );
  const adminEmail = `admin-onboarding-${randomUUID()}@example.test`;
  const adminPassword = `Admin-E2E-${randomUUID()}!`;
  const admin = existing.length === 0
    ? await auth.bootstrapAdministrator({ name: 'Administrador E2E', email: adminEmail, password: adminPassword })
    : await auth.register({ name: 'Administrador E2E', email: adminEmail, password: adminPassword });
  fixture.adminId = admin.id;
  if (existing.length > 0) await users.assignRole(admin.id, 'ADMINISTRADOR');
  const facilities = createFacilitiesModule({ adapter: createMySqlFacilitiesAdapter({ pool }), clock });
  const [available] = await pool.execute(
    'SELECT id FROM facilities WHERE deactivated_at IS NULL ORDER BY id ASC LIMIT 2',
  );
  fixture.facilityIds.push(...available.map(({ id }) => String(id)));
  while (fixture.facilityIds.length < 2) {
    const result = await facilities.createFacility({ actor: { id: admin.id, roles: ['USUARIO', 'ADMINISTRADOR'] },
      name: `Instalación de prueba ${randomUUID().slice(0, 8)}`,
      timeZone: 'America/Bogota', minimumAdvanceMinutes: 15, maximumAdvanceMinutes: 43200 });
    fixture.facilityIds.push(result.facility.id);
    fixture.createdFacilityIds.push(result.facility.id);
  }
  return { adminEmail, adminPassword };
}

async function userRoles(pool, userId) {
  const [rows] = await pool.execute('SELECT role_code FROM user_roles WHERE user_id = ? ORDER BY role_code', [userId]);
  return rows.map(({ role_code }) => role_code);
}

async function membershipIds(pool, userId) {
  const [rows] = await pool.execute(
    'SELECT facility_id FROM facility_memberships WHERE user_id = ? AND active = 1 ORDER BY facility_id',
    [userId],
  );
  return rows.map(({ facility_id }) => String(facility_id));
}

async function cleanFixture(pool, fixture) {
  if (fixture.applicantId) {
    await pool.execute('DELETE FROM facility_memberships WHERE user_id = ?', [fixture.applicantId]);
    await pool.execute('DELETE FROM owner_applications WHERE user_id = ?', [fixture.applicantId]);
    await pool.execute('DELETE FROM sessions WHERE user_id = ?', [fixture.applicantId]);
    await pool.execute('DELETE FROM user_credentials WHERE user_id = ?', [fixture.applicantId]);
    await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [fixture.applicantId]);
    await pool.execute('DELETE FROM users WHERE id = ?', [fixture.applicantId]);
  }
  for (const facilityId of fixture.createdFacilityIds) {
    await pool.execute('DELETE FROM facilities WHERE id = ?', [facilityId]);
  }
  if (fixture.adminId) {
    await pool.execute('DELETE FROM sessions WHERE user_id = ?', [fixture.adminId]);
    await pool.execute('DELETE FROM user_credentials WHERE user_id = ?', [fixture.adminId]);
    await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [fixture.adminId]);
    await pool.execute('DELETE FROM users WHERE id = ?', [fixture.adminId]);
  }
}
