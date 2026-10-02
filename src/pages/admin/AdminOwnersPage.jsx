import { ArrowRight, Search, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { api, withQuery } from '../../api/client.js';
import { EmptyState, ErrorNotice, LoadingBlock } from '../../components/Feedback.jsx';
import { PageHeading, StatusBadge } from '../../components/Primitives.jsx';
import { errorCopy } from '../../lib/format.js';

const PATH = '/api/v1/admin/owners';
const stateLabel = { active: 'ACTIVO', suspended: 'SUSPENDIDO', inactive: 'CUENTA INACTIVA' };
const stateTone = { active: 'positive', suspended: 'negative', inactive: 'neutral' };

export function AdminOwnersPage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setItems([]);
    setCursor(null);
    setError(null);
    api(withQuery(PATH, { q: query, limit: 25 }), { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setItems(result.items); setCursor(result.page.nextCursor); } })
      .catch((caught) => { if (caught.name !== 'AbortError') setError(caught); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, refresh]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await api(withQuery(PATH, { q: query, limit: 25, cursor }));
      setItems((current) => [...current, ...result.items]);
      setCursor(result.page.nextCursor);
    } catch (caught) { setError(caught); }
    finally { setLoadingMore(false); }
  }

  return <div className="page-standard admin-page">
    <PageHeading title="Propietarios" description="Gestiona Propietarios y su acceso a la plataforma." />
    <form className="filter-bar" role="search" onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); }}>
      <label className="field"><span>Buscar por nombre o correo</span><input value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} /></label>
      <button className="button button-secondary" type="submit"><Search size={17} />Buscar</button>
      {query ? <button className="button button-quiet" type="button" onClick={() => { setSearch(''); setQuery(''); }}>Limpiar</button> : null}
    </form>
    {error ? <ErrorNotice onRetry={() => setRefresh((value) => value + 1)}>{errorCopy(error)}</ErrorNotice> : null}
    {loading ? <LoadingBlock label="Cargando Propietarios" /> : null}
    {!loading && !items.length && !error ? <EmptyState icon={UsersRound} title="No hay Propietarios para esta búsqueda">Prueba otro nombre o correo.</EmptyState> : null}
    <div className="resource-list">{items.map((owner) => <Link className="resource-row" key={owner.id} to={`/admin/propietarios/${owner.id}`}>
      <span><strong>{owner.name}</strong><small>{owner.email}</small><small>{owner.facilityCount} {owner.facilityCount === 1 ? 'Instalación asignada' : 'Instalaciones asignadas'}</small></span>
      <StatusBadge tone={stateTone[owner.state]}>{stateLabel[owner.state]}</StatusBadge><ArrowRight size={18} aria-hidden="true" />
    </Link>)}</div>
    {cursor ? <button className="button button-secondary load-more" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Cargando' : 'Ver más Propietarios'}</button> : null}
  </div>;
}
