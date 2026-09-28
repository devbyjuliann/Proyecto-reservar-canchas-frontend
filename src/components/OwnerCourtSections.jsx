import { CalendarOff, Clock3, Plus, Trash2, Wrench } from 'lucide-react';
import { useState } from 'react';

import { EmptyState } from './Feedback.jsx';
import { formatCOP, formatDate, formatInstant, formatTime, sportLabel, todayInTimeZone } from '../lib/format.js';
import { parseDurations, parsePriceMinor, priceInputValue, toLocalTime, validPeriod } from '../lib/owner-forms.js';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function OwnerSection({ title, description, children, action }) {
  return <section className="owner-work-section"><header className="owner-work-heading"><div><h2>{title}</h2><p>{description}</p></div>{action}</header>{children}</section>;
}

function InputError({ children }) {
  return children ? <p className="owner-form-error" role="alert">{children}</p> : null;
}

export function GeneralSection({ court, pending, save, deactivate }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({ name: court.name, description: court.description || '', sportCode: court.sportCode || '' });
  const [confirming, setConfirming] = useState(false);
  const [inputError, setInputError] = useState('');
  const active = court.state === 'active';

  async function submit(event) {
    event.preventDefault();
    const name = values.name.trim();
    const sportCode = values.sportCode.trim().toUpperCase();
    if (sportCode && !/^[A-Z0-9_]{2,32}$/.test(sportCode)) {
      setInputError('El deporte debe ser un código como FUTBOL_5.'); return;
    }
    const body = { name, description: values.description.trim() || null, sportCode: sportCode || null };
    setInputError('');
    if (await save(body)) {
      setValues({ name, description: body.description || '', sportCode: sportCode || '' });
      setEditing(false);
    }
  }

  return <><OwnerSection title="Datos de la Cancha" description="La ficha descriptiva que acompaña a la Cancha." action={active ? <button className="button button-quiet button-small" type="button" onClick={() => setEditing((value) => !value)}>Editar datos</button> : null}>
    <dl className="owner-detail-facts"><div><dt>Nombre</dt><dd>{court.name}</dd></div><div><dt>Deporte</dt><dd>{sportLabel(court.sportCode)}</dd></div><div><dt>Descripción</dt><dd>{court.description || 'Por definir'}</dd></div><div><dt>Estado</dt><dd>{active ? 'Activa' : 'Inactiva'}</dd></div></dl>
    {editing && active ? <form className="owner-editor form-grid" onSubmit={submit}><label className="field"><span>Nombre</span><input value={values.name} maxLength={150} required onChange={(event) => setValues({ ...values, name: event.target.value })} /></label><label className="field"><span>Deporte (código)</span><input value={values.sportCode} maxLength={32} placeholder="FUTBOL_5" onChange={(event) => setValues({ ...values, sportCode: event.target.value })} /></label><label className="field field-wide"><span>Descripción</span><textarea value={values.description} maxLength={500} onChange={(event) => setValues({ ...values, description: event.target.value })} /></label><div className="field-wide"><InputError>{inputError}</InputError></div><div className="form-actions field-wide"><button className="button button-primary" type="submit" disabled={pending}>Guardar datos</button><button className="button button-quiet" type="button" disabled={pending} onClick={() => setEditing(false)}>Cancelar</button></div></form> : null}
  </OwnerSection>
    {active ? <OwnerSection title="Desactivar Cancha" description="Las Reservas vigentes pueden impedir esta acción. No existe reactivación en el contrato actual.">
      {confirming ? <div className="owner-inline-confirm"><strong>¿Desactivar esta Cancha?</strong><button className="button button-danger" type="button" disabled={pending} onClick={async () => { if (await deactivate()) setConfirming(false); }}>Sí, desactivar</button><button className="button button-quiet" type="button" disabled={pending} onClick={() => setConfirming(false)}>Conservar</button></div> : <button className="button button-danger-subtle" type="button" onClick={() => setConfirming(true)}>Desactivar Cancha</button>}
    </OwnerSection> : null}
  </>;
}

