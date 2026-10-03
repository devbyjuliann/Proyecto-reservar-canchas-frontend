import { CalendarX2, ChevronDown, MapPin, XCircle } from 'lucide-react';
import { startTransition, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { api, withQuery } from '../api/client.js';
import { ButtonPending, EmptyState, ErrorNotice, LoadingBlock } from '../components/Feedback.jsx';
import { PageHeading, StatusBadge } from '../components/Primitives.jsx';
import { errorCopy, formatCancellationWindow, formatCOP, formatInstant, statusLabel, todayInTimeZone } from '../lib/format.js';

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

  function replaceBooking(booking, nextMessage = 'Reserva cancelada. La encontrarás en tu historial.') {
    setItems((current) => current.map((item) => item.id === booking.id ? booking : item));
    setMessage(nextMessage);
  }

  const upcoming = items.filter((booking) => ['CONFIRMADA', 'PENDIENTE_PAGO'].includes(booking.status)
    && new Date(booking.startAt) > new Date());
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
  const [rescheduling, setRescheduling] = useState(false);
  const [exception, setException] = useState(false);
  const [exceptionNote, setExceptionNote] = useState('');
  const [exceptionCategory, setExceptionCategory] = useState('MAL_CLIMA');
  const [history, setHistory] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const cutoff = new Date(booking.startAt).getTime() - (booking.cancellationMinMinutes ?? 120) * 60_000;
  const pendingPayment = booking.status === 'PENDIENTE_PAGO';
  const paymentExpired = pendingPayment && (!booking.paymentExpiresAt
    || new Date(booking.paymentExpiresAt) <= new Date());
  const future = booking.status === 'CONFIRMADA' && new Date(booking.startAt) > new Date();
  const cancellable = future && Date.now() <= cutoff;

  async function showHistory() {
    setHistoryOpen((current) => !current);
    if (history) return;
    try { setHistory((await api(`/api/v1/bookings/${booking.id}/changes`)).items); }
    catch (caught) { setError(caught); }
  }

  async function askException(event) {
    event.preventDefault();
    setPending(true); setError(null);
    try {
      await api(`/api/v1/bookings/${booking.id}/exception-requests`, { method: 'POST',
        body: { category: exceptionCategory, ...(exceptionNote.trim() ? { note: exceptionNote.trim() } : {}) } });
      setException(false);
      onChanged(booking, 'Solicitud de excepción enviada al Propietario.');
    } catch (caught) { setError(caught); }
    finally { setPending(false); }
  }

  async function cancelByException() {
    setPending(true); setError(null);
    try {
      const result = await api(`/api/v1/bookings/${booking.id}/exception-cancellation`, { method: 'POST' });
      onChanged(result.booking);
    } catch (caught) { setError(caught); }
    finally { setPending(false); }
  }

  async function cancel() {
    setPending(true);
    setError(null);
    try {
      const result = await api(`/api/v1/bookings/${booking.id}/cancellation`, { method: 'POST',
        headers: { 'X-Booking-Start-At': booking.startAt } });
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
       <div className="booking-outcome"><StatusBadge tone={booking.status === 'CONFIRMADA' ? 'positive' : booking.status === 'CANCELADA' ? 'negative' : 'neutral'}>{paymentExpired ? 'Pago vencido' : statusLabel(booking.status)}</StatusBadge><strong className="booking-price">{formatCOP(booking.priceMinor)}</strong>{booking.depositAmountMinor != null ? <small>Anticipo: {formatCOP(booking.amountPaidMinor ?? 0)} de {formatCOP(booking.depositAmountMinor)}</small> : null}</div>
       {pendingPayment && !paymentExpired ? <p className="notice notice-info">Pendiente de anticipo hasta {formatInstant(booking.paymentExpiresAt, booking.timeZone)}. El saldo presencial será {formatCOP(Math.max(0, (booking.priceMinor ?? 0) - (booking.depositAmountMinor ?? 0)))}.</p> : null}
       {paymentExpired ? <p className="notice notice-warning">El anticipo no se completó a tiempo y el horario fue liberado.</p> : null}
      {future && !cancellable ? <p className="notice notice-info">El plazo normal para cancelar o cambiar esta reserva ya terminó.</p> : null}
       {future || confirming ? <div className={`booking-actions ${confirming ? 'is-confirming' : ''}`}>
         {(cancellable || booking.exceptionApproved) && !confirming ? <><button className="button button-secondary button-small" type="button" disabled={!booking.exceptionApproved && (booking.voluntaryRescheduleCount ?? 0) >= 1} onClick={() => { setRescheduling((value) => !value); setException(false); }}>Cambiar horario</button>{cancellable ? <button className="button button-danger-subtle button-small" type="button" onClick={() => { setConfirming(true); setRescheduling(false); }}>Cancelar reserva</button> : null}</> : null}
        {future && !cancellable && !booking.exceptionApproved && !confirming ? <button className="button button-secondary button-small" type="button" onClick={() => { setException((value) => !value); setRescheduling(false); }}>Solicitar excepción</button> : null}
        {future && booking.exceptionApproved && !cancellable ? <button className="button button-danger-subtle button-small" type="button" disabled={pending} onClick={cancelByException}>Cancelar con excepción aprobada</button> : null}
        {confirming ? <div className="booking-confirmation" role="group" aria-label={`Confirmar cancelación de ${booking.court.name}`}><strong>¿Cancelar esta reserva?</strong><p>{booking.court.name} · {booking.facility.name}. Permanecerá en tu historial como cancelada.</p><div><button className="button button-danger button-small" type="button" onClick={cancel} disabled={pending}><ButtonPending pending={pending} pendingLabel="Cancelando…">Sí, cancelar</ButtonPending></button><button className="button button-quiet button-small" type="button" onClick={() => setConfirming(false)} disabled={pending}>Conservar reserva</button></div></div> : null}
      </div> : null}
      {rescheduling ? <ReschedulePanel booking={booking} onUpdated={(updated) => {
        onChanged(updated, 'Reserva actualizada.'); setHistory(null); setRescheduling(false);
      }} onClose={() => setRescheduling(false)} /> : null}
      {exception ? <form className="form-stack" onSubmit={askException}>
        <label className="field"><span>Motivo de excepción</span><select value={exceptionCategory} onChange={(event) => setExceptionCategory(event.target.value)}><option value="MAL_CLIMA">Mal clima</option><option value="FUERZA_MAYOR">Fuerza mayor</option></select></label>
        <label className="field"><span>Nota breve (opcional)</span><textarea maxLength={500} value={exceptionNote} onChange={(event) => setExceptionNote(event.target.value)} /></label>
        <button className="button button-primary button-small" disabled={pending}>Enviar solicitud</button>
      </form> : null}
      <button className="button button-quiet button-small" type="button" aria-expanded={historyOpen} onClick={showHistory}>Historial</button>
      {historyOpen && history ? <ol className="booking-change-history">{history.map((change, index) => <li key={`${change.createdAt}-${index}`}>{change.type === 'CREATED' ? 'Reserva creada' : change.type === 'RESCHEDULED' ? 'Reprogramada' : change.type === 'NO_SHOW' ? 'No asistió' : 'Cancelada'} — {formatInstant(change.newStartAt ?? change.previousStartAt, booking.timeZone)}{change.newPriceMinor != null ? ` · ${formatCOP(change.newPriceMinor)}` : ''}</li>)}</ol> : null}
      {error ? <div className="row-error" role="alert"><XCircle size={16} aria-hidden="true" />{errorCopy(error)}</div> : null}
    </article>
  );
}

function ReschedulePanel({ booking, onUpdated, onClose }) {
  const [date, setDate] = useState(todayInTimeZone(booking.timeZone));
  const [options, setOptions] = useState(null);
  const [selected, setSelected] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const attempt = useRef(null);
  const duration = (new Date(booking.endAt) - new Date(booking.startAt)) / 60_000;

  async function search(event) {
    event.preventDefault(); setPending(true); setError(null); setSelected(null);
    try {
      const result = await api(withQuery(`/api/v1/courts/${booking.court.id}/availability`, { date }));
      setOptions(result.options.filter((option) => option.durationMinutes === duration));
    } catch (caught) { setError(caught); }
    finally { setPending(false); }
  }

  async function submit() {
    if (!selected) return;
    setPending(true); setError(null);
    const signature = `${date}:${selected.startTime}:${selected.priceMinor}`;
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    try {
      const result = await api(`/api/v1/bookings/${booking.id}/reschedule`, {
        method: 'POST', headers: { 'Idempotency-Key': attempt.current.key },
        body: { localDate: date, startTime: selected.startTime,
          expectedPriceMinor: selected.priceMinor, currency: 'COP' },
      });
      onUpdated(result.booking);
    } catch (caught) {
      setError(caught);
      if (caught.code) { attempt.current = null; setSelected(null); }
    } finally { setPending(false); }
  }

  return <section className="booking-reschedule" aria-label={`Cambiar horario de ${booking.court.name}`}>
    <h3>Cambiar horario</h3><p>Conservas la misma Cancha y la duración. {booking.exceptionApproved ? 'Tu excepción fue aprobada: puedes elegir otro turno.' : `Puedes reprogramar ${formatCancellationWindow(booking.cancellationMinMinutes ?? 120)}.`}</p>
    <form className="form-stack" onSubmit={search}><label className="field"><span>Nueva fecha</span><input type="date" min={todayInTimeZone(booking.timeZone)} value={date} onChange={(event) => { setDate(event.target.value); setOptions(null); setSelected(null); }} required /></label><button className="button button-secondary button-small" disabled={pending}>Ver horarios</button></form>
    {options ? <div role="group" aria-label="Nuevos horarios">{options.length ? options.map((option) => <button className="button button-quiet button-small" type="button" aria-pressed={selected?.startAt === option.startAt} key={option.startAt} onClick={() => { setSelected(option); attempt.current = null; }}>{formatInstant(option.startAt, booking.timeZone)} · {formatCOP(option.priceMinor)}</button>) : <p>No hay horarios disponibles para esa fecha.</p>}</div> : null}
    {selected ? <div className="booking-confirmation"><strong>Antes: {formatInstant(booking.startAt, booking.timeZone)} — {formatCOP(booking.priceMinor)}</strong><p>Nuevo: {formatInstant(selected.startAt, booking.timeZone)} — {formatCOP(selected.priceMinor)}</p><button className="button button-primary button-small" type="button" disabled={pending} onClick={submit}>Confirmar nuevo horario y precio</button></div> : null}
    {error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}
    <button className="button button-quiet button-small" type="button" onClick={onClose}>Cerrar</button>
  </section>;
}
