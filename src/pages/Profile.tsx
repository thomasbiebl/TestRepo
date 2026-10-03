import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge } from '../components/ui';
import { buildMyExport } from '../domain/exports';
import { noShowCount, pastTripCount, userScore } from '../domain/rules';
import { downloadFile } from '../lib/download';
import { HELP_LINKS } from '../help/sections';
import { useApp } from '../state/AppContext';
import { THEMES } from '../themes';
import { useTheme } from '../themes/ThemeProvider';

export function Profile() {
  const { snap, user, now, auth, data, act, notify, setSessionUser } = useApp();
  const { theme, setTheme } = useTheme();
  const nav = useNavigate();
  const [name, setName] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [code, setCode] = useState('');
  if (!snap || !user) return null;

  const leave = () => {
    auth.logout();
    setSessionUser(null);
    nav('/login', { replace: true });
  };

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    if (await act(() => data.updateMyName(user.id, name ?? user.name), 'Name gespeichert.')) setName(null);
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    const res = await auth.updatePassword(password);
    if (!res.ok) return setPwError(res.error);
    setPwError('');
    setPassword('');
    notify('Passwort geändert.');
  };

  const exportData = () => {
    const file = JSON.stringify(buildMyExport(snap, user), null, 2);
    downloadFile('meine-daten.json', file, 'application/json');
  };

  const deleteAccount = async () => {
    const res = await data.deleteMyAccount(user.id);
    if (!res.ok) {
      setConfirmDelete(false);
      return notify(res.error);
    }
    leave();
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
          <p className="muted">
            Bisherige Fahrten: <b>{pastTripCount(user, snap.trips, snap.bookings, now)}</b> · Punkte für die Platzvergabe: <b>{userScore(user, snap.trips, snap.bookings, now, snap.settings)}</b>
            {noShowCount(user, snap.trips, snap.bookings, now) > 0 && ` · Nicht erschienen: ${noShowCount(user, snap.trips, snap.bookings, now)}`}
          </p>
        </section>

        {!user.isMember && (
          <form className="card form" onSubmit={async (e) => { e.preventDefault(); if (await act(() => data.redeemMemberCode(user.id, code), 'Willkommen bei den Mitgliedern!')) setCode(''); }}>
            <h3>Mitgliedscode</h3>
            <label htmlFor="p-code">Hast du einen Code vom Verein?</label>
            <input id="p-code" autoComplete="off" autoCapitalize="off" required value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn ghost">Code einlösen</button>
          </form>
        )}

        <form className="card form" onSubmit={saveName}>
          <h3>Name ändern</h3>
          <label htmlFor="p-name">Name</label>
          <input id="p-name" required value={name ?? user.name} onChange={(e) => setName(e.target.value)} />
          <button className="btn ghost" disabled={name === null || name.trim() === user.name}>Name speichern</button>
        </form>

        <form className="card form" onSubmit={savePassword}>
          <h3>Passwort ändern</h3>
          <label htmlFor="p-pw">Neues Passwort (mind. 6 Zeichen)</label>
          <input id="p-pw" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
          {pwError && <p className="error" role="alert">{pwError}</p>}
          <button className="btn ghost">Passwort speichern</button>
        </form>

        {!auth.isDemo && (
          <section className="card form">
            <h3>E-Mail-Benachrichtigungen</h3>
            <label className="check" htmlFor="mail-personal">
              <input id="mail-personal" type="checkbox" checked={user.emailPersonal}
                onChange={(e) => void act(() => data.updateNotificationPrefs(user.id, { emailPersonal: e.target.checked, emailBroadcast: user.emailBroadcast }), 'Gespeichert.')} />
              Wenn mein Platz vergeben wird, ich nachrücke oder eine Fahrt abgesagt wird
            </label>
            <label className="check" htmlFor="mail-broadcast">
              <input id="mail-broadcast" type="checkbox" checked={user.emailBroadcast}
                onChange={(e) => void act(() => data.updateNotificationPrefs(user.id, { emailPersonal: user.emailPersonal, emailBroadcast: e.target.checked }), 'Gespeichert.')} />
              Bei neuen Fahrten und News
            </label>
            <p className="muted">Mitteilungen in der App bekommst du immer.</p>
          </section>
        )}

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

        <section className="card">
          <h3>Hilfe und Anleitung</h3>
          <p className="muted">Wie die App funktioniert, wie die Plätze vergeben werden und was bei Problemen hilft.</p>
          <Link className="btn ghost" to={HELP_LINKS.start}>Anleitung öffnen</Link>
        </section>

        <section className="card">
          <h3>Deine Daten</h3>
          <p className="muted">Lade alles herunter, was wir über dich gespeichert haben.</p>
          <button className="btn ghost" onClick={exportData}>Meine Daten herunterladen</button>
        </section>

        <button className="btn ghost" onClick={leave}>Abmelden</button>

        <section className="card danger-zone">
          <h3>Konto löschen</h3>
          <p className="muted">Dein Konto und alle deine Buchungen werden endgültig gelöscht. Das lässt sich nicht rückgängig machen.</p>
          {confirmDelete ? (
            <div className="chips">
              <button className="chip danger" onClick={() => void deleteAccount()}>Ja, Konto endgültig löschen</button>
              <button className="chip" onClick={() => setConfirmDelete(false)}>Abbrechen</button>
            </div>
          ) : (
            <button className="chip" onClick={() => setConfirmDelete(true)}>Konto löschen …</button>
          )}
        </section>
      </div>
    </>
  );
}
