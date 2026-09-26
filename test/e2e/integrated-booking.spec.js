import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('registro → login → disponibilidad → reserva → mis reservas → cancelación', async ({ page }) => {
  const name = 'Reserva E2E';
  const email = `booking-${randomUUID()}@example.test`;
  const password = 'Contrasena-E2E-2026!';

  await page.goto('/acceso');
  await page.getByRole('tab', { name: 'Crear cuenta' }).click();
  await page.getByLabel('Nombre').fill(name);
  await page.getByLabel('Correo').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.getByText('Cuenta creada. Ingresa con tu correo y contraseña.')).toBeVisible();
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).last().click();
  await expect(page.getByText(name)).toBeVisible();
  expect((await page.context().cookies('http://localhost:3000')).some((cookie) => cookie.httpOnly)).toBe(true);

  await page.getByLabel('ID de Cancha').fill('15');
  await page.getByLabel('Fecha').fill('2026-09-28');
  const availabilityResponse = page.waitForResponse((response) => response.url().includes('/api/v1/courts/15/availability?') && response.status() === 200);
  await page.getByRole('button', { name: 'Ver turnos' }).click();
  const availability = await (await availabilityResponse).json();
  expect(availability.options.some((option) => option.durationMinutes === 60)).toBe(true);
  await page.getByRole('option', { name: /60 min/ }).first().click();

  const confirmationResponse = page.waitForResponse((response) => response.url().endsWith('/api/v1/bookings') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Confirmar reserva' }).click();
  const confirmation = await confirmationResponse;
  expect(confirmation.status()).toBe(201);
  const { booking } = await confirmation.json();
  await expect(page.getByRole('heading', { name: 'Reserva confirmada' })).toBeVisible();

  await page.getByRole('link', { name: 'Mis reservas' }).click();
  const row = page.locator('.booking-row').filter({ hasText: booking.court.name });
  await expect(row).toContainText('Confirmada');
  await row.getByRole('button', { name: 'Cancelar', exact: true }).click();
  const cancellationResponse = page.waitForResponse((response) => response.url().endsWith(`/api/v1/bookings/${booking.id}/cancellation`) && response.request().method() === 'POST');
  await row.getByRole('button', { name: 'Sí, cancelar' }).click();
  expect((await (await cancellationResponse).json()).booking.status).toBe('CANCELADA');
  await expect(row).toContainText('Cancelada');
});
