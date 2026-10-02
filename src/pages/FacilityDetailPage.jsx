import { ArrowLeft, ArrowRight, MapPin } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { api, withQuery } from '../api/client.js';
import { CourtCard } from '../components/MarketplaceCards.jsx';
import { EmptyState, ErrorNotice, LoadingBlock } from '../components/Feedback.jsx';
import { errorCopy } from '../lib/format.js';

export function FacilityDetailPage() {
  const { facilityId } = useParams();
  const [facility, setFacility] = useState(null);
  const [courts, setCourts] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const loadMoreController = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    loadMoreController.current?.abort();
    setLoadingMore(false);
    setLoading(true);
    setFacility(null);
    setCourts([]);
    setError(null);
    Promise.all([
      api(`/api/v1/facilities/${facilityId}`, { signal: controller.signal }),
      api(withQuery(`/api/v1/facilities/${facilityId}/courts`, { limit: 12 }), { signal: controller.signal }),
    ]).then(([detail, list]) => {
      setFacility(detail.facility);
      setCourts(list.items);
      setCursor(list.page.nextCursor);
    }).catch((caught) => { if (caught.name !== 'AbortError') setError(caught); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [facilityId, refresh]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const controller = new AbortController();
    loadMoreController.current = controller;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await api(withQuery(`/api/v1/facilities/${facilityId}/courts`, { limit: 12, cursor }),
        { signal: controller.signal });
      setCourts((current) => {
        const known = new Set(current.map((court) => court.id));
        return [...current, ...result.items.filter((court) => !known.has(court.id))];
      });
      setCursor(result.page.nextCursor);
    } catch (caught) { if (caught.name !== 'AbortError') setError(caught); }
    finally { if (!controller.signal.aborted) setLoadingMore(false); }
  }

  return (
    <div className="market-detail-page">
      <Link className="back-link" to="/"><ArrowLeft size={17} aria-hidden="true" />Volver a explorar</Link>
      {loading ? <LoadingBlock lines={5} label="Cargando establecimiento" /> : null}
      {error ? <ErrorNotice onRetry={() => setRefresh((value) => value + 1)}>{errorCopy(error)}</ErrorNotice> : null}
      {facility ? <>
        <header className="market-detail-hero">
          <div className="detail-hero-content"><span className="detail-location"><MapPin size={18} aria-hidden="true" />{facility.city}</span><h1>{facility.name}</h1><p>{facility.description}</p></div>
          <div className="detail-field" aria-hidden="true"><i /><i /></div>
        </header>
        <div className="facility-address"><MapPin size={18} aria-hidden="true" /><span>Dirección</span><address>{facility.address}</address></div>
        <section className="detail-list-section" aria-labelledby="facility-courts-heading"><div className="market-results-heading"><div><h2 id="facility-courts-heading">Canchas disponibles</h2><p>Elige una Cancha para consultar sus duraciones, precios y horarios.</p></div></div>
          {!courts.length && !error ? <EmptyState title="Sin Canchas disponibles">Por ahora este establecimiento no muestra Canchas para reservar.</EmptyState> : null}
          {courts.length ? <div className="market-card-grid">{courts.map((court) => <CourtCard key={court.id} court={court} />)}</div> : null}
          {cursor ? <button className="button button-secondary load-more" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Cargando más' : 'Ver más Canchas'}<ArrowRight size={18} aria-hidden="true" /></button> : null}
        </section>
      </> : null}
    </div>
  );
}
