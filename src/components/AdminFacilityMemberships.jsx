import { UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';

import { api, apiItems, withQuery } from '../api/client.js';
import { ButtonPending, EmptyState, ErrorNotice, LoadingBlock } from './Feedback.jsx';
import { Section, StatusBadge } from './Primitives.jsx';
import { errorCopy, formatInstant } from '../lib/format.js';

export function AdminFacilityMemberships({ facilityId }) {
  const path = `/api/v1/admin/facilities/${facilityId}/memberships`;
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [approved, setApproved] = useState([]);
  const [ownerId, setOwnerId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pending, setPending] = useState(false);
  const [revokeId, setRevokeId] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoaded(false);
    setError(null);
    Promise.all([
      api(withQuery(path, { limit: 25 }), { signal: controller.signal }),
      apiItems('/api/v1/admin/owner-applications', { status: 'APROBADA', limit: 100 },
        { signal: controller.signal }),
    ]).then(([memberships, applications]) => {
      setLoaded(true);
      setItems(memberships.items);
      setCursor(memberships.page.nextCursor);
      setApproved(applications);
    }).catch((caught) => { if (caught.name !== 'AbortError') setError(caught); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [facilityId, refresh]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await api(withQuery(path, { limit: 25, cursor }));
      setItems((current) => [...current, ...result.items]);
      setCursor(result.page.nextCursor);
    } catch (caught) { setError(caught); }
    finally { setLoadingMore(false); }
  }

  async function assign(event) {
    event.preventDefault();
    if (!ownerId) return;
    setPending(true);
    setError(null);
    setMessage('');
    try {
      await api(path, { method: 'POST', body: { userId: ownerId, membershipRole: 'PROPIETARIO' } });
      setOwnerId('');
      setMessage('Membresía asignada. El Propietario ya puede consultar esta Instalación en Mi negocio.');
      setRefresh((value) => value + 1);
    } catch (caught) { setError(caught); }
    finally { setPending(false); }
  }

  async function revoke(member) {
    setPending(true);
    setError(null);
    setMessage('');
    try {
      const result = await api(`${path}/${member.id}/revocation`, { method: 'POST' });
      setItems((current) => current.map((item) => item.id === member.id ? result.membership : item));
      setRevokeId(null);
      setMessage(result.operation.changed ? 'Membresía revocada. El acceso a esta Instalación dejó de estar vigente.' : 'Esta membresía ya estaba revocada.');
    } catch (caught) { setError(caught); }
    finally { setPending(false); }
  }

  return <Section title="Propietarios de la Instalación" description="La primera membresía se crea con el negocio. La asignación manual es excepcional; una revocación solo retira el acceso a esta Instalación.">
    {loading ? <LoadingBlock lines={3} label="Cargando membresías" /> : <>
      {error ? <ErrorNotice onRetry={() => setRefresh((value) => value + 1)}>{errorCopy(error)}</ErrorNotice> : null}
      {loaded ? <>
      {message ? <p className="notice notice-success" role="status">{message}</p> : null}
       <form className="membership-assign admin-membership-assign" onSubmit={assign}><label className="field"><span>Asignación excepcional: Propietario aprobado</span><select value={ownerId} onChange={(event) => setOwnerId(event.target.value)} required><option value="">Selecciona un Usuario aprobado</option>{approved.map((application) => <option value={application.userId} key={application.id}>{application.user?.name || application.businessName} · {application.user?.email || `ID ${application.userId}`}</option>)}</select></label><button className="button button-secondary" type="submit" disabled={pending || !ownerId}><ButtonPending pending={pending} pendingLabel="Asignando…">Asignar a esta Instalación</ButtonPending></button></form>
      {!approved.length ? <p className="quiet-copy">Primero aprueba una solicitud de Propietario para poder asignar una membresía.</p> : null}
       {!items.length ? <EmptyState icon={UsersRound} title="Sin Propietarios asignados">Esta Instalación todavía no tiene membresías. Las Instalaciones históricas no se asignan automáticamente.</EmptyState> : <div className="membership-list">{items.map((member) => <article className="membership-row" key={member.id}><div><strong>{member.user?.name || `Usuario ${member.userId}`}</strong><p>{member.user?.email}</p><small>Asignada el {formatInstant(member.grantedAt)}</small>{member.revokedAt ? <small>Revocada el {formatInstant(member.revokedAt)}</small> : null}</div><StatusBadge tone={member.active ? 'positive' : 'negative'}>{member.active ? 'Activa' : 'Revocada'}</StatusBadge>{member.active ? <div className="membership-actions">{revokeId === member.id ? <><span>Retira el acceso a esta Instalación; no elimina al Propietario ni el negocio.</span><button className="button button-danger button-small" type="button" disabled={pending} onClick={() => revoke(member)}><ButtonPending pending={pending} pendingLabel="Revocando…">Sí, revocar</ButtonPending></button><button className="button button-quiet button-small" type="button" disabled={pending} onClick={() => setRevokeId(null)}>Conservar</button></> : <button className="button button-danger-subtle button-small" type="button" onClick={() => setRevokeId(member.id)}>Revocar</button>}</div> : null}</article>)}</div>}
      {cursor ? <button className="button button-secondary load-more" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Cargando' : 'Ver más membresías'}</button> : null}
      </> : null}
    </>}
  </Section>;
}