export function ConfigurationSection({ courtId, value, pending, disabled, save }) {
  const [values, setValues] = useState({ minimumSeparationMinutes: String(value.minimumSeparationMinutes), startIntervalMinutes: String(value.startIntervalMinutes), durations: value.allowedDurationsMinutes.join(', ') });
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const [inputError, setInputError] = useState('');

  async function submit(event) {
    event.preventDefault();
    const allowedDurationsMinutes = parseDurations(values.durations);
    const interval = Number(values.startIntervalMinutes);
    const separation = Number(values.minimumSeparationMinutes);
    if (!allowedDurationsMinutes || !Number.isInteger(interval) || interval < 1 || interval > 65_535
      || !Number.isInteger(separation) || separation < 0 || separation > 65_535) {
      setInputError('Indica Duraciones únicas entre 1 y 65.535 min y revisa intervalo/separación.'); return;
    }
    if (value.allowedDurationsMinutes.some((duration) => !allowedDurationsMinutes.includes(duration)) && !confirmRemoval) {
      setInputError('Quitar una Duración también retira su precio. Confirma para continuar.');
      setConfirmRemoval(true);
      return;
    }
    setInputError('');
    if (await save({ courtId, minimumSeparationMinutes: separation,
      startIntervalMinutes: interval, allowedDurationsMinutes })) setConfirmRemoval(false);
  }

  return <OwnerSection title="Configuración de Reserva" description="Estas reglas afectan los inicios posibles y la separación entre Reservas. Los Conflictos se calculan en el backend.">
    <form className="owner-editor form-grid" onSubmit={submit}><label className="field"><span>Separación mínima (minutos)</span><input type="number" min="0" max="65535" value={values.minimumSeparationMinutes} onChange={(event) => { setValues({ ...values, minimumSeparationMinutes: event.target.value }); setConfirmRemoval(false); }} disabled={disabled} required /></label><label className="field"><span>Intervalo entre inicios (minutos)</span><input type="number" min="1" max="65535" value={values.startIntervalMinutes} onChange={(event) => { setValues({ ...values, startIntervalMinutes: event.target.value }); setConfirmRemoval(false); }} disabled={disabled} required /></label><label className="field field-wide"><span>Duraciones permitidas</span><input value={values.durations} onChange={(event) => { setValues({ ...values, durations: event.target.value }); setConfirmRemoval(false); }} placeholder="30, 60, 90" disabled={disabled} required /><small>Minutos separados por coma. Quitar una Duración también elimina su precio configurado.</small></label><div className="field-wide"><InputError>{inputError}</InputError></div>{!disabled ? <div className="form-actions field-wide"><button className="button button-primary" type="submit" disabled={pending}>{confirmRemoval ? 'Confirmar reemplazo' : 'Guardar configuración'}</button></div> : null}</form>
  </OwnerSection>;
}

function PeriodEditor({ periods, onChange, withDay = false }) {
  function update(index, field, value) {
    onChange(periods.map((period, position) => position === index
      ? { ...period, [field]: field === 'weekday' ? Number(value) : toLocalTime(value) }
      : period));
  }
  return <div className="owner-period-editor">{periods.map((period, index) => <div className={`owner-period-row ${withDay ? 'with-day' : ''}`} key={`${withDay ? period.weekday : 'special'}-${index}`}>{withDay ? <label className="field"><span>Día</span><select value={period.weekday} onChange={(event) => update(index, 'weekday', event.target.value)}>{DAYS.map((day, dayIndex) => <option value={dayIndex + 1} key={day}>{day}</option>)}</select></label> : null}<label className="field"><span>Inicio</span><input type="time" value={formatTime(period.startTime)} onChange={(event) => update(index, 'startTime', event.target.value)} required /></label><label className="field"><span>Fin</span><input type="time" value={formatTime(period.endTime)} onChange={(event) => update(index, 'endTime', event.target.value)} required /></label><button className="icon-button" type="button" aria-label={`Eliminar Franja ${index + 1}`} onClick={() => onChange(periods.filter((_, position) => position !== index))}><Trash2 size={17} aria-hidden="true" /></button></div>)}<button className="button button-quiet button-small" type="button" onClick={() => onChange([...periods, { ...(withDay ? { weekday: 1 } : {}), startTime: '08:00:00', endTime: '09:00:00' }])}><Plus size={16} aria-hidden="true" />Agregar Franja</button></div>;
}

