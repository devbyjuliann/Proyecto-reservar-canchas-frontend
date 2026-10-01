import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { loadDatabaseConfig } from '../../../backend/src/config/database.js';
import { createMySqlPool } from '../../../backend/src/database/pool.js';
import { createAuthModule, createMySqlAuthAdapter } from '../../../backend/src/modules/auth/index.js';
import { createSystemClock } from '../../../backend/src/shared/clock.js';
import { todayInTimeZone } from '../../src/lib/format.js';

const API = 'http://localhost:3000';
const unique = randomUUID().slice(0, 8);

test('solicitud → aprobación → negocio Owner → publicación Admin → Reserva → Owner', async ({ page }) => {
  test.setTimeout(180_000);
  page.setDefaultTimeout(15_000);
  const config = loadDatabaseConfig();
  if (config.environment !== 'test' || !config.database.endsWith('_test')) throw new Error('Requires MySQL _test');
  const pool = createMySqlPool(config);
  const ids = {};
  const owner = { email: `flow-owner-${unique}@example.test`, password: `Owner-${randomUUID()}!` };
  const admin = { email: `flow-admin-${unique}@example.test`, password: `Admin-${randomUUID()}!` };
  const buyer = { email: `flow-buyer-${unique}@example.test`, password: `Buyer-${randomUUID()}!` };
  const name = `Instalación E2E ${unique}`;
  try {
    const auth = createAuthModule({ adapter: createMySqlAuthAdapter({ pool }), clock: createSystemClock() });
    ids.admin = (await auth.register({ name: 'Administrador E2E', ...admin })).id;
    await pool.execute("INSERT INTO user_roles (user_id, role_code) VALUES (?, 'ADMINISTRADOR')", [ids.admin]);

    await register(page, owner, 'Propietario E2E');
    const ownerSession = page.waitForResponse((r) => r.url().endsWith('/api/v1/auth/sessions') && r.request().method() === 'POST');
    await login(page, owner);
    await ownerSession;
    ids.owner = (await (await page.context().request.get(`${API}/api/v1/me`)).json()).user.id;
    await page.goto('/propietarios');
    await page.getByLabel('Nombre comercial').fill(name);
    await page.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(page.getByText('Solicitud enviada')).toBeVisible();
    const [apps] = await pool.execute('SELECT id FROM owner_applications WHERE user_id = ?', [ids.owner]);
    ids.application = String(apps[0].id);
    await logout(page);

    await login(page, admin);
    await expect(page.getByRole('link', { name: 'Administración' })).toBeVisible();
    await page.goto('/admin/solicitudes');
    await page.locator('.application-row').filter({ hasText: name }).click();
    await page.getByRole('button', { name: 'Aprobar solicitud' }).click();
    await expect(page.getByText('Rol PROPIETARIO concedido')).toBeVisible();
    await logout(page);

    await login(page, owner);
    await expect(page.getByRole('link', { name: 'Mi negocio' })).toBeVisible();
    await page.goto('/owner');
    await expect(page.getByText('Todavía no tienes un negocio registrado.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear negocio' })).toBeVisible();
    await page.getByRole('button', { name: 'Nueva Instalación' }).click();
    const creation = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/v1/owner/facilities' && r.request().method() === 'POST');
    await page.getByRole('form', { name: 'Crear Instalación' }).getByLabel('Nombre').fill(name);
    await page.getByRole('form', { name: 'Crear Instalación' }).getByLabel('Ciudad').fill('Ibagué');
    await page.getByRole('form', { name: 'Crear Instalación' }).getByLabel('Dirección').fill('Calle 1');
    await page.getByRole('form', { name: 'Crear Instalación' }).getByLabel('Descripción').fill('Cancha de prueba');
    await page.getByRole('button', { name: 'Crear Instalación' }).click();
    const created = await creation;
    expect(created.status()).toBe(201);
    const result = await created.json();
    ids.facility = result.facility.id;
    expect(result.membership).toMatchObject({ userId: ids.owner, facilityId: ids.facility, active: true });
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByText('BORRADOR', { exact: true })).toBeVisible();
    await page.goto('/owner');
    await expect(page.getByText('Preparación para publicar')).toBeVisible();
    await expect(page.getByText('Crea tu primera Cancha para continuar.')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: 'test-results/owner-overview-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 768, height: 900 });
    await expectNoHorizontalOverflow(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
    await expect(page.getByRole('link', { name: 'Crear Cancha' })).toBeVisible();
    await page.screenshot({ path: 'test-results/owner-overview-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole('link', { name: 'Crear Cancha' }).click();
    await expect(page.getByText('Este negocio aún no tiene Canchas')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Crear Cancha' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
    await page.getByRole('navigation', { name: 'Secciones de Mi negocio' }).getByRole('link', { name: 'Canchas' }).click();
    await expect(page.getByText('Este negocio aún no tiene Canchas')).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.getByRole('button', { name: 'Nueva Cancha' }).click();
    await page.getByLabel('Nombre de la Cancha').fill(`Cancha ${unique}`);
    await page.getByLabel('Descripción').fill('Fútbol cubierto');
    await page.getByLabel('Deporte (código)').fill('FUTBOL_5');
    await page.getByRole('button', { name: 'Crear Cancha' }).click();
    await expect(page).toHaveURL(/\/owner\/canchas\/\d+$/);
    ids.court = page.url().split('/').pop();

    await page.goto('/owner');
    await expect(page.getByText('Configura las tarifas de tu Cancha.')).toBeVisible();
    await page.getByRole('link', { name: 'Configurar tarifas' }).click();
    await expect(page.getByRole('heading', { name: 'Tarifas' })).toBeVisible();
    await page.getByLabel('Precio para 60 minutos (COP)').fill('50000');
    await page.getByRole('button', { name: 'Establecer precio' }).click();
    await expect(page.getByText('Precio en COP guardado.')).toBeVisible();
    const future = new Date(`${todayInTimeZone('America/Bogota')}T12:00:00.000Z`);
    future.setUTCDate(future.getUTCDate() + 3);
    const date = future.toISOString().slice(0, 10);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
    await page.getByRole('navigation', { name: 'Secciones de la Cancha' }).getByRole('button', { name: 'Horario habitual' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Horario habitual' })).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/owner');
    await expect(page.getByText('Define cuándo estará disponible tu Cancha.')).toBeVisible();
    await page.getByRole('link', { name: 'Definir horario' }).click();
    await expect(page.getByRole('heading', { name: 'Horario habitual' })).toBeVisible();
    await expect(page.getByText('Esta Cancha todavía no tiene horarios habituales.', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Editar horario' }).click();
    await page.getByRole('button', { name: 'Agregar Franja' }).click();
    await page.getByLabel('Día').selectOption(String(future.getUTCDay() || 7));
    await page.getByLabel('Inicio', { exact: true }).fill('16:00');
    await page.getByLabel('Fin', { exact: true }).fill('23:00');
    await page.getByRole('button', { name: 'Reemplazar horario' }).click();
    await page.getByRole('button', { name: 'Confirmar reemplazo' }).click();
    await expect(page.getByText('Horario semanal actualizado.')).toBeVisible();
    await page.goto('/owner');
    await expect(page.getByText('Tu negocio está preparado. Falta la revisión y publicación del Administrador.')).toBeVisible();
    await logout(page);

    await login(page, admin);
    await expect(page.getByRole('link', { name: 'Administración' })).toBeVisible();
    await page.goto(`/admin/instalaciones/${ids.facility}`);
    await expect(page.getByText('BORRADOR', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Editar nombre' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Nueva cancha' })).toHaveCount(0);
    await page.goto(`/admin/canchas/${ids.court}`);
    await expect(page.getByRole('heading', { name: `Cancha ${unique}` })).toBeVisible();
    await expect(page.getByText('COP 50.000')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Editar horario' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Actualizar precio' })).toHaveCount(0);
    await page.goto(`/admin/instalaciones/${ids.facility}`);
    await expect(page.getByText('BORRADOR', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Publicar instalación' }).click();
    await expect(page.getByText('PUBLICADA', { exact: true })).toBeVisible();
    await logout(page);

    await register(page, buyer, 'Cliente E2E');
    await login(page, buyer);
    await expect(page.getByRole('link', { name: 'Mis reservas' })).toBeVisible();
    ids.buyer = (await (await page.context().request.get(`${API}/api/v1/me`)).json()).user.id;
    await page.goto('/');
    await page.getByRole('searchbox', { name: 'Busca una cancha o establecimiento' }).fill(name);
    await page.getByRole('button', { name: 'Buscar', exact: true }).click();
    await page.getByRole('link', { name: `Ver establecimiento ${name}` }).click();
    await page.getByRole('link', { name: `Ver cancha Cancha ${unique} de ${name}` }).click();
    await page.getByLabel('Fecha para jugar').fill(date);
    await page.getByRole('button', { name: 'Ver turnos' }).click();
    await page.locator('.slot-option').filter({ hasText: '16:00' }).filter({ hasText: '60 min' }).click();
    const bookingResponse = page.waitForResponse((r) => r.url().endsWith('/api/v1/bookings') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Confirmar reserva' }).click();
    const confirmed = await bookingResponse;
    expect(confirmed.status()).toBe(201);
    ids.booking = (await confirmed.json()).booking.id;
    await page.getByRole('link', { name: 'Mis reservas', exact: true }).click();
    await expect(page.locator('.booking-row').filter({ hasText: `Cancha ${unique}` })).toContainText('Confirmada');
    await logout(page);
    await login(page, owner);
    await expect(page.getByRole('link', { name: 'Mi negocio' })).toBeVisible();
    await page.goto('/owner');
    await expect(page.getByText('PUBLICADA', { exact: true })).toBeVisible();
    await expect(page.getByText('Tu negocio está publicado y visible en el marketplace.')).toBeVisible();
    await page.goto('/owner/reservas');
    const row = page.locator('.owner-booking-row').filter({ hasText: `Reserva #${ids.booking}` });
    await expect(row).toContainText(name);
    await expect(row).toContainText('Confirmada');
    await logout(page);

    await login(page, admin);
    await expect(page.getByRole('link', { name: 'Administración' })).toBeVisible();
    await page.goto('/admin/propietarios');
    await page.getByLabel('Buscar por nombre o correo').fill(owner.email);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.locator('.resource-row').filter({ hasText: owner.email }).click();
    await expect(page.getByRole('heading', { name: 'Propietario E2E' })).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
    await page.getByRole('button', { name: 'Suspender propietario', exact: true }).click();
    await expect(page.getByText(/Sus datos, instalaciones y reservas se conservarán/)).toBeVisible();
    await page.getByRole('button', { name: 'Sí, suspender propietario' }).click();
    await expect(page.getByText('SUSPENDIDO', { exact: true }).first()).toBeVisible();
    await logout(page);

    await login(page, owner);
    await page.goto('/owner');
    await expect(page.getByText(/Tu acceso como Propietario está suspendido/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nueva Instalación' })).toHaveCount(0);
    const blocked = await page.context().request.get(`${API}/api/v1/owner/facilities`);
    expect(blocked.status()).toBe(403);
    expect((await blocked.json()).error.code).toBe('owner_suspended');
    await page.goto(`/canchas/${ids.court}`);
    await page.getByLabel('Fecha para jugar').fill(date);
    await page.getByRole('button', { name: 'Ver turnos' }).click();
    await page.locator('.slot-option').filter({ hasText: '17:30' }).filter({ hasText: '60 min' }).click();
    const ownerAsCustomer = page.waitForResponse((r) => r.url().endsWith('/api/v1/bookings') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Confirmar reserva' }).click();
    const ownConfirmation = await ownerAsCustomer;
    expect(ownConfirmation.status()).toBe(201);
    ids.ownerBooking = (await ownConfirmation.json()).booking.id;
    await page.getByRole('link', { name: 'Mis reservas', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Mis reservas' })).toBeVisible();
    const ownRow = page.locator('.booking-row').filter({ hasText: `Cancha ${unique}` });
    await expect(ownRow).toContainText('Confirmada');
    await ownRow.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await ownRow.getByRole('button', { name: 'Sí, cancelar' }).click();
    await expect(ownRow).toContainText('Cancelada');
    expect((await page.context().request.get(`${API}/api/v1/facilities/${ids.facility}`)).status()).toBe(200);
    const [preserved] = await pool.execute('SELECT status, price_amount_minor FROM bookings WHERE id = ?', [ids.booking]);
    expect(preserved[0].status).toBe('CONFIRMADA');
    expect(Number(preserved[0].price_amount_minor)).toBe(5000000);
    const [membership] = await pool.execute('SELECT active FROM facility_memberships WHERE facility_id = ? AND user_id = ?', [ids.facility, ids.owner]);
    expect(Number(membership[0].active)).toBe(1);
    await logout(page);

    await login(page, admin);
    await page.goto(`/admin/propietarios/${ids.owner}`);
    await page.getByRole('button', { name: 'Reactivar propietario' }).click();
    await expect(page.getByText('ACTIVO', { exact: true }).first()).toBeVisible();
    await logout(page);
    await login(page, owner);
    await page.goto('/owner');
    await expect(page.getByRole('heading', { name: 'Mi negocio' })).toBeVisible();
    await expect(page.locator('.owner-dashboard-facility').filter({ hasText: name })).toBeVisible();
  } finally {
    try { await clean(pool, ids); } finally { await pool.end(); }
  }
});

async function register(page, credentials, name) {
  await page.goto('/acceso');
  await page.getByRole('tab', { name: 'Crear cuenta' }).click();
  await page.getByLabel('Nombre').fill(name);
  await page.getByLabel('Correo').fill(credentials.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('Cuenta creada. Ingresa con tu correo y contraseña.')).toBeVisible();
}

async function login(page, credentials) {
  await page.goto('/acceso');
  await page.getByLabel('Correo').fill(credentials.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
}

async function logout(page) {
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('link', { name: 'Iniciar sesión' })).toBeVisible();
}

async function expectNoHorizontalOverflow(page) {
  const { viewport, content } = await page.evaluate(() => ({
    viewport: window.innerWidth, content: document.documentElement.scrollWidth,
  }));
  expect(content).toBeLessThanOrEqual(viewport + 1);
}

async function clean(pool, ids) {
  if (ids.owner) {
    await pool.execute('DELETE FROM idempotency_records WHERE user_id = ?', [ids.owner]);
    await pool.execute('DELETE FROM operational_conflicts WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ?)', [ids.owner]);
    await pool.execute('DELETE FROM bookings WHERE user_id = ? AND court_id = ?', [ids.owner, ids.court ?? '0']);
  }
  if (ids.buyer) {
    await pool.execute('DELETE FROM idempotency_records WHERE user_id = ?', [ids.buyer]);
    await pool.execute('DELETE FROM operational_conflicts WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ?)', [ids.buyer]);
    await pool.execute('DELETE FROM bookings WHERE user_id = ?', [ids.buyer]);
  }
  if (ids.court) {
    await pool.execute('DELETE FROM operational_conflicts WHERE operational_change_id IN (SELECT id FROM operational_changes WHERE court_id = ?)', [ids.court]);
    await pool.execute('DELETE FROM operational_changes WHERE court_id = ?', [ids.court]);
    await pool.execute('DELETE FROM court_weekly_periods WHERE court_id = ?', [ids.court]);
    await pool.execute('DELETE FROM court_prices WHERE court_id = ?', [ids.court]);
    await pool.execute('DELETE FROM court_allowed_durations WHERE court_id = ?', [ids.court]);
    await pool.execute('DELETE FROM courts WHERE id = ?', [ids.court]);
  }
  if (ids.facility) {
    await pool.execute('DELETE FROM facility_memberships WHERE facility_id = ?', [ids.facility]);
    await pool.execute('DELETE FROM facilities WHERE id = ?', [ids.facility]);
  }
  for (const id of [ids.owner, ids.buyer, ids.admin]) if (id) {
    await pool.execute('DELETE FROM owner_applications WHERE user_id = ?', [id]);
    await pool.execute('DELETE FROM sessions WHERE user_id = ?', [id]);
    await pool.execute('DELETE FROM user_credentials WHERE user_id = ?', [id]);
    await pool.execute('DELETE FROM user_roles WHERE user_id = ?', [id]);
    await pool.execute('DELETE FROM users WHERE id = ?', [id]);
  }
}
