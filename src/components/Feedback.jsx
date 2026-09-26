import { AlertTriangle, LoaderCircle, RefreshCw } from 'lucide-react';

export function LoadingBlock({ lines = 4, label = 'Cargando' }) {
  return (
    <div className="loading-block" role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} style={{ width: `${92 - index * 9}%` }} />
      ))}
    </div>
  );
}

export function ErrorNotice({ children, onRetry }) {
  return (
    <div className="notice notice-error" role="alert">
      <AlertTriangle aria-hidden="true" size={19} />
      <div><strong>No se completó la acción</strong><p>{children}</p></div>
      {onRetry ? (
        <button className="button button-quiet button-small" type="button" onClick={onRetry}>
          <RefreshCw size={15} aria-hidden="true" /> Reintentar
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="empty-state">
      {Icon ? <Icon aria-hidden="true" size={25} /> : null}
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}

export function ButtonPending({ pending, children }) {
  return pending ? <><LoaderCircle className="spin" size={17} aria-hidden="true" /> Guardando</> : children;
}