export function ScheduleSection({ value, pending, disabled, save }) {
  const [periods, setPeriods] = useState(value.periods);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [inputError, setInputError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (periods.some((period) => !validPeriod(period))) {
      setInputError('Cada Franja debe terminar después de su hora de inicio.'); return;
    }
    if (!confirming) {
      setConfirming(true);
      setInputError('Se reemplazará el horario semanal completo. Las Reservas existentes no se cancelan automáticamente.');
      return;
    }
    setInputError('');
    if (await save({ periods })) { setConfirming(false); setEditing(false); }
  }

  return <OwnerSection title="Horario semanal" description="Los días sin Franjas figuran como cerrados. Una Excepción puede reemplazar este horario en una fecha concreta." action={!disabled ? <button className="button button-quiet button-small" type="button" onClick={() => setEditing((current) => !current)}>Editar horario</button> : null}>
    <div className="owner-week-board">{DAYS.map((day, index) => <div key={day}><strong>{day}</strong><span>{value.periods.filter((period) => period.weekday === index + 1).map((period) => `${formatTime(period.startTime)}–${formatTime(period.endTime)}`).join(' / ') || 'Sin horario'}</span></div>)}</div>
    {editing && !disabled ? <form className="owner-editor" onSubmit={submit}><PeriodEditor periods={periods} onChange={(next) => { setPeriods(next); setConfirming(false); setInputError(''); }} withDay /><InputError>{inputError}</InputError><div className="form-actions"><button className="button button-primary" type="submit" disabled={pending}>{confirming ? 'Confirmar reemplazo' : 'Reemplazar horario'}</button><button className="button button-quiet" type="button" disabled={pending} onClick={() => setEditing(false)}>Cancelar</button></div></form> : null}
  </OwnerSection>;
}

