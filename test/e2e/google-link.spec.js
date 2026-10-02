import { createHmac, randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

import { loadDatabaseConfig } from '../../../backend/src/config/database.js';
import { createMySqlPool } from '../../../backend/src/database/pool.js';
import { createAuthModule, createMySqlAuthAdapter } from '../../../backend/src/modules/auth/index.js';
import { createSystemClock } from '../../../backend/src/shared/clock.js';

test('cuenta de correo externo se vincula desde Perfil y conserva contraseña y sesión propia', async ({ page }) => {
  const config = loadDatabaseConfig();
  if (config.environment !== 'test' || !config.database.endsWith('_test')) throw new Error('Requires MySQL _test');
  const pool = createMySqlPool(config);
  const email = `google-link-${randomUUID()}@external.test`;
  const password = `Password-${randomUUID()}!`;
  let userId;
  try {
    const auth = createAuthModule({ adapter: createMySqlAuthAdapter({ pool }), clock: createSystemClock() });
    userId = (await auth.register({ name: 'Cliente existente', email, password })).id;
    const payload = Buffer.from(JSON.stringify({ sub: randomUUID(), email, name: 'Nombre Google',
      email_verified: true, aud: 'google-e2e-web-client', iss: 'accounts.google.com',
      exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    const credential = `${payload}.${createHmac('sha256', 'google-e2e-signature-only').update(payload).digest('base64url')}`;
    await page.addInitScript(({ token }) => {
      let callback;
      window.google = { accounts: { id: {
        initialize(options) { callback = options.callback; },
        renderButton(element) {
          const button = document.createElement('button');
          button.type = 'button'; button.textContent = 'Continuar con Google';
          button.onclick = () => callback({ credential: token });
          element.append(button);
        },
      } } };
    }, { token: credential });
    await page.goto('/acceso');
    await page.getByRole('button', { name: 'Continuar con Google' }).click();
    await expect(page.getByText('Ya existe una cuenta con este correo.', { exact: false })).toBeVisible();
    await page.getByLabel('Correo').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await page.getByRole('link', { name: 'Perfil' }).click();
    await expect(page.getByRole('heading', { name: 'Vincular Google' })).toBeVisible();
    await page.getByRole('button', { name: 'Continuar con Google' }).click();
    await expect(page.getByText('Google quedó vinculado a tu cuenta.')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await page.goto('/acceso');
    await page.getByRole('button', { name: 'Continuar con Google' }).click();
    await expect(page.getByText('Cliente existente')).toBeVisible();
    const me = await page.context().request.get('http://localhost:3000/api/v1/me');
    expect((await me.json()).user.id).toBe(userId);
    const [identities] = await pool.execute('SELECT user_id FROM user_external_identities WHERE user_id = ?', [userId]);
    expect(identities).toHaveLength(1);
    expect((await auth.login({ email, password })).user.id).toBe(userId);
  } finally {
    if (userId) {
      await pool.execute('DELETE FROM user_external_identities WHERE user_id = ?', [userId]);
      await pool.execute('DELETE FROM sessions WHERE user_id = ?', [userId]);
      await pool.execute('DELETE FROM user_credentials WHERE user_id = ?', [userId]);
      await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
      await pool.execute('DELETE FROM users WHERE id = ?', [userId]);
    }
    await pool.end();
  }
});
