export function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
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

export function statusLabel(status) {
  return ({
    CONFIRMADA: 'Confirmada',
    CANCELADA: 'Cancelada',
    COMPLETADA: 'Completada',
  })[status] ?? status;
}

export function errorCopy(error) {
  const copies = {
    invalid_credentials: 'El correo o la contraseña no coinciden.',
    authentication_required: 'Inicia sesión para continuar.',
    forbidden: 'Tu cuenta no tiene permiso para realizar esta acción.',
    resource_not_found: 'El recurso ya no está disponible o no existe.',
    option_not_available: 'Ese turno dejó de estar disponible. Consulta la fecha de nuevo.',
    booking_conflict: 'Otra persona confirmó un turno incompatible. Actualiza la disponibilidad.',
    invalid_booking_option: 'Ese turno ya no cumple la configuración vigente.',
    booking_already_started: 'La reserva ya comenzó y no se puede cancelar.',
    invalid_booking_state: 'El estado actual de la reserva no permite cancelarla.',
    email_already_registered: 'Ese correo ya está registrado. Puedes iniciar sesión.',
    resource_inactive: 'El recurso está inactivo y no admite cambios.',
    future_bookings_prevent_deactivation: 'Hay reservas vigentes que impiden la desactivación.',
    facility_time_zone_locked: 'La zona horaria no puede cambiar porque ya existe historial operativo.',
    invalid_operational_configuration: 'La configuración no cumple las reglas operativas.',
    origin_not_allowed: 'El origen de esta aplicación no está permitido por el servidor.',
  };
  return copies[error?.code] ?? 'No se pudo completar la acción. Revisa los datos e inténtalo de nuevo.';
}
