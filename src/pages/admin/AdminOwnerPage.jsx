import { ArrowLeft, Building2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api } from '../../api/client.js';
import { ButtonPending, EmptyState, ErrorNotice, LoadingBlock } from '../../components/Feedback.jsx';
import { Section, StatusBadge } from '../../components/Primitives.jsx';
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
    <header className="resource-hero admin-resource-hero"><div><h1>{owner.name}</h1><p>{owner.email}</p><div className="admin-resource-states"><StatusBadge tone={owner.state === 'active' ? 'positive' : owner.state === 'suspended' ? 'negative' : 'neutral'}>{owner.state === 'active' ? 'ACTIVO' : owner.state === 'suspended' ? 'SUSPENDIDO' : 'CUENTA INACTIVA'}</StatusBadge></div></div></header>
    {error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}
    {message ? <p className="notice notice-success" role="status">{message}</p> : null}
    <Section title="Identidad y acceso" description="La suspensión restringe la administración Owner; no elimina la cuenta ni sus recursos."><dl className="definition-grid"><div><dt>Rol</dt><dd>{owner.roles.join(', ')}</dd></div><div><dt>Estado Owner</dt><dd>{owner.state === 'active' ? 'Activo' : owner.state === 'suspended' ? 'Suspendido' : 'Cuenta inactiva'}</dd></div><div><dt>Registrado</dt><dd>{formatInstant(owner.createdAt)}</dd></div>{owner.ownerSuspendedAt ? <div><dt>Suspendido</dt><dd>{formatInstant(owner.ownerSuspendedAt)}</dd></div> : null}</dl>
      {owner.state !== 'inactive' ? owner.state === 'suspended'
        ? <button className="button button-secondary" type="button" disabled={pending} onClick={changeSuspension}><ButtonPending pending={pending} pendingLabel="Reactivando…">Reactivar propietario</ButtonPending></button>
        : confirm ? <div className="inline-confirm"><span>El propietario perderá acceso a la administración de sus negocios. Sus datos, instalaciones y reservas se conservarán.</span><button className="button button-danger" type="button" disabled={pending} onClick={changeSuspension}><ButtonPending pending={pending} pendingLabel="Suspendiendo…">Sí, suspender propietario</ButtonPending></button><button className="button button-quiet" type="button" disabled={pending} onClick={() => setConfirm(false)}>Conservar</button></div>
          : <button className="button button-danger-subtle" type="button" onClick={() => setConfirm(true)}>Suspender propietario</button> : null}
    </Section>
    <Section title="Instalaciones y memberships" description="La suspensión no revoca memberships ni modifica la publicación o las Reservas.">
      {!owner.memberships.length ? <EmptyState icon={Building2} title="Sin Instalaciones asignadas">Este Propietario todavía no tiene memberships.</EmptyState> : <div className="data-rows admin-membership-rows">{owner.memberships.map((member) => <article className="data-row" key={member.id}><div><Link to={`/admin/instalaciones/${member.facility.id}`}><strong>{member.facility.name}</strong></Link><div className="admin-row-states"><StatusBadge tone={member.facility.state === 'active' ? 'positive' : 'negative'}>{member.facility.state === 'active' ? 'Activa' : 'Inactiva'}</StatusBadge><StatusBadge tone={member.facility.publicationState === 'PUBLISHED' ? 'positive' : 'warning'}>{member.facility.publicationState === 'PUBLISHED' ? 'PUBLICADA' : 'BORRADOR'}</StatusBadge><StatusBadge tone={member.active ? 'positive' : 'negative'}>Membership {member.active ? 'activa' : 'revocada'}</StatusBadge></div><small>Asignada el {formatInstant(member.grantedAt)}{member.revokedAt ? ` · Revocada el ${formatInstant(member.revokedAt)}` : ''}</small></div>{member.active ? revokeId === member.id ? <div className="inline-confirm"><span>Revoca el acceso a esta Instalación; no elimina al Propietario ni el negocio.</span><button className="button button-danger button-small" type="button" disabled={pending} onClick={() => revoke(member)}><ButtonPending pending={pending} pendingLabel="Revocando…">Sí, revocar</ButtonPending></button><button className="button button-quiet button-small" type="button" disabled={pending} onClick={() => setRevokeId(null)}>Conservar</button></div> : <button className="button button-danger-subtle button-small" type="button" disabled={pending} onClick={() => setRevokeId(member.id)}>Revocar membership</button> : null}</article>)}</div>}
    </Section>
  </div>;
}
