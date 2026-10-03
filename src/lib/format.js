export function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function todayInTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone,
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function formatCOP(priceMinor) {
  if (priceMinor === null || priceMinor === undefined) return 'Precio no disponible';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', currencyDisplay: 'code',
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(priceMinor / 100);
}

export function priceMinorFromCOP(value) {
  if (value === '') return undefined;
  const pesos = Number(value);
  if (!Number.isSafeInteger(pesos) || pesos <= 0 || !Number.isSafeInteger(pesos * 100)) return null;
  return pesos * 100;
}

export function sportLabel(code) {
  if (!code) return 'Deporte no indicado';
  return code.replaceAll('_', ' ').toLocaleLowerCase('es-CO')
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase('es-CO'));
}

export function formatDate(value, options = {}) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(new Date(`${value}T12:00:00`));
}

export function formatInstant(value, timeZone, options = {}) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
    ...options,
  }).format(new Date(value));
}

export function formatTime(value) {
  return value?.slice(0, 5) ?? '';
}

export function formatCancellationWindow(minutes) {
  if (minutes === 0) return 'hasta el inicio';
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? 'hora' : 'horas'} antes del inicio`;
  }
  return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} antes del inicio`;
}

export function formatPaymentCountdown(expiresAt, now = Date.now()) {
  if (!expiresAt) return null;
  const remainingSeconds = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function statusLabel(status) {
  return ({
    CONFIRMADA: 'Confirmada',
    PENDIENTE_PAGO: 'Pendiente de anticipo',
    CANCELADA: 'Cancelada',
    COMPLETADA: 'Completada',
  })[status] ?? status;
}

export function ownerApplicationStatusLabel(status) {
  return ({ PENDIENTE: 'Pendiente', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada' })[status] ?? status;
}

export function errorCopy(error) {
  const copies = {
    invalid_request: 'Revisa los campos y su formato antes de intentarlo de nuevo.',
    invalid_credentials: 'El correo o la contraseña no coinciden.',
    invalid_google_credential: 'No pudimos verificar el acceso con Google. Inténtalo nuevamente.',
    google_link_requires_confirmation: 'Ya existe una cuenta con este correo. Inicia sesión con tu contraseña y vincula Google desde Mi perfil.',
    google_identity_conflict: 'Esta identidad de Google no puede vincularse a esta cuenta.',
    google_link_requires_recent_login: 'Por seguridad, cierra sesión y vuelve a iniciar sesión antes de vincular Google.',
    google_not_configured: 'Google no está disponible ahora. Puedes iniciar sesión con tu contraseña.',
    invalid_password_reset_token: 'Este enlace ya no es válido o ha expirado.',
    authentication_required: 'Inicia sesión para continuar.',
    forbidden: 'Tu cuenta no tiene permiso para realizar esta acción.',
    resource_not_found: 'El recurso ya no está disponible o no existe.',
    option_not_available: 'Este horario acaba de dejar de estar disponible. Elige otro turno.',
    booking_conflict: 'Este horario acaba de dejar de estar disponible. Elige otro turno.',
    booking_price_changed: 'El precio de este turno cambió desde que lo seleccionaste. Revisa la nueva selección.',
    invalid_booking_option: 'Ese turno ya no cumple la configuración vigente.',
    booking_already_started: 'La reserva ya comenzó y no se puede cancelar.',
    booking_not_started: 'Solo puedes marcar una ausencia después del inicio del turno.',
    booking_cancellation_window_closed: 'El plazo de cancelación de esta reserva ya terminó.',
    booking_exception_pending: 'Ya existe una solicitud de excepción pendiente para esta reserva.',
    payment_expired: 'El tiempo para completar el anticipo terminó. Elige el turno nuevamente.',
    invalid_payment_amount: 'El importe acreditado no coincide con el anticipo pendiente.',
    payment_reference_reused: 'Este pago ya fue usado en otra reserva.',
    invalid_booking_state: 'Esta reserva ya no se puede cancelar.',
    email_already_registered: 'Ese correo ya está registrado. Puedes iniciar sesión.',
    resource_inactive: 'El recurso está inactivo y no admite cambios.',
    facility_not_publishable: 'La Instalación aún no está lista para publicar. Revisa sus datos públicos, una membresía activa de Propietario y una Cancha con duración y precio COP.',
    future_bookings_prevent_deactivation: 'Hay reservas vigentes que impiden la desactivación.',
    facility_time_zone_locked: 'La zona horaria no puede cambiar porque ya existe historial operativo.',
    invalid_operational_configuration: 'La configuración no cumple las reglas operativas.',
    origin_not_allowed: 'El origen de esta aplicación no está permitido por el servidor.',
    owner_application_pending: 'Ya tienes una solicitud pendiente de revisión.',
    already_owner: 'Tu cuenta ya tiene acceso como Propietario.',
    invalid_owner_application_state: 'Esta solicitud ya fue decidida. Actualiza la lista antes de continuar.',
    membership_conflict: 'Ese Usuario no puede asignarse o ya tiene una membresía activa aquí.',
    rate_limit_exceeded: 'Hay demasiados intentos. Espera un momento antes de volver a intentar.',
  };
  return copies[error?.code] ?? 'No pudimos completar la operación. Inténtalo nuevamente.';
}
