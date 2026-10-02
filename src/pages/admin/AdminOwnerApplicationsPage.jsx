import { ArrowRight, ClipboardList } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { api, withQuery } from '../../api/client.js';
import { ButtonPending, EmptyState, ErrorNotice, LoadingBlock } from '../../components/Feedback.jsx';
import { PageHeading, StatusBadge } from '../../components/Primitives.jsx';
import { errorCopy, formatInstant, ownerApplicationStatusLabel } from '../../lib/format.js';

const PATH = '/api/v1/admin/owner-applications';
const filters = ['PENDIENTE', 'APROBADA', 'RECHAZADA', 'all'];
const applicationTone = { PENDIENTE: 'warning', APROBADA: 'positive', RECHAZADA: 'negative' };

export function AdminOwnerApplicationsPage() {
  const [filter, setFilter] = useState('PENDIENTE');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [pending, setPending] = useState(false);
  const [reason, setReason] = useState('');
  const [decisionMessage, setDecisionMessage] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setItems([]);
    setCursor(null);
    setError(null);
    api(withQuery(PATH, { status: filter, limit: 25 }), { signal: controller.signal })
      .then((result) => { setItems(result.items); setCursor(result.page.nextCursor); })
      .catch((caught) => { if (caught.name !== 'AbortError') setError(caught); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filter, refresh]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await api(withQuery(PATH, { status: filter, limit: 25, cursor }));
      setItems((current) => [...current, ...result.items]);
      setCursor(result.page.nextCursor);
    } catch (caught) { setError(caught); }
    finally { setLoadingMore(false); }
  }

  async function open(id) {
    setDetailLoading(true);
    setDetailError(null);
    setDecisionMessage('');
    setReason('');
    try {
      const { ownerApplication } = await api(`${PATH}/${id}`);
      setSelected(ownerApplication);
    } catch (caught) { setDetailError(caught); }
    finally { setDetailLoading(false); }
  }

  async function decide(decision) {
    if (!selected || pending) return;
    setPending(true);
    setDetailError(null);
    setDecisionMessage('');
    try {
      const result = await api(`${PATH}/${selected.id}/${decision}`, {
        method: 'POST', ...(decision === 'rejection' ? { body: { reason: reason.trim() } } : {}),
      });
      setSelected(result.ownerApplication);
      setReason('');
      setDecisionMessage(decision === 'approval'
        ? 'Solicitud aprobada. El Usuario ya tiene el rol PROPIETARIO, pero todavía no tiene una Instalación asignada.'
        : 'Solicitud rechazada. El Usuario puede consultar el motivo desde su cuenta.');
      setRefresh((value) => value + 1);
    } catch (caught) { setDetailError(caught); }
    finally { setPending(false); }
  }

  return <div className="page-standard admin-page"><PageHeading title="Solicitudes de Propietario" description="Revisa cada solicitud antes de conceder el rol. La membresía de una Instalación es un paso aparte." />
    <div className="filter-bar" role="group" aria-label="Filtrar solicitudes"><span>Estado</span>{filters.map((status) => <button key={status} type="button" aria-pressed={filter === status} className={filter === status ? 'selected' : ''} onClick={() => { setFilter(status); setSelected(null); setDecisionMessage(''); }}>{status === 'all' ? 'Todas' : ownerApplicationStatusLabel(status)}</button>)}</div>
    {error ? <ErrorNotice onRetry={() => setRefresh((value) => value + 1)}>{errorCopy(error)}</ErrorNotice> : null}
    <div className="applications-layout"><section className="applications-list" aria-label="Solicitudes">
      {loading ? <LoadingBlock lines={5} label="Cargando solicitudes" /> : !items.length && !error ? <EmptyState icon={ClipboardList} title={filter === 'PENDIENTE' ? 'No hay solicitudes pendientes.' : 'No hay solicitudes en este estado'}>Cambia el filtro para consultar el historial.</EmptyState> : <div className="resource-list admin-applications-list">{items.map((item) => <button className={`application-row ${item.status === 'PENDIENTE' ? 'is-pending' : ''} ${selected?.id === item.id ? 'selected' : ''}`} type="button" key={item.id} aria-pressed={selected?.id === item.id} onClick={() => open(item.id)}><span><strong>{item.businessName}</strong><small>{item.user?.name} · {item.user?.email}</small><small>Recibida {formatInstant(item.createdAt)}</small></span><StatusBadge tone={applicationTone[item.status]}>{ownerApplicationStatusLabel(item.status)}</StatusBadge></button>)}</div>}
      {cursor ? <button className="button button-secondary load-more" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Cargando' : 'Ver más solicitudes'}</button> : null}
    </section>
    <section className="application-detail" aria-label="Detalle de solicitud">{detailLoading ? <LoadingBlock lines={5} label="Cargando detalle" /> : selected ? <>
      <div className="application-detail-heading"><StatusBadge tone={applicationTone[selected.status]}>{ownerApplicationStatusLabel(selected.status)}</StatusBadge><h2>{selected.businessName}</h2><p>Solicitud de {selected.user?.name}</p><p>{selected.user?.email}</p></div>
      {selected.message ? <div className="application-message"><strong>Mensaje del solicitante</strong><p>{selected.message}</p></div> : null}
      <dl className="application-facts"><div><dt>Enviada</dt><dd>{formatInstant(selected.createdAt)}</dd></div>{selected.decidedAt ? <div><dt>Decidida</dt><dd>{formatInstant(selected.decidedAt)}</dd></div> : null}</dl>
      {selected.status === 'RECHAZADA' && selected.decisionReason ? <p className="owner-rejection-reason">Motivo: {selected.decisionReason}</p> : null}
      {decisionMessage ? <p className="notice notice-success" role="status">{decisionMessage}</p> : null}
      {selected.status === 'APROBADA' ? <div className="application-next-step"><strong>Rol PROPIETARIO concedido</strong><p>No se asignó ninguna Instalación automáticamente. Abre la Instalación correspondiente para asignar una membresía.</p><Link className="button button-secondary" to="/admin">Ir a Instalaciones<ArrowRight size={16} aria-hidden="true" /></Link></div> : null}
      {selected.status === 'PENDIENTE' ? <div className="application-decisions"><div className="admin-decision-copy"><strong>Decisión administrativa</strong><p>La aprobación concede el rol de Propietario, pero no asigna una Instalación.</p></div><button className="button button-primary" type="button" onClick={() => decide('approval')} disabled={pending}><ButtonPending pending={pending} pendingLabel="Aprobando…">Aprobar solicitud</ButtonPending></button><form onSubmit={(event) => { event.preventDefault(); decide('rejection'); }}><label className="field"><span>Motivo del rechazo</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={500} placeholder="Explica qué información falta" /></label><button className="button button-danger-subtle" type="submit" disabled={pending || !reason.trim()}><ButtonPending pending={pending} pendingLabel="Rechazando…">Rechazar solicitud</ButtonPending></button></form></div> : null}
    </> : <EmptyState icon={ClipboardList} title="Selecciona una solicitud">Abre una solicitud para ver los datos y, si está pendiente, tomar una decisión.</EmptyState>}
    {detailError ? <ErrorNotice onRetry={selected ? () => open(selected.id) : undefined}>{errorCopy(detailError)}</ErrorNotice> : null}</section></div>
  </div>;
}
