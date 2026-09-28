import { ArrowRight, CircleUserRound } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext.jsx';

export function ProfilePage() {
  const auth = useAuth();
  return <div className="profile-page"><header className="page-heading"><div><h1>Mi perfil</h1><p>La cuenta con la que reservas y consultas tus solicitudes.</p></div></header><section className="profile-card"><CircleUserRound size={38} aria-hidden="true" /><div><span>Nombre</span><strong>{auth.user.name}</strong></div><div><span>Correo</span><strong>{auth.user.email}</strong></div><div><span>Acceso</span><strong>{auth.isAdministrator ? 'Administrador' : auth.isOwner ? 'Propietario' : 'Usuario'}</strong></div></section><div className="profile-links"><Link to="/reservas">Mis reservas<ArrowRight size={18} aria-hidden="true" /></Link><Link to={auth.isOwner ? '/owner' : '/propietarios'}>{auth.isOwner ? 'Mi negocio' : 'Solicitar ser Propietario'}<ArrowRight size={18} aria-hidden="true" /></Link></div></div>;
}
