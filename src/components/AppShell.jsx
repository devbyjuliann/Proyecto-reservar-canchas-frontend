import {
  CalendarDays,
  CircleUserRound,
  DoorOpen,
  MapPinned,
  Menu,
  Building2,
  ClipboardList,
  Search,
  ShieldCheck,
  TicketCheck,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext.jsx';

const userLinks = [
  { to: '/', label: 'Marketplace', icon: CalendarDays },
  { to: '/reservas', label: 'Mis reservas', icon: TicketCheck },
  { to: '/perfil', label: 'Perfil', icon: CircleUserRound },
];
const adminLinks = [
  { to: '/admin', label: 'Instalaciones', icon: MapPinned },
  { to: '/admin/solicitudes', label: 'Solicitudes de Propietario', icon: ClipboardList },
  { to: '/admin/propietarios', label: 'Propietarios', icon: Building2 },
  { to: '/admin/conflictos', label: 'Conflictos', icon: ShieldCheck },
];

export function AppShell({ children }) {
  const location = useLocation();
  return location.pathname.startsWith('/admin')
    ? <AdminShell>{children}</AdminShell>
    : <MarketplaceShell>{children}</MarketplaceShell>;
}

function MarketplaceShell({ children }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    await auth.logout();
    setOpen(false);
    navigate('/');
  }

  return (
    <div className="market-frame">
      <a className="skip-link" href="#contenido">Saltar al contenido</a>
      <header className="market-header">
        <div className="market-header-inner">
          <Brand />
          <button className="icon-button market-menu-button" type="button" aria-label={open ? 'Cerrar navegación' : 'Abrir navegación'} aria-controls="market-navigation" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{open ? <X /> : <Menu />}</button>
          <nav id="market-navigation" className={`market-nav ${open ? 'is-open' : ''}`} aria-label="Navegación principal" onClick={() => setOpen(false)}>
            <NavLink end to="/" className={({ isActive }) => `market-nav-link ${isActive ? 'active' : ''}`}><Search size={17} aria-hidden="true" />Marketplace</NavLink>
            {auth.status === 'authenticated' ? <NavLink to="/reservas" className={({ isActive }) => `market-nav-link ${isActive ? 'active' : ''}`}><TicketCheck size={17} aria-hidden="true" />Mis reservas</NavLink> : null}
            {auth.status === 'authenticated' ? <NavLink to="/perfil" className={({ isActive }) => `market-nav-link ${isActive ? 'active' : ''}`}><CircleUserRound size={17} aria-hidden="true" />Perfil</NavLink> : null}
            {auth.status === 'authenticated' && !auth.isOwner ? <NavLink to="/propietarios" className={({ isActive }) => `market-nav-link ${isActive ? 'active' : ''}`}>Ser Propietario</NavLink> : null}
            {auth.isOwner ? <NavLink to="/owner" className={({ isActive }) => `market-nav-link ${isActive ? 'active' : ''}`}><Building2 size={17} aria-hidden="true" />Mi negocio</NavLink> : null}
            {auth.isAdministrator ? <NavLink to="/admin" className="market-nav-link"><ShieldCheck size={17} aria-hidden="true" />Administración</NavLink> : null}
            <div className="market-account">
              {auth.status === 'authenticated' ? <><span className="market-account-name">{auth.user.name}</span><button type="button" className="market-nav-link" onClick={handleLogout}><DoorOpen size={17} aria-hidden="true" />Cerrar sesión</button></> : <><NavLink to="/acceso" className="market-nav-link">Iniciar sesión</NavLink><NavLink to="/registro" className="market-register">Crear cuenta</NavLink></>}
            </div>
          </nav>
        </div>
      </header>
      <main id="contenido" className="market-main">{children}</main>
    </div>
  );
}

function AdminShell({ children }) {
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
          {auth.isAdministrator ? <NavGroup label="Administración" links={adminLinks} /> : null}
          <NavGroup label="Cuenta" links={userLinks} />
        </nav>
        <div className="rail-account">
          {auth.status === 'authenticated' ? (
            <>
              <div className="account-name"><CircleUserRound size={18} /><span><strong>{auth.user.name}</strong><small>{auth.isAdministrator ? 'Administrador' : auth.isOwner ? 'Propietario' : 'Usuario'}</small></span></div>
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
