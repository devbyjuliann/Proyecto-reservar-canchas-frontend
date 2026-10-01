export function ownerReadiness(facility, courts, courtDetails) {
  const activeCourts = courts.filter((court) => court.state === 'active');
  const prepared = activeCourts.map((court) => {
    const detail = courtDetails[courts.indexOf(court)];
    const allowed = court.allowedDurationsMinutes ?? [];
    return { court, hasProfile: Boolean(court.name?.trim() && court.description?.trim() && court.sportCode && allowed.length),
      hasPrice: detail?.prices?.some((price) => allowed.includes(price.durationMinutes)
        && price.currency === 'COP' && price.priceMinor > 0) ?? false,
      hasSchedule: Boolean(detail?.schedule?.periods?.length) };
  });
  const profile = prepared.find((item) => item.hasProfile);
  const priced = prepared.find((item) => item.hasProfile && item.hasPrice);
  const scheduled = prepared.find((item) => item.hasProfile && item.hasPrice && item.hasSchedule);
  const checks = [
    { key: 'information', label: 'Información del negocio', complete: Boolean(facility.name?.trim() && facility.description?.trim()) },
    { key: 'address', label: 'Dirección y ciudad', complete: Boolean(facility.address?.trim() && facility.city?.trim()) },
    { key: 'court', label: 'Cancha creada', complete: courts.length > 0 },
    { key: 'sport', label: 'Ficha y deporte de una Cancha activa', complete: Boolean(profile) },
    { key: 'duration', label: 'Duración permitida', complete: Boolean(prepared.find((item) => item.court.allowedDurationsMinutes?.length)) },
    { key: 'price', label: 'Precio COP en esa Cancha', complete: Boolean(priced) },
    { key: 'schedule', label: 'Horario habitual para recibir turnos', complete: Boolean(scheduled) },
  ];
  const missing = checks.filter((check) => !check.complete).map((check) => check.key);
  const firstCourt = activeCourts[0];

  let nextAction;
  if (facility.state === 'inactive') nextAction = { message: 'Esta Instalación está suspendida y no ofrece nuevos turnos. Consulta su estado antes de continuar.', to: `/owner/instalaciones/${facility.id}`, label: 'Ver estado' };
  else if (!courts.length) nextAction = { message: 'Crea tu primera Cancha para continuar.', to: `/owner/instalaciones/${facility.id}#canchas`, label: 'Crear Cancha' };
  else if (!firstCourt) nextAction = { message: 'Necesitas una Cancha activa para recibir nuevas Reservas.', to: `/owner/instalaciones/${facility.id}#canchas`, label: 'Ver Canchas' };
  else if (missing.includes('sport')) nextAction = { message: 'Completa la ficha y el deporte de una Cancha activa.', to: `/owner/canchas/${firstCourt.id}`, section: 'general', label: 'Configurar Cancha' };
  else if (missing.includes('duration')) nextAction = { message: 'Define al menos una duración para tu Cancha.', to: `/owner/canchas/${firstCourt.id}`, section: 'configuration', label: 'Configurar duraciones' };
  else if (missing.includes('price')) nextAction = { message: 'Configura las tarifas de tu Cancha.', to: `/owner/canchas/${profile.court.id}`, section: 'prices', label: 'Configurar tarifas' };
  else if (missing.includes('schedule')) nextAction = { message: 'Define cuándo estará disponible tu Cancha.', to: `/owner/canchas/${priced.court.id}`, section: 'schedule', label: 'Definir horario' };
  else if (missing.includes('information') || missing.includes('address')) nextAction = { message: 'Completa la información de tu negocio para preparar su ficha.', to: `/owner/instalaciones/${facility.id}#informacion`, label: 'Completar información' };
  else if (facility.publicationState === 'PUBLISHED') nextAction = { message: 'Tu negocio está publicado y visible en el marketplace.', to: `/owner/reservas`, label: 'Ver Reservas' };
  else nextAction = { message: 'Tu negocio está preparado. Falta la revisión y publicación del Administrador.', to: `/owner/instalaciones/${facility.id}`, label: 'Ver negocio' };

  return { checks, missing, ready: facility.state !== 'inactive' && missing.length === 0 && Boolean(scheduled), nextAction };
}
