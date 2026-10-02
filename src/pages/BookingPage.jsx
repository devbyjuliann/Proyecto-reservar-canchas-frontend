import { CalendarDays, Check, Clock3, Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { api, ApiError, withQuery } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { ButtonPending, EmptyState, ErrorNotice, LoadingBlock } from '../components/Feedback.jsx';
import { errorCopy, formatCOP, formatDate, formatInstant, formatTime, todayInTimeZone } from '../lib/format.js';

export function BookingPage({ court }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const intent = location.state?.intent?.courtId === court.id ? location.state.intent : null;
  const [date, setDate] = useState(() => intent?.date ?? todayInTimeZone(court.timeZone));
  const [availability, setAvailability] = useState(null);
  const [duration, setDuration] = useState(() => intent?.durationMinutes ?? null);
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
        if (match?.priceMinor === restore.priceMinor) {
          setDuration(match.durationMinutes);
          setSelection(match);
        }
        else setPriceNotice(match
          ? { previous: restore.priceMinor, current: match.priceMinor }
          : { unavailable: true });
      } else if (!result.options.some((option) => option.durationMinutes === duration)) {
        setDuration(result.options[0]?.durationMinutes ?? null);
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
      } else if (caught instanceof ApiError && ['booking_conflict', 'option_not_available', 'invalid_booking_option'].includes(caught.code)) {
        setPriceNotice({ unavailable: true });
        await fetchAvailability(availability.date, { keepNotice: true });
      } else {
        setError(caught);
      }
    } finally {
      setConfirming(false);
    }
  }

  const options = availability?.options ?? [];
  const durations = court.prices.filter((price) => options.some((option) => option.durationMinutes === price.durationMinutes));
  const visibleOptions = duration ? options.filter((option) => option.durationMinutes === duration) : options;

  return (
    <section className="booking-layout" aria-label="Disponibilidad y Reserva">
      <div className="booking-stage">
        <header className="booking-hero"><div><h2>Elige fecha, duración y horario</h2><p>Consulta los horarios reales de esta Cancha. El precio y la disponibilidad se revisan otra vez antes de confirmar.</p></div><span className="live-note"><i />Disponibilidad actual</span></header>
        <form className="court-search" onSubmit={search}>
          <label><span>Fecha para jugar</span><div className="input-with-icon"><CalendarDays size={18} aria-hidden="true" /><input type="date" min={todayInTimeZone(court.timeZone)} value={date} onChange={(event) => { setDate(event.target.value); setAvailability(null); setSelection(null); setBooking(null); setPriceNotice(null); }} required aria-describedby="date-help" /></div><small id="date-help">Los horarios se muestran en la zona local de la Instalación.</small></label>
          <button className="button button-search" type="submit" disabled={loading}>{loading ? 'Consultando' : 'Ver turnos'}</button>
        </form>
        {priceNotice ? <div className={`notice price-update-notice ${priceNotice.unavailable ? 'notice-info' : 'notice-warning'}`} role="alert"><Info size={20} aria-hidden="true" /><div><strong>{priceNotice.unavailable ? 'Este horario acaba de dejar de estar disponible.' : 'El precio de este turno cambió desde que lo seleccionaste.'}</strong><p>{priceNotice.unavailable ? 'Actualizamos la disponibilidad. Elige otro turno para continuar.' : priceNotice.current == null ? 'Actualizamos la disponibilidad. Revisa y elige el turno de nuevo antes de confirmar.' : `Antes: ${formatCOP(priceNotice.previous)}. Ahora: ${formatCOP(priceNotice.current)}. Elige el turno de nuevo para aceptar el precio actual.`}</p></div></div> : null}
        {error && !selection ? <ErrorNotice onRetry={() => fetchAvailability(date)}>{errorCopy(error)}</ErrorNotice> : null}
        {loading ? <LoadingBlock lines={4} label="Consultando disponibilidad" /> : null}
        {!loading && availability ? <div className="availability-wrap">
          <div className="availability-meta"><span>Disponibilidad</span><strong>{formatDate(availability.date)}</strong><small>Hora local de la Instalación</small></div>
          {options.length ? <><div className="duration-picker" role="group" aria-label="Duración"><span>Duración y precio</span><div>{durations.map((price) => <button key={price.durationMinutes} type="button" aria-pressed={duration === price.durationMinutes} onClick={() => { setDuration(price.durationMinutes); setSelection(null); setBooking(null); }}>{price.durationMinutes} min <strong>{formatCOP(price.priceMinor)}</strong>{duration === price.durationMinutes ? <small>Elegida</small> : null}</button>)}</div></div><p className="slots-label">Horarios disponibles · {duration ?? options[0]?.durationMinutes} min</p>{selection ? <a className="selection-jump" href="#resumen-reserva">Ver tu selección y confirmar</a> : null}<div className="court-options" role="group" aria-label={`Horarios disponibles para ${duration ?? 'la duración seleccionada'} minutos`}>{visibleOptions.map((option) => {
            const selected = selection?.startTime === option.startTime && selection?.durationMinutes === option.durationMinutes;
            return <button key={`${option.startTime}-${option.durationMinutes}`} className={`slot-option ${selected ? 'selected' : ''}`} type="button" aria-pressed={selected} onClick={() => { setSelection(option); setBooking(null); setError(null); setPriceNotice(null); confirmationAttempt.current = null; }}>
              <span className="slot-time">{formatTime(option.startTime)}</span><span className="slot-duration">{option.durationMinutes} min</span><span className="slot-price">{formatCOP(option.priceMinor)}</span><span className="slot-select">{selected ? <><Check size={16} aria-hidden="true" />Elegido</> : 'Seleccionar turno'}</span>
            </button>;
          })}</div></> : <EmptyState icon={CalendarDays} title="No hay horarios disponibles para esta fecha.">Elige otra fecha para consultar nuevos turnos.</EmptyState>}
        </div> : null}
      </div>
      <aside id="resumen-reserva" className={`booking-ticket ${selection || booking ? 'has-selection' : ''}`} aria-label="Resumen de la reserva" aria-live="polite">
        <div className="ticket-stub"><span>Ficha de turno</span><strong>{booking ? `N.º ${booking.id}` : 'Sin emitir'}</strong></div>
        {booking ? <BookingSuccess booking={booking} onAnother={() => fetchAvailability(date)} /> : selection ? <>
           <div className="ticket-body"><h3>Tu selección</h3><p className="ticket-date">{formatDate(availability.date)}</p><strong className="ticket-time">{formatTime(selection.startTime)} – {formatInstant(selection.endAt, court.timeZone, { day: undefined, month: undefined, year: undefined })}</strong><dl><div><dt>Instalación</dt><dd>{court.facility.name}</dd></div><div><dt>Cancha</dt><dd>{court.name}</dd></div><div><dt>Duración</dt><dd>{selection.durationMinutes} min</dd></div><div><dt>Precio</dt><dd>{formatCOP(selection.priceMinor)}</dd></div></dl><p className="ticket-note">La opción se volverá a verificar al confirmar.</p>{error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}</div>
          <button className="button button-primary button-wide" type="button" onClick={confirm} disabled={confirming || auth.status === 'loading'}><ButtonPending pending={confirming} pendingLabel="Confirmando…">{auth.status === 'authenticated' ? 'Confirmar reserva' : 'Iniciar sesión para confirmar'}</ButtonPending></button>
        </> : <div className="ticket-empty"><Clock3 size={28} aria-hidden="true" /><strong>Tu turno aparecerá aquí</strong><p>Elige un horario para revisar el precio antes de reservar.</p></div>}
      </aside>
    </section>
  );
}

function BookingSuccess({ booking, onAnother }) {
  return <div className="ticket-success"><span className="success-mark"><Check aria-hidden="true" /></span><h2>Reserva confirmada</h2><p>{booking.facility.name}<br /><strong>{booking.court.name}</strong><br />{formatInstant(booking.startAt, booking.timeZone)}</p><div className="success-time">{new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: booking.timeZone }).format(new Date(booking.startAt))}</div><strong className="success-price">{formatCOP(booking.priceMinor)}</strong><Link className="button button-secondary button-wide" to="/reservas">Ver mis Reservas</Link><Link className="button button-quiet button-wide" to="/">Volver al marketplace</Link><button className="button button-quiet button-wide" type="button" onClick={onAnother}>Buscar otro turno</button></div>;
}
