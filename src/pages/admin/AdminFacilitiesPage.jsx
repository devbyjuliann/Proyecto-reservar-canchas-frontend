import { Building2, Filter } from 'lucide-react';
import { startTransition, useEffect, useState } from 'react';

import { api, withQuery } from '../../api/client.js';
import { EmptyState, ErrorNotice, LoadingBlock } from '../../components/Feedback.jsx';
import { PageHeading, StatusBadge } from '../../components/Primitives.jsx';
import { Link } from 'react-router-dom';
import { errorCopy } from '../../lib/format.js';

export function AdminFacilitiesPage() {
  const [stateFilter, setStateFilter] = useState('active');
  const [result, setResult] = useState({ items: [], page: { nextCursor: null } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    load(undefined, controller.signal);
    return () => controller.abort();
  }, [stateFilter]);

  async function load(cursor, signal) {
    setLoading(true);
    setError(null);
    try {
      const data = await api(withQuery('/api/v1/admin/facilities', { state: stateFilter, limit: 25, cursor }), { signal });
      startTransition(() => setResult((current) => ({ items: cursor ? [...current.items, ...data.items] : data.items, page: data.page })));
    } catch (caught) {
      if (caught.name !== 'AbortError') setError(caught);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-standard admin-page">
      <PageHeading title="Instalaciones" description="Consulta y moderación de los negocios de la plataforma." />
      <div className="filter-bar"><Filter size={17} /><span>Mostrar</span>{['active', 'inactive', 'all'].map((state) => <button key={state} type="button" className={stateFilter === state ? 'selected' : ''} onClick={() => setStateFilter(state)}>{({ active: 'Activas', inactive: 'Inactivas', all: 'Todas' })[state]}</button>)}</div>
      {error ? <ErrorNotice onRetry={() => load()}>{errorCopy(error)}</ErrorNotice> : null}
      {loading && !result.items.length ? <LoadingBlock lines={5} /> : null}
       {!loading && !result.items.length ? <EmptyState icon={Building2} title="No hay Instalaciones en esta vista">Cambia el filtro para revisar otros negocios.</EmptyState> : null}
       <div className="resource-list admin-facilities-list">
         {result.items.map((facility) => <Link className="resource-row admin-facility-row" key={facility.id} to={`/admin/instalaciones/${facility.id}`}><span><strong>{facility.name}</strong><small>{facility.city || 'Ciudad pendiente'} · {facility.timeZone}</small><small>Reserva entre {facility.minimumAdvanceMinutes} y {facility.maximumAdvanceMinutes} min</small></span><span className="admin-row-states"><StatusBadge tone={facility.state === 'active' ? 'positive' : 'negative'}>{facility.state === 'active' ? 'Activa' : 'Inactiva'}</StatusBadge><StatusBadge tone={facility.publicationState === 'PUBLISHED' ? 'positive' : 'warning'}>{facility.publicationState === 'PUBLISHED' ? 'PUBLICADA' : 'BORRADOR'}</StatusBadge></span><span aria-hidden="true">Revisar</span></Link>)}
       </div>
      {result.page.nextCursor ? <button className="button button-secondary load-more" type="button" disabled={loading} onClick={() => load(result.page.nextCursor)}>Ver más</button> : null}
    </div>
  );
}
