import { ArrowLeft, CalendarDays, ChevronDown, Clock3, TicketCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { api, apiItems, withQuery } from '../api/client.js';
import { EmptyState, LoadingBlock } from '../components/Feedback.jsx';
import { isOwnerAccessLost, OwnerAccessNotice } from '../components/OwnerAccessNotice.jsx';
import { StatusBadge } from '../components/Primitives.jsx';
import { formatCOP, statusLabel } from '../lib/format.js';

const PATH = '/api/v1/owner/bookings';
const INITIAL_FILTERS = { facilityId: '', courtId: '', status: '', from: '', through: '' };

function nextUtcDate(date) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function queryFilters(filters) {
  return {
    facilityId: filters.facilityId,
    courtId: filters.courtId,
    status: filters.status,
    startFrom: filters.from ? `${filters.from}T00:00:00Z` : undefined,
    startBefore: filters.through ? `${nextUtcDate(filters.through)}T00:00:00Z` : undefined,
  };
}

function timeAt(instant, timeZone) {
  return new Intl.DateTimeFormat('es-CO', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone,
  }).format(new Date(instant));
}

function dateAt(instant, timeZone) {
  return new Intl.DateTimeFormat('es-CO', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone,
  }).format(new Date(instant));
}

export function OwnerBookingsPage() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [facilities, setFacilities] = useState([]);
  const [courts, setCourts] = useState([]);
  const [items, setItems] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingCourts, setLoadingCourts] = useState(false);
  const [error, setError] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const pageController = useRef(null);
  const moreController = useRef(null);
  const accessLost = useRef(false);

  function handleError(caught) {
    if (isOwnerAccessLost(caught)) {
      accessLost.current = true;
      pageController.current?.abort();
      moreController.current?.abort();
      setItems([]);
      setCursor(null);
      setLoadingMore(false);
      setFacilities([]);
      setCourts([]);
    }
    setError(caught);
  }

  function changeFilters(changes) {
    if (accessLost.current) return;
    pageController.current?.abort();
    moreController.current?.abort();
    setItems([]);
    setCursor(null);
    setLoadingMore(false);
    setError(null);
    setLoading(true);
    setFilters((current) => ({ ...current, ...changes }));
  }

  useEffect(() => {
    const controller = new AbortController();
    api('/api/v1/owner/booking-exceptions', { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setExceptions(result.items); })
      .catch((caught) => { if (caught.name !== 'AbortError') handleError(caught); });
    return () => controller.abort();
  }, [refresh]);

  async function decideException(id, decision) {
    try {
      await api(`/api/v1/owner/booking-exceptions/${id}/${decision}`, { method: 'POST' });
      setRefresh((value) => value + 1);
    } catch (caught) { handleError(caught); }
  }

  useEffect(() => {
    const controller = new AbortController();
    apiItems('/api/v1/owner/facilities', { limit: 100 }, { signal: controller.signal })
      .then((result) => { if (!accessLost.current) setFacilities(result); })
      .catch((caught) => { if (caught.name !== 'AbortError') handleError(caught); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setCourts([]);
    setLoadingCourts(Boolean(filters.facilityId));
    if (!filters.facilityId || accessLost.current) return () => controller.abort();
    apiItems(`/api/v1/owner/facilities/${filters.facilityId}/courts`,
      { state: 'all', limit: 100 }, { signal: controller.signal })
      .then((result) => { if (!accessLost.current) setCourts(result); })
      .catch((caught) => { if (caught.name !== 'AbortError') handleError(caught); })
      .finally(() => { if (!controller.signal.aborted) setLoadingCourts(false); });
    return () => controller.abort();
  }, [filters.facilityId]);

  useEffect(() => {
    const controller = new AbortController();
    pageController.current = controller;
    moreController.current?.abort();
    setItems([]);
    setCursor(null);
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    accessLost.current = false;
    api(withQuery(PATH, { ...queryFilters(filters), limit: 25 }), { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted && !accessLost.current) {
          setItems(result.items);
          setCursor(result.page.nextCursor);
        }
      })
      .catch((caught) => { if (caught.name !== 'AbortError') handleError(caught); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, refresh]);

  async function loadMore() {
    if (!cursor || loadingMore || accessLost.current) return;
    const controller = new AbortController();
    moreController.current = controller;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await api(withQuery(PATH, { ...queryFilters(filters), limit: 25, cursor }),
        { signal: controller.signal });
      if (!controller.signal.aborted && !accessLost.current) {
        setItems((current) => [...current, ...result.items]);
        setCursor(result.page.nextCursor);
      }
    } catch (caught) {
      if (caught.name !== 'AbortError') handleError(caught);
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }

  const hasFilters = Object.values(filters).some(Boolean);

  return <div className="owner-console owner-bookings-page">
    <Link className="back-link" to="/owner"><ArrowLeft size={17} aria-hidden="true" />Volver a Mi negocio</Link>
    <header className="owner-console-hero"><div><span className="owner-console-label">Mi negocio / Reservas</span><h1>Reservas recibidas</h1><p>Turnos de las Canchas de tus Instalaciones. Consulta el horario y el precio acordado al confirmar cada Reserva.</p></div></header>
    {exceptions.length ? <section className="owner-bookings-results" aria-label="Solicitudes de excepción"><h2>Solicitudes de excepción</h2>{exceptions.map((item) => <article className="owner-booking-row" key={item.id}><div><strong>{item.category === 'MAL_CLIMA' ? 'Mal clima' : 'Fuerza mayor'}</strong><p>{item.facilityName} · {item.courtName} · {item.customerName}</p>{item.note ? <p>{item.note}</p> : null}</div><div className="booking-actions"><button className="button button-secondary button-small" onClick={() => decideException(item.id, 'approve')}>Aprobar</button><button className="button button-quiet button-small" onClick={() => decideException(item.id, 'reject')}>Rechazar</button></div></article>)}</section> : null}
    <section className="owner-bookings-filters" aria-label="Filtrar Reservas recibidas">
      <div className="owner-bookings-filter-heading"><h2>Filtrar Reservas</h2><p>Los filtros por fecha usan días UTC. El horario de cada turno se muestra en la hora local de su Instalación.</p></div>
      <div className="owner-bookings-filter-grid">
        <label className="field"><span>Instalación</span><select value={filters.facilityId} disabled={accessLost.current} onChange={(event) => changeFilters({ facilityId: event.target.value, courtId: '' })}><option value="">Todas mis Instalaciones</option>{facilities.map((facility) => <option key={facility.id} value={facility.id}>{facility.name}</option>)}</select></label>
        <label className="field"><span>Cancha</span><select value={filters.courtId} disabled={!filters.facilityId || loadingCourts || accessLost.current} onChange={(event) => changeFilters({ courtId: event.target.value })}><option value="">{loadingCourts ? 'Cargando Canchas' : filters.facilityId ? 'Todas las Canchas' : 'Elige una Instalación'}</option>{courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}</select></label>
        <label className="field"><span>Estado</span><select value={filters.status} disabled={accessLost.current} onChange={(event) => changeFilters({ status: event.target.value })}><option value="">Todos</option><option value="PENDIENTE_PAGO">Pendiente de anticipo</option><option value="CONFIRMADA">Confirmada</option><option value="CANCELADA">Cancelada</option><option value="COMPLETADA">Completada</option></select></label>
        <label className="field"><span>Desde (UTC)</span><input type="date" value={filters.from} max={filters.through || undefined} disabled={accessLost.current} onChange={(event) => { const from = event.target.value; changeFilters({ from, through: filters.through && from > filters.through ? '' : filters.through }); }} /></label>
        <label className="field"><span>Hasta (UTC)</span><input type="date" value={filters.through} min={filters.from || undefined} disabled={accessLost.current} onChange={(event) => { const through = event.target.value; changeFilters({ through, from: filters.from && through && through < filters.from ? '' : filters.from }); }} /></label>
      </div>
      {hasFilters ? <button className="button button-quiet button-small" type="button" disabled={accessLost.current} onClick={() => changeFilters(INITIAL_FILTERS)}>Limpiar filtros</button> : null}
    </section>
    <section className="owner-bookings-results" aria-labelledby="owner-bookings-results-title">
      <div className="owner-section-heading"><h2 id="owner-bookings-results-title">Turnos recibidos</h2><p>Ordenados por fecha de inicio, del más reciente al más antiguo.</p></div>
      {error ? <OwnerAccessNotice error={error} onRetry={() => setRefresh((value) => value + 1)} /> : null}
      {loading && !error ? <LoadingBlock lines={4} label="Cargando Reservas recibidas" /> : null}
      {!loading && !error && !items.length ? <EmptyState icon={TicketCheck} title={hasFilters ? 'Sin Reservas para estos filtros' : 'Todavía no has recibido Reservas'} action={!hasFilters ? <Link className="button button-secondary" to="/owner">Ir a Mi negocio</Link> : null}>{hasFilters ? 'Prueba con otra Instalación, fecha o estado.' : 'Las Reservas de tus Canchas aparecerán aquí cuando un cliente confirme un turno. Revisa la preparación de tu negocio y tus horarios.'}</EmptyState> : null}
      {!error && items.length ? <div className="owner-bookings-list">{items.map((booking) => <OwnerBookingRow key={booking.id} booking={booking} onChanged={() => setRefresh((value) => value + 1)} />)}</div> : null}
      {!error && cursor ? <button className="button button-secondary load-more" type="button" disabled={loadingMore} onClick={loadMore}><ChevronDown size={18} aria-hidden="true" />{loadingMore ? 'Cargando' : 'Ver más Reservas'}</button> : null}
    </section>
  </div>;
}

function OwnerBookingRow({ booking, onChanged }) {
  const [reason, setReason] = useState('');
  const [reasonCode, setReasonCode] = useState('COURT_DAMAGE');
  const [cancelling, setCancelling] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  async function ownerAction(action) {
    setPending(true); setError(null);
    try {
      await api(`/api/v1/owner/bookings/${booking.id}/${action}`, { method: 'POST',
        ...(action === 'cancellation' ? { body: { reasonCode, reason: reason.trim() } } : {}) });
      onChanged();
    } catch (caught) { setError(caught); }
    finally { setPending(false); }
  }

  return <article className="owner-booking-row">
    <div className="owner-booking-when"><time dateTime={booking.startAt}>{dateAt(booking.startAt, booking.timeZone)}</time><strong>{timeAt(booking.startAt, booking.timeZone)} – {timeAt(booking.endAt, booking.timeZone)}</strong><small>{booking.timeZone}</small></div>
    <div className="owner-booking-where"><h3>{booking.court.name}</h3><p>{booking.facility.name}</p><span><Clock3 size={15} aria-hidden="true" />{booking.durationMinutes} min · Reserva #{booking.id}</span>{booking.user?.name ? <p className="owner-booking-customer">Cliente: {booking.user.name}</p> : null}</div>
     <div className="owner-booking-outcome"><StatusBadge tone={booking.status === 'CONFIRMADA' ? 'positive' : booking.status === 'CANCELADA' ? 'negative' : 'neutral'}>{statusLabel(booking.status)}</StatusBadge><strong>{booking.priceMinor == null ? 'Precio no disponible' : formatCOP(booking.priceMinor)}</strong>{booking.depositAmountMinor != null ? <small>Anticipo: {formatCOP(booking.amountPaidMinor ?? 0)} / {formatCOP(booking.depositAmountMinor)} · {booking.refundState === 'REFUNDED' ? 'Reembolso procesado' : booking.refundState === 'REFUND_PENDING' || booking.paymentStatus === 'REFUND_PENDING' ? 'Reembolso en proceso' : booking.paymentStatus === 'PAGADO' ? 'Pagado' : booking.paymentStatus === 'PENDIENTE' ? 'Pendiente de pago' : 'Pago vencido'}</small> : null}</div>
    {booking.persistedStatus === 'CONFIRMADA' ? <div className="booking-actions">
      {new Date(booking.endAt) > new Date() && !booking.noShowAt ? <button type="button" className="button button-danger-subtle button-small" onClick={() => setCancelling((value) => !value)}>Cancelar por establecimiento</button> : null}
      {new Date(booking.startAt) <= new Date() && !booking.noShowAt ? <button type="button" className="button button-secondary button-small" disabled={pending} onClick={() => ownerAction('no-show')}>Marcar no-show</button> : null}
      {cancelling ? <div className="booking-confirmation"><label className="field"><span>Causa operativa</span><select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}><option value="COURT_DAMAGE">Daño de Cancha</option><option value="URGENT_MAINTENANCE">Mantenimiento urgente</option><option value="UNEXPECTED_CLOSURE">Cierre inesperado</option><option value="EXTRAORDINARY_UNAVAILABILITY">Indisponibilidad extraordinaria</option></select></label><label className="field"><span>Motivo operativo obligatorio</span><textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></label><button type="button" className="button button-danger button-small" disabled={pending || !reason.trim()} onClick={() => ownerAction('cancellation')}>Confirmar cancelación</button></div> : null}
      {error ? <OwnerAccessNotice error={error} /> : null}
    </div> : null}
  </article>;
}
