import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppContext';

export function Layout() {
  const { user } = useApp();
  const { pathname } = useLocation();
  const nav = useNavigate();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  const tabs = [
    { to: '/', label: 'Fahrten', icon: '🚌', end: true },
    { to: '/bookings', label: 'Buchungen', icon: '🎫' },
    { to: '/profile', label: 'Profil', icon: '👤' },
    ...(user?.isAdmin ? [{ to: '/admin', label: 'Admin', icon: '⚙️' }] : []),
  ];
  const deep = pathname.startsWith('/trip/') || pathname === '/admin/trips' || pathname === '/admin/users';

  return (
    <div className="shell">
      <header className="top">
        <div className="top-inner">
          {deep ? (
            <button className="link" onClick={() => nav(-1)}>‹ Zurück</button>
          ) : (
            <small>{user ? `Servus ${user.name.split(' ')[0]}${user.isMember ? ' · Mitglied' : ''}` : ''}</small>
          )}
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
      <nav className="tabs" aria-label="Hauptnavigation">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.end} className="tab">
            <b aria-hidden="true">{t.icon}</b>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
