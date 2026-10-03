import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { useAuth } from './auth/AuthContext.jsx';
import { AppShell } from './components/AppShell.jsx';
import { LoadingBlock } from './components/Feedback.jsx';
import { AdminConflictsPage } from './pages/admin/AdminConflictsPage.jsx';
import { AdminCourtPage } from './pages/admin/AdminCourtPage.jsx';
import { AdminFacilitiesPage } from './pages/admin/AdminFacilitiesPage.jsx';
import { AdminFacilityPage } from './pages/admin/AdminFacilityPage.jsx';
import { AdminOwnerApplicationsPage } from './pages/admin/AdminOwnerApplicationsPage.jsx';
import { AdminOwnersPage } from './pages/admin/AdminOwnersPage.jsx';
import { AdminOwnerPage } from './pages/admin/AdminOwnerPage.jsx';
import { AuthPage } from './pages/AuthPage.jsx';
import { PasswordResetConfirmPage, PasswordResetRequestPage } from './pages/PasswordResetPage.jsx';
import { CourtDetailPage } from './pages/CourtDetailPage.jsx';
import { FacilityDetailPage } from './pages/FacilityDetailPage.jsx';
import { MarketplacePage } from './pages/MarketplacePage.jsx';
import { OwnerIntroPage } from './pages/OwnerIntroPage.jsx';
import { OwnerDashboardPage } from './pages/OwnerDashboardPage.jsx';
import { OwnerFacilityPage } from './pages/OwnerFacilityPage.jsx';
import { OwnerCourtPage } from './pages/OwnerCourtPage.jsx';
import { OwnerBookingsPage } from './pages/OwnerBookingsPage.jsx';
import { ProfilePage } from './pages/ProfilePage.jsx';
import { MyBookingsPage } from './pages/MyBookingsPage.jsx';
import { PaymentReturnPage } from './pages/PaymentReturnPage.jsx';

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<MarketplacePage />} />
        <Route path="/acceso" element={<AuthPage />} />
        <Route path="/registro" element={<AuthPage />} />
        <Route path="/recuperar-password" element={<PasswordResetRequestPage />} />
        <Route path="/reset-password" element={<PasswordResetConfirmPage />} />
        <Route path="/instalaciones/:facilityId" element={<FacilityDetailPage />} />
        <Route path="/canchas/:courtId" element={<CourtDetailPage />} />
        <Route path="/propietarios" element={<RequireAuth><OwnerIntroPage /></RequireAuth>} />
        <Route path="/reservas" element={<RequireAuth><MyBookingsPage /></RequireAuth>} />
        <Route path="/reservas/pago" element={<RequireAuth><PaymentReturnPage /></RequireAuth>} />
        <Route path="/perfil" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="/owner" element={<RequireOwner><OwnerDashboardPage /></RequireOwner>} />
        <Route path="/owner/reservas" element={<RequireOwner><OwnerBookingsPage /></RequireOwner>} />
        <Route path="/owner/instalaciones/:facilityId" element={<RequireOwner><OwnerFacilityPage /></RequireOwner>} />
        <Route path="/owner/facilities/:facilityId" element={<RequireOwner><OwnerFacilityPage /></RequireOwner>} />
        <Route path="/owner/canchas/:courtId" element={<RequireOwner><OwnerCourtPage /></RequireOwner>} />
        <Route path="/admin" element={<RequireAdmin><AdminFacilitiesPage /></RequireAdmin>} />
        <Route path="/admin/instalaciones/:facilityId" element={<RequireAdmin><AdminFacilityPage /></RequireAdmin>} />
        <Route path="/admin/canchas/:courtId" element={<RequireAdmin><AdminCourtPage /></RequireAdmin>} />
        <Route path="/admin/conflictos" element={<RequireAdmin><AdminConflictsPage /></RequireAdmin>} />
        <Route path="/admin/solicitudes" element={<RequireAdmin><AdminOwnerApplicationsPage /></RequireAdmin>} />
        <Route path="/admin/propietarios" element={<RequireAdmin><AdminOwnersPage /></RequireAdmin>} />
        <Route path="/admin/propietarios/:ownerId" element={<RequireAdmin><AdminOwnerPage /></RequireAdmin>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

function RequireAuth({ children }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === 'loading') return <div className="page-narrow"><LoadingBlock label="Comprobando sesión" /></div>;
  if (auth.status !== 'authenticated') return <Navigate to="/acceso" state={{ from: `${location.pathname}${location.search}` }} replace />;
  return children;
}

function RequireAdmin({ children }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === 'loading') return <div className="page-narrow"><LoadingBlock label="Comprobando permisos" /></div>;
  if (auth.status !== 'authenticated') return <Navigate to="/acceso" state={{ from: `${location.pathname}${location.search}` }} replace />;
  if (!auth.isAdministrator) return <Navigate to="/" replace />;
  return children;
}

function RequireOwner({ children }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === 'loading') return <div className="page-narrow"><LoadingBlock label="Comprobando acceso al negocio" /></div>;
  if (auth.status !== 'authenticated') return <Navigate to="/acceso" state={{ from: `${location.pathname}${location.search}` }} replace />;
  if (!auth.isOwner) return <Navigate to="/propietarios" replace />;
  return children;
}
