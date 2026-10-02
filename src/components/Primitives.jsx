import { ChevronRight, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

export function PageHeading({ title, description, actions }) {
  return (
    <header className="page-heading">
      <div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Section({ title, description, actions, children, className = '' }) {
  return (
    <section className={`section-block ${className}`}>
      {(title || actions) ? <header className="section-heading"><div>{title ? <h2>{title}</h2> : null}{description ? <p>{description}</p> : null}</div>{actions}</header> : null}
      {children}
    </section>
  );
}

export function ResourceLink({ to, title, meta, state }) {
  return (
    <Link className="resource-row" to={to}>
      <span><strong>{title}</strong><small>{meta}</small></span>
      {state ? <StatusDot state={state} /> : null}
      <ChevronRight size={18} aria-hidden="true" />
    </Link>
  );
}

export function StatusDot({ state }) {
  const inactive = state === 'inactive';
  return <span className={`state-label ${inactive ? 'inactive' : 'active'}`}><i />{inactive ? 'Inactivo' : 'Activo'}</span>;
}

// Presentation only: callers choose the tone without delegating domain rules to the badge.
export function StatusBadge({ children, tone = 'neutral' }) {
  return <span className={`status-badge status-badge-${tone}`}>{children}</span>;
}

export function AddButton({ children, ...props }) {
  return <button className="button button-secondary button-small" type="button" {...props}><Plus size={16} />{children}</button>;
}

export function OperationResult({ operation }) {
  if (!operation) return null;
  return (
    <div className={`operation-result ${operation.changed ? 'changed' : 'unchanged'}`} role="status">
      <strong>{operation.changed ? 'Cambio aplicado' : 'Sin cambios'}</strong>
      <span>{operation.changed ? `${operation.changes?.length ?? 0} cambio(s) operativo(s) registrado(s).` : 'La configuración ya tenía estos valores.'}</span>
    </div>
  );
}
