import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AdminHome } from './pages/AdminHome';
import { AdminNews } from './pages/AdminNews';
import { AdminSettings } from './pages/AdminSettings';
import { AdminTrips } from './pages/AdminTrips';
import { AdminUsers } from './pages/AdminUsers';
import { ForgotPassword, Login, Register, ResetPassword } from './pages/AuthPages';
import { MyBookings } from './pages/MyBookings';
import { News } from './pages/News';
import { Profile } from './pages/Profile';
import { TripDetail } from './pages/TripDetail';
import { Trips } from './pages/Trips';
import { useApp } from './state/AppContext';

function RequireUser() {
  const { snap, user } = useApp();
  if (!snap) return <p className="loading">Lädt …</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

function RequireAdmin() {
  const { user } = useApp();
  return user?.isAdmin ? <Outlet /> : <Navigate to="/" replace />;
}

export function App() {
  const { toast, snap, auth } = useApp();
  const nav = useNavigate();
  useEffect(() => auth.onPasswordRecovery?.(() => nav('/reset-password', { replace: true })), [auth, nav]);
  const clubName = snap?.settings.clubName;
  useEffect(() => {
    document.title = clubName ? `${clubName} Busfahrten` : 'Busfahrten';
  }, [clubName]);
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<RequireUser />}>
          <Route index element={<Trips />} />
          <Route path="trip/:id" element={<TripDetail />} />
          <Route path="news" element={<News />} />
          <Route path="bookings" element={<MyBookings />} />
          <Route path="profile" element={<Profile />} />
          <Route element={<RequireAdmin />}>
            <Route path="admin" element={<AdminHome />} />
            <Route path="admin/trips" element={<AdminTrips />} />
            <Route path="admin/users" element={<AdminUsers />} />
            <Route path="admin/news" element={<AdminNews />} />
            <Route path="admin/settings" element={<AdminSettings />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <div className="toast" role="status" aria-live="polite" data-show={toast ? 'true' : 'false'}>
        {toast}
      </div>
    </>
  );
}
