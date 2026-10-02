import { ArrowRight, CircleUserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';

import { useAuth } from '../auth/AuthContext.jsx';
import { GoogleIdentityButton } from '../components/GoogleIdentityButton.jsx';
import { ErrorNotice } from '../components/Feedback.jsx';
import { errorCopy } from '../lib/format.js';

export function ProfilePage() {
  const auth = useAuth();
  const [pending, setPending] = useState(false);
  const [linked, setLinked] = useState(false);
  const [error, setError] = useState(null);
  async function linkGoogle(credential) {
    if (pending) return;
    setPending(true); setError(null);
    try { await auth.linkGoogle(credential); setLinked(true); }
    catch (caught) { setError(caught); }
    finally { setPending(false); }
  }
  return <div className="profile-page"><header className="page-heading"><div><h1>Mi perfil</h1><p>La cuenta con la que reservas y consultas tus solicitudes.</p></div></header><section className="profile-card"><CircleUserRound size={38} aria-hidden="true" /><div><span>Nombre</span><strong>{auth.user.name}</strong></div><div><span>Correo</span><strong>{auth.user.email}</strong></div><div><span>Acceso</span><strong>{auth.isAdministrator ? 'Administrador' : auth.isOwner ? 'Propietario' : 'Usuario'}</strong></div></section>{import.meta.env.VITE_GOOGLE_CLIENT_ID ? <section className="profile-google"><h2>Vincular Google</h2><p>Usa Google para entrar con este mismo correo. Tu contraseña y tus Reservas seguirán disponibles.</p>{error ? <ErrorNotice>{errorCopy(error)}</ErrorNotice> : null}{linked ? <p role="status" className="notice notice-success">Google quedó vinculado a tu cuenta.</p> : <GoogleIdentityButton onCredential={linkGoogle} disabled={pending} />}</section> : null}<div className="profile-links"><Link to="/reservas">Mis reservas<ArrowRight size={18} aria-hidden="true" /></Link><Link to={auth.isOwner ? '/owner' : '/propietarios'}>{auth.isOwner ? 'Mi negocio' : 'Solicitar ser Propietario'}<ArrowRight size={18} aria-hidden="true" /></Link></div></div>;
}
