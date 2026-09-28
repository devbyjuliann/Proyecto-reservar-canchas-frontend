import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardList } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { api, withQuery } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { ButtonPending, EmptyState, ErrorNotice, LoadingBlock } from '../components/Feedback.jsx';
import { errorCopy, formatInstant, ownerApplicationStatusLabel } from '../lib/format.js';

const PATH = '/api/v1/me/owner-applications';

export function OwnerIntroPage() {
  const auth = useAuth();
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [values, setValues] = useState({ businessName: '', message: '' });

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoaded(false);
    setError(null);
    api(withQuery(PATH, { limit: 25 }), { signal: controller.signal })
      .then((result) => {
        setLoaded(true);
        setItems(result.items);
        setCursor(result.page.nextCursor);
        if (result.items[0]?.status === 'APROBADA' && !auth.isOwner) {
          auth.refreshSession().catch(() => {});
        }
      })
      .catch((caught) => { if (caught.name !== 'AbortError') setError(caught); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const result = await api(withQuery(PATH, { limit: 25, cursor }));
      setItems((current) => [...current, ...result.items]);
      setCursor(result.page.nextCursor);
    } catch (caught) { setError(caught); }
    finally { setLoadingMore(false); }
  }

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setSent(false);
    setError(null);
    try {
      const { ownerApplication } = await api(PATH, { method: 'POST', body: {
        businessName: values.businessName.trim(), message: values.message.trim() || null,
      } });
      setItems((current) => [ownerApplication, ...current]);
      setValues({ businessName: '', message: '' });
      setSent(true);
    } catch (caught) { setError(caught); }
    finally { setPending(false); }
  }

  const latest = items[0];
  const canRequest = loaded && !auth.isOwner && latest?.status !== 'PENDIENTE' && latest?.status !== 'APROBADA';

  return <div className="owner-onboarding"><Link className="back-link" to="/"><ArrowLeft size={17} aria-hidden="true" />Volver al marketplace</Link>
    <header className="owner-onboarding-hero"><div><h1>¿Eres dueño de una cancha? Registra tu negocio</h1><p>Solicita acceso para operar tus Instalaciones. Enviar la solicitud no te convierte en Propietario: un Administrador debe revisarla primero.</p></div><span className="owner-hero-mark" aria-hidden="true"><i /><i /></span></header>
    {sent ? <div className="notice notice-success" role="status"><CheckCircle2 size={21} aria-hidden="true" /><div><strong>Solicitud enviada</strong><p>Estado: PENDIENTE. Tu cuenta continúa como Usuario mientras se revisa.</p></div></div> : null}
    {error ? <ErrorNotice onRetry={() => setRefresh((value) => value + 1)}>{errorCopy(error)}</ErrorNotice> : null}
    {loading ? <LoadingBlock lines={3} label="Consultando solicitudes" /> : <div className="owner-onboarding-layout">
      <section className="owner-apply-panel" aria-labelledby="owner-apply-title"><h2 id="owner-apply-title">{canRequest ? 'Cuéntanos sobre tu negocio' : 'Estado de tu solicitud'}</h2>
        {!loaded ? <p>No pudimos comprobar tus solicitudes. Reintenta la consulta antes de enviar una nueva.</p> : canRequest ? <><p>Indica el nombre comercial y, si quieres, añade contexto para la revisión.</p><form className="form-stack" onSubmit={submit}><label className="field"><span>Nombre comercial</span><input name="businessName" value={values.businessName} onChange={(event) => setValues((current) => ({ ...current, businessName: event.target.value }))} required maxLength={150} /></label><label className="field"><span>Mensaje para el Administrador (opcional)</span><textarea name="message" value={values.message} onChange={(event) => setValues((current) => ({ ...current, message: event.target.value }))} maxLength={1000} /></label><p className="quiet-copy">Una aprobación concede el Rol, pero no asigna ni publica una Instalación automáticamente.</p><button className="button button-primary" disabled={pending} type="submit"><ButtonPending pending={pending}>Enviar solicitud</ButtonPending></button></form></> : <><p>{latest?.status === 'PENDIENTE' ? 'Tu solicitud sigue en revisión. No necesitas enviarla otra vez.' : 'Tu cuenta ya está aprobada como Propietario. La asignación de Instalaciones es un paso separado.'}</p>{auth.isOwner ? <Link className="button button-secondary" to="/owner">Ir a Mi negocio<ArrowRight size={17} aria-hidden="true" /></Link> : null}</>}
      </section>
      <section className="owner-history" aria-labelledby="owner-history-title"><div className="owner-history-title"><h2 id="owner-history-title">Tus solicitudes</h2><button className="button button-quiet button-small" type="button" disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Actualizar estado</button></div>
        {loaded && !items.length ? <EmptyState icon={ClipboardList} title="Aún no has enviado una solicitud">Cuando la envíes, aquí podrás seguir su estado.</EmptyState> : <div className="owner-history-list">{items.map((item) => <article className="owner-history-item" key={item.id}><div className="owner-history-item-head"><strong>{item.businessName}</strong><span className={`owner-state state-${item.status.toLowerCase()}`}>{ownerApplicationStatusLabel(item.status)}</span></div><p>Enviada el {formatInstant(item.createdAt)}</p>{item.decidedAt ? <p>Decidida el {formatInstant(item.decidedAt)}</p> : null}{item.status === 'RECHAZADA' && item.decisionReason ? <p className="owner-rejection-reason">Motivo: {item.decisionReason}</p> : null}</article>)}</div>}
        {cursor ? <button className="button button-quiet load-more" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Cargando' : 'Ver solicitudes anteriores'}</button> : null}
      </section>
    </div>}
  </div>;
}
