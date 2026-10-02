import { ArrowRight, Building2, Search, TicketCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { api, withQuery } from '../api/client.js';
import { CourtCard, FacilityCard } from '../components/MarketplaceCards.jsx';
import { EmptyState, ErrorNotice, LoadingBlock } from '../components/Feedback.jsx';
import { errorCopy, priceMinorFromCOP } from '../lib/format.js';

const emptyFilters = { q: '', city: '', sport: '', maxPriceMinor: undefined };

export function MarketplacePage() {
  const [form, setForm] = useState({ q: '', city: '', sport: '', maxPriceCOP: '' });
  const [filters, setFilters] = useState(emptyFilters);
  const [view, setView] = useState('facilities');
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [inputError, setInputError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const loadMoreController = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    loadMoreController.current?.abort();
    setLoadingMore(false);
    setLoading(true);
    setItems([]);
    setCursor(null);
    setError(null);
    api(withQuery(`/api/v1/${view}`, { ...filters, limit: 12 }), { signal: controller.signal })
      .then((result) => { setItems(result.items); setCursor(result.page.nextCursor); })
      .catch((caught) => { if (caught.name !== 'AbortError') setError(caught); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, view, refresh]);

  function search(event) {
    event.preventDefault();
    const maxPriceMinor = priceMinorFromCOP(form.maxPriceCOP);
    if (maxPriceMinor === null) {
      setInputError('Ingresa un precio máximo positivo en pesos colombianos.');
      return;
    }
    setInputError('');
    const sport = form.sport.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .toUpperCase().replace(/\s+/g, '_');
    setFilters({ q: form.q.trim(), city: form.city.trim(), sport,
      maxPriceMinor });
  }

  function clearFilters() {
    setForm({ q: '', city: '', sport: '', maxPriceCOP: '' });
    setInputError('');
    setFilters({ ...emptyFilters });
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    const controller = new AbortController();
    loadMoreController.current = controller;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await api(withQuery(`/api/v1/${view}`, { ...filters, limit: 12, cursor }),
        { signal: controller.signal });
      setItems((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...result.items.filter((item) => !known.has(item.id))];
      });
      setCursor(result.page.nextCursor);
    } catch (caught) {
      if (caught.name !== 'AbortError') setError(caught);
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }

  const hasFilters = Boolean(filters.q || filters.city || filters.sport || filters.maxPriceMinor);

  return (
    <div className="market-home">
      <section className="market-hero">
        <div className="market-hero-copy"><h1>Encuentra y reserva una cancha.</h1><p>Explora establecimientos, compara precios y consulta horarios reales antes de reservar.</p></div>
        <div className="hero-field" aria-hidden="true"><i /><i /><i /></div>
      </section>

      <section className="market-search-section" aria-labelledby="search-title">
        <div className="market-search-heading"><div><h2 id="search-title">Busca tu próximo turno</h2><p>Encuentra una Instalación o Cancha por nombre y ajusta la búsqueda a tu juego.</p></div></div>
        <form className="market-search-form" onSubmit={search}>
          <div className="market-search-primary"><label className="market-field"><span>Buscar</span><input type="search" maxLength={100} value={form.q} placeholder="Nombre de Instalación o Cancha" onChange={(event) => setForm((current) => ({ ...current, q: event.target.value }))} /></label><button className="button button-primary" type="submit"><Search size={18} aria-hidden="true" />Buscar</button></div>
          <div className="market-filter-heading"><strong>Filtra los resultados</strong><span>Combina ciudad, deporte y precio máximo.</span></div>
          <div className="market-filter-fields">
            <label className="market-field"><span>Ciudad</span><input value={form.city} maxLength={120} placeholder="Ej. Bogotá" onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} /></label>
            <label className="market-field"><span>Deporte</span><input value={form.sport} maxLength={32} placeholder="Ej. Fútbol 5" onChange={(event) => setForm((current) => ({ ...current, sport: event.target.value }))} /><small>Ejemplo: Fútbol 5.</small></label>
            <label className="market-field"><span>Precio máximo en COP</span><input type="number" min="1" step="1" inputMode="numeric" value={form.maxPriceCOP} placeholder="Ej. 90000" onChange={(event) => setForm((current) => ({ ...current, maxPriceCOP: event.target.value }))} /></label>
            {hasFilters ? <button className="button button-quiet market-clear" type="button" onClick={clearFilters}>Limpiar filtros</button> : null}
          </div>
        </form>
        {inputError ? <p className="market-input-error" role="alert">{inputError}</p> : null}
      </section>

      <section className="market-results" aria-labelledby="results-title">
        <div className="market-results-heading"><div><h2 id="results-title">{view === 'facilities' ? 'Instalaciones disponibles' : 'Canchas para jugar'}</h2><p>Explora las opciones publicadas y consulta horarios antes de reservar.</p></div><div className="market-view-switch" role="group" aria-label="Tipo de resultados"><button type="button" aria-pressed={view === 'facilities'} onClick={() => setView('facilities')}>Instalaciones</button><button type="button" aria-pressed={view === 'courts'} onClick={() => setView('courts')}>Canchas</button></div></div>
        {error ? <ErrorNotice onRetry={() => setRefresh((value) => value + 1)}>{errorCopy(error)}</ErrorNotice> : null}
        {loading ? <LoadingBlock lines={4} label="Buscando establecimientos y canchas" /> : null}
        {!loading && !items.length && !error ? <EmptyState icon={view === 'facilities' ? Building2 : TicketCheck} title={hasFilters ? 'No encontramos canchas con esos filtros.' : 'Todavía no hay canchas disponibles.'} action={hasFilters ? <button className="button button-quiet" type="button" onClick={clearFilters}>Limpiar filtros</button> : null}>{hasFilters ? 'Prueba con otra ciudad, deporte o precio máximo.' : 'Vuelve pronto para descubrir establecimientos disponibles.'}</EmptyState> : null}
        {items.length ? <div className="market-card-grid">{items.map((item) => view === 'facilities' ? <FacilityCard key={item.id} facility={item} /> : <CourtCard key={item.id} court={item} />)}</div> : null}
        {cursor ? <button className="button button-secondary load-more" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Cargando más' : 'Ver más resultados'}<ArrowRight size={18} aria-hidden="true" /></button> : null}
      </section>

      <section className="owner-cta"><div><h2>¿Eres dueño de una cancha? Registra tu negocio</h2><p>Este espacio es para quienes quieren compartir sus Canchas con más personas.</p></div><Link className="button button-secondary" to="/propietarios">Conocer el próximo paso<ArrowRight size={18} aria-hidden="true" /></Link></section>
    </div>
  );
}
