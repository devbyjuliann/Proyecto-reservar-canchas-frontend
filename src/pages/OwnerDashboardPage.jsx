import { ArrowRight, Building2, CalendarDays, CheckCircle2, CircleDashed, MapPin, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api, apiItems, withQuery } from '../api/client.js';
import { EmptyState, LoadingBlock } from '../components/Feedback.jsx';
import { isOwnerAccessLost, OwnerAccessNotice } from '../components/OwnerAccessNotice.jsx';
import { ownerReadiness } from '../lib/owner-readiness.js';

const PATH = '/api/v1/owner/facilities';

async function readProgress(items, signal) {
  return Object.fromEntries((await Promise.all(items.map(async (item) => {
    try {
      const detailPath = `${PATH}/${item.id}`;
      const [detail, courts] = await Promise.all([
        api(detailPath, { signal }),
        apiItems(`${detailPath}/courts`, { state: 'all', limit: 100 }, { signal }),
      ]);
      const courtDetails = await Promise.all(courts.map(async (court) => {
        if (court.state !== 'active') return null;
        const base = `/api/v1/owner/courts/${court.id}`;
        const [prices, schedule] = await Promise.all([
          api(`${base}/prices`, { signal }), api(`${base}/weekly-schedule`, { signal }),
        ]);
        return { prices: prices.items, schedule: schedule.weeklySchedule };
      }));
      return [item.id, ownerReadiness(detail.facility, courts, courtDetails)];
    } catch (caught) {
      if (caught.name === 'AbortError' || caught.status === 401 || caught.status === 403) throw caught;
      return [item.id, null];
    }
  }))));
}

