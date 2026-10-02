import { ArrowLeft, CalendarOff, CircleDollarSign, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api, apiItems } from '../../api/client.js';
import { EmptyState, ErrorNotice, LoadingBlock } from '../../components/Feedback.jsx';
import { Section, StatusBadge } from '../../components/Primitives.jsx';
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
    <header className="resource-hero admin-resource-hero"><div><h1>{court.name}</h1><p>{court.description || 'Sin descripción'} · {court.sportCode || 'Deporte pendiente'}</p><div className="admin-resource-states"><StatusBadge tone={court.state === 'active' ? 'positive' : 'negative'}>{court.state === 'active' ? 'Activa' : 'Inactiva'}</StatusBadge><span className="admin-readonly-label">Solo lectura</span></div></div></header>
    {error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}
    <Section title="Reglas de turno" description="Configuración operativa del Propietario, solo lectura."><dl className="definition-grid"><div><dt>Separación mínima</dt><dd>{court.minimumSeparationMinutes} min</dd></div><div><dt>Intervalo de inicios</dt><dd>{court.startIntervalMinutes} min</dd></div><div><dt>Duraciones permitidas</dt><dd>{court.allowedDurationsMinutes.join(', ')} min</dd></div></dl></Section>
    <Section title="Tarifas" description="Precios configurados por el Propietario; Administración no los modifica.">{!prices.length ? <EmptyState icon={CircleDollarSign} title="Sin tarifas configuradas">Esta Cancha no tiene precios disponibles para revisión.</EmptyState> : <div className="data-rows">{prices.map((price) => <div className="data-row" key={price.durationMinutes}><strong>{price.durationMinutes} min</strong><span>{formatCOP(price.priceMinor)}</span></div>)}</div>}</Section>
    <Section title="Horario semanal"><div className="schedule-board">{WEEKDAYS.map((day, index) => <div key={day}><strong>{day.slice(0, 3)}</strong><span>{periods.filter((period) => period.weekday === index + 1).map((period) => `${formatTime(period.startTime)}–${formatTime(period.endTime)}`).join(' / ') || 'Cerrado'}</span></div>)}</div></Section>
    <Section title="Excepciones por fecha">{!exceptions.length ? <EmptyState icon={CalendarOff} title="Sin excepciones registradas">Se aplica el horario semanal configurado.</EmptyState> : <div className="data-rows">{exceptions.map((item) => <div className="data-row" key={item.localDate}><strong>{item.localDate}</strong><span>{item.mode === 'CLOSED' ? 'Cerrado' : item.periods.map((period) => `${formatTime(period.startTime)}–${formatTime(period.endTime)}`).join(' / ')}</span></div>)}</div>}</Section>
    <Section title="Indisponibilidades">{!blocks.length ? <EmptyState icon={Wrench} title="Sin bloqueos registrados">No hay periodos de indisponibilidad para revisar.</EmptyState> : <div className="data-rows">{blocks.map((item) => <div className="data-row" key={item.id}><strong>{item.type}</strong><span>{formatInstant(item.startAt)} – {formatInstant(item.endAt)}</span></div>)}</div>}</Section>
  </div>;
}
