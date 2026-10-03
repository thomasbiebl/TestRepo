import { useEffect, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { scrollToTop } from '../lib/scroll';
import { useApp } from '../state/AppContext';
import { useNewsSeen } from '../state/newsSeen';

export function Layout({ children }: { children?: ReactNode }) {
  const { user, snap } = useApp();
  const { hasUnread } = useNewsSeen(user?.id, snap?.news);
  const { pathname } = useLocation();
  const nav = useNavigate();
  useEffect(() => {
    scrollToTop();
  }, [pathname]);
  const tabs = [
    { to: '/', label: 'Fahrten', icon: '🚌', end: true },
    { to: '/news', label: 'News', icon: '📰', dot: hasUnread },
    { to: '/bookings', label: 'Buchungen', icon: '🎫' },
    { to: '/profile', label: 'Profil', icon: '👤' },
    ...(user?.isAdmin ? [{ to: '/admin', label: 'Admin', icon: '⚙️' }] : []),
  ];
  const unread = snap?.notifications.filter((n) => n.userId === user?.id && !n.readAt).length ?? 0;
  const deep = pathname.startsWith('/trip/') || pathname.startsWith('/admin/') || pathname.startsWith('/help');

  return (
    <div className="shell">
      <header className="top">
        <div className="top-inner">
          {deep ? (
            <button className="link" onClick={() => nav(-1)}>‹ Zurück</button>
          ) : (
            <small>{user ? `Servus ${user.name.split(' ')[0]}${user.isMember ? ' · Mitglied' : ''}` : ''}</small>
          )}
          <span className="top-actions">
          <Link to="/help" className="bell" aria-label="Hilfe und Anleitung">
            <span aria-hidden="true">❓</span>
          </Link>
          <Link to="/notifications" className="bell" aria-label={unread > 0 ? `Mitteilungen, ${unread} neu` : 'Mitteilungen'}>
            <span aria-hidden="true">🔔</span>
            {unread > 0 && <i className="count">{unread > 9 ? '9+' : unread}</i>}
          </Link>
          </span>
        </div>
      </header>
      <main className="page">
        {children ?? <Outlet />}
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
