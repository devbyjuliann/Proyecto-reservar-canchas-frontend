import { CalendarDays, Check, Clock3, Info } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { api, ApiError, withQuery } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { ButtonPending, EmptyState, ErrorNotice, LoadingBlock } from '../components/Feedback.jsx';
import { errorCopy, formatCancellationWindow, formatCOP, formatDate, formatInstant, formatPaymentCountdown, formatTime, priceMinorFromCOP, todayInTimeZone } from '../lib/format.js';

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
  const [checkout, setCheckout] = useState(null);
  const [creditBalance, setCreditBalance] = useState(null);
  const [creditPesos, setCreditPesos] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const [priceNotice, setPriceNotice] = useState(null);
  const confirmationAttempt = useRef(null);

  useEffect(() => {
    if (auth.status !== 'authenticated') { setCreditBalance(null); return; }
    const controller = new AbortController();
    api(`/api/v1/me/facilities/${court.facility.id}/credit`, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setCreditBalance(result.balanceMinor); })
      .catch(() => { if (!controller.signal.aborted) setCreditBalance(null); });
    return () => controller.abort();
  }, [auth.status, court.facility.id]);

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
    setCheckout(null);
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
      const useCreditMinor = priceMinorFromCOP(creditPesos);
      if (useCreditMinor === null) {
        setError(new ApiError({ status: 400, code: 'invalid_request' }));
        return;
      }
      const result = await api('/api/v1/bookings', {
        method: 'POST', headers: { 'Idempotency-Key': confirmationAttempt.current.key },
        body: {
          courtId: court.id, localDate: availability.date,
          startTime: selection.startTime, durationMinutes: selection.durationMinutes,
          expectedPriceMinor: selection.priceMinor, currency: 'COP',
          ...(useCreditMinor ? { useCreditMinor } : {}),
        },
      });
      setBooking(result.booking);
      setCheckout(result.checkout);
      setCreditBalance((current) => current == null ? current : Math.max(0,
        current - (result.checkout?.creditAppliedMinor ?? 0)));
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
         {booking ? booking.status === 'PENDIENTE_PAGO'
           ? <PaymentPending booking={booking} checkout={checkout} onExpired={() => fetchAvailability(date)} onUpdated={setBooking} />
           : <BookingSuccess booking={booking} onAnother={() => fetchAvailability(date)} /> : selection ? <>
            <div className="ticket-body"><h3>Resumen y anticipo</h3><p className="ticket-date">{formatDate(availability.date)}</p><strong className="ticket-time">{formatTime(selection.startTime)} – {formatInstant(selection.endAt, court.timeZone, { day: undefined, month: undefined, year: undefined })}</strong><dl><div><dt>Instalación</dt><dd>{court.facility.name}</dd></div><div><dt>Cancha</dt><dd>{court.name}</dd></div><div><dt>Duración</dt><dd>{selection.durationMinutes} min</dd></div><div><dt>Precio total</dt><dd>{formatCOP(selection.priceMinor)}</dd></div><div><dt>Anticipo requerido</dt><dd>{formatCOP(Math.ceil(selection.priceMinor * (availability.court.depositPercentage ?? 30) / 100))} ({availability.court.depositPercentage ?? 30}%)</dd></div></dl>{auth.status === 'authenticated' ? <label className="field checkout-credit"><span>Saldo a favor a utilizar</span><input type="number" min="0" step="1" inputMode="numeric" value={creditPesos} onChange={(event) => setCreditPesos(event.target.value)} placeholder="0" /><small>Disponible en {court.facility.name}: {creditBalance == null ? 'consultando…' : formatCOP(creditBalance)}. El saldo se aplica solo si lo eliges.</small></label> : null}<p className="ticket-note">El saldo restante se paga presencialmente. Puedes cancelar o reprogramar {formatCancellationWindow(availability.court.cancellationMinMinutes ?? court.cancellationMinMinutes ?? 120)}; un anticipo confirmado no se devuelve por cancelación voluntaria.</p>{error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}</div>
           <button className="button button-primary button-wide" type="button" onClick={confirm} disabled={confirming || auth.status === 'loading'}><ButtonPending pending={confirming} pendingLabel="Reservando horario…">{auth.status === 'authenticated' ? 'Continuar al anticipo' : 'Iniciar sesión para continuar'}</ButtonPending></button>
        </> : <div className="ticket-empty"><Clock3 size={28} aria-hidden="true" /><strong>Tu turno aparecerá aquí</strong><p>Elige un horario para revisar el precio antes de reservar.</p></div>}
      </aside>
    </section>
  );
}