export function OwnerDashboardPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [readiness, setReadiness] = useState({});
  const [draft, setDraft] = useState({ name: '', timeZone: 'America/Bogota', city: '', address: '', description: '' });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setItems([]);
    setCursor(null);
    setReadiness({});
    api(withQuery(PATH, { limit: 25 }), { signal: controller.signal })
      .then(async (result) => {
        if (controller.signal.aborted) return;
        setItems(result.items);
        setCursor(result.page.nextCursor);
        setLoading(false);
        if (result.items.length) {
          const progress = await readProgress(result.items, controller.signal);
          if (!controller.signal.aborted) setReadiness(progress);
        }
      })
      .catch((caught) => { if (caught.name !== 'AbortError') { setError(caught); setItems([]); setCursor(null); setReadiness({}); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await api(withQuery(PATH, { limit: 25, cursor }));
      setItems((current) => [...current, ...result.items]);
      setCursor(result.page.nextCursor);
      if (result.items.length) {
        const progress = await readProgress(result.items);
        setReadiness((current) => ({ ...current, ...progress }));
      }
    } catch (caught) {
      if (isOwnerAccessLost(caught)) { setItems([]); setCursor(null); setReadiness({}); }
      setError(caught);
    }
    finally { setLoadingMore(false); }
  }

  async function createFacility(event) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const { facility } = await api(PATH, { method: 'POST', body: {
        name: draft.name, timeZone: draft.timeZone,
        ...(draft.city.trim() ? { city: draft.city.trim() } : {}),
        ...(draft.address.trim() ? { address: draft.address.trim() } : {}),
        ...(draft.description.trim() ? { description: draft.description.trim() } : {}),
      } });
      navigate(`/owner/instalaciones/${facility.id}`);
    } catch (caught) { setError(caught); }
    finally { setPending(false); }
  }

  const accessLost = isOwnerAccessLost(error);

  return <div className="owner-console"><header className="owner-console-hero"><div><span className="owner-console-label">Área del Propietario</span><h1>Mi negocio</h1><p>Crea y administra tus Instalaciones. Solo puedes operar negocios con membresía activa.</p></div><Building2 size={56} strokeWidth={1.3} aria-hidden="true" /></header>{!accessLost ? <div className="owner-bookings-entry"><div><CalendarDays size={22} aria-hidden="true" /><span><strong>Reservas recibidas</strong><small>Turnos en las Canchas de tus Instalaciones.</small></span></div><Link className="button button-secondary" to="/owner/reservas">Reservas<ArrowRight size={17} aria-hidden="true" /></Link></div> : null}<section className="owner-console-body" aria-labelledby="owner-facilities-heading"><div className="owner-section-heading"><h2 id="owner-facilities-heading">Mis Instalaciones</h2><p>Solo se muestran membresías activas asociadas a tu cuenta.</p>{!accessLost ? <button className="button button-secondary" type="button" onClick={() => setCreating((value) => !value)}><Plus size={17} />Nueva Instalación</button> : null}</div>
    {creating && !accessLost ? <form className="owner-editor form-grid" onSubmit={createFacility} aria-label="Crear Instalación"><label className="field"><span>Nombre</span><input required maxLength={150} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="field"><span>Zona horaria de la Instalación</span><input required value={draft.timeZone} onChange={(event) => setDraft({ ...draft, timeZone: event.target.value })} /><small>Ej. America/Bogota. Los horarios y las Reservas se interpretan en esta zona.</small></label><label className="field"><span>Ciudad</span><input maxLength={120} value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} /></label><label className="field"><span>Dirección</span><input maxLength={250} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></label><label className="field field-wide"><span>Descripción</span><textarea maxLength={1000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><p className="field-wide form-hint">Puedes completar la ficha después. El negocio empieza en borrador y el Administrador decide su publicación.</p><div className="form-actions field-wide"><button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Creando' : 'Crear Instalación'}</button><button className="button button-quiet" type="button" disabled={pending} onClick={() => setCreating(false)}>Cancelar</button></div></form> : null}
    {error ? <OwnerAccessNotice error={error} onRetry={() => setRefresh((value) => value + 1)} /> : null}
    {loading ? <LoadingBlock lines={4} label="Cargando mis Instalaciones" /> : null}
    {!loading && !items.length && !error ? <EmptyState icon={Building2} title="Todavía no tienes un negocio registrado." action={<button className="button button-primary" type="button" onClick={() => setCreating(true)}>Crear negocio</button>}>Crea tu primera Instalación para comenzar a preparar tu negocio.</EmptyState> : null}
    {!accessLost && items.length ? <div className="owner-dashboard-list">{items.map((facility) => <FacilitySummary key={facility.id} facility={facility} readiness={readiness[facility.id]} onRetry={() => setRefresh((value) => value + 1)} />)}</div> : null}
    {!accessLost && cursor ? <button className="button button-secondary load-more" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Cargando' : 'Ver más Instalaciones'}</button> : null}
  </section></div>;
}

function FacilitySummary({ facility, readiness, onRetry }) {
  return <article className="owner-dashboard-facility"><header><div><span className="owner-facility-city"><MapPin size={15} aria-hidden="true" />{facility.city || 'Ciudad por definir'}</span><h3>{facility.name}</h3><div className="owner-facility-states"><span className={`owner-state ${facility.state === 'active' ? 'state-aprobada' : 'state-rechazada'}`}>{facility.state === 'active' ? 'Activa' : 'Suspendida'}</span><span className={`owner-state ${facility.publicationState === 'PUBLISHED' ? 'state-aprobada' : 'state-pendiente'}`}>{facility.publicationState === 'PUBLISHED' ? 'PUBLICADA' : 'BORRADOR'}</span></div></div><Link className="button button-quiet button-small" to={`/owner/instalaciones/${facility.id}`}>Abrir negocio<ArrowRight size={16} aria-hidden="true" /></Link></header>
    {readiness ? <><section className="owner-readiness" aria-label={`Preparación para publicar ${facility.name}`}><div><h4>Preparación para publicar</h4><p>Guía basada en tu ficha. El horario habitual te ayuda a ofrecer turnos; no es obligatorio para solicitar publicación. El Administrador y el backend deciden la publicación.</p></div><ul>{readiness.checks.map((check) => <li key={check.key} className={check.complete ? 'complete' : ''}>{check.complete ? <CheckCircle2 size={17} aria-hidden="true" /> : <CircleDashed size={17} aria-hidden="true" />}{check.label}: {check.complete ? 'Configurado' : 'Pendiente'}</li>)}</ul></section><section className="owner-next-action" aria-label="Siguiente acción"><div><strong>Siguiente acción</strong><p>{readiness.nextAction.message}</p></div><Link className="button button-secondary button-small" to={readiness.nextAction.to} state={readiness.nextAction.section ? { section: readiness.nextAction.section } : undefined}>{readiness.nextAction.label}</Link></section></> : readiness === null ? <div className="owner-next-action"><p>No pudimos comprobar la preparación de este negocio. Puedes abrirlo igualmente o volver a intentarlo.</p><button className="button button-secondary button-small" type="button" onClick={onRetry}>Reintentar</button></div> : <LoadingBlock lines={2} label="Revisando preparación del negocio" />}</article>;
}