export function ExceptionsSection({ items, cursor, loadingMore, loadMore, timeZone, pending, disabled, save, remove }) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(todayInTimeZone(timeZone));
  const [mode, setMode] = useState('CLOSED');
  const [periods, setPeriods] = useState([]);
  const [deleteDate, setDeleteDate] = useState(null);
  const [inputError, setInputError] = useState('');

  function edit(item) { setDate(item.localDate); setMode(item.mode); setPeriods(item.periods); setEditing(true); setInputError(''); }
  async function submit(event) {
    event.preventDefault();
    if (mode === 'CUSTOM_PERIODS' && (!periods.length || periods.some((period) => !validPeriod(period)))) {
      setInputError('El horario especial necesita una Franja válida con fin posterior al inicio.'); return;
    }
    setInputError('');
    if (await save(date, { mode, periods: mode === 'CLOSED' ? [] : periods })) setEditing(false);
  }

  return <OwnerSection title="Excepciones por fecha" description="Una Excepción sustituye por completo el horario semanal de ese día." action={!disabled ? <button className="button button-secondary button-small" type="button" onClick={() => { setEditing(true); setDate(todayInTimeZone(timeZone)); setMode('CLOSED'); setPeriods([]); }}><Plus size={16} aria-hidden="true" />Nueva excepción</button> : null}>
    {editing && !disabled ? <form className="owner-editor form-stack" onSubmit={submit}><div className="form-grid"><label className="field"><span>Fecha local de la Instalación</span><input type="date" min={todayInTimeZone(timeZone)} value={date} onChange={(event) => setDate(event.target.value)} required /></label><label className="field"><span>Tipo</span><select value={mode} onChange={(event) => { setMode(event.target.value); if (event.target.value === 'CLOSED') setPeriods([]); }}><option value="CLOSED">Día cerrado</option><option value="CUSTOM_PERIODS">Horario especial</option></select></label></div>{mode === 'CUSTOM_PERIODS' ? <PeriodEditor periods={periods} onChange={setPeriods} /> : <p className="quiet-copy">No se ofrecerán turnos durante esta fecha.</p>}<InputError>{inputError}</InputError><div className="form-actions"><button className="button button-primary" type="submit" disabled={pending}>Guardar excepción</button><button className="button button-quiet" type="button" disabled={pending} onClick={() => setEditing(false)}>Cancelar</button></div></form> : null}
    {!items.length ? <EmptyState icon={CalendarOff} title="Sin Excepciones">Se aplica el horario semanal salvo que configures una fecha especial.</EmptyState> : <div className="owner-data-list">{items.map((item) => <article className="owner-data-row" key={item.localDate}><div><strong>{formatDate(item.localDate)}</strong><p>{item.mode === 'CLOSED' ? 'Día cerrado' : `Horario especial: ${item.periods.map((period) => `${formatTime(period.startTime)}–${formatTime(period.endTime)}`).join(', ')}`}</p></div>{!disabled ? <div className="owner-row-actions"><button className="button button-quiet button-small" type="button" onClick={() => edit(item)}>Editar</button>{deleteDate === item.localDate ? <><button className="button button-danger button-small" type="button" disabled={pending} onClick={async () => { if (await remove(item.localDate)) setDeleteDate(null); }}>Sí, eliminar</button><button className="button button-quiet button-small" type="button" onClick={() => setDeleteDate(null)}>Conservar</button></> : <button className="button button-danger-subtle button-small" type="button" onClick={() => setDeleteDate(item.localDate)}>Eliminar</button>}</div> : null}</article>)}</div>}
    {cursor ? <button className="button button-quiet load-more" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Cargando' : 'Ver más Excepciones'}</button> : null}
  </OwnerSection>;
}

export function UnavailabilitySection({ items, cursor, loadingMore, loadMore, pending, disabled, save }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState({ type: 'BLOQUEO_ADMINISTRATIVO', startAt: '', endAt: '', reason: '' });
  const [inputError, setInputError] = useState('');

  async function submit(event) {
    event.preventDefault();
    const start = new Date(values.startAt);
    const end = new Date(values.endAt);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      setInputError('El final del bloqueo debe ser posterior al inicio.'); return;
    }
    setInputError('');
    if (await save({ type: values.type, startAt: start.toISOString(), endAt: end.toISOString(), reason: values.reason.trim() || null })) {
      setEditing(false);
      setValues({ type: 'BLOQUEO_ADMINISTRATIVO', startAt: '', endAt: '', reason: '' });
    }
  }

  return <OwnerSection title="Bloqueos e Indisponibilidades" description="Los bloqueos impiden nuevas Reservas. Los Conflictos de Reservas existentes se registran en el backend." action={!disabled ? <button className="button button-secondary button-small" type="button" onClick={() => setEditing((value) => !value)}><Plus size={16} aria-hidden="true" />Nuevo bloqueo</button> : null}>
    {editing && !disabled ? <form className="owner-editor form-grid" onSubmit={submit}><label className="field field-wide"><span>Tipo de Indisponibilidad</span><select value={values.type} onChange={(event) => setValues({ ...values, type: event.target.value })}><option value="BLOQUEO_ADMINISTRATIVO">Bloqueo administrativo</option><option value="FUERA_DE_SERVICIO">Fuera de servicio</option></select></label><label className="field"><span>Inicio</span><input type="datetime-local" value={values.startAt} onChange={(event) => setValues({ ...values, startAt: event.target.value })} required /></label><label className="field"><span>Fin</span><input type="datetime-local" value={values.endAt} onChange={(event) => setValues({ ...values, endAt: event.target.value })} required /></label><label className="field field-wide"><span>Motivo (opcional)</span><textarea value={values.reason} maxLength={500} onChange={(event) => setValues({ ...values, reason: event.target.value })} /></label><p className="form-hint field-wide">Las horas de tu dispositivo se enviarán como instantes UTC.</p><div className="field-wide"><InputError>{inputError}</InputError></div><div className="form-actions field-wide"><button className="button button-primary" type="submit" disabled={pending}>Crear Indisponibilidad</button><button className="button button-quiet" type="button" disabled={pending} onClick={() => setEditing(false)}>Cancelar</button></div></form> : null}
    {!items.length ? <EmptyState icon={Wrench} title="Sin bloqueos registrados">No hay Indisponibilidades para esta Cancha.</EmptyState> : <div className="owner-data-list">{items.map((item) => <article className="owner-data-row" key={item.id}><div><strong>{item.type === 'FUERA_DE_SERVICIO' ? 'Fuera de servicio' : 'Bloqueo administrativo'}</strong><p>{item.reason || 'Sin motivo informado'}</p><small>{formatInstant(item.startAt)} – {formatInstant(item.endAt)}</small></div></article>)}</div>}
    {cursor ? <button className="button button-quiet load-more" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Cargando' : 'Ver más bloqueos'}</button> : null}
  </OwnerSection>;
}

