import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

import { loadDatabaseConfig } from '../../../backend/src/config/database.js';
import { createMySqlPool } from '../../../backend/src/database/pool.js';
import { createAuthModule, createMySqlAuthAdapter } from '../../../backend/src/modules/auth/index.js';
import { createSystemClock } from '../../../backend/src/shared/clock.js';

test('ADMINISTRADOR accede y edita el nombre de la Instalación 15', async ({ page }) => {
  const config = loadDatabaseConfig();
  if (config.environment !== 'test' || !config.database.endsWith('_test')) {
    throw new Error('El E2E administrativo requiere una base _test');
  }

  const email = `admin-e2e-${randomUUID()}@example.test`;
  const password = `Admin-E2E-${randomUUID()}!`;
  const pool = createMySqlPool(config);
  try {
    const auth = createAuthModule({ adapter: createMySqlAuthAdapter({ pool }), clock: createSystemClock() });
    await auth.bootstrapAdministrator({ name: 'Administrador E2E', email, password });
  } finally {
    await pool.end();
  }

  await page.goto('/acceso');
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
  await expect(page.getByText('Administrador E2E')).toBeVisible();

  await page.getByRole('link', { name: 'Instalaciones' }).click();
  await expect(page.getByRole('heading', { name: 'Instalaciones', exact: true })).toBeVisible();
  await expect(page.locator('.resource-list .resource-row').first()).toBeVisible();

  await page.goto('/admin/instalaciones/15');
  const originalName = await page.locator('.resource-hero h1').textContent();
  const updatedName = `${originalName} E2E-${randomUUID().slice(0, 8)}`;
  await page.getByRole('button', { name: 'Editar nombre' }).click();
  await page.getByLabel('Nombre').fill(updatedName);
  await page.getByRole('button', { name: 'Guardar nombre' }).click();
  await expect(page.locator('.resource-hero h1')).toHaveText(updatedName);

  const response = await page.context().request.get('http://localhost:3000/api/v1/admin/facilities/15');
  expect(response.status()).toBe(200);
  expect((await response.json()).facility.name).toBe(updatedName);
});
