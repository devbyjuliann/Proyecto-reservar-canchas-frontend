import { expect, test } from '@playwright/test';

const USER = { id: '7', name: 'Ana Perez', email: 'ana@example.com', roles: ['USUARIO'] };
const ADMIN = { ...USER, roles: ['ADMINISTRADOR', 'USUARIO'] };

test('consulta disponibilidad y pasa la selección a la ficha', async ({ page }) => {
  await mockApi(page, { user: null });
  await page.goto('/');
  await page.getByLabel('ID de Cancha').fill('12');
  await page.getByRole('button', { name: 'Ver turnos' }).click();
  await expect(page.getByRole('option', { name: /16:00/ })).toBeVisible();
  await page.getByRole('option', { name: /16:00/ }).click();
  await expect(page.getByText('60 min', { exact: true }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ingresar para reservar' })).toBeVisible();
});

test('inicia sesión y muestra la identidad', async ({ page }) => {
  let authenticated = false;
  await page.route('http://localhost:3000/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/v1/me') {
      await json(route, authenticated ? 200 : 401, authenticated ? { user: USER } : { error: { code: 'authentication_required' } });
    } else if (pathname === '/api/v1/auth/sessions') {
      authenticated = true;
      await json(route, 200, { user: USER });
    } else await json(route, 404, { error: { code: 'resource_not_found' } });
  });
  await page.goto('/acceso');
  await page.getByLabel('Correo').fill(USER.email);
  await page.getByLabel('Contraseña', { exact: true }).fill('password value');
  await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
  await expect(page.getByText(USER.name)).toBeVisible();
});

test('reutiliza la clave idempotente después de un fallo de red', async ({ page }) => {
  const keys = [];
  await page.route('http://localhost:3000/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/v1/me') return json(route, 200, { user: USER });
    if (pathname === '/api/v1/courts/12/availability') {
      return json(route, 200, {
        court: { id: '12', timeZone: 'America/Bogota' },
        date: '2026-09-28',
        options: [{ startTime: '16:00:00', durationMinutes: 60, startAt: '2026-09-28T21:00:00.000000Z', endAt: '2026-09-28T22:00:00.000000Z' }],
      });
    }
    if (pathname === '/api/v1/bookings') {
      keys.push(route.request().headers()['idempotency-key']);
      if (keys.length === 1) return route.abort('failed');
      return json(route, 201, { booking: { id: '44', facility: { name: 'Centro' }, court: { name: 'Cancha 1' }, timeZone: 'America/Bogota', startAt: '2026-09-28T21:00:00.000000Z' } });
    }
    return json(route, 404, { error: { code: 'resource_not_found' } });
  });
  await page.goto('/');
  await page.getByLabel('ID de Cancha').fill('12');
  await page.getByLabel('Fecha').fill('2026-09-28');
  await page.getByRole('button', { name: 'Ver turnos' }).click();
  await page.getByRole('option', { name: /16:00/ }).click();
  await page.getByRole('button', { name: 'Confirmar reserva' }).click();
  await expect(page.getByText('No se pudo completar la acción. Revisa los datos e inténtalo de nuevo.')).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar reserva' }).click();
  await expect(page.getByRole('heading', { name: 'Reserva confirmada' })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
});

test('cierra localmente una sesión ante una respuesta 204 vacía', async ({ page }) => {
  await page.route('http://localhost:3000/**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/v1/me') return json(route, 200, { user: USER });
    if (pathname === '/api/v1/auth/session') {
      return route.fulfill({ status: 204, headers: { 'Content-Type': 'application/json' } });
    }
    return json(route, 404, { error: { code: 'resource_not_found' } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('link', { name: 'Ingresar' })).toBeVisible();
});

test('un Administrador accede al directorio operativo', async ({ page }) => {
  await mockApi(page, { user: ADMIN });
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Instalaciones', exact: true })).toBeVisible();
  await expect(page.getByText('Centro Deportivo')).toBeVisible();
  await page.getByRole('button', { name: 'Ver más' }).click();
  await expect(page.getByText('Sede Norte')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Conflictos' })).toBeVisible();
});

async function mockApi(page, { user }) {
  await page.route('http://localhost:3000/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v1/me') {
      await json(route, user ? 200 : 401, user ? { user } : { error: { code: 'authentication_required' } });
      return;
    }
    if (url.pathname === '/api/v1/courts/12/availability') {
      await json(route, 200, {
        court: { id: '12', timeZone: 'America/Bogota' },
        date: url.searchParams.get('date'),
        generatedAt: '2026-09-25T12:00:00.000000Z',
        options: [
          { startTime: '16:00:00', durationMinutes: 60, startAt: '2026-09-28T21:00:00.000000Z', endAt: '2026-09-28T22:00:00.000000Z' },
          { startTime: '17:30:00', durationMinutes: 30, startAt: '2026-09-28T22:30:00.000000Z', endAt: '2026-09-28T23:00:00.000000Z' },
        ],
      });
      return;
    }
    if (url.pathname === '/api/v1/admin/facilities') {
      const secondPage = url.searchParams.has('cursor');
      await json(route, 200, {
        items: [secondPage
          ? { id: '4', name: 'Sede Norte', timeZone: 'America/Bogota', minimumAdvanceMinutes: 15, maximumAdvanceMinutes: 43200, state: 'active' }
          : { id: '3', name: 'Centro Deportivo', timeZone: 'America/Bogota', minimumAdvanceMinutes: 15, maximumAdvanceMinutes: 43200, state: 'active' }],
        page: { nextCursor: secondPage ? null : 'next-page' },
      });
      return;
    }
    await json(route, 404, { error: { code: 'resource_not_found' } });
  });
}

function json(route, status, body) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
