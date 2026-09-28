import { ArrowLeft, Ban, Plus, Settings2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { api, apiItems } from '../../api/client.js';
import { ButtonPending, EmptyState, ErrorNotice, LoadingBlock } from '../../components/Feedback.jsx';
import { AdminFacilityMemberships } from '../../components/AdminFacilityMemberships.jsx';
import { AddButton, OperationResult, ResourceLink, Section, StatusDot } from '../../components/Primitives.jsx';
import { errorCopy } from '../../lib/format.js';

export function AdminFacilityPage() {
  const { facilityId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [courts, setCourts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editor, setEditor] = useState(null);
  const [operation, setOperation] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api(`/api/v1/admin/facilities/${facilityId}`, { signal: controller.signal }),
      apiItems(`/api/v1/admin/facilities/${facilityId}/courts`, { state: 'all', limit: 100 }, { signal: controller.signal }),
    ]).then(([facilityResult, courtItems]) => {
      setData(facilityResult.facility);
      setCourts(courtItems);
    }).catch((caught) => {
      if (caught.name !== 'AbortError') setError(caught);
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [facilityId]);

  function applied(result) {
    if (result.facility) setData(result.facility);
    setOperation(result.operation);
    setEditor(null);
  }

  async function deactivate() {
    setError(null);
    try {
      applied(await api(`/api/v1/admin/facilities/${facilityId}/deactivation`, { method: 'POST' }));
    } catch (caught) { setError(caught); }
  }

  if (loading) return <div className="page-standard"><LoadingBlock lines={7} /></div>;
  if (!data) return <div className="page-standard"><ErrorNotice onRetry={() => navigate('/admin')}>{errorCopy(error)}</ErrorNotice></div>;

  return (
    <div className="page-standard admin-page">
      <Link className="back-link" to="/admin"><ArrowLeft size={17} />Instalaciones</Link>
      <header className="resource-hero"><div><div className="resource-title-line"><h1>{data.name}</h1><StatusDot state={data.state} /></div><p>{data.timeZone} · ID {data.id}</p></div><div className="page-actions"><button className="button button-secondary" type="button" onClick={() => setEditor('details')}>Editar nombre</button><button className="button button-secondary" type="button" onClick={() => setEditor('policy')}><Settings2 size={17} />Política</button>{data.state === 'active' ? <button className="button button-danger-subtle" type="button" onClick={deactivate}><Ban size={17} />Desactivar</button> : null}</div></header>
      {error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}
      <OperationResult operation={operation} />
      {editor === 'details' ? <FacilityDetails facility={data} onClose={() => setEditor(null)} onSaved={applied} /> : null}
      {editor === 'policy' ? <FacilityPolicy facility={data} onClose={() => setEditor(null)} onSaved={applied} /> : null}
      <section className="policy-strip" aria-label="Política de reserva"><div><span>Mínimo</span><strong>{data.minimumAdvanceMinutes} min</strong></div><div><span>Máximo</span><strong>{data.maximumAdvanceMinutes} min</strong></div><div><span>Zona horaria</span><strong>{data.timeZone}</strong></div></section>
      <Section title="Canchas" description="Recursos físicos y su configuración reservable." actions={data.state === 'active' ? <AddButton onClick={() => setEditor('court')}>Nueva cancha</AddButton> : null}>
        {editor === 'court' ? <CreateCourt facilityId={facilityId} onClose={() => setEditor(null)} onCreated={(court) => navigate(`/admin/canchas/${court.id}`)} /> : null}
        {!courts.length ? <EmptyState title="Esta instalación aún no tiene Canchas">Crea una Cancha con al menos una Duración permitida.</EmptyState> : <div className="resource-list">{courts.map((court) => <ResourceLink key={court.id} to={`/admin/canchas/${court.id}`} title={court.name} meta={`${court.allowedDurationsMinutes.join(', ')} min · Separación ${court.minimumSeparationMinutes} min`} state={court.state} />)}</div>}
      </Section>
      <AdminFacilityMemberships facilityId={facilityId} />
    </div>
  );
}

function FacilityDetails({ facility, onClose, onSaved }) {
  return <FacilityForm title="Editar instalación" initial={{ name: facility.name }} endpoint={`/api/v1/admin/facilities/${facility.id}`} method="PATCH" submitLabel="Guardar nombre" onClose={onClose} onSaved={onSaved} />;
}

function FacilityPolicy({ facility, onClose, onSaved }) {
  return <FacilityForm title="Política de reserva" initial={{ timeZone: facility.timeZone, minimumAdvanceMinutes: facility.minimumAdvanceMinutes, maximumAdvanceMinutes: facility.maximumAdvanceMinutes }} endpoint={`/api/v1/admin/facilities/${facility.id}/booking-policy`} method="PUT" submitLabel="Guardar política" onClose={onClose} onSaved={onSaved} />;
}

function FacilityForm({ title, initial, endpoint, method, submitLabel, onClose, onSaved }) {
  const [values, setValues] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  async function submit(event) { event.preventDefault(); setPending(true); setError(null); try { onSaved(await api(endpoint, { method, body: values })); } catch (caught) { setError(caught); } finally { setPending(false); } }
  return <section className="inline-editor"><header><h2>{title}</h2><button className="icon-button" type="button" onClick={onClose}><X /></button></header>{error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}<form className="form-grid" onSubmit={submit}>{Object.entries(values).map(([name, value]) => <label key={name} className={`field ${name === 'timeZone' || name === 'name' ? 'field-wide' : ''}`}><span>{({ name: 'Nombre', timeZone: 'Zona horaria IANA', minimumAdvanceMinutes: 'Anticipación mínima', maximumAdvanceMinutes: 'Anticipación máxima' })[name]}</span><input name={name} type={typeof value === 'number' ? 'number' : 'text'} min={typeof value === 'number' ? 0 : undefined} value={value} onChange={(event) => setValues((current) => ({ ...current, [name]: typeof value === 'number' ? Number(event.target.value) : event.target.value }))} required /></label>)}<div className="form-actions field-wide"><button className="button button-primary" disabled={pending}><ButtonPending pending={pending}>{submitLabel}</ButtonPending></button><button className="button button-quiet" type="button" onClick={onClose}>Cancelar</button></div></form></section>;
}

function CreateCourt({ facilityId, onClose, onCreated }) {
  const [values, setValues] = useState({ name: '', description: '', minimumSeparationMinutes: 0, startIntervalMinutes: 30, allowedDurationsMinutes: '30, 60' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  async function submit(event) {
    event.preventDefault(); setPending(true); setError(null);
    try {
      const body = { ...values, description: values.description || null, minimumSeparationMinutes: Number(values.minimumSeparationMinutes), startIntervalMinutes: Number(values.startIntervalMinutes), allowedDurationsMinutes: values.allowedDurationsMinutes.split(',').map((value) => Number(value.trim())).filter(Boolean) };
      const result = await api(`/api/v1/admin/facilities/${facilityId}/courts`, { method: 'POST', body });
      onCreated(result.court);
    } catch (caught) { setError(caught); } finally { setPending(false); }
  }
  return <section className="inline-editor"><header><div><h2>Nueva Cancha</h2><p>La Cancha y sus Duraciones se guardan juntas.</p></div><button className="icon-button" type="button" onClick={onClose}><X /></button></header>{error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}<form className="form-grid" onSubmit={submit}><label className="field"><span>Nombre</span><input value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} required /></label><label className="field"><span>Descripción</span><input value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} /></label><label className="field"><span>Separación mínima</span><input type="number" min="0" value={values.minimumSeparationMinutes} onChange={(e) => setValues({ ...values, minimumSeparationMinutes: e.target.value })} required /><small>Minutos</small></label><label className="field"><span>Intervalo de inicios</span><input type="number" min="1" value={values.startIntervalMinutes} onChange={(e) => setValues({ ...values, startIntervalMinutes: e.target.value })} required /><small>Minutos</small></label><label className="field field-wide"><span>Duraciones permitidas</span><input value={values.allowedDurationsMinutes} onChange={(e) => setValues({ ...values, allowedDurationsMinutes: e.target.value })} placeholder="30, 60, 90" required /><small>Minutos separados por coma, sin duplicados.</small></label><div className="form-actions field-wide"><button className="button button-primary" disabled={pending}><ButtonPending pending={pending}>Crear Cancha</ButtonPending></button><button className="button button-quiet" type="button" onClick={onClose}>Cancelar</button></div></form></section>;
}
