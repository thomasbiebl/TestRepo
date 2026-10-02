import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AdminHome } from './pages/AdminHome';
import { AdminTrips } from './pages/AdminTrips';
import { AdminUsers } from './pages/AdminUsers';
import { Login, Register } from './pages/AuthPages';
import { MyBookings } from './pages/MyBookings';
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
  const { toast } = useApp();
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<RequireUser />}>
          <Route index element={<Trips />} />
          <Route path="trip/:id" element={<TripDetail />} />
          <Route path="bookings" element={<MyBookings />} />
          <Route path="profile" element={<Profile />} />
          <Route element={<RequireAdmin />}>
            <Route path="admin" element={<AdminHome />} />
            <Route path="admin/trips" element={<AdminTrips />} />
            <Route path="admin/users" element={<AdminUsers />} />
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
