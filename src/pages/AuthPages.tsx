import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ADMIN_EMAIL, ADMIN_PASSWORD, DEMO_PASSWORD } from '../data/seed';
import { useApp } from '../state/AppContext';

function AuthFrame({ title, children }: { title: string; children: React.ReactNode }) {
  const { snap } = useApp();
  return (
    <div className="auth">
      <div className="auth-box">
        <small className="eyebrow">{snap?.settings.clubName ?? 'Fanclub'}</small>
        <h1 className="title">
          Bus<span className="accent-text">fahrten</span>
        </h1>
        <h2 className="sub">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function Login() {
  const { auth, user, reload, setSessionUser } = useApp();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await auth.login(email, password);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setSessionUser(res.user.id);
    await reload();
    nav('/', { replace: true });
  };

  const fill = (mail: string, pw: string) => {
    setEmail(mail);
    setPassword(pw);
    setError('');
  };

  return (
    <AuthFrame title="Anmelden">
      <form onSubmit={submit} className="form">
        <label htmlFor="email">E-Mail</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="password">Passwort</label>
        <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" disabled={busy}>Anmelden</button>
      </form>
      <p className="muted center">
        Noch kein Konto? <Link to="/register">Registrieren</Link>
      </p>
      <div className="card demo">
        <b>Demo-Zugänge</b>
        <p className="muted">Die Daten liegen nur in diesem Browser. Tippen zum Ausfüllen:</p>
        <div className="chips">
          <button type="button" className="chip" onClick={() => fill(ADMIN_EMAIL, ADMIN_PASSWORD)}>Admin</button>
          <button type="button" className="chip" onClick={() => fill('anna@fanclub.test', DEMO_PASSWORD)}>Mitglied (Anna)</button>
          <button type="button" className="chip" onClick={() => fill('lukas@fanclub.test', DEMO_PASSWORD)}>Kein Mitglied (Lukas)</button>
        </div>
      </div>
    </AuthFrame>
  );
}

export function Register() {
  const { auth, user, reload, setSessionUser } = useApp();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', wantsMembership: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await auth.register(form);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setSessionUser(res.user.id);
    await reload();
    nav('/', { replace: true });
  };

  return (
    <AuthFrame title="Registrieren">
      <form onSubmit={submit} className="form">
        <label htmlFor="name">Name</label>
        <input id="name" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <label htmlFor="email">E-Mail</label>
        <input id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <label htmlFor="password">Passwort (mind. 6 Zeichen)</label>
        <input id="password" type="password" autoComplete="new-password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <label className="check" htmlFor="member">
          <input id="member" type="checkbox" checked={form.wantsMembership} onChange={(e) => setForm({ ...form, wantsMembership: e.target.checked })} />
          Ich bin Vereinsmitglied (wird vom Admin bestätigt)
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" disabled={busy}>Konto erstellen</button>
      </form>
      <p className="muted center">
        Schon registriert? <Link to="/login">Anmelden</Link>
      </p>
    </AuthFrame>
  );
}
