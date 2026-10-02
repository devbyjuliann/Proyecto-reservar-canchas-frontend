import { CalendarX2, ChevronDown, MapPin, XCircle } from 'lucide-react';
import { startTransition, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { api, withQuery } from '../api/client.js';
import { ButtonPending, EmptyState, ErrorNotice, LoadingBlock } from '../components/Feedback.jsx';
import { PageHeading, StatusBadge } from '../components/Primitives.jsx';
import { errorCopy, formatCOP, formatInstant, statusLabel } from '../lib/format.js';

export function MyBookingsPage() {
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');

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
    setMessage('Reserva cancelada. La encontrarás en tu historial.');
  }

  const upcoming = items.filter((booking) => booking.status === 'CONFIRMADA' && new Date(booking.startAt) > new Date());
  const history = items.filter((booking) => !upcoming.includes(booking));

  return (
    <div className="page-standard my-bookings-page">
      <PageHeading title="Mis reservas" description="Próximos turnos e historial, ordenados por fecha de juego." />
      {message ? <p className="notice notice-success" role="status">{message}</p> : null}
      {error ? <ErrorNotice onRetry={() => load()}>{errorCopy(error)}</ErrorNotice> : null}
      {loading ? <LoadingBlock lines={6} label="Cargando reservas" /> : null}
      {!loading && !items.length && !error ? <EmptyState icon={CalendarX2} title="Todavía no tienes reservas" action={<Link className="button button-secondary" to="/">Buscar una cancha</Link>}>Explora las Canchas y elige un horario disponible.</EmptyState> : null}
      {!loading && history.length && !upcoming.length ? <p className="booking-no-upcoming">No tienes reservas próximas. <Link to="/">Buscar una cancha</Link></p> : null}
      {upcoming.length ? <section className="booking-section" aria-labelledby="upcoming-bookings"><h2 id="upcoming-bookings">Próximas reservas</h2><div className="booking-list">{upcoming.map((booking) => <BookingRow key={booking.id} booking={booking} onChanged={replaceBooking} />)}</div></section> : null}
      {history.length ? <section className="booking-section" aria-labelledby="booking-history"><h2 id="booking-history">Anteriores y canceladas</h2><div className="booking-list">{history.map((booking) => <BookingRow key={booking.id} booking={booking} onChanged={replaceBooking} />)}</div></section> : null}
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
      <time dateTime={booking.startAt}><strong>{new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: booking.timeZone }).format(new Date(booking.startAt))}</strong><span>{formatInstant(booking.startAt, booking.timeZone, { year: undefined, month: undefined, day: undefined })} – {formatInstant(booking.endAt, booking.timeZone, { year: undefined, month: undefined, day: undefined })}</span></time>
      <div className="booking-place"><p className="booking-facility"><MapPin size={15} aria-hidden="true" />{booking.facility.name}</p><h2>{booking.court.name}</h2></div>
      <div className="booking-outcome"><StatusBadge tone={booking.status === 'CONFIRMADA' ? 'positive' : booking.status === 'CANCELADA' ? 'negative' : 'neutral'}>{statusLabel(booking.status)}</StatusBadge><strong className="booking-price">{formatCOP(booking.priceMinor)}</strong></div>
      {cancellable || confirming ? <div className={`booking-actions ${confirming ? 'is-confirming' : ''}`}>
        {cancellable && !confirming ? <button className="button button-danger-subtle button-small" type="button" onClick={() => setConfirming(true)}>Cancelar reserva</button> : null}
        {confirming ? <div className="booking-confirmation" role="group" aria-label={`Confirmar cancelación de ${booking.court.name}`}><strong>¿Cancelar esta reserva?</strong><p>{booking.court.name} · {booking.facility.name}. Permanecerá en tu historial como cancelada.</p><div><button className="button button-danger button-small" type="button" onClick={cancel} disabled={pending}><ButtonPending pending={pending} pendingLabel="Cancelando…">Sí, cancelar</ButtonPending></button><button className="button button-quiet button-small" type="button" onClick={() => setConfirming(false)} disabled={pending}>Conservar reserva</button></div></div> : null}
      </div> : null}
      {error ? <div className="row-error" role="alert"><XCircle size={16} aria-hidden="true" />{errorCopy(error)}</div> : null}
    </article>
  );
}
