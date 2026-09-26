import { ArrowLeft, Ban, CalendarOff, Clock3, Plus, Trash2, Wrench, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api, apiItems } from '../../api/client.js';
import { ButtonPending, EmptyState, ErrorNotice, LoadingBlock } from '../../components/Feedback.jsx';
import { AddButton, OperationResult, Section, StatusDot } from '../../components/Primitives.jsx';
import { errorCopy, formatDate, formatInstant, formatTime, todayInputValue } from '../../lib/format.js';

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function AdminCourtPage() {
  const { courtId } = useParams();
  const [court, setCourt] = useState(null);
  const [configuration, setConfiguration] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [exceptions, setExceptions] = useState([]);
  const [unavailabilities, setUnavailabilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [operation, setOperation] = useState(null);
  const [editor, setEditor] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api(`/api/v1/admin/courts/${courtId}`, { signal: controller.signal }),
      api(`/api/v1/admin/courts/${courtId}/booking-configuration`, { signal: controller.signal }),
      api(`/api/v1/admin/courts/${courtId}/weekly-schedule`, { signal: controller.signal }),
      apiItems(`/api/v1/admin/courts/${courtId}/date-exceptions`, { limit: 100 }, { signal: controller.signal }),
      apiItems(`/api/v1/admin/courts/${courtId}/unavailabilities`, { limit: 100 }, { signal: controller.signal }),
    ]).then(([courtResult, configResult, scheduleResult, exceptionItems, unavailabilityItems]) => {
      setCourt(courtResult.court);
      setConfiguration(configResult);
      setSchedule(scheduleResult.weeklySchedule);
      setExceptions(exceptionItems);
      setUnavailabilities(unavailabilityItems);
    }).catch((caught) => {
      if (caught.name !== 'AbortError') setError(caught);
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [courtId]);

  function applied(result) {
    if (result.court) setCourt(result.court);
    if (result.bookingConfiguration) setConfiguration(result.bookingConfiguration);
    if (result.weeklySchedule) setSchedule(result.weeklySchedule);
    setOperation(result.operation ?? null);
    setEditor(null);
  }

  async function deactivate() {
    setError(null);
    try { applied(await api(`/api/v1/admin/courts/${courtId}/deactivation`, { method: 'POST' })); }
    catch (caught) { setError(caught); }
  }

  if (loading) return <div className="page-standard"><LoadingBlock lines={8} /></div>;
  if (!court) return <div className="page-standard"><ErrorNotice>{errorCopy(error)}</ErrorNotice></div>;

  return (
    <div className="page-standard admin-page court-admin">
      <Link className="back-link" to={`/admin/instalaciones/${court.facility.id}`}><ArrowLeft size={17} />{court.facility.name}</Link>
      <header className="resource-hero"><div><div className="resource-title-line"><h1>{court.name}</h1><StatusDot state={court.state} /></div><p>{court.description || 'Sin descripción'} · ID {court.id}</p></div><div className="page-actions"><button className="button button-secondary" type="button" onClick={() => setEditor('details')}>Editar datos</button>{court.state === 'active' ? <button className="button button-danger-subtle" type="button" onClick={deactivate}><Ban size={17} />Desactivar</button> : null}</div></header>
      {error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}
      <OperationResult operation={operation} />
      {editor === 'details' ? <CourtDetails court={court} onClose={() => setEditor(null)} onSaved={applied} /> : null}
      <div className="court-admin-grid">
        <Section title="Reglas de turno" description="Grilla, separación y Duraciones válidas." actions={court.state === 'active' ? <button className="button button-quiet button-small" onClick={() => setEditor('configuration')}>Editar</button> : null}>
          <dl className="definition-grid"><div><dt>Separación</dt><dd>{configuration.minimumSeparationMinutes} min</dd></div><div><dt>Intervalo</dt><dd>{configuration.startIntervalMinutes} min</dd></div><div className="definition-wide"><dt>Duraciones</dt><dd>{configuration.allowedDurationsMinutes.map((duration) => <span className="duration-chip" key={duration}>{duration} min</span>)}</dd></div></dl>
          {editor === 'configuration' ? <ConfigurationForm courtId={courtId} value={configuration} onClose={() => setEditor(null)} onSaved={applied} /> : null}
        </Section>
        <Section title="Horario semanal" description="Franjas recurrentes; pueden quedar vacías." actions={court.state === 'active' ? <button className="button button-quiet button-small" onClick={() => setEditor('schedule')}>Reemplazar</button> : null}>
          <ScheduleRead periods={schedule.periods} />
          {editor === 'schedule' ? <ScheduleForm courtId={courtId} value={schedule} onClose={() => setEditor(null)} onSaved={applied} /> : null}
        </Section>
      </div>
      <Section title="Excepciones por fecha" description="Reemplazan por completo el horario semanal de ese día." actions={court.state === 'active' ? <AddButton onClick={() => setEditor('exception')}>Nueva excepción</AddButton> : null}>
        {editor === 'exception' ? <ExceptionForm courtId={courtId} onClose={() => setEditor(null)} onSaved={(result) => { setExceptions((current) => [result.dateException, ...current.filter((item) => item.localDate !== result.dateException.localDate)]); applied(result); }} /> : null}
        {!exceptions.length ? <EmptyState icon={CalendarOff} title="Sin excepciones">El horario semanal rige todas las fechas futuras.</EmptyState> : <div className="data-rows">{exceptions.map((item) => <ExceptionRow key={item.localDate} item={item} courtId={courtId} onDeleted={(result) => { setExceptions((current) => current.filter((value) => value.localDate !== item.localDate)); setOperation(result.operation); }} />)}</div>}
      </Section>
      <Section title="Indisponibilidades" description="Bloqueos administrativos y períodos fuera de servicio." actions={court.state === 'active' ? <AddButton onClick={() => setEditor('unavailability')}>Nueva indisponibilidad</AddButton> : null}>
        {editor === 'unavailability' ? <UnavailabilityForm courtId={courtId} onClose={() => setEditor(null)} onSaved={(result) => { setUnavailabilities((current) => [result.unavailability, ...current]); applied(result); }} /> : null}
        {!unavailabilities.length ? <EmptyState icon={Wrench} title="Sin indisponibilidades registradas">La Cancha no tiene bloqueos ni períodos fuera de servicio.</EmptyState> : <div className="data-rows">{unavailabilities.map((item) => <article className="data-row" key={item.id}><span className={`type-mark ${item.type === 'FUERA_DE_SERVICIO' ? 'service' : ''}`}><Wrench size={17} /></span><div><strong>{item.type === 'FUERA_DE_SERVICIO' ? 'Fuera de servicio' : 'Bloqueo administrativo'}</strong><p>{item.reason || 'Sin motivo informado'}</p></div><div className="row-dates"><span>{formatInstant(item.startAt)}</span><span>{formatInstant(item.endAt)}</span></div></article>)}</div>}
      </Section>
    </div>
  );
}