function PaymentPending({ booking, checkout, onExpired, onUpdated }) {
  const [now, setNow] = useState(Date.now());
  const [opening, setOpening] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);
  const expired = !booking.paymentExpiresAt || new Date(booking.paymentExpiresAt).getTime() <= now;

  useEffect(() => {
    if (expired) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [expired]);

  async function payWithWompi() {
    setOpening(true); setError(null);
    try {
      const result = await api(`/api/v1/bookings/${booking.id}/payments/wompi/checkout`, { method: 'POST' });
      await loadWompiWidget();
      const widget = new window.WidgetCheckout(result.config);
      widget.open(async (widgetResult) => {
        setVerifying(true);
        try {
          const transactionId = widgetResult?.transaction?.id;
          if (transactionId) await api(`/api/v1/bookings/${booking.id}/payments/wompi/reconcile`, {
            method: 'POST', body: { transactionId },
          });
          const own = await api('/api/v1/me/bookings?limit=100');
          const updated = own.items.find((item) => item.id === booking.id);
          if (updated) onUpdated(updated);
        } catch (caught) { setError(caught); }
        finally { setVerifying(false); }
      });
    } catch (caught) { setError(caught); }
    finally { setOpening(false); }
  }

  return <div className="ticket-body checkout-pending"><h3>Anticipo pendiente</h3><p className="ticket-date">Tu horario queda reservado temporalmente.</p><strong className="checkout-countdown">{expired ? 'Tiempo vencido' : formatPaymentCountdown(booking.paymentExpiresAt, now)}</strong><dl><div><dt>Precio total</dt><dd>{formatCOP(booking.priceMinor)}</dd></div><div><dt>Anticipo requerido</dt><dd>{formatCOP(checkout?.depositAmountMinor ?? booking.depositAmountMinor)}</dd></div><div><dt>Saldo a favor aplicado</dt><dd>{formatCOP(checkout?.creditAppliedMinor ?? booking.amountPaidMinor ?? 0)}</dd></div><div><dt>Anticipo restante con Wompi</dt><dd>{formatCOP(checkout?.amountDueMinor ?? Math.max(0, (booking.depositAmountMinor ?? 0) - (booking.amountPaidMinor ?? 0)))}</dd></div><div><dt>Saldo presencial</dt><dd>{formatCOP(Math.max(0, (booking.priceMinor ?? 0) - (booking.depositAmountMinor ?? 0)))}</dd></div></dl>{expired ? <><p className="notice notice-warning">El horario ya no está retenido. Consulta de nuevo antes de iniciar otra Reserva.</p><button className="button button-secondary button-wide" type="button" onClick={onExpired}>Ver horarios disponibles</button></> : <><button className="button button-primary button-wide" type="button" disabled={opening || verifying} onClick={payWithWompi}><ButtonPending pending={opening || verifying} pendingLabel={verifying ? 'Verificando pago…' : 'Abriendo Wompi…'}>Pagar anticipo con Wompi</ButtonPending></button><p className="ticket-note">Tienes 10 minutos desde la creación del checkout para completar el anticipo. El servidor, no este navegador, verifica la acreditación.</p></>}{error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}</div>;
}

function loadWompiWidget() {
  if (window.WidgetCheckout) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-wompi-widget]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.wompi.co/widget.js';
    script.async = true;
    script.dataset.wompiWidget = 'true';
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', () => reject(new Error('No se pudo cargar Wompi')), { once: true });
    document.head.append(script);
  });
}

function BookingSuccess({ booking, onAnother }) {
  return <div className="ticket-success"><span className="success-mark"><Check aria-hidden="true" /></span><h2>Reserva confirmada</h2><p>{booking.facility.name}<br /><strong>{booking.court.name}</strong><br />{formatInstant(booking.startAt, booking.timeZone)}</p><div className="success-time">{new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: booking.timeZone }).format(new Date(booking.startAt))}</div><strong className="success-price">{formatCOP(booking.priceMinor)}</strong><Link className="button button-secondary button-wide" to="/reservas">Ver mis Reservas</Link><Link className="button button-quiet button-wide" to="/">Volver al marketplace</Link><button className="button button-quiet button-wide" type="button" onClick={onAnother}>Buscar otro turno</button></div>;
}
