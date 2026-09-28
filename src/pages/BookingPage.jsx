import { CalendarDays, Check, Clock3, TicketCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { api, ApiError, withQuery } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { ButtonPending, EmptyState, ErrorNotice, LoadingBlock } from '../components/Feedback.jsx';
import { errorCopy, formatCOP, formatDate, formatTime, todayInTimeZone } from '../lib/format.js';

export function BookingPage({ court }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const intent = location.state?.intent?.courtId === court.id ? location.state.intent : null;
  const [date, setDate] = useState(() => intent?.date ?? todayInTimeZone(court.timeZone));
  const [availability, setAvailability] = useState(null);
  const [selection, setSelection] = useState(null);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const [priceNotice, setPriceNotice] = useState(null);
  const confirmationAttempt = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchAvailability(date, { signal: controller.signal, restore: intent });
    return () => controller.abort();
    // Restoration belongs to the navigation into this Court, not each re-render.
  }, [court.id]);

  async function fetchAvailability(localDate, { signal, restore, keepNotice = false } = {}) {
    setLoading(true);
    setError(null);
    setSelection(null);
    setBooking(null);
    if (!keepNotice) setPriceNotice(null);
    confirmationAttempt.current = null;
    try {
      const result = await api(withQuery(`/api/v1/courts/${court.id}/availability`, { date: localDate }), { signal });
      if (signal?.aborted) return;
      setAvailability(result);
      if (restore) {
        const match = result.options.find((option) => option.startTime === restore.startTime
          && option.durationMinutes === restore.durationMinutes);
        if (match?.priceMinor === restore.priceMinor) setSelection(match);
        else setPriceNotice(match
          ? { previous: restore.priceMinor, current: match.priceMinor }
          : { unavailable: true });
      }
    } catch (caught) {
      if (caught.name !== 'AbortError') {
        setAvailability(null);
        setError(caught);
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  function search(event) {
    event.preventDefault();
    fetchAvailability(date);
  }

  async function confirm() {
    if (!selection || !availability) return;
    if (auth.status !== 'authenticated') {
      navigate('/acceso', {
        state: { from: `/canchas/${court.id}`, intent: { courtId: court.id, date: availability.date,
          startTime: selection.startTime, durationMinutes: selection.durationMinutes,
          priceMinor: selection.priceMinor } },
      });
      return;
    }
    setConfirming(true);
    setError(null);
    const signature = `${court.id}:${availability.date}:${selection.startTime}:${selection.durationMinutes}:${selection.priceMinor}`;
    if (confirmationAttempt.current?.signature !== signature) {
      confirmationAttempt.current = { signature, key: crypto.randomUUID() };
    }
    try {
      const result = await api('/api/v1/bookings', {
        method: 'POST', headers: { 'Idempotency-Key': confirmationAttempt.current.key },
        body: {
          courtId: court.id, localDate: availability.date,
          startTime: selection.startTime, durationMinutes: selection.durationMinutes,
          expectedPriceMinor: selection.priceMinor, currency: 'COP',
        },
      });
      setBooking(result.booking);
      confirmationAttempt.current = null;
    } catch (caught) {
      if (caught instanceof ApiError) confirmationAttempt.current = null;
      if (caught instanceof ApiError && caught.code === 'booking_price_changed') {
        setPriceNotice({ previous: selection.priceMinor,
          current: caught.details?.currentPriceMinor ?? null });
        await fetchAvailability(availability.date, { keepNotice: true });
      } else {
        setError(caught);
      }
    } finally {
      setConfirming(false);
    }
  }

  const options = availability?.options ?? [];

  return (
    <section className="booking-layout" aria-label="Disponibilidad y Reserva">
      <div className="booking-stage">
        <header className="booking-hero"><div><h2>Elige tu turno.</h2><p>Consulta los horarios reales de esta Cancha. El precio y la disponibilidad se revisan otra vez antes de confirmar.</p></div><span className="live-note"><i />Disponibilidad actual</span></header>
        <form className="court-search" onSubmit={search}>
          <label><span>Fecha para jugar</span><div className="input-with-icon"><CalendarDays size={18} aria-hidden="true" /><input type="date" min={todayInTimeZone(court.timeZone)} value={date} onChange={(event) => { setDate(event.target.value); setAvailability(null); setSelection(null); setBooking(null); setPriceNotice(null); }} required /></div></label>
          <button className="button button-search" type="submit" disabled={loading}>{loading ? 'Consultando' : 'Ver turnos'}</button>
        </form>
        {priceNotice ? <div className="notice notice-error price-update-notice" role="alert"><TicketCheck size={20} aria-hidden="true" /><div><strong>{priceNotice.unavailable ? 'Ese turno ya no está disponible' : 'El precio cambió'}</strong><p>{priceNotice.unavailable ? 'Elige otra opción disponible para esta fecha.' : `Antes: ${formatCOP(priceNotice.previous)}. Ahora: ${formatCOP(priceNotice.current)}. Elige el turno de nuevo para aceptar el precio actual.`}</p></div></div> : null}
        {error && !selection ? <ErrorNotice onRetry={() => fetchAvailability(date)}>{errorCopy(error)}</ErrorNotice> : null}
        {loading ? <LoadingBlock lines={4} label="Consultando disponibilidad" /> : null}
        {!loading && availability ? <div className="availability-wrap">
          <div className="availability-meta"><span>Cancha {court.id}</span><strong>{formatDate(availability.date)}</strong><small>{court.timeZone}</small></div>
          {options.length ? <div className="court-options" role="group" aria-label="Turnos disponibles">{options.map((option) => {
            const selected = selection?.startTime === option.startTime && selection?.durationMinutes === option.durationMinutes;
            return <button key={`${option.startTime}-${option.durationMinutes}`} className={`slot-option ${selected ? 'selected' : ''}`} type="button" aria-pressed={selected} onClick={() => { setSelection(option); setBooking(null); setError(null); setPriceNotice(null); confirmationAttempt.current = null; }}>
              <span className="slot-time">{formatTime(option.startTime)}</span><span className="slot-duration">{option.durationMinutes} min</span><span className="slot-price">{formatCOP(option.priceMinor)}</span><span className="slot-select">{selected ? <><Check size={16} aria-hidden="true" />Elegido</> : 'Seleccionar turno'}</span>
            </button>;
          })}</div> : <EmptyState icon={CalendarDays} title="No hay turnos para esta fecha">Prueba otra fecha para esta Cancha.</EmptyState>}
        </div> : null}
      </div>
      <aside className={`booking-ticket ${selection || booking ? 'has-selection' : ''}`} aria-live="polite">
        <div className="ticket-stub"><span>Ficha de turno</span><strong>{booking ? `N.º ${booking.id}` : 'Sin emitir'}</strong></div>
        {booking ? <BookingSuccess booking={booking} onAnother={() => fetchAvailability(date)} /> : selection ? <>
          <div className="ticket-body"><p className="ticket-date">{formatDate(availability.date)}</p><strong className="ticket-time">{formatTime(selection.startTime)}</strong><dl><div><dt>Cancha</dt><dd>{court.name}</dd></div><div><dt>Duración</dt><dd>{selection.durationMinutes} min</dd></div><div><dt>Precio</dt><dd>{formatCOP(selection.priceMinor)}</dd></div></dl><p className="ticket-note">La opción se volverá a verificar al confirmar.</p>{error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}</div>
          <button className="button button-primary button-wide" type="button" onClick={confirm} disabled={confirming || auth.status === 'loading'}><ButtonPending pending={confirming}>{auth.status === 'authenticated' ? 'Confirmar reserva' : 'Ingresar para reservar'}</ButtonPending></button>
        </> : <div className="ticket-empty"><Clock3 size={28} aria-hidden="true" /><strong>Tu turno aparecerá aquí</strong><p>Elige un horario para revisar el precio antes de reservar.</p></div>}
      </aside>
    </section>
  );
}

function BookingSuccess({ booking, onAnother }) {
  return <div className="ticket-success"><span className="success-mark"><Check aria-hidden="true" /></span><h2>Reserva confirmada</h2><p>{booking.facility.name}<br /><strong>{booking.court.name}</strong></p><div className="success-time">{new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: booking.timeZone }).format(new Date(booking.startAt))}</div><strong className="success-price">{formatCOP(booking.priceMinor)}</strong><Link className="button button-dark button-wide" to="/reservas">Ver Mis Reservas</Link><button className="button button-quiet button-wide" type="button" onClick={onAnother}>Buscar otro turno</button></div>;
}