function CourtDetails({ court, onClose, onSaved }) {
  const [values, setValues] = useState({ name: court.name, description: court.description ?? '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  async function submit(event) { event.preventDefault(); setPending(true); try { onSaved(await api(`/api/v1/admin/courts/${court.id}`, { method: 'PATCH', body: { name: values.name, description: values.description || null } })); } catch (caught) { setError(caught); } finally { setPending(false); } }
  return <Editor title="Datos descriptivos" onClose={onClose} error={error}><form className="form-grid" onSubmit={submit}><label className="field"><span>Nombre</span><input value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} required /></label><label className="field"><span>Descripción</span><input value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} /></label><FormActions pending={pending} label="Guardar datos" onClose={onClose} /></form></Editor>;
}

function ConfigurationForm({ courtId, value, onClose, onSaved }) {
  const [values, setValues] = useState({ minimumSeparationMinutes: value.minimumSeparationMinutes, startIntervalMinutes: value.startIntervalMinutes, allowedDurationsMinutes: value.allowedDurationsMinutes.join(', ') });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  async function submit(event) { event.preventDefault(); setPending(true); try { onSaved(await api(`/api/v1/admin/courts/${courtId}/booking-configuration`, { method: 'PUT', body: { courtId, minimumSeparationMinutes: Number(values.minimumSeparationMinutes), startIntervalMinutes: Number(values.startIntervalMinutes), allowedDurationsMinutes: values.allowedDurationsMinutes.split(',').map((item) => Number(item.trim())).filter(Boolean) } })); } catch (caught) { setError(caught); } finally { setPending(false); } }
  return <Editor title="Reemplazar reglas" onClose={onClose} error={error}><form className="form-grid" onSubmit={submit}><label className="field"><span>Separación mínima</span><input type="number" min="0" value={values.minimumSeparationMinutes} onChange={(e) => setValues({ ...values, minimumSeparationMinutes: e.target.value })} required /></label><label className="field"><span>Intervalo de inicios</span><input type="number" min="1" value={values.startIntervalMinutes} onChange={(e) => setValues({ ...values, startIntervalMinutes: e.target.value })} required /></label><label className="field field-wide"><span>Duraciones</span><input value={values.allowedDurationsMinutes} onChange={(e) => setValues({ ...values, allowedDurationsMinutes: e.target.value })} required /><small>Minutos separados por coma.</small></label><FormActions pending={pending} label="Reemplazar configuración" onClose={onClose} /></form></Editor>;
}

