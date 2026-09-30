import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api, apiItems } from '../../api/client.js';
import { ErrorNotice, LoadingBlock } from '../../components/Feedback.jsx';
import { Section, StatusDot } from '../../components/Primitives.jsx';
import { errorCopy, formatCOP, formatInstant, formatTime } from '../../lib/format.js';

const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function AdminCourtPage() {
  const { courtId } = useParams();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    const base = `/api/v1/admin/courts/${courtId}`;
    Promise.all([
      api(base, { signal: controller.signal }),
      api(`${base}/weekly-schedule`, { signal: controller.signal }),
      apiItems(`${base}/date-exceptions`, { limit: 100 }, { signal: controller.signal }),
      apiItems(`${base}/unavailabilities`, { limit: 100 }, { signal: controller.signal }),
      api(`${base}/prices`, { signal: controller.signal }),
    ]).then(([court, schedule, exceptions, blocks, prices]) => {
      setDetail({ court: court.court, periods: schedule.weeklySchedule.periods, exceptions, blocks, prices: prices.items });
    }).catch((caught) => { if (caught.name !== 'AbortError') setError(caught); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [courtId]);

  if (loading) return <div className="page-standard"><LoadingBlock lines={6} /></div>;
  if (!detail) return <div className="page-standard"><ErrorNotice>{errorCopy(error)}</ErrorNotice></div>;
  const { court, periods, exceptions, blocks, prices } = detail;
  return <div className="page-standard admin-page court-admin">
    <Link className="back-link" to={`/admin/instalaciones/${court.facility.id}`}><ArrowLeft size={17} />{court.facility.name}</Link>
    <header className="resource-hero"><div><div className="resource-title-line"><h1>{court.name}</h1><StatusDot state={court.state} /></div><p>{court.description || 'Sin descripción'} · {court.sportCode || 'Deporte pendiente'} · ID {court.id}</p></div></header>
    {error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}
    <Section title="Reglas de turno" description="Configuración operativa del Propietario, solo lectura."><dl className="definition-grid"><div><dt>Separación mínima</dt><dd>{court.minimumSeparationMinutes} min</dd></div><div><dt>Intervalo de inicios</dt><dd>{court.startIntervalMinutes} min</dd></div><div><dt>Duraciones permitidas</dt><dd>{court.allowedDurationsMinutes.join(', ')} min</dd></div></dl></Section>
    <Section title="Tarifas"><div className="data-rows">{prices.map((price) => <div className="data-row" key={price.durationMinutes}><strong>{price.durationMinutes} min</strong><span>{formatCOP(price.priceMinor)}</span></div>)}</div></Section>
    <Section title="Horario semanal"><div className="schedule-board">{WEEKDAYS.map((day, index) => <div key={day}><strong>{day.slice(0, 3)}</strong><span>{periods.filter((period) => period.weekday === index + 1).map((period) => `${formatTime(period.startTime)}–${formatTime(period.endTime)}`).join(' / ') || 'Cerrado'}</span></div>)}</div></Section>
    <Section title="Excepciones por fecha"><div className="data-rows">{exceptions.map((item) => <div className="data-row" key={item.localDate}><strong>{item.localDate}</strong><span>{item.mode === 'CLOSED' ? 'Cerrado' : item.periods.map((period) => `${formatTime(period.startTime)}–${formatTime(period.endTime)}`).join(' / ')}</span></div>)}</div></Section>
    <Section title="Indisponibilidades"><div className="data-rows">{blocks.map((item) => <div className="data-row" key={item.id}><strong>{item.type}</strong><span>{formatInstant(item.startAt)} – {formatInstant(item.endAt)}</span></div>)}</div></Section>
  </div>;
}
