import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api, apiItems } from '../../api/client.js';
import { AdminFacilityMemberships } from '../../components/AdminFacilityMemberships.jsx';
import { ErrorNotice, LoadingBlock } from '../../components/Feedback.jsx';
import { ResourceLink, Section } from '../../components/Primitives.jsx';
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
    <header className="resource-hero"><div><h1>{facility.name}</h1><p>{facility.timeZone} · ID {facility.id}</p></div>
      <div className="page-actions">
        <button className={facility.publicationState === 'PUBLISHED' ? 'button button-secondary' : 'button button-primary'} type="button" disabled={pending} onClick={() => change('publication', facility.publicationState === 'PUBLISHED' ? 'DELETE' : 'POST', facility.publicationState === 'PUBLISHED' ? 'La Instalación dejó de aparecer en el marketplace.' : 'La Instalación ya aparece en el marketplace.')}>
          {facility.publicationState === 'PUBLISHED' ? 'Despublicar instalación' : 'Publicar instalación'}
        </button>
        {facility.state === 'active'
          ? <button className="button button-danger-subtle" type="button" disabled={pending} onClick={() => change('deactivation', 'POST', 'Instalación suspendida.')}>Suspender instalación</button>
          : <button className="button button-secondary" type="button" disabled={pending} onClick={() => change('reactivation', 'POST', 'Instalación reactivada.')}>Reactivar instalación</button>}
      </div>
    </header>
    {error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}
    {message ? <p className="notice notice-success" role="status">{message}</p> : null}
    <section className="policy-strip" aria-label="Estado y política de reserva"><div><span>Estado</span><strong>{facility.state === 'active' ? 'Activa' : 'Suspendida'}</strong></div><div><span>Publicación</span><strong>{facility.publicationState === 'PUBLISHED' ? 'PUBLICADA' : 'BORRADOR'}</strong></div><div><span>Mínimo</span><strong>{facility.minimumAdvanceMinutes} min</strong></div><div><span>Máximo</span><strong>{facility.maximumAdvanceMinutes} min</strong></div><div><span>Zona horaria</span><strong>{facility.timeZone}</strong></div></section>
    <Section title="Información del negocio" description="El Propietario prepara y opera esta Instalación."><dl className="definition-grid"><div><dt>Ciudad</dt><dd>{facility.city || 'Pendiente'}</dd></div><div><dt>Dirección</dt><dd>{facility.address || 'Pendiente'}</dd></div><div><dt>Descripción</dt><dd>{facility.description || 'Pendiente'}</dd></div></dl></Section>
    <Section title="Preparación para publicación" description="Información orientativa. El servidor valida los requisitos definitivos al publicar."><dl className="definition-grid"><div><dt>Ciudad</dt><dd>{facility.city ? 'Configurada' : 'Pendiente'}</dd></div><div><dt>Dirección</dt><dd>{facility.address ? 'Configurada' : 'Pendiente'}</dd></div><div><dt>Descripción</dt><dd>{facility.description ? 'Configurada' : 'Pendiente'}</dd></div><div><dt>Canchas</dt><dd>{courts.length}</dd></div></dl></Section>
    <Section title="Canchas" description="Configuración del negocio, solo lectura para Administración."><div className="resource-list">{courts.map((court) => <ResourceLink key={court.id} to={`/admin/canchas/${court.id}`} title={court.name} meta={`${court.allowedDurationsMinutes.join(', ')} min · ${court.sportCode || 'Deporte pendiente'}`} state={court.state} />)}</div></Section>
    <AdminFacilityMemberships facilityId={facilityId} />
  </div>;
}