export function PricesSection({ items, pending, disabled, save, remove }) {
  const [values, setValues] = useState(Object.fromEntries(items.map((item) => [item.durationMinutes, priceInputValue(item.priceMinor)])));
  const [errors, setErrors] = useState({});
  const [confirmRemove, setConfirmRemove] = useState(null);

  async function submit(event, durationMinutes) {
    event.preventDefault();
    const amount = parsePriceMinor(values[durationMinutes] ?? '');
    if (amount === null) {
      setErrors((current) => ({ ...current, [durationMinutes]: 'Ingresa un precio positivo en COP, con hasta dos decimales.' }));
      return;
    }
    setErrors((current) => ({ ...current, [durationMinutes]: '' }));
    await save(durationMinutes, amount);
  }

  return <OwnerSection title="Precios por Duración" description="Cada Duración permitida tiene un precio fijo en COP. Cambiarlo no modifica el precio de Reservas existentes.">
    {!items.length ? <EmptyState icon={Clock3} title="Sin Duraciones para cotizar">Configura primero al menos una Duración permitida.</EmptyState> : <div className="owner-price-list">{items.map((item) => <form className="owner-price-row" key={item.durationMinutes} onSubmit={(event) => submit(event, item.durationMinutes)}><div><strong>{item.durationMinutes} min</strong><span>{formatCOP(item.priceMinor)}</span></div>{!disabled ? <><label className="field"><span>Precio para {item.durationMinutes} minutos (COP)</span><input inputMode="decimal" value={values[item.durationMinutes] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [item.durationMinutes]: event.target.value }))} placeholder="Ej. 90000" required /></label><button className="button button-secondary button-small" type="submit" disabled={pending}>{item.priceMinor == null ? 'Establecer precio' : 'Actualizar precio'}</button>{item.priceMinor != null ? confirmRemove === item.durationMinutes ? <div className="owner-row-actions"><span>¿Retirar este precio?</span><button className="button button-danger button-small" type="button" disabled={pending} onClick={async () => { if (await remove(item.durationMinutes)) setConfirmRemove(null); }}>Sí, retirar</button><button className="button button-quiet button-small" type="button" onClick={() => setConfirmRemove(null)}>Conservar</button></div> : <button className="button button-danger-subtle button-small" type="button" onClick={() => setConfirmRemove(item.durationMinutes)}>Retirar</button> : null}</> : null}{errors[item.durationMinutes] ? <p className="owner-form-error" role="alert">{errors[item.durationMinutes]}</p> : null}</form>)}</div>}
  </OwnerSection>;
}
