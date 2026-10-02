import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api, apiItems } from '../../api/client.js';
import { AdminFacilityMemberships } from '../../components/AdminFacilityMemberships.jsx';
import { ButtonPending, ErrorNotice, LoadingBlock } from '../../components/Feedback.jsx';
import { ResourceLink, Section, StatusBadge } from '../../components/Primitives.jsx';
import { errorCopy } from '../../lib/format.js';

export function AdminFacilityPage() {
  const { facilityId } = useParams();
  const [facility, setFacility] = useState(null);
  const [courts, setCourts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api(`/api/v1/admin/facilities/${facilityId}`, { signal: controller.signal }),
      apiItems(`/api/v1/admin/facilities/${facilityId}/courts`, { state: 'all', limit: 100 }, { signal: controller.signal }),
    ]).then(([detail, items]) => { setFacility(detail.facility); setCourts(items); })
      .catch((caught) => { if (caught.name !== 'AbortError') setError(caught); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [facilityId]);

  async function change(path, method, success) {
    if (pending) return;
    setPending(true);
    setError(null);
    setMessage('');
    try {
      await api(`/api/v1/admin/facilities/${facilityId}/${path}`, { method });
      const { facility: updated } = await api(`/api/v1/admin/facilities/${facilityId}`);
      setFacility(updated);
      setMessage(success);
    } catch (caught) { setError(caught); }
    finally { setPending(false); }
  }

  if (loading) return <div className="page-standard"><LoadingBlock lines={7} /></div>;
  if (!facility) return <div className="page-standard"><ErrorNotice>{errorCopy(error)}</ErrorNotice></div>;

  return <div className="page-standard admin-page">
    <Link className="back-link" to="/admin"><ArrowLeft size={17} />Instalaciones</Link>
    <header className="resource-hero admin-resource-hero"><div><h1>{facility.name}</h1><p>{facility.city || 'Ciudad pendiente'} · {facility.timeZone}</p><div className="admin-resource-states"><StatusBadge tone={facility.state === 'active' ? 'positive' : 'negative'}>{facility.state === 'active' ? 'Activa' : 'Suspendida'}</StatusBadge><StatusBadge tone={facility.publicationState === 'PUBLISHED' ? 'positive' : 'warning'}>{facility.publicationState === 'PUBLISHED' ? 'PUBLICADA' : 'BORRADOR'}</StatusBadge></div></div>
      <div className="page-actions admin-moderation-actions">
        <button className={facility.publicationState === 'PUBLISHED' ? 'button button-secondary' : 'button button-primary'} type="button" disabled={pending} onClick={() => change('publication', facility.publicationState === 'PUBLISHED' ? 'DELETE' : 'POST', facility.publicationState === 'PUBLISHED' ? 'La Instalación dejó de aparecer en el marketplace.' : 'La Instalación ya aparece en el marketplace.')}>
          <ButtonPending pending={pending} pendingLabel={facility.publicationState === 'PUBLISHED' ? 'Despublicando…' : 'Publicando…'}>{facility.publicationState === 'PUBLISHED' ? 'Despublicar instalación' : 'Publicar instalación'}</ButtonPending>
        </button>
        {facility.state === 'active'
          ? <button className="button button-danger-subtle" type="button" disabled={pending} onClick={() => change('deactivation', 'POST', 'Instalación suspendida.')}><ButtonPending pending={pending} pendingLabel="Suspendiendo…">Suspender instalación</ButtonPending></button>
          : <button className="button button-secondary" type="button" disabled={pending} onClick={() => change('reactivation', 'POST', 'Instalación reactivada.')}><ButtonPending pending={pending} pendingLabel="Reactivando…">Reactivar instalación</ButtonPending></button>}
      </div>
    </header>
    {error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}
    {message ? <p className="notice notice-success" role="status">{message}</p> : null}
    <section className="policy-strip admin-policy-strip" aria-label="Estado y política de reserva"><div><span>Estado operativo</span><strong>{facility.state === 'active' ? 'Activa' : 'Operación detenida'}</strong></div><div><span>Visibilidad</span><strong>{facility.publicationState === 'PUBLISHED' ? 'Visible en Marketplace' : 'Pendiente de publicación'}</strong></div><div><span>Anticipación</span><strong>{facility.minimumAdvanceMinutes}–{facility.maximumAdvanceMinutes} min</strong></div><div><span>Zona horaria</span><strong>{facility.timeZone}</strong></div></section>
    <Section title="Información del negocio" description="El Propietario prepara y opera esta Instalación."><dl className="definition-grid"><div><dt>Ciudad</dt><dd>{facility.city || 'Pendiente'}</dd></div><div><dt>Dirección</dt><dd>{facility.address || 'Pendiente'}</dd></div><div><dt>Descripción</dt><dd>{facility.description || 'Pendiente'}</dd></div></dl></Section>
    <Section title="Preparación para publicación" description="Información orientativa. El servidor valida los requisitos definitivos al publicar."><dl className="definition-grid admin-readiness-grid"><div><dt>Ciudad</dt><dd>{facility.city ? 'Configurada' : 'Pendiente'}</dd></div><div><dt>Dirección</dt><dd>{facility.address ? 'Configurada' : 'Pendiente'}</dd></div><div><dt>Descripción</dt><dd>{facility.description ? 'Configurada' : 'Pendiente'}</dd></div><div><dt>Canchas para revisión</dt><dd>{courts.length}</dd></div></dl></Section>
    <Section title="Canchas" description="Configuración del negocio, solo lectura para Administración."><div className="resource-list">{courts.map((court) => <ResourceLink key={court.id} to={`/admin/canchas/${court.id}`} title={court.name} meta={`${court.allowedDurationsMinutes.join(', ')} min · ${court.sportCode || 'Deporte pendiente'}`} state={court.state} />)}</div></Section>
    <AdminFacilityMemberships facilityId={facilityId} />
  </div>;
}
