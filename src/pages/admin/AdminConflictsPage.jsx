import { AlertOctagon, ChevronDown, Search } from 'lucide-react';
import { startTransition, useEffect, useState } from 'react';

import { api, withQuery } from '../../api/client.js';
import { EmptyState, ErrorNotice, LoadingBlock } from '../../components/Feedback.jsx';
import { PageHeading, StatusBadge } from '../../components/Primitives.jsx';
import { errorCopy, formatInstant } from '../../lib/format.js';

export function AdminConflictsPage() {
  const [filters, setFilters] = useState({ courtId: '', bookingId: '', operationalChangeId: '' });
  const [applied, setApplied] = useState({});
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    load(undefined, controller.signal);
    return () => controller.abort();
  }, [applied]);

  async function load(nextCursor, signal) {
    setLoading(true); setError(null);
    try {
      const result = await api(withQuery('/api/v1/admin/operational-conflicts', { ...applied, limit: 25, cursor: nextCursor }), { signal });
      startTransition(() => { setItems((current) => nextCursor ? [...current, ...result.items] : result.items); setCursor(result.page.nextCursor); });
    } catch (caught) { if (caught.name !== 'AbortError') setError(caught); }
    finally { setLoading(false); }
  }

  async function inspect(id) {
    setError(null);
    try { setSelected(await api(`/api/v1/admin/operational-conflicts/${id}`)); }
    catch (caught) { setError(caught); }
  }

  return (
    <div className="page-standard admin-page">
      <PageHeading title="Conflictos operativos" description="Reservas que dejaron de ser compatibles después de un cambio. No se modifican automáticamente." />
      <form className="conflict-filters" onSubmit={(event) => { event.preventDefault(); setApplied(Object.fromEntries(Object.entries(filters).filter(([, value]) => value))); }}><label><span>Cancha</span><input inputMode="numeric" value={filters.courtId} onChange={(e) => setFilters({ ...filters, courtId: e.target.value })} placeholder="ID" /></label><label><span>Reserva</span><input inputMode="numeric" value={filters.bookingId} onChange={(e) => setFilters({ ...filters, bookingId: e.target.value })} placeholder="ID" /></label><label><span>Cambio</span><input inputMode="numeric" value={filters.operationalChangeId} onChange={(e) => setFilters({ ...filters, operationalChangeId: e.target.value })} placeholder="ID" /></label><button className="button button-secondary" type="submit"><Search size={17} />Filtrar</button></form>
      {error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}
      <div className="conflict-layout">
        <section className="conflict-list" aria-label="Listado de conflictos">
          {loading && !items.length ? <LoadingBlock lines={6} /> : null}
          {!loading && !items.length ? <EmptyState icon={AlertOctagon} title="No hay conflictos en esta vista">Los cambios operativos compatibles no generan filas aquí.</EmptyState> : null}
          {items.map((conflict) => <button className={`conflict-row ${selected?.id === conflict.id ? 'selected' : ''}`} type="button" key={conflict.id} onClick={() => inspect(conflict.id)}><span className="conflict-id">#{conflict.id}</span><span><strong>Reserva {conflict.booking.id}</strong><small>Cancha {conflict.booking.courtId} · {formatInstant(conflict.detectedAt)}</small></span><StatusBadge tone={conflict.resolvedAt ? 'neutral' : 'negative'}>{conflict.resolvedAt ? 'Resuelto' : 'Abierto'}</StatusBadge></button>)}
          {cursor ? <button className="button button-quiet load-more" type="button" onClick={() => load(cursor)}><ChevronDown size={17} />Ver más</button> : null}
        </section>
        <aside className="conflict-detail">
          {selected ? <ConflictDetail conflict={selected} /> : <div className="ticket-empty"><AlertOctagon size={26} /><strong>Selecciona un conflicto</strong><p>Verás la Reserva y el Cambio Operativo relacionados.</p></div>}
        </aside>
      </div>
    </div>
  );
}

function ConflictDetail({ conflict }) {
  return <><header><span>Conflicto #{conflict.id}</span><StatusBadge tone={conflict.resolvedAt ? 'neutral' : 'negative'}>{conflict.resolvedAt ? 'Resuelto' : 'Abierto'}</StatusBadge></header><h2>Reserva {conflict.booking.id}</h2><dl><div><dt>Cancha</dt><dd>{conflict.booking.courtId}</dd></div><div><dt>Usuario</dt><dd>{conflict.booking.userId}</dd></div><div><dt>Inicio</dt><dd>{formatInstant(conflict.booking.startAt, conflict.booking.timeZone)}</dd></div><div><dt>Fin</dt><dd>{formatInstant(conflict.booking.endAt, conflict.booking.timeZone)}</dd></div><div><dt>Cambio</dt><dd>{conflict.operationalChange.type}</dd></div><div><dt>Realizado por</dt><dd>Usuario {conflict.operationalChange.actorUserId}</dd></div></dl><p className="ticket-note">El MVP permite consultar este conflicto, pero no resolverlo ni modificar la Reserva.</p></>;
}
