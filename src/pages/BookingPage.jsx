import { CalendarDays, Check, Clock3, MapPin, Search, TicketCheck } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api, ApiError, withQuery } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { ButtonPending, EmptyState, ErrorNotice, LoadingBlock } from '../components/Feedback.jsx';
import { errorCopy, formatDate, formatTime, todayInputValue } from '../lib/format.js';

export function BookingPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState({ courtId: '', date: todayInputValue() });
  const [availability, setAvailability] = useState(null);
  const [selection, setSelection] = useState(null);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const confirmationAttempt = useRef(null);

  async function search(event) {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    setSelection(null);
    setBooking(null);
    try {
      const result = await api(withQuery(`/api/v1/courts/${query.courtId}/availability`, { date: query.date }));
      setAvailability(result);
    } catch (caught) {
      setAvailability(null);
      setError(caught);
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!selection) return;
    if (auth.status !== 'authenticated') {
      navigate('/acceso', { state: { from: '/' } });
      return;
    }
    setConfirming(true);
    setError(null);
    const signature = `${availability.court.id}:${availability.date}:${selection.startTime}:${selection.durationMinutes}`;
    if (confirmationAttempt.current?.signature !== signature) {
      confirmationAttempt.current = { signature, key: crypto.randomUUID() };
    }
    try {
      const result = await api('/api/v1/bookings', {
        method: 'POST',
        headers: { 'Idempotency-Key': confirmationAttempt.current.key },
        body: {
          courtId: availability.court.id,
          localDate: availability.date,
          startTime: selection.startTime,
          durationMinutes: selection.durationMinutes,
        },
      });
      setBooking(result.booking);
      confirmationAttempt.current = null;
    } catch (caught) {
      if (caught instanceof ApiError) confirmationAttempt.current = null;
      setError(caught);
    } finally {
      setConfirming(false);
    }
  }

  const options = availability?.options ?? [];

  return (
    <div className="booking-layout">
      <section className="booking-stage">
        <header className="booking-hero">
          <div><h1>Elige tu línea de juego.</h1><p>Ingresa la Cancha indicada por la Instalación y consulta una fecha.</p></div>
          <span className="live-note"><i />Disponibilidad en tiempo real</span>
        </header>
        <form className="court-search" onSubmit={search}>
          <label><span>ID de Cancha</span><div className="input-with-icon"><MapPin size={18} /><input inputMode="numeric" pattern="[1-9][0-9]*" value={query.courtId} onChange={(event) => setQuery((current) => ({ ...current, courtId: event.target.value }))} placeholder="Ej. 12" required /></div></label>
          <label><span>Fecha</span><div className="input-with-icon"><CalendarDays size={18} /><input type="date" min={todayInputValue()} value={query.date} onChange={(event) => setQuery((current) => ({ ...current, date: event.target.value }))} required /></div></label>
          <button className="button button-search" type="submit" disabled={loading}><Search size={18} />{loading ? 'Consultando' : 'Ver turnos'}</button>
        </form>
        {error && !selection ? <ErrorNotice onRetry={availability ? search : undefined}>{errorCopy(error)}</ErrorNotice> : null}
        {loading ? <LoadingBlock lines={5} label="Consultando disponibilidad" /> : null}
        {!loading && !availability ? (
          <div className="court-welcome" aria-hidden="true">
            <span className="court-net" /><span className="court-service court-service-a" /><span className="court-service court-service-b" />
            <div><Clock3 size={30} /><strong>Los turnos aparecerán sobre la pista</strong><p>Solo mostramos opciones que cumplen horario, duración y separación.</p></div>
          </div>
        ) : null}
        {!loading && availability ? (
          <div className="availability-wrap">
            <div className="availability-meta"><span>Cancha {availability.court.id}</span><strong>{formatDate(availability.date)}</strong><small>{availability.court.timeZone}</small></div>
            {options.length ? (
              <div className="court-options" role="listbox" aria-label="Turnos disponibles">
                {options.map((option) => {
                  const selected = selection?.startTime === option.startTime && selection?.durationMinutes === option.durationMinutes;
                  return (
                    <button key={`${option.startTime}-${option.durationMinutes}`} className={`slot-option ${selected ? 'selected' : ''}`} type="button" role="option" aria-selected={selected} onClick={() => { setSelection(option); setBooking(null); setError(null); }}>
                      <span className="slot-time">{formatTime(option.startTime)}</span>
                      <span className="slot-duration">{option.durationMinutes} min</span>
                      <span className="slot-select">{selected ? <><Check size={16} />Elegido</> : 'Elegir'}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={CalendarDays} title="No hay turnos para esta fecha">Prueba otra fecha o confirma el ID de la Cancha.</EmptyState>
            )}
          </div>
        ) : null}
      </section>
      <aside className={`booking-ticket ${selection ? 'has-selection' : ''}`} aria-live="polite">
        <div className="ticket-stub"><span>Ficha de turno</span><strong>{booking ? `N.º ${booking.id}` : 'Sin emitir'}</strong></div>
        {booking ? (
          <BookingSuccess booking={booking} onAnother={() => { setSelection(null); setBooking(null); setError(null); search(); }} />
        ) : selection ? (
          <>
            <div className="ticket-body">
              <p className="ticket-date">{formatDate(availability.date)}</p>
              <strong className="ticket-time">{formatTime(selection.startTime)}</strong>
              <dl><div><dt>Cancha</dt><dd>{availability.court.id}</dd></div><div><dt>Duración</dt><dd>{selection.durationMinutes} min</dd></div><div><dt>Zona</dt><dd>{availability.court.timeZone}</dd></div></dl>
              <p className="ticket-note">La opción se revalidará al confirmar.</p>
              {error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}
            </div>
            <button className="button button-primary button-wide" type="button" onClick={confirm} disabled={confirming}><ButtonPending pending={confirming}>{auth.status === 'authenticated' ? 'Confirmar reserva' : 'Ingresar para reservar'}</ButtonPending></button>
          </>
        ) : (
          <div className="ticket-empty"><TicketCheck size={28} /><strong>Tu turno aparecerá aquí</strong><p>Elige una hora para revisar los detalles antes de confirmar.</p></div>
        )}
      </aside>
    </div>
  );
}

function BookingSuccess({ booking, onAnother }) {
  return (
    <div className="ticket-success">
      <span className="success-mark"><Check /></span>
      <h2>Reserva confirmada</h2>
      <p>{booking.facility.name}<br /><strong>{booking.court.name}</strong></p>
      <div className="success-time">{new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: booking.timeZone }).format(new Date(booking.startAt))}</div>
      <button className="button button-dark button-wide" type="button" onClick={onAnother}>Buscar otro turno</button>
    </div>
  );
}
