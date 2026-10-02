import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('registro → login → /me → logout con sesión real', async ({ page }) => {
  const name = 'Usuario E2E';
  const email = `e2e-${randomUUID()}@example.test`;
  const password = 'Contrasena-E2E-2026!';

  await page.goto('/acceso');
  await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
  await page.getByRole('tab', { name: 'Crear cuenta' }).click();
  await page.getByLabel('Nombre').fill(name);
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('Cuenta creada. Ingresa con tu correo y contraseña.')).toBeVisible();

  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.getByText(name)).toBeVisible();
  await page.goto('/reservas');
  await expect(page.getByRole('heading', { name: 'Todavía no tienes reservas' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Buscar una cancha' })).toBeVisible();

  const cookies = await page.context().cookies('http://localhost:3000');
  expect(cookies.some((cookie) => cookie.httpOnly)).toBe(true);

  const meResponse = page.waitForResponse((response) => response.url().endsWith('/api/v1/me'));
  await page.reload();
  expect((await meResponse).status()).toBe(200);
  await expect(page.getByText(name)).toBeVisible();

  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('link', { name: 'Iniciar sesión' })).toBeVisible();
});
