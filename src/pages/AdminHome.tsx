import { Link } from 'react-router-dom';
import { getTripPhase } from '../domain/rules';
import { HELP_LINKS } from '../help/sections';
import { useApp } from '../state/AppContext';

export function AdminHome() {
  const { snap, now, data, act } = useApp();
  if (!snap) return null;
  const active = snap.trips.filter((t) => ['interest', 'open'].includes(getTripPhase(t, now))).length;
  const members = snap.users.filter((u) => u.isMember).length;
  const requests = snap.users.filter((u) => u.memberRequested).length;
  const waiting = snap.bookings.filter((b) => b.status === 'waitlist').length;

  return (
    <>
      <h1 className="title">Admin</h1>
      <div className="kpi">
        <div><b>{active}</b><span>aktive Fahrten</span></div>
        <div><b>{snap.users.length}</b><span>Benutzer</span></div>
        <div><b>{members}</b><span>Mitglieder</span></div>
        <div><b>{waiting}</b><span>auf Wartelisten</span></div>
      </div>
      {requests > 0 && <p className="notice">{requests} Mitgliedschaftsanfrage{requests > 1 ? 'n' : ''} warten auf dich.</p>}
      <div className="stack">
        <Link className="btn" to="/admin/trips">Fahrten verwalten</Link>
        <Link className="btn ghost" to="/admin/users">Benutzer verwalten</Link>
        <Link className="btn ghost" to="/admin/roster">Mitgliederliste importieren</Link>
        <Link className="btn ghost" to="/admin/news">News verwalten</Link>
        <Link className="btn ghost" to="/admin/settings">Einstellungen</Link>
        <Link className="btn ghost" to="/admin/log">Änderungsprotokoll</Link>
        <Link className="btn ghost" to={HELP_LINKS.admin}>Anleitung für Admins</Link>
      </div>
      {data.resetDemo && (
        <>
          <h2 className="sub">Testhilfen</h2>
          <p className="muted">Setzt alle Daten in diesem Browser auf die Demo-Daten zurück.</p>
          <button className="btn ghost" onClick={() => void data.resetDemo?.().then(() => act(async () => ({ ok: true }), 'Demo-Daten wiederhergestellt.'))}>
            Demo-Daten zurücksetzen
          </button>
        </>
      )}
    </>
  );
}
