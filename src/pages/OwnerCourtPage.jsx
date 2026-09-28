import { ArrowLeft, MapPin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api, withQuery } from '../api/client.js';
import { LoadingBlock } from '../components/Feedback.jsx';
import { isOwnerAccessLost, OwnerAccessNotice } from '../components/OwnerAccessNotice.jsx';
import {
  ConfigurationSection, ExceptionsSection, GeneralSection,
  PricesSection, ScheduleSection, UnavailabilitySection,
} from '../components/OwnerCourtSections.jsx';

const sections = [
  { key: 'general', label: 'General' },
  { key: 'configuration', label: 'Configuración' },
  { key: 'schedule', label: 'Horarios' },
  { key: 'exceptions', label: 'Excepciones' },
  { key: 'unavailabilities', label: 'Bloqueos' },
  { key: 'prices', label: 'Precios' },
];

export function OwnerCourtPage() {
  const { courtId } = useParams();
  const base = `/api/v1/owner/courts/${courtId}`;
  const [court, setCourt] = useState(null);
  const [facility, setFacility] = useState(null);
  const [section, setSection] = useState('general');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sectionLoading, setSectionLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [sectionError, setSectionError] = useState(null);
  const [accessError, setAccessError] = useState(null);
  const [message, setMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [sectionRefresh, setSectionRefresh] = useState(0);
  const courtController = useRef(null);
  const sectionController = useRef(null);
  const moreController = useRef(null);
  const accessLost = useRef(false);

  function handleFailure(caught, sectionOnly = false) {
    if (isOwnerAccessLost(caught)) {
      accessLost.current = true;
      courtController.current?.abort();
      sectionController.current?.abort();
      moreController.current?.abort();
      setCourt(null);
      setFacility(null);
      setData(null);
      setAccessError(caught);
      setError(null);
      setSectionError(null);
      return;
    }
    if (sectionOnly) setSectionError(caught);
    else setError(caught);
  }

  useEffect(() => {
    const controller = new AbortController();
    courtController.current = controller;
    sectionController.current?.abort();
    moreController.current?.abort();
    accessLost.current = false;
    setLoading(true);
    setCourt(null);
    setFacility(null);
    setData(null);
    setAccessError(null);
    setError(null);
    setMessage('');
    api(base, { signal: controller.signal }).then(async ({ court: result }) => {
      const detail = await api(`/api/v1/owner/facilities/${result.facility.id}`, { signal: controller.signal });
      if (!controller.signal.aborted && !accessLost.current) {
        setCourt(result);
        setFacility(detail.facility);
      }
    }).catch((caught) => { if (caught.name !== 'AbortError') handleFailure(caught); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [courtId, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    sectionController.current = controller;
    moreController.current?.abort();
    setData(null);
    setSectionError(null);
    setLoadingMore(false);
    setSectionLoading(false);
    if (!court || section === 'general' || accessLost.current) return () => controller.abort();
    setSectionLoading(true);
    api(withQuery(sectionUrl(base, section),
      ['exceptions', 'unavailabilities'].includes(section) ? { limit: 25 } : {}),
    { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted && !accessLost.current) {
          setData(section === 'schedule' ? result.weeklySchedule : result);
        }
      })
      .catch((caught) => { if (caught.name !== 'AbortError') handleFailure(caught, true); })
      .finally(() => { if (!controller.signal.aborted) setSectionLoading(false); });
    return () => controller.abort();
  }, [court?.id, section, sectionRefresh]);

  async function loadMore() {
    const cursor = data?.page?.nextCursor;
    if (!cursor || loadingMore) return;
    const controller = new AbortController();
    moreController.current = controller;
    setLoadingMore(true);
    setSectionError(null);
    try {
      const result = await api(withQuery(sectionUrl(base, section), { limit: 25, cursor }),
        { signal: controller.signal });
      if (!accessLost.current) setData((current) => ({ items: [...current.items, ...result.items], page: result.page }));
    } catch (caught) { if (caught.name !== 'AbortError') handleFailure(caught, true); }
    finally { if (!controller.signal.aborted) setLoadingMore(false); }
  }

  async function mutate(path, method, body, successMessage) {
    setPending(true);
    setError(null);
    setSectionError(null);
    setMessage('');
    try {
      const result = await api(path, { method, ...(body === undefined ? {} : { body }) });
      if (result.court) setCourt(result.court);
      setMessage(successMessage);
      if (section !== 'general') setSectionRefresh((value) => value + 1);
      return true;
    } catch (caught) { handleFailure(caught, true); return false; }
    finally { setPending(false); }
  }

  return <div className="owner-console owner-court-page">
    <Link className="back-link" to={court ? `/owner/instalaciones/${court.facility.id}` : '/owner'}><ArrowLeft size={17} aria-hidden="true" />Volver a la Instalación</Link>
    {loading ? <LoadingBlock lines={5} label="Cargando Cancha" /> : null}
    {accessError || error ? <OwnerAccessNotice error={accessError || error} onRetry={() => setRefresh((value) => value + 1)} /> : null}
    {court && facility && !accessLost.current ? <>
      <header className="owner-console-hero"><div><span className="owner-console-label">{facility.name}</span><h1>{court.name}</h1><p>{court.description || 'Completa la descripción de esta Cancha desde General.'}</p><span className="owner-court-location"><MapPin size={16} aria-hidden="true" />{facility.city || 'Ciudad por definir'} · {facility.timeZone}</span></div><span className={`owner-state ${court.state === 'active' ? 'state-aprobada' : 'state-rechazada'}`}>{court.state === 'active' ? 'Activa' : 'Inactiva'}</span></header>
      <nav className="owner-section-nav" aria-label="Secciones de la Cancha">{sections.map((item) => <button key={item.key} type="button" aria-pressed={section === item.key} onClick={() => { setSection(item.key); setMessage(''); }}>{item.label}</button>)}</nav>
      <div className="owner-console-body owner-court-content">
        {message ? <p className="notice notice-success" role="status">{message}</p> : null}
        {sectionError ? <OwnerAccessNotice error={sectionError} onRetry={() => setSectionRefresh((value) => value + 1)} /> : null}
        {section !== 'general' && sectionLoading ? <LoadingBlock lines={4} label={`Cargando ${sections.find((item) => item.key === section)?.label}`} /> : null}
        {section === 'general' ? <GeneralSection court={court} pending={pending}
          save={(values) => mutate(base, 'PATCH', values, 'Datos de la Cancha guardados.')}
          deactivate={() => mutate(`${base}/deactivation`, 'POST', undefined, 'Cancha desactivada. No se ofrecen nuevos turnos.')} /> : null}
        {section === 'configuration' && data ? <ConfigurationSection key={`${courtId}-${sectionRefresh}`} courtId={courtId} value={data} pending={pending} disabled={court.state !== 'active'}
          save={(values) => mutate(`${base}/booking-configuration`, 'PUT', values, 'Configuración de Reserva actualizada.')} /> : null}
        {section === 'schedule' && data ? <ScheduleSection key={`${courtId}-${sectionRefresh}`} value={data} pending={pending} disabled={court.state !== 'active'}
          save={(values) => mutate(`${base}/weekly-schedule`, 'PUT', values, 'Horario semanal actualizado.')} /> : null}
        {section === 'exceptions' && data ? <ExceptionsSection items={data.items} cursor={data.page?.nextCursor} loadingMore={loadingMore} loadMore={loadMore} timeZone={facility.timeZone} pending={pending} disabled={court.state !== 'active'}
          save={(date, values) => mutate(`${base}/date-exceptions/${date}`, 'PUT', values, 'Excepción guardada.')}
          remove={(date) => mutate(`${base}/date-exceptions/${date}`, 'DELETE', undefined, 'Excepción eliminada; vuelve a regir el horario semanal.')} /> : null}
        {section === 'unavailabilities' && data ? <UnavailabilitySection items={data.items} cursor={data.page?.nextCursor} loadingMore={loadingMore} loadMore={loadMore} pending={pending} disabled={court.state !== 'active'}
          save={(values) => mutate(`${base}/unavailabilities`, 'POST', values, 'Bloqueo registrado. Las Reservas existentes conservan su estado.')} /> : null}
        {section === 'prices' && data ? <PricesSection key={`${courtId}-${sectionRefresh}`} items={data.items} pending={pending} disabled={court.state !== 'active'}
          save={(duration, priceMinor) => mutate(`${base}/prices/${duration}`, 'PUT', { priceMinor, currency: 'COP' }, 'Precio en COP guardado.')}
          remove={(duration) => mutate(`${base}/prices/${duration}`, 'DELETE', undefined, 'Precio retirado; esa Duración deja de ofrecerse públicamente.')} /> : null}
      </div>
    </> : null}
  </div>;
}

function sectionUrl(base, section) {
  const routes = {
    configuration: 'booking-configuration', schedule: 'weekly-schedule',
    exceptions: 'date-exceptions', unavailabilities: 'unavailabilities', prices: 'prices',
  };
  return `${base}/${routes[section]}`;
}
