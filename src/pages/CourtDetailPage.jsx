import { ArrowLeft, MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api } from '../api/client.js';
import { ErrorNotice, LoadingBlock } from '../components/Feedback.jsx';
import { formatCOP, sportLabel } from '../lib/format.js';
import { BookingPage } from './BookingPage.jsx';

export function CourtDetailPage() {
  const { courtId } = useParams();
  const [court, setCourt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setCourt(null);
    setError(null);
    api(`/api/v1/courts/${courtId}`, { signal: controller.signal })
      .then(({ court: result }) => setCourt(result))
      .catch((caught) => { if (caught.name !== 'AbortError') setError(caught); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [courtId, refresh]);

  return (
    <div className="court-detail-page">
      {loading ? <div className="market-detail-page"><LoadingBlock lines={6} label="Cargando Cancha" /></div> : null}
      {error ? <div className="market-detail-page"><Link className="back-link" to="/"><ArrowLeft size={17} aria-hidden="true" />Volver a explorar</Link><ErrorNotice onRetry={() => setRefresh((value) => value + 1)}>No pudimos abrir esta Cancha. Quizás ya no está publicada.</ErrorNotice></div> : null}
      {court ? <>
        <div className="court-detail-intro">
          <Link className="back-link" to={`/instalaciones/${court.facility.id}`}><ArrowLeft size={17} aria-hidden="true" />{court.facility.name}</Link>
          <div className="court-detail-heading"><div><span className="sport-pill">{sportLabel(court.sportCode)}</span><h1>{court.name}</h1><p>{court.description}</p><span className="listing-location"><MapPin size={16} aria-hidden="true" />{court.facility.name} · {court.facility.city}</span></div><div className="court-prices"><span>Duraciones y precios</span>{court.prices.map((price) => <div key={price.durationMinutes}><span>{price.durationMinutes} min</span><strong>{formatCOP(price.priceMinor)}</strong></div>)}</div></div>
        </div>
        <BookingPage court={court} />
      </> : null}
    </div>
  );
}
