import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';
import { loadDatabaseConfig } from '../../../backend/src/config/database.js';
import { createMySqlPool } from '../../../backend/src/database/pool.js';

const OUTBOX = fileURLToPath(new URL('../../../backend/.password-reset-outbox.jsonl', import.meta.url));

test('recuperación real: privacidad, correo, sesiones revocadas y enlace de un solo uso', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const config = loadDatabaseConfig();
  if (config.environment !== 'test' || !config.database.endsWith('_test')) throw new Error('Requires MySQL _test');
  const pool = createMySqlPool(config);
  const email = `reset-${randomUUID()}@example.test`;
  const oldPassword = `Original-${randomUUID()}!`;
  const newPassword = `Replacement-${randomUUID()}!`;
  let userId;
  let context;
  try {
    await page.goto('/registro');
    await page.getByLabel('Nombre').fill('Usuario recuperación');
    await page.getByLabel('Correo').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(oldPassword);
    const registered = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/registrations'));
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    userId = (await (await registered).json()).user.id;
    await page.getByLabel('Contraseña', { exact: true }).fill(oldPassword);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Mis reservas' })).toBeVisible();
    context = await browser.newContext();
    const reset = await context.newPage();
    await reset.goto('/acceso');
    await reset.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
    await reset.getByLabel('Correo').fill(email);
    const knownResponse = reset.waitForResponse((r) => r.url().endsWith('/auth/password-reset/request'));
    await reset.getByRole('button', { name: 'Enviar enlace' }).click();
    const known = await (await knownResponse).json();
    await expect(reset.getByText(known.message)).toBeVisible();

    await expect.poll(async () => {
      const content = await readFile(OUTBOX, 'utf8').catch(() => '');
      return content.split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((mail) => mail.email === email).length;
    }).toBe(1);
    const content = await readFile(OUTBOX, 'utf8');
    const mail = content.split('\n').filter(Boolean).map((line) => JSON.parse(line)).findLast((item) => item.email === email);
    await reset.goto('/recuperar-password');
    await reset.getByLabel('Correo').fill(`missing-${randomUUID()}@example.test`);
    const unknownResponse = reset.waitForResponse((r) => r.url().endsWith('/auth/password-reset/request'));
    await reset.getByRole('button', { name: 'Enviar enlace' }).click();
    expect(await (await unknownResponse).json()).toEqual(known);
    await expect(reset.getByText(known.message)).toBeVisible();

    await reset.goto(mail.resetUrl);
    await reset.getByLabel('Nueva contraseña').last().fill(newPassword);
    await reset.getByLabel('Confirmar contraseña').fill(newPassword);
    await reset.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(reset.getByRole('heading', { name: 'Contraseña actualizada' })).toBeVisible();
    await expect(reset.getByText('Ahora puedes iniciar sesión con tu nueva contraseña.')).toBeVisible();
    const oldSession = await page.context().request.get('http://localhost:3000/api/v1/me');
    expect(oldSession.status()).toBe(401);
    const oldLogin = await reset.context().request.post('http://localhost:3000/api/v1/auth/sessions', { data: { email, password: oldPassword } });
    expect(oldLogin.status()).toBe(401);
    await reset.goto(mail.resetUrl);
    const attemptedPassword = `Another-${randomUUID()}!`;
    await reset.getByLabel('Nueva contraseña').last().fill(attemptedPassword);
    await reset.getByLabel('Confirmar contraseña').fill(attemptedPassword);
    await reset.getByRole('button', { name: 'Cambiar contraseña' }).click();
    await expect(reset.getByText('Este enlace ya no es válido o ha expirado.')).toBeVisible();
    await expect(reset.getByRole('link', { name: 'Solicitar un nuevo enlace' })).toBeVisible();
    await reset.getByRole('link', { name: 'Solicitar un nuevo enlace' }).click();
    await reset.goto('/acceso');
    await reset.getByLabel('Correo').fill(email);
    await reset.getByLabel('Contraseña', { exact: true }).fill(newPassword);
    await reset.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await expect(reset.getByRole('link', { name: 'Mis reservas' })).toBeVisible();
  } finally {
    await context?.close();
    if (userId) {
      await pool.execute('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]);
      await pool.execute('DELETE FROM sessions WHERE user_id = ?', [userId]);
      await pool.execute('DELETE FROM user_credentials WHERE user_id = ?', [userId]);
      await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
      await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
    }
    await pool.end();
  }
});
