import { ArrowLeft, ArrowRight, Ban, Building2, MapPin, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { api, withQuery } from '../api/client.js';
import { EmptyState, LoadingBlock } from '../components/Feedback.jsx';
import { isOwnerAccessLost, OwnerAccessNotice } from '../components/OwnerAccessNotice.jsx';
import { StatusBadge } from '../components/Primitives.jsx';
import { errorCopy, formatCOP, formatInstant, sportLabel } from '../lib/format.js';
import { parseDurations } from '../lib/owner-forms.js';

export function OwnerFacilityPage() {
  const { facilityId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const path = `/api/v1/owner/facilities/${facilityId}`;
  const [facility, setFacility] = useState(null);
  const [courts, setCourts] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [priceSummary, setPriceSummary] = useState({});
  const [deactivating, setDeactivating] = useState(false);
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

  useEffect(() => {
    const controller = new AbortController();
    setPriceSummary({});
    if (!courts.length || accessLost.current) return () => controller.abort();
    Promise.all(courts.filter((court) => court.state === 'active').map(async (court) => {
      try {
        const result = await api(`/api/v1/owner/courts/${court.id}/prices`, { signal: controller.signal });
        const amounts = result.items.filter((price) => price.currency === 'COP' && price.priceMinor > 0)
          .map((price) => price.priceMinor);
        return [court.id, amounts.length ? Math.min(...amounts) : null];
      } catch (caught) {
        if (caught.name === 'AbortError' || isOwnerAccessLost(caught)) throw caught;
        return [court.id, undefined];
      }
    })).then((results) => {
      if (!controller.signal.aborted) setPriceSummary(Object.fromEntries(results));
    }).catch((caught) => { if (caught.name !== 'AbortError') handleError(caught); });
    return () => controller.abort();
  }, [courts]);

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
      return null;
    } catch (caught) { if (isOwnerAccessLost(caught)) handleError(caught); return caught; }
  }

  async function savePolicy(values) {
    try {
      await api(`${path}/booking-policy`, { method: 'PUT', body: values });
      const detail = await api(path);
      setFacility(detail.facility);
      setEditor(null);
      setError(null);
      setMessage('Política de Reserva actualizada. Las Canchas aplicarán la nueva ventana.');
      return null;
    } catch (caught) { if (isOwnerAccessLost(caught)) handleError(caught); return caught; }
  }

  async function createCourt(values) {
    try {
      const result = await api(`${path}/courts`, { method: 'POST', body: values });
      navigate(`/owner/canchas/${result.court.id}`);
      return null;
    } catch (caught) { if (isOwnerAccessLost(caught)) handleError(caught); return caught; }
  }

  async function deactivate() {
    if (deactivating) return;
    setDeactivating(true);
    try {
      await api(`${path}/deactivation`, { method: 'POST' });
      const detail = await api(path);
      setFacility(detail.facility);
      setConfirmDeactivate(false);
      setError(null);
      setMessage('Instalación desactivada. Ya no se ofrecerá para nuevas Reservas.');
    } catch (caught) { handleError(caught); }
    finally { setDeactivating(false); }
  }

  const primaryCourt = courts.find((court) => court.state === 'active');

  return <div className="owner-console owner-facility-detail"><Link className="back-link" to="/owner"><ArrowLeft size={17} aria-hidden="true" />Volver a Mi negocio</Link>
    {loading ? <LoadingBlock lines={5} label="Cargando Instalación y Canchas" /> : null}
    {error ? <OwnerAccessNotice error={error} onRetry={() => setRefresh((value) => value + 1)} /> : null}
     {facility ? <><header className="owner-console-hero"><div><span className="owner-console-label">Mi negocio / Instalación</span><h1>{facility.name}</h1><p>{facility.description || 'Completa la descripción de tu negocio para preparar su ficha.'}</p><div className="owner-hero-facts"><span><MapPin size={15} aria-hidden="true" />{facility.city || 'Ciudad por definir'}</span><StatusBadge tone={facility.state === 'active' ? 'positive' : 'negative'}>{facility.state === 'active' ? 'Activa' : 'Suspendida'}</StatusBadge><StatusBadge tone={facility.publicationState === 'PUBLISHED' ? 'positive' : 'warning'}>{facility.publicationState === 'PUBLISHED' ? 'PUBLICADA' : 'BORRADOR'}</StatusBadge></div></div></header>
        <nav className="owner-section-nav owner-facility-nav" aria-label="Secciones de Mi negocio"><Link to="#informacion" aria-current={!location.hash || location.hash === '#informacion' ? 'location' : undefined}>Información</Link><Link to="#canchas" aria-current={location.hash === '#canchas' ? 'location' : undefined}>Canchas</Link><Link to={primaryCourt ? `/owner/canchas/${primaryCourt.id}` : '#canchas'} state={{ section: 'schedule' }}>Disponibilidad</Link><Link to={primaryCourt ? `/owner/canchas/${primaryCourt.id}` : '#canchas'} state={{ section: 'prices' }}>Tarifas</Link><Link to="/owner/reservas">Reservas</Link></nav>
        <div className="owner-console-body">{facility.publicationState !== 'PUBLISHED' ? <p className="owner-publication-copy">Pendiente de revisión y publicación del Administrador. <Link to="/owner">Consulta qué te falta preparar</Link>.</p> : <p className="owner-publication-copy">Visible en el marketplace. Consulta las <Link to="/owner/reservas">Reservas recibidas</Link> o sigue configurando tus Canchas.</p>}
        {message ? <p className="notice notice-success" role="status">{message}</p> : null}
         <section id="informacion" className="owner-work-section" aria-labelledby="owner-facility-data"><div className="owner-work-heading"><div><h2 id="owner-facility-data">Información del negocio</h2><p>Nombre, ciudad, dirección y descripción de la ficha que verán tus clientes.</p></div>{facility.state === 'active' ? <button className="button button-quiet button-small" type="button" onClick={() => { setEditor(editor === 'details' ? null : 'details'); setError(null); }}>Editar información</button> : null}</div>
           <dl className="owner-detail-facts"><div><dt>Ciudad</dt><dd>{facility.city || 'Por definir'}</dd></div><div><dt>Dirección</dt><dd><MapPin size={15} aria-hidden="true" />{facility.address || 'Por definir'}</dd></div><div><dt>Descripción</dt><dd>{facility.description || 'Por definir'}</dd></div><div><dt>Zona horaria</dt><dd>{facility.timeZone}</dd></div>{facility.publishedAt ? <div><dt>Última publicación</dt><dd>{formatInstant(facility.publishedAt)}</dd></div> : null}</dl>
          {editor === 'details' ? <FacilityDetailsForm facility={facility} onSave={saveDetails} onClose={() => setEditor(null)} /> : null}
        </section>
         <section className="owner-work-section" aria-labelledby="owner-policy-heading"><div className="owner-work-heading"><div><h2 id="owner-policy-heading">Anticipación de Reservas</h2><p>Define con cuánta anticipación pueden reservar los clientes en tus Canchas. Aquí también se ajusta la zona horaria, si aún está permitida su edición.</p></div>{facility.state === 'active' ? <button className="button button-quiet button-small" type="button" onClick={() => { setEditor(editor === 'policy' ? null : 'policy'); setError(null); }}>Editar zona y anticipación</button> : null}</div>
          <div className="owner-policy-facts"><div><span>Anticipación mínima</span><strong>{facility.minimumAdvanceMinutes} min</strong></div><div><span>Anticipación máxima</span><strong>{facility.maximumAdvanceMinutes} min</strong></div></div>
          {editor === 'policy' ? <PolicyForm facility={facility} onSave={savePolicy} onClose={() => setEditor(null)} /> : null}
        </section>
         <section id="canchas" className="owner-work-section" aria-labelledby="owner-courts-heading"><div className="owner-work-heading"><div><h2 id="owner-courts-heading">Canchas</h2><p>Abre una Cancha para editar deporte, horarios, duraciones y tarifas.</p></div>{facility.state === 'active' ? <button className="button button-secondary button-small" type="button" onClick={() => { setEditor(editor === 'court' ? null : 'court'); setError(null); }}><Plus size={16} aria-hidden="true" />Nueva Cancha</button> : null}</div>
          {editor === 'court' ? <CreateCourtForm onSave={createCourt} onClose={() => setEditor(null)} /> : null}
            {!courts.length ? <EmptyState icon={Building2} title="Este negocio aún no tiene Canchas" action={facility.state === 'active' && editor !== 'court' ? <button className="button button-secondary" type="button" onClick={() => setEditor('court')}>Crear Cancha</button> : null}>Crea la primera para configurar horarios y precios y comenzar a recibir Reservas.</EmptyState> : <div className="owner-courts-list">{courts.map((court) => <Link className="owner-court-row" key={court.id} to={`/owner/canchas/${court.id}`}><div><strong>{court.name}</strong><span>{sportLabel(court.sportCode)} · {court.allowedDurationsMinutes.join(', ')} min</span><span className={priceSummary[court.id] === null ? 'price-pending' : ''}>{court.state !== 'active' ? 'Cancha inactiva' : !Object.hasOwn(priceSummary, court.id) ? 'Consultando tarifas' : priceSummary[court.id] === undefined ? 'Tarifa sin comprobar' : priceSummary[court.id] === null ? 'Precio pendiente' : `Desde ${formatCOP(priceSummary[court.id])}`}</span></div><StatusBadge tone={court.state === 'active' ? 'positive' : 'negative'}>{court.state === 'active' ? 'Activa' : 'Inactiva'}</StatusBadge><ArrowRight size={19} aria-hidden="true" /></Link>)}</div>}
          {cursor ? <button className="button button-quiet load-more" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Cargando' : 'Ver más Canchas'}</button> : null}
        </section>
         {facility.state === 'active' ? <section className="owner-work-section owner-danger-zone" aria-labelledby="owner-deactivate-heading"><h2 id="owner-deactivate-heading">Desactivar Instalación</h2><p>Solo es posible si las reglas de Reservas vigentes lo permiten. No se cancelan Reservas automáticamente.</p>{confirmDeactivate ? <div className="owner-inline-confirm"><strong>¿Desactivar esta Instalación?</strong><button className="button button-danger" type="button" disabled={deactivating} onClick={deactivate}>{deactivating ? 'Desactivando' : 'Sí, desactivar'}</button><button className="button button-quiet" type="button" disabled={deactivating} onClick={() => setConfirmDeactivate(false)}>Conservar</button></div> : <button className="button button-danger-subtle" type="button" onClick={() => setConfirmDeactivate(true)}><Ban size={16} aria-hidden="true" />Desactivar Instalación</button>}</section> : null}
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
    if (pending) return;
    const changes = {};
    for (const field of ['name', 'city', 'address', 'description']) {
      const value = values[field].trim();
      if (!value && facility[field]) { setError('Los datos informados no pueden quedar en blanco.'); return; }
      if (value && value !== facility[field]) changes[field] = value;
    }
    if (!Object.keys(changes).length) { setError('No hay cambios para guardar.'); return; }
    setPending(true);
    setError('');
    const failure = await onSave(changes);
    if (failure && !isOwnerAccessLost(failure)) setError(errorCopy(failure));
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
    if (pending) return;
    const minimum = Number(values.minimumAdvanceMinutes);
    const maximum = Number(values.maximumAdvanceMinutes);
    if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum)
      || minimum < 0 || maximum < minimum) { setError('La anticipación máxima debe ser igual o superior a la mínima.'); return; }
    setPending(true);
    setError('');
    const failure = await onSave({ timeZone: values.timeZone.trim(), minimumAdvanceMinutes: minimum, maximumAdvanceMinutes: maximum });
    if (failure && !isOwnerAccessLost(failure)) setError(errorCopy(failure));
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
    if (pending) return;
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
    const failure = await onSave({ name: values.name.trim(), description: values.description.trim() || null,
      ...(sportCode ? { sportCode } : {}), minimumSeparationMinutes: separation,
      startIntervalMinutes: interval, allowedDurationsMinutes });
    if (failure && !isOwnerAccessLost(failure)) setError(errorCopy(failure));
    setPending(false);
  }

  return <form className="owner-editor form-grid" onSubmit={submit}><label className="field"><span>Nombre de la Cancha</span><input value={values.name} onChange={(event) => setValues({ ...values, name: event.target.value })} required maxLength={150} /></label><label className="field"><span>Deporte (código)</span><input value={values.sportCode} onChange={(event) => setValues({ ...values, sportCode: event.target.value })} placeholder="FUTBOL_5" maxLength={32} /></label><label className="field field-wide"><span>Descripción</span><input value={values.description} onChange={(event) => setValues({ ...values, description: event.target.value })} maxLength={500} /></label><label className="field"><span>Intervalo entre inicios (minutos)</span><input type="number" min="1" max="65535" value={values.startIntervalMinutes} onChange={(event) => setValues({ ...values, startIntervalMinutes: event.target.value })} required /></label><label className="field"><span>Separación mínima (minutos)</span><input type="number" min="0" max="65535" value={values.minimumSeparationMinutes} onChange={(event) => setValues({ ...values, minimumSeparationMinutes: event.target.value })} required /></label><label className="field field-wide"><span>Duraciones permitidas</span><input value={values.durations} onChange={(event) => setValues({ ...values, durations: event.target.value })} placeholder="30, 60, 90" required /><small>Minutos separados por coma; podrás configurar los precios después.</small></label>{error ? <p className="owner-form-error field-wide" role="alert">{error}</p> : null}<div className="form-actions field-wide"><button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Creando' : 'Crear Cancha'}</button><button className="button button-quiet" type="button" disabled={pending} onClick={onClose}>Cancelar</button></div></form>;
}
