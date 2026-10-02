import { useNavigate } from 'react-router-dom';
import { Badge } from '../components/ui';
import { pastTripCount } from '../domain/rules';
import { useApp } from '../state/AppContext';
import { THEMES } from '../themes';
import { useTheme } from '../themes/ThemeProvider';

export function Profile() {
  const { snap, user, now, auth, setSessionUser } = useApp();
  const { theme, setTheme } = useTheme();
  const nav = useNavigate();
  if (!snap || !user) return null;

  const logout = () => {
    auth.logout();
    setSessionUser(null);
    nav('/login', { replace: true });
  };

  return (
    <>
      <h1 className="title">Profil</h1>
      <div className="stack">
        <section className="card">
          <h3>{user.name}</h3>
          <p className="muted">{user.email}</p>
          <div className="chips">
            {user.isMember ? <Badge tone="green">Mitglied</Badge> : user.memberRequested ? <Badge>Mitgliedschaft in Prüfung</Badge> : <Badge>Kein Mitglied</Badge>}
            {user.isAdmin && <Badge tone="red">Admin</Badge>}
          </div>
          <p className="muted">Bisherige Fahrten: <b>{pastTripCount(user, snap.trips, snap.bookings, now)}</b></p>
        </section>

        <section className="card">
          <h3>Design</h3>
          <div className="themes" role="radiogroup" aria-label="Design">
            {THEMES.map((t) => (
              <button key={t.id} role="radio" aria-checked={theme === t.id} className="theme" data-on={theme === t.id} onClick={() => setTheme(t.id)}>
                <span className="swatches" aria-hidden="true">
                  {t.swatches.map((c) => <i key={c} style={{ background: c }} />)}
                </span>
                <b>{t.label}</b>
                <small>{t.description}</small>
              </button>
            ))}
          </div>
        </section>

        <button className="btn ghost" onClick={logout}>Abmelden</button>
      </div>
    </>
  );
}
