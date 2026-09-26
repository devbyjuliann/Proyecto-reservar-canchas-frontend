import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from './auth/AuthContext.jsx';
import { AppShell } from './components/AppShell.jsx';
import { LoadingBlock } from './components/Feedback.jsx';
import { AdminConflictsPage } from './pages/admin/AdminConflictsPage.jsx';
import { AdminCourtPage } from './pages/admin/AdminCourtPage.jsx';
import { AdminFacilitiesPage } from './pages/admin/AdminFacilitiesPage.jsx';
import { AdminFacilityPage } from './pages/admin/AdminFacilityPage.jsx';
import { AuthPage } from './pages/AuthPage.jsx';
import { BookingPage } from './pages/BookingPage.jsx';
import { MyBookingsPage } from './pages/MyBookingsPage.jsx';

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<BookingPage />} />
        <Route path="/acceso" element={<AuthPage />} />
        <Route path="/reservas" element={<RequireAuth><MyBookingsPage /></RequireAuth>} />
        <Route path="/admin" element={<RequireAdmin><AdminFacilitiesPage /></RequireAdmin>} />
        <Route path="/admin/instalaciones/:facilityId" element={<RequireAdmin><AdminFacilityPage /></RequireAdmin>} />
        <Route path="/admin/canchas/:courtId" element={<RequireAdmin><AdminCourtPage /></RequireAdmin>} />
        <Route path="/admin/conflictos" element={<RequireAdmin><AdminConflictsPage /></RequireAdmin>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

function RequireAuth({ children }) {
  const auth = useAuth();
  if (auth.status === 'loading') return <div className="page-narrow"><LoadingBlock label="Comprobando sesión" /></div>;
  if (auth.status !== 'authenticated') return <Navigate to="/acceso" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const auth = useAuth();
  if (auth.status === 'loading') return <div className="page-narrow"><LoadingBlock label="Comprobando permisos" /></div>;
  if (auth.status !== 'authenticated') return <Navigate to="/acceso" replace />;
  if (!auth.isAdministrator) return <Navigate to="/" replace />;
  return children;
}
