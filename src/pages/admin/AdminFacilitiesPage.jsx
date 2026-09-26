import { Building2, Filter, Plus, X } from 'lucide-react';
import { startTransition, useEffect, useState } from 'react';

import { api, withQuery } from '../../api/client.js';
import { ButtonPending, EmptyState, ErrorNotice, LoadingBlock } from '../../components/Feedback.jsx';
import { PageHeading, ResourceLink } from '../../components/Primitives.jsx';
import { errorCopy } from '../../lib/format.js';

export function AdminFacilitiesPage() {
  const [stateFilter, setStateFilter] = useState('active');
  const [result, setResult] = useState({ items: [], page: { nextCursor: null } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

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
      <PageHeading title="Instalaciones" description="Directorio operativo y política general de reserva." actions={<button className="button button-primary" type="button" onClick={() => setCreating(true)}><Plus size={18} />Nueva instalación</button>} />
      <div className="filter-bar"><Filter size={17} /><span>Mostrar</span>{['active', 'inactive', 'all'].map((state) => <button key={state} type="button" className={stateFilter === state ? 'selected' : ''} onClick={() => setStateFilter(state)}>{({ active: 'Activas', inactive: 'Inactivas', all: 'Todas' })[state]}</button>)}</div>
      {creating ? <CreateFacility onClose={() => setCreating(false)} onCreated={(facility) => { setCreating(false); if (stateFilter !== 'inactive') setResult((current) => ({ ...current, items: [facility, ...current.items] })); }} /> : null}
      {error ? <ErrorNotice onRetry={() => load()}>{errorCopy(error)}</ErrorNotice> : null}
      {loading && !result.items.length ? <LoadingBlock lines={5} /> : null}
      {!loading && !result.items.length ? <EmptyState icon={Building2} title="No hay instalaciones en esta vista">Cambia el filtro o crea la primera Instalación.</EmptyState> : null}
      <div className="resource-list">
        {result.items.map((facility) => <ResourceLink key={facility.id} to={`/admin/instalaciones/${facility.id}`} title={facility.name} meta={`${facility.timeZone} · Reserva entre ${facility.minimumAdvanceMinutes} y ${facility.maximumAdvanceMinutes} min`} state={facility.state} />)}
      </div>
      {result.page.nextCursor ? <button className="button button-secondary load-more" type="button" disabled={loading} onClick={() => load(result.page.nextCursor)}>Ver más</button> : null}
    </div>
  );
}

function CreateFacility({ onClose, onCreated }) {
  const [values, setValues] = useState({ name: '', timeZone: 'America/Bogota', minimumAdvanceMinutes: 15, maximumAdvanceMinutes: 43200 });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  function update(event) {
    const value = event.target.type === 'number' ? Number(event.target.value) : event.target.value;
    setValues((current) => ({ ...current, [event.target.name]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await api('/api/v1/admin/facilities', { method: 'POST', body: values });
      onCreated(result.facility);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="inline-editor">
      <header><div><h2>Nueva instalación</h2><p>Define el reloj y la ventana inicial de sus Canchas.</p></div><button className="icon-button" type="button" onClick={onClose} aria-label="Cerrar formulario"><X /></button></header>
      {error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}
      <form onSubmit={submit} className="form-grid">
        <label className="field field-wide"><span>Nombre</span><input name="name" value={values.name} onChange={update} required maxLength="150" /></label>
        <label className="field field-wide"><span>Zona horaria IANA</span><input name="timeZone" value={values.timeZone} onChange={update} required /></label>
        <label className="field"><span>Anticipación mínima</span><input type="number" min="0" name="minimumAdvanceMinutes" value={values.minimumAdvanceMinutes} onChange={update} required /><small>Minutos</small></label>
        <label className="field"><span>Anticipación máxima</span><input type="number" min="0" name="maximumAdvanceMinutes" value={values.maximumAdvanceMinutes} onChange={update} required /><small>Minutos</small></label>
        <div className="form-actions field-wide"><button className="button button-primary" type="submit" disabled={pending}><ButtonPending pending={pending}>Crear instalación</ButtonPending></button><button className="button button-quiet" type="button" onClick={onClose}>Cancelar</button></div>
      </form>
    </section>
  );
}
