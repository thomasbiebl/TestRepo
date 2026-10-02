import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { useNewsSeen } from '../state/newsSeen';

export function Layout() {
  const { user, snap } = useApp();
  const { hasUnread } = useNewsSeen(user?.id, snap?.news);
  const { pathname } = useLocation();
  const nav = useNavigate();
  useEffect(() => window.scrollTo(0, 0), [pathname]);
  const tabs = [
    { to: '/', label: 'Fahrten', icon: '🚌', end: true },
    { to: '/news', label: 'News', icon: '📰', dot: hasUnread },
    { to: '/bookings', label: 'Buchungen', icon: '🎫' },
    { to: '/profile', label: 'Profil', icon: '👤' },
    ...(user?.isAdmin ? [{ to: '/admin', label: 'Admin', icon: '⚙️' }] : []),
  ];
  const deep = pathname.startsWith('/trip/') || pathname.startsWith('/admin/');

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
            {'dot' in t && t.dot && <i className="dot" role="img" aria-label="Neu" />}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
