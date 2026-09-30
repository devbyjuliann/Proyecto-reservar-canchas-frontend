import { Link } from 'react-router-dom';

import { ErrorNotice } from './Feedback.jsx';
import { errorCopy } from '../lib/format.js';

export function isOwnerAccessLost(error) {
  return error?.status === 401 || error?.status === 403 || error?.status === 404;
}

export function OwnerAccessNotice({ error, onRetry }) {
  if (!error) return null;
  if (!isOwnerAccessLost(error)) return <ErrorNotice onRetry={onRetry}>{errorCopy(error)}</ErrorNotice>;
  if (error.code === 'owner_suspended') {
    return <div><ErrorNotice>Tu acceso como Propietario está suspendido. Puedes seguir usando tu cuenta como Usuario, pero no administrar negocios en este momento.</ErrorNotice><Link className="button button-secondary" to="/">Volver al marketplace</Link></div>;
  }
  const message = error.status === 401 ? 'Tu sesión terminó. Vuelve a iniciar sesión para continuar.'
    : error.status === 403 ? 'Tu cuenta ya no tiene permiso para operar este negocio.'
      : 'Esta Instalación o Cancha ya no está entre tus asignaciones.';
  const destination = error.status === 401 ? '/acceso' : error.status === 403 ? '/propietarios' : '/owner';
  return <div><ErrorNotice>{message}</ErrorNotice><Link className="button button-secondary" to={destination}>{error.status === 401 ? 'Iniciar sesión' : error.status === 403 ? 'Consultar mi solicitud' : 'Volver a Mi negocio'}</Link></div>;
}