function ScheduleRead({ periods }) {
  if (!periods.length) return <p className="quiet-copy">Sin Franjas semanales. Las Excepciones todavía pueden abrir fechas concretas.</p>;
  return <div className="schedule-board">{WEEKDAYS.map((day, index) => { const rows = periods.filter((period) => period.weekday === index + 1); return <div key={day}><strong>{day.slice(0, 3)}</strong><span>{rows.length ? rows.map((row) => `${formatTime(row.startTime)}–${formatTime(row.endTime)}`).join(' / ') : 'Cerrado'}</span></div>; })}</div>;
}

function ScheduleForm({ courtId, value, onClose, onSaved }) {
  const [periods, setPeriods] = useState(value.periods);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  async function submit(event) { event.preventDefault(); setPending(true); try { onSaved(await api(`/api/v1/admin/courts/${courtId}/weekly-schedule`, { method: 'PUT', body: { periods } })); } catch (caught) { setError(caught); } finally { setPending(false); } }
  return <Editor title="Horario semanal completo" onClose={onClose} error={error}><form onSubmit={submit}><PeriodEditor periods={periods} setPeriods={setPeriods} includeWeekday /><FormActions pending={pending} label="Reemplazar horario" onClose={onClose} /></form></Editor>;
}

function ExceptionForm({ courtId, onClose, onSaved }) {
  const [date, setDate] = useState(todayInputValue());
  const [mode, setMode] = useState('CLOSED');
  const [periods, setPeriods] = useState([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  async function submit(event) { event.preventDefault(); setPending(true); try { onSaved(await api(`/api/v1/admin/courts/${courtId}/date-exceptions/${date}`, { method: 'PUT', body: { mode, periods: mode === 'CLOSED' ? [] : periods } })); } catch (caught) { setError(caught); } finally { setPending(false); } }
  return <Editor title="Excepción de fecha" onClose={onClose} error={error}><form onSubmit={submit} className="form-stack"><div className="form-grid"><label className="field"><span>Fecha local</span><input type="date" min={todayInputValue()} value={date} onChange={(e) => setDate(e.target.value)} required /></label><label className="field"><span>Modo</span><select value={mode} onChange={(e) => { setMode(e.target.value); if (e.target.value === 'CLOSED') setPeriods([]); }}><option value="CLOSED">Día cerrado</option><option value="CUSTOM_PERIODS">Horario especial</option></select></label></div>{mode === 'CUSTOM_PERIODS' ? <PeriodEditor periods={periods} setPeriods={setPeriods} /> : <p className="quiet-copy">No se ofrecerán turnos durante esta fecha.</p>}<FormActions pending={pending} label="Guardar excepción" onClose={onClose} /></form></Editor>;
}

function ExceptionRow({ item, courtId, onDeleted }) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  async function remove() { setDeleting(true); try { onDeleted(await api(`/api/v1/admin/courts/${courtId}/date-exceptions/${item.localDate}`, { method: 'DELETE' })); } catch (caught) { setError(caught); } finally { setDeleting(false); } }
  return <article className="data-row"><span className="date-tile"><strong>{item.localDate.slice(8)}</strong><small>{item.localDate.slice(5, 7)}</small></span><div><strong>{item.mode === 'CLOSED' ? 'Día cerrado' : 'Horario especial'}</strong><p>{item.periods.length ? item.periods.map((period) => `${formatTime(period.startTime)}–${formatTime(period.endTime)}`).join(', ') : formatDate(item.localDate)}</p>{error ? <small className="text-error">{errorCopy(error)}</small> : null}</div><button className="icon-button" type="button" onClick={remove} disabled={deleting} aria-label={`Eliminar excepción del ${item.localDate}`}><Trash2 size={18} /></button></article>;
}

function UnavailabilityForm({ courtId, onClose, onSaved }) {
  const [values, setValues] = useState({ type: 'BLOQUEO_ADMINISTRATIVO', startAt: '', endAt: '', reason: '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  async function submit(event) { event.preventDefault(); setPending(true); try { onSaved(await api(`/api/v1/admin/courts/${courtId}/unavailabilities`, { method: 'POST', body: { type: values.type, startAt: new Date(values.startAt).toISOString(), endAt: new Date(values.endAt).toISOString(), reason: values.reason || null } })); } catch (caught) { setError(caught); } finally { setPending(false); } }
  return <Editor title="Nueva indisponibilidad" onClose={onClose} error={error}><form className="form-grid" onSubmit={submit}><label className="field field-wide"><span>Tipo</span><select value={values.type} onChange={(e) => setValues({ ...values, type: e.target.value })}><option value="BLOQUEO_ADMINISTRATIVO">Bloqueo administrativo</option><option value="FUERA_DE_SERVICIO">Fuera de servicio</option></select></label><label className="field"><span>Inicio</span><input type="datetime-local" value={values.startAt} onChange={(e) => setValues({ ...values, startAt: e.target.value })} required /></label><label className="field"><span>Fin</span><input type="datetime-local" value={values.endAt} onChange={(e) => setValues({ ...values, endAt: e.target.value })} required /></label><label className="field field-wide"><span>Motivo</span><textarea value={values.reason} onChange={(e) => setValues({ ...values, reason: e.target.value })} maxLength="500" /></label><p className="field-wide form-hint">Las horas del dispositivo se convierten a instantes UTC antes de enviarse.</p><FormActions pending={pending} label="Crear indisponibilidad" onClose={onClose} /></form></Editor>;
}

function PeriodEditor({ periods, setPeriods, includeWeekday = false }) {
  function add() { setPeriods((current) => [...current, { ...(includeWeekday ? { weekday: 1 } : {}), startTime: '08:00:00', endTime: '09:00:00' }]); }
  function change(index, field, value) { setPeriods((current) => current.map((period, position) => position === index ? { ...period, [field]: field === 'weekday' ? Number(value) : `${value}:00` } : period)); }
  function remove(index) { setPeriods((current) => current.filter((_, position) => position !== index)); }
  return <div className="period-editor">{periods.map((period, index) => <div className="period-row" key={`${period.weekday ?? 'custom'}-${index}`}>{includeWeekday ? <label><span>Día</span><select value={period.weekday} onChange={(e) => change(index, 'weekday', e.target.value)}>{WEEKDAYS.map((day, dayIndex) => <option value={dayIndex + 1} key={day}>{day}</option>)}</select></label> : null}<label><span>Inicio</span><input type="time" value={formatTime(period.startTime)} onChange={(e) => change(index, 'startTime', e.target.value)} required /></label><label><span>Fin</span><input type="time" value={formatTime(period.endTime)} onChange={(e) => change(index, 'endTime', e.target.value)} required /></label><button className="icon-button" type="button" onClick={() => remove(index)} aria-label="Eliminar Franja"><X size={17} /></button></div>)}<button className="button button-quiet button-small" type="button" onClick={add}><Plus size={16} />Agregar Franja</button></div>;
}

function Editor({ title, onClose, error, children }) {
  return <div className="nested-editor"><header><h3>{title}</h3><button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar"><X /></button></header>{error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}{children}</div>;
}

function FormActions({ pending, label, onClose }) {
  return <div className="form-actions field-wide"><button className="button button-primary" disabled={pending}><ButtonPending pending={pending}>{label}</ButtonPending></button><button className="button button-quiet" type="button" onClick={onClose}>Cancelar</button></div>;
}
