import {
  CalendarDays,
  CircleUserRound,
  DoorOpen,
  MapPinned,
  Menu,
  ShieldCheck,
  TicketCheck,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext.jsx';

const userLinks = [
  { to: '/', label: 'Buscar turno', icon: CalendarDays },
  { to: '/reservas', label: 'Mis reservas', icon: TicketCheck },
];
const adminLinks = [
  { to: '/admin', label: 'Instalaciones', icon: MapPinned },
  { to: '/admin/conflictos', label: 'Conflictos', icon: ShieldCheck },
];

export function AppShell({ children }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    await auth.logout();
    setOpen(false);
    navigate('/');
  }

  return (
    <div className="app-frame">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <header className="mobile-header">
        <Brand />
        <button className="icon-button" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Abrir navegación">
          {open ? <X /> : <Menu />}
        </button>
      </header>
      <aside className={`app-rail ${open ? 'is-open' : ''}`}>
        <Brand />
        <nav aria-label="Navegación principal" onClick={() => setOpen(false)}>
          <NavGroup links={userLinks} />
          {auth.isAdministrator ? <NavGroup label="Operación" links={adminLinks} /> : null}
        </nav>
        <div className="rail-account">
          {auth.status === 'authenticated' ? (
            <>
              <div className="account-name"><CircleUserRound size={18} /><span><strong>{auth.user.name}</strong><small>{auth.isAdministrator ? 'Administrador' : 'Usuario'}</small></span></div>
              <button className="rail-action" type="button" onClick={handleLogout}><DoorOpen size={17} />Cerrar sesión</button>
            </>
          ) : (
            <NavLink className="rail-action rail-login" to="/acceso" onClick={() => setOpen(false)}><CircleUserRound size={17} />Ingresar</NavLink>
          )}
        </div>
      </aside>
      <main id="contenido" className="app-main">{children}</main>
      {open ? <button className="rail-scrim" type="button" aria-label="Cerrar navegación" onClick={() => setOpen(false)} /> : null}
    </div>
  );
}

function Brand() {
  return (
    <NavLink className="brand" to="/" aria-label="Reserva Canchas, inicio">
      <span className="brand-mark" aria-hidden="true"><i /><i /></span>
      <span>Reserva<br />Canchas</span>
    </NavLink>
  );
}

function NavGroup({ label, links }) {
  return (
    <div className="nav-group">
      {label ? <p>{label}</p> : null}
      {links.map(({ to, label: itemLabel, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/' || to === '/admin'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
          <Icon size={19} aria-hidden="true" />
          <span>{itemLabel}</span>
        </NavLink>
      ))}
    </div>
  );
}
