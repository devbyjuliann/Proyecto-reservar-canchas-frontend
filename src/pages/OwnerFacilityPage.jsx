import { ArrowLeft, ArrowRight, Ban, Building2, MapPin, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { api, withQuery } from '../api/client.js';
import { EmptyState, ErrorNotice, LoadingBlock } from '../components/Feedback.jsx';
import { isOwnerAccessLost, OwnerAccessNotice } from '../components/OwnerAccessNotice.jsx';
import { errorCopy, formatInstant, sportLabel } from '../lib/format.js';
import { parseDurations } from '../lib/owner-forms.js';

export function OwnerFacilityPage() {
  const { facilityId } = useParams();
  const navigate = useNavigate();
  const path = `/api/v1/owner/facilities/${facilityId}`;
  const [facility, setFacility] = useState(null);
  const [courts, setCourts] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const [editor, setEditor] = useState(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const moreController = useRef(null);
  const accessLost = useRef(false);

  function handleError(caught) {
    setError(caught);
    if (isOwnerAccessLost(caught)) {
      accessLost.current = true;
      moreController.current?.abort();
      setFacility(null);
      setCourts([]);
      setCursor(null);
      setEditor(null);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    moreController.current?.abort();
    accessLost.current = false;
    setLoadingMore(false);
    setLoading(true);
    setFacility(null);
    setCourts([]);
    setCursor(null);
    setError(null);
    Promise.all([
      api(path, { signal: controller.signal }),
      api(withQuery(`${path}/courts`, { state: 'all', limit: 25 }), { signal: controller.signal }),
    ]).then(([detail, list]) => {
      setFacility(detail.facility);
      setCourts(list.items);
      setCursor(list.page.nextCursor);
    }).catch((caught) => { if (caught.name !== 'AbortError') handleError(caught); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [facilityId, refresh]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const controller = new AbortController();
    moreController.current = controller;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await api(withQuery(`${path}/courts`, { state: 'all', limit: 25, cursor }),
        { signal: controller.signal });
      if (!accessLost.current) {
        setCourts((current) => [...current, ...result.items]);
        setCursor(result.page.nextCursor);
      }
    } catch (caught) { if (caught.name !== 'AbortError') handleError(caught); }
    finally { if (!controller.signal.aborted) setLoadingMore(false); }
  }

  async function saveDetails(values) {
    try {
      const result = await api(path, { method: 'PATCH', body: values });
      setFacility(result.facility);
      setEditor(null);
      setError(null);
      setMessage(result.operation.changed ? 'Datos de la Instalación guardados.' : 'La ficha ya tenía estos valores.');
    } catch (caught) { handleError(caught); }
  }

  async function savePolicy(values) {
    try {
      await api(`${path}/booking-policy`, { method: 'PUT', body: values });
      const detail = await api(path);
      setFacility(detail.facility);
      setEditor(null);
      setError(null);
      setMessage('Política de Reserva actualizada. Las Canchas aplicarán la nueva ventana.');
    } catch (caught) { handleError(caught); }
  }

  async function createCourt(values) {
    try {
      const result = await api(`${path}/courts`, { method: 'POST', body: values });
      navigate(`/owner/canchas/${result.court.id}`);
    } catch (caught) { handleError(caught); }
  }

  async function deactivate() {
    try {
      await api(`${path}/deactivation`, { method: 'POST' });
      const detail = await api(path);
      setFacility(detail.facility);
      setConfirmDeactivate(false);
      setError(null);
      setMessage('Instalación desactivada. Ya no se ofrecerá para nuevas Reservas.');
    } catch (caught) { handleError(caught); }
  }

  return <div className="owner-console owner-facility-detail"><Link className="back-link" to="/owner"><ArrowLeft size={17} aria-hidden="true" />Volver a Mi negocio</Link>
    {loading ? <LoadingBlock lines={5} label="Cargando Instalación y Canchas" /> : null}
    {error ? <OwnerAccessNotice error={error} onRetry={() => setRefresh((value) => value + 1)} /> : null}
    {facility ? <><header className="owner-console-hero"><div><span className="owner-console-label">Instalación asignada</span><h1>{facility.name}</h1><p>{facility.description || 'Completa la descripción de tu negocio para preparar su ficha.'}</p></div><Building2 size={56} strokeWidth={1.3} aria-hidden="true" /></header>
      <div className="owner-console-body"><div className="owner-facility-states"><span className={`owner-state ${facility.state === 'active' ? 'state-aprobada' : 'state-rechazada'}`}>{facility.state === 'active' ? 'Activa' : 'Inactiva'}</span><span className={`owner-state ${facility.publicationState === 'PUBLISHED' ? 'state-aprobada' : 'state-pendiente'}`}>{facility.publicationState === 'PUBLISHED' ? 'Publicada' : 'Sin publicar'}</span></div>
        {message ? <p className="notice notice-success" role="status">{message}</p> : null}
        <section className="owner-work-section" aria-labelledby="owner-facility-data"><div className="owner-work-heading"><div><h2 id="owner-facility-data">Datos del establecimiento</h2><p>El Administrador decide la publicación; aquí preparas la ficha.</p></div>{facility.state === 'active' ? <button className="button button-quiet button-small" type="button" onClick={() => { setEditor(editor === 'details' ? null : 'details'); setError(null); }}>Editar datos</button> : null}</div>
          <dl className="owner-detail-facts"><div><dt>Ciudad</dt><dd>{facility.city || 'Por definir'}</dd></div><div><dt>Dirección</dt><dd><MapPin size={15} aria-hidden="true" />{facility.address || 'Por definir'}</dd></div><div><dt>Zona horaria</dt><dd>{facility.timeZone}</dd></div>{facility.publishedAt ? <div><dt>Última publicación</dt><dd>{formatInstant(facility.publishedAt)}</dd></div> : null}</dl>
          {editor === 'details' ? <FacilityDetailsForm facility={facility} onSave={saveDetails} onClose={() => setEditor(null)} /> : null}
        </section>
        <section className="owner-work-section" aria-labelledby="owner-policy-heading"><div className="owner-work-heading"><div><h2 id="owner-policy-heading">Política de Reserva</h2><p>Define la ventana de anticipación compartida por las Canchas.</p></div>{facility.state === 'active' ? <button className="button button-quiet button-small" type="button" onClick={() => { setEditor(editor === 'policy' ? null : 'policy'); setError(null); }}>Editar política</button> : null}</div>
          <div className="owner-policy-facts"><div><span>Anticipación mínima</span><strong>{facility.minimumAdvanceMinutes} min</strong></div><div><span>Anticipación máxima</span><strong>{facility.maximumAdvanceMinutes} min</strong></div></div>
          {editor === 'policy' ? <PolicyForm facility={facility} onSave={savePolicy} onClose={() => setEditor(null)} /> : null}
        </section>
        <section className="owner-work-section" aria-labelledby="owner-courts-heading"><div className="owner-work-heading"><div><h2 id="owner-courts-heading">Canchas</h2><p>Configura cada Cancha desde su propia ficha operativa.</p></div>{facility.state === 'active' ? <button className="button button-secondary button-small" type="button" onClick={() => { setEditor(editor === 'court' ? null : 'court'); setError(null); }}><Plus size={16} aria-hidden="true" />Nueva Cancha</button> : null}</div>
          {editor === 'court' ? <CreateCourtForm onSave={createCourt} onClose={() => setEditor(null)} /> : null}
          {!courts.length ? <EmptyState title="Aún no tienes Canchas en esta Instalación">Crea la primera Cancha con al menos una Duración permitida.</EmptyState> : <div className="owner-courts-list">{courts.map((court) => <Link className="owner-court-row" key={court.id} to={`/owner/canchas/${court.id}`}><div><strong>{court.name}</strong><span>{sportLabel(court.sportCode)} · {court.allowedDurationsMinutes.join(', ')} min</span></div><span className={`owner-state ${court.state === 'active' ? 'state-aprobada' : 'state-rechazada'}`}>{court.state === 'active' ? 'Activa' : 'Inactiva'}</span><ArrowRight size={19} aria-hidden="true" /></Link>)}</div>}
          {cursor ? <button className="button button-quiet load-more" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Cargando' : 'Ver más Canchas'}</button> : null}
        </section>
        {facility.state === 'active' ? <section className="owner-work-section owner-danger-zone" aria-labelledby="owner-deactivate-heading"><h2 id="owner-deactivate-heading">Desactivar Instalación</h2><p>Solo es posible si las reglas de Reservas vigentes lo permiten. No se cancelan Reservas automáticamente.</p>{confirmDeactivate ? <div className="owner-inline-confirm"><strong>¿Desactivar esta Instalación?</strong><button className="button button-danger" type="button" onClick={deactivate}>Sí, desactivar</button><button className="button button-quiet" type="button" onClick={() => setConfirmDeactivate(false)}>Conservar</button></div> : <button className="button button-danger-subtle" type="button" onClick={() => setConfirmDeactivate(true)}><Ban size={16} aria-hidden="true" />Desactivar Instalación</button>}</section> : null}
      </div>
    </> : null}
  </div>;
}

function FacilityDetailsForm({ facility, onSave, onClose }) {
  const [values, setValues] = useState({ name: facility.name, city: facility.city || '', address: facility.address || '', description: facility.description || '' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    const changes = {};
    for (const field of ['name', 'city', 'address', 'description']) {
      const value = values[field].trim();
      if (!value && facility[field]) { setError('Los datos informados no pueden quedar en blanco.'); return; }
      if (value && value !== facility[field]) changes[field] = value;
    }
    if (!Object.keys(changes).length) { setError('No hay cambios para guardar.'); return; }
    setPending(true);
    setError('');
    await onSave(changes);
    setPending(false);
  }

  return <form className="owner-editor form-grid" onSubmit={submit}><label className="field field-wide"><span>Nombre</span><input value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} required maxLength={150} /></label><label className="field"><span>Ciudad</span><input value={values.city} onChange={(event) => setValues({ ...values, city: event.target.value })} maxLength={120} /></label><label className="field"><span>Dirección</span><input value={values.address} onChange={(event) => setValues({ ...values, address: event.target.value })} maxLength={250} /></label><label className="field field-wide"><span>Descripción</span><textarea value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} maxLength={1000} /></label>{error ? <p className="owner-form-error field-wide" role="alert">{error}</p> : null}<div className="form-actions field-wide"><button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Guardando' : 'Guardar datos'}</button><button className="button button-quiet" type="button" disabled={pending} onClick={onClose}>Cancelar</button></div></form>;
}

function PolicyForm({ facility, onSave, onClose }) {
  const [values, setValues] = useState({ timeZone: facility.timeZone, minimumAdvanceMinutes: facility.minimumAdvanceMinutes, maximumAdvanceMinutes: facility.maximumAdvanceMinutes });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    const minimum = Number(values.minimumAdvanceMinutes);
    const maximum = Number(values.maximumAdvanceMinutes);
    if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum)
      || minimum < 0 || maximum < minimum) { setError('La anticipación máxima debe ser igual o superior a la mínima.'); return; }
    setPending(true);
    setError('');
    await onSave({ timeZone: values.timeZone.trim(), minimumAdvanceMinutes: minimum, maximumAdvanceMinutes: maximum });
    setPending(false);
  }

  return <form className="owner-editor form-grid" onSubmit={submit}><label className="field field-wide"><span>Zona horaria IANA</span><input value={values.timeZone} onChange={(event) => setValues({ ...values, timeZone: event.target.value })} required maxLength={64} /><small>El backend puede impedir cambios de zona cuando ya existe historial temporal.</small></label><label className="field"><span>Anticipación mínima (minutos)</span><input type="number" min="0" value={values.minimumAdvanceMinutes} onChange={(event) => setValues({ ...values, minimumAdvanceMinutes: event.target.value })} required /></label><label className="field"><span>Anticipación máxima (minutos)</span><input type="number" min="0" value={values.maximumAdvanceMinutes} onChange={(event) => setValues({ ...values, maximumAdvanceMinutes: event.target.value })} required /></label>{error ? <p className="owner-form-error field-wide" role="alert">{error}</p> : null}<div className="form-actions field-wide"><button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Guardando' : 'Guardar política'}</button><button className="button button-quiet" type="button" disabled={pending} onClick={onClose}>Cancelar</button></div></form>;
}

function CreateCourtForm({ onSave, onClose }) {
  const [values, setValues] = useState({ name: '', description: '', sportCode: '', minimumSeparationMinutes: '0', startIntervalMinutes: '30', durations: '60' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    const allowedDurationsMinutes = parseDurations(values.durations);
    const interval = Number(values.startIntervalMinutes);
    const separation = Number(values.minimumSeparationMinutes);
    if (!allowedDurationsMinutes) { setError('Indica Duraciones enteras entre 1 y 65.535 minutos, sin duplicados.'); return; }
    if (!Number.isInteger(interval) || interval < 1 || interval > 65_535
      || !Number.isInteger(separation) || separation < 0 || separation > 65_535) {
      setError('Revisa el intervalo y la separación de la Cancha.'); return;
    }
    const sportCode = values.sportCode.trim().toUpperCase();
    if (sportCode && !/^[A-Z0-9_]{2,32}$/.test(sportCode)) {
      setError('Usa un código de deporte como FUTBOL_5.'); return;
    }
    setPending(true);
    setError('');
    await onSave({ name: values.name.trim(), description: values.description.trim() || null,
      ...(sportCode ? { sportCode } : {}), minimumSeparationMinutes: separation,
      startIntervalMinutes: interval, allowedDurationsMinutes });
    setPending(false);
  }

  return <form className="owner-editor form-grid" onSubmit={submit}><label className="field"><span>Nombre de la Cancha</span><input value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} required maxLength={150} /></label><label className="field"><span>Deporte (código)</span><input value={values.sportCode} onChange={(event) => setValues({ ...values, sportCode: event.target.value })} placeholder="FUTBOL_5" maxLength={32} /></label><label className="field field-wide"><span>Descripción</span><input value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} maxLength={500} /></label><label className="field"><span>Intervalo entre inicios (minutos)</span><input type="number" min="1" max="65535" value={values.startIntervalMinutes} onChange={(event) => setValues({ ...values, startIntervalMinutes: event.target.value })} required /></label><label className="field"><span>Separación mínima (minutos)</span><input type="number" min="0" max="65535" value={values.minimumSeparationMinutes} onChange={(event) => setValues({ ...values, minimumSeparationMinutes: event.target.value })} required /></label><label className="field field-wide"><span>Duraciones permitidas</span><input value={values.durations} onChange={(event) => setValues({ ...values, durations: event.target.value })} placeholder="30, 60, 90" required /><small>Minutos separados por coma; podrás configurar los precios después.</small></label>{error ? <p className="owner-form-error field-wide" role="alert">{error}</p> : null}<div className="form-actions field-wide"><button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Creando' : 'Crear Cancha'}</button><button className="button button-quiet" type="button" disabled={pending} onClick={onClose}>Cancelar</button></div></form>;
}
