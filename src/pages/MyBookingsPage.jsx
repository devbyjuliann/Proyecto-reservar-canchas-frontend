import { CalendarX2, ChevronDown, Clock3, MapPin, XCircle } from 'lucide-react';
import { startTransition, useEffect, useState } from 'react';

import { api, withQuery } from '../api/client.js';
import { EmptyState, ErrorNotice, LoadingBlock } from '../components/Feedback.jsx';
import { PageHeading } from '../components/Primitives.jsx';
import { errorCopy, formatCOP, formatInstant, statusLabel } from '../lib/format.js';

export function MyBookingsPage() {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    load(undefined, controller.signal);
    return () => controller.abort();
  }, []);

  async function load(nextCursor, signal) {
    nextCursor ? setLoadingMore(true) : setLoading(true);
    setError(null);
    try {
      const result = await api(withQuery('/api/v1/me/bookings', { limit: 25, cursor: nextCursor }), { signal });
      startTransition(() => {
        setItems((current) => nextCursor ? [...current, ...result.items] : result.items);
        setCursor(result.page.nextCursor);
      });
    } catch (caught) {
      if (caught.name !== 'AbortError') setError(caught);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  function replaceBooking(booking) {
    setItems((current) => current.map((item) => item.id === booking.id ? booking : item));
  }

  return (
    <div className="page-standard">
      <PageHeading title="Mis reservas" description="Próximos turnos e historial, ordenados por fecha de juego." />
      {error ? <ErrorNotice onRetry={() => load()}>{errorCopy(error)}</ErrorNotice> : null}
      {loading ? <LoadingBlock lines={6} label="Cargando reservas" /> : null}
      {!loading && !items.length ? <EmptyState icon={CalendarX2} title="Todavía no tienes reservas">Busca una Cancha y elige uno de sus turnos disponibles.</EmptyState> : null}
      <div className="booking-list">
        {items.map((booking) => <BookingRow key={booking.id} booking={booking} onChanged={replaceBooking} />)}
      </div>
      {cursor ? <button className="button button-secondary load-more" type="button" disabled={loadingMore} onClick={() => load(cursor)}><ChevronDown size={18} />{loadingMore ? 'Cargando' : 'Ver más reservas'}</button> : null}
    </div>
  );
}

function BookingRow({ booking, onChanged }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const cancellable = booking.status === 'CONFIRMADA' && new Date(booking.startAt) > new Date();

  async function cancel() {
    setPending(true);
    setError(null);
    try {
      const result = await api(`/api/v1/bookings/${booking.id}/cancellation`, { method: 'POST' });
      onChanged(result.booking);
      setConfirming(false);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <article className={`booking-row status-${booking.status.toLowerCase()}`}>
      <time dateTime={booking.startAt}><strong>{new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', timeZone: booking.timeZone }).format(new Date(booking.startAt))}</strong><span>{new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: booking.timeZone }).format(new Date(booking.startAt))}</span></time>
      <div className="booking-place"><h2>{booking.court.name}</h2><p><MapPin size={15} aria-hidden="true" />{booking.facility.name}</p><p><Clock3 size={15} aria-hidden="true" />Hasta {formatInstant(booking.endAt, booking.timeZone, { year: undefined, month: undefined, day: undefined })}</p><p className="booking-price">{formatCOP(booking.priceMinor)}</p></div>
      <span className="booking-status">{statusLabel(booking.status)}</span>
      <div className="booking-actions">
        {cancellable && !confirming ? <button className="button button-quiet button-small" type="button" onClick={() => setConfirming(true)}>Cancelar</button> : null}
        {confirming ? <div className="inline-confirm"><span>¿Cancelar este turno?</span><button className="button button-danger button-small" type="button" onClick={cancel} disabled={pending}>{pending ? 'Cancelando' : 'Sí, cancelar'}</button><button className="button button-quiet button-small" type="button" onClick={() => setConfirming(false)} disabled={pending}>Conservar</button></div> : null}
      </div>
      {error ? <div className="row-error"><XCircle size={16} />{errorCopy(error)}</div> : null}
    </article>
  );
}
