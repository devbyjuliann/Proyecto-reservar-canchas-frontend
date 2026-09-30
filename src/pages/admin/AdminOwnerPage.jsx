import { ArrowLeft, Building2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api } from '../../api/client.js';
import { EmptyState, ErrorNotice, LoadingBlock } from '../../components/Feedback.jsx';
import { Section } from '../../components/Primitives.jsx';
import { errorCopy, formatInstant } from '../../lib/format.js';

export function AdminOwnerPage() {
  const { ownerId } = useParams();
  const path = `/api/v1/admin/owners/${ownerId}`;
  const [owner, setOwner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [revokeId, setRevokeId] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api(path, { signal: controller.signal })
      .then(({ owner: result }) => { if (!controller.signal.aborted) setOwner(result); })
      .catch((caught) => { if (caught.name !== 'AbortError') setError(caught); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [path, refresh]);

  async function changeSuspension() {
    if (pending) return;
    setPending(true);
    setError(null);
    const suspend = owner.state === 'active';
    try {
      const { owner: result } = await api(`${path}/suspension`, { method: suspend ? 'POST' : 'DELETE' });
      setOwner(result);
      setConfirm(false);
      setMessage(suspend ? 'Propietario suspendido. Su cuenta de Usuario sigue activa.' : 'Propietario reactivado. Recupera el acceso a sus membresías vigentes.');
    } catch (caught) { setError(caught); }
    finally { setPending(false); }
  }

  async function revoke(member) {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await api(`/api/v1/admin/facilities/${member.facility.id}/memberships/${member.id}/revocation`, { method: 'POST' });
      const { owner: updated } = await api(path);
      setOwner(updated);
      setRevokeId(null);
      setMessage('Membership revocada. El Propietario ya no puede operar esa Instalación.');
    } catch (caught) { setError(caught); }
    finally { setPending(false); }
  }

  if (loading && !owner) return <div className="page-standard"><LoadingBlock label="Cargando Propietario" /></div>;
  if (!owner) return <div className="page-standard"><Link className="back-link" to="/admin/propietarios"><ArrowLeft size={17} />Propietarios</Link><ErrorNotice onRetry={() => setRefresh((value) => value + 1)}>{errorCopy(error)}</ErrorNotice></div>;
  return <div className="page-standard admin-page">
    <Link className="back-link" to="/admin/propietarios"><ArrowLeft size={17} />Propietarios</Link>
    <header className="resource-hero"><div><h1>{owner.name}</h1><p>{owner.email} · ID {owner.id}</p></div><span className={`owner-state ${owner.state === 'active' ? 'state-aprobada' : 'state-rechazada'}`}>{owner.state === 'active' ? 'ACTIVO' : owner.state === 'suspended' ? 'SUSPENDIDO' : 'CUENTA INACTIVA'}</span></header>
    {error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}
    {message ? <p className="notice notice-success" role="status">{message}</p> : null}
    <Section title="Acceso de Propietario"><dl className="definition-grid"><div><dt>Rol</dt><dd>{owner.roles.join(', ')}</dd></div><div><dt>Estado</dt><dd>{owner.state === 'active' ? 'ACTIVO' : owner.state === 'suspended' ? 'SUSPENDIDO' : 'CUENTA INACTIVA'}</dd></div><div><dt>Registrado</dt><dd>{formatInstant(owner.createdAt)}</dd></div>{owner.ownerSuspendedAt ? <div><dt>Suspendido</dt><dd>{formatInstant(owner.ownerSuspendedAt)}</dd></div> : null}</dl>
      {owner.state !== 'inactive' ? owner.state === 'suspended'
        ? <button className="button button-secondary" type="button" disabled={pending} onClick={changeSuspension}>Reactivar propietario</button>
        : confirm ? <div className="inline-confirm"><span>El propietario perderá acceso a la administración de sus negocios. Sus datos, instalaciones y reservas se conservarán.</span><button className="button button-danger" type="button" disabled={pending} onClick={changeSuspension}>Sí, suspender propietario</button><button className="button button-quiet" type="button" disabled={pending} onClick={() => setConfirm(false)}>Conservar</button></div>
          : <button className="button button-danger-subtle" type="button" onClick={() => setConfirm(true)}>Suspender propietario</button> : null}
    </Section>
    <Section title="Instalaciones y memberships" description="La suspensión no revoca memberships ni modifica la publicación o las Reservas.">
      {!owner.memberships.length ? <EmptyState icon={Building2} title="Sin Instalaciones asignadas">Este Propietario todavía no tiene memberships.</EmptyState> : <div className="data-rows">{owner.memberships.map((member) => <article className="data-row" key={member.id}><div><Link to={`/admin/instalaciones/${member.facility.id}`}><strong>{member.facility.name}</strong></Link><p>{member.facility.state === 'active' ? 'Activa' : 'Suspendida'} · {member.facility.publicationState === 'PUBLISHED' ? 'PUBLICADA' : 'BORRADOR'} · Membership {member.active ? 'activa' : 'revocada'}</p><small>Asignada el {formatInstant(member.grantedAt)}{member.revokedAt ? ` · Revocada el ${formatInstant(member.revokedAt)}` : ''}</small></div>{member.active ? revokeId === member.id ? <div className="inline-confirm"><span>¿Revocar acceso a esta Instalación?</span><button className="button button-danger button-small" type="button" disabled={pending} onClick={() => revoke(member)}>Sí, revocar</button><button className="button button-quiet button-small" type="button" disabled={pending} onClick={() => setRevokeId(null)}>Conservar</button></div> : <button className="button button-danger-subtle button-small" type="button" disabled={pending} onClick={() => setRevokeId(member.id)}>Revocar membership</button> : null}</article>)}</div>}
    </Section>
  </div>;
}
