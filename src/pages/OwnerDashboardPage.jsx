import { ArrowRight, Building2, CalendarDays, MapPin, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { api, withQuery } from '../api/client.js';
import { EmptyState, LoadingBlock } from '../components/Feedback.jsx';
import { isOwnerAccessLost, OwnerAccessNotice } from '../components/OwnerAccessNotice.jsx';

const PATH = '/api/v1/owner/facilities';

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
  const [draft, setDraft] = useState({ name: '', timeZone: 'America/Bogota', city: '', address: '', description: '' });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setItems([]);
    setCursor(null);
    api(withQuery(PATH, { limit: 25 }), { signal: controller.signal })
      .then((result) => { setItems(result.items); setCursor(result.page.nextCursor); })
      .catch((caught) => { if (caught.name !== 'AbortError') { setError(caught); setItems([]); setCursor(null); } })
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
    } catch (caught) {
      if (isOwnerAccessLost(caught)) { setItems([]); setCursor(null); }
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

  return <div className="owner-console"><header className="owner-console-hero"><div><span className="owner-console-label">Área del Propietario</span><h1>Mi negocio</h1><p>Crea y administra tus Instalaciones. Solo puedes operar negocios con membresía activa.</p></div><Building2 size={56} strokeWidth={1.3} aria-hidden="true" /></header><div className="owner-bookings-entry"><div><CalendarDays size={22} aria-hidden="true" /><span><strong>Reservas recibidas</strong><small>Turnos en las Canchas de tus Instalaciones.</small></span></div><Link className="button button-secondary" to="/owner/reservas">Reservas<ArrowRight size={17} aria-hidden="true" /></Link></div><section className="owner-console-body" aria-labelledby="owner-facilities-heading"><div className="owner-section-heading"><h2 id="owner-facilities-heading">Mis Instalaciones</h2><p>Solo se muestran membresías activas asociadas a tu cuenta.</p><button className="button button-secondary" type="button" onClick={() => setCreating((value) => !value)}><Plus size={17} />Nueva Instalación</button></div>
    {creating ? <form className="owner-editor form-grid" onSubmit={createFacility} aria-label="Crear Instalación"><label className="field"><span>Nombre</span><input required maxLength={150} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="field"><span>Zona horaria IANA</span><input required value={draft.timeZone} onChange={(event) => setDraft({ ...draft, timeZone: event.target.value })} /></label><label className="field"><span>Ciudad</span><input maxLength={120} value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} /></label><label className="field"><span>Dirección</span><input maxLength={250} value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></label><label className="field field-wide"><span>Descripción</span><textarea maxLength={1000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><div className="form-actions field-wide"><button className="button button-primary" type="submit" disabled={pending}>{pending ? 'Creando' : 'Crear Instalación'}</button><button className="button button-quiet" type="button" disabled={pending} onClick={() => setCreating(false)}>Cancelar</button></div></form> : null}
    {error ? <OwnerAccessNotice error={error} onRetry={() => setRefresh((value) => value + 1)} /> : null}
    {loading ? <LoadingBlock lines={4} label="Cargando mis Instalaciones" /> : null}
    {!loading && !items.length && !error ? <EmptyState icon={Building2} title="Aún no tienes Instalaciones">Crea tu primera Instalación para empezar a preparar tu negocio.</EmptyState> : null}
    {items.length ? <div className="owner-facility-list">{items.map((facility) => <Link key={facility.id} className="owner-facility-row" to={`/owner/instalaciones/${facility.id}`}><div><span className="owner-facility-city"><MapPin size={15} aria-hidden="true" />{facility.city || 'Ciudad por definir'}</span><h3>{facility.name}</h3><div className="owner-facility-states"><span className={`owner-state ${facility.state === 'active' ? 'state-aprobada' : 'state-rechazada'}`}>{facility.state === 'active' ? 'Activa' : 'Suspendida'}</span><span className={`owner-state ${facility.publicationState === 'PUBLISHED' ? 'state-aprobada' : 'state-pendiente'}`}>{facility.publicationState === 'PUBLISHED' ? 'PUBLICADA' : 'BORRADOR'}</span>{Number.isInteger(facility.courtCount) ? <span className="owner-facility-count">{facility.courtCount} {facility.courtCount === 1 ? 'Cancha' : 'Canchas'}</span> : null}</div></div><ArrowRight size={21} aria-hidden="true" /></Link>)}</div> : null}
    {cursor ? <button className="button button-secondary load-more" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Cargando' : 'Ver más Instalaciones'}</button> : null}
  </section></div>;
}
