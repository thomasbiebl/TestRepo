import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { HELP_LINKS } from '../help/sections';
import { ADMIN_EMAIL, ADMIN_PASSWORD, DEMO_PASSWORD } from '../data/seed';
import { useApp } from '../state/AppContext';

const PROVIDER_LABEL = { google: 'Google', apple: 'Apple', facebook: 'Facebook' } as const;

function SocialButtons({ onError }: { onError: (message: string) => void }) {
  const { auth } = useApp();
  if (!auth.oauthProviders?.length || !auth.loginWithProvider) return null;
  return (
    <div className="social">
      {auth.oauthProviders.map((p) => (
        <button key={p} type="button" className="btn ghost" onClick={async () => {
          const res = await auth.loginWithProvider?.(p);
          if (res && !res.ok) onError(res.error);
        }}>
          Weiter mit {PROVIDER_LABEL[p]}
        </button>
      ))}
      <p className="muted center">oder mit E-Mail</p>
    </div>
  );
}

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
    setSessionUser(res.userId);
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
      <SocialButtons onError={setError} />
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
        {auth.resetPassword && <> · <Link to="/forgot-password">Passwort vergessen?</Link></>}
      </p>
      <p className="muted center"><Link to={HELP_LINKS.start}>Anleitung ansehen</Link></p>
      {auth.isDemo && <div className="card demo">
        <b>Demo-Zugänge</b>
        <p className="muted">Die Daten liegen nur in diesem Browser. Tippen zum Ausfüllen:</p>
        <div className="chips">
          <button type="button" className="chip" onClick={() => fill(ADMIN_EMAIL, ADMIN_PASSWORD)}>Admin</button>
          <button type="button" className="chip" onClick={() => fill('anna@fanclub.test', DEMO_PASSWORD)}>Mitglied (Anna)</button>
          <button type="button" className="chip" onClick={() => fill('lukas@fanclub.test', DEMO_PASSWORD)}>Kein Mitglied (Lukas)</button>
        </div>
      </div>}
    </AuthFrame>
  );
}

export function Register() {
  const { auth, user, reload, setSessionUser } = useApp();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', wantsMembership: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await auth.register(form);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (!res.userId) return setConfirmEmail(true);
    setSessionUser(res.userId);
    await reload();
    nav('/', { replace: true });
  };

  if (confirmEmail) {
    return (
      <AuthFrame title="Fast geschafft">
        <p className="notice">
          Wir haben dir eine E-Mail an <b>{form.email}</b> geschickt. Bitte öffne den Link darin, um dein Konto zu bestätigen. Danach kannst du dich anmelden.
        </p>
        <Link className="btn" to="/login">Zur Anmeldung</Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame title="Registrieren">
      <SocialButtons onError={setError} />
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
        Schon registriert? <Link to="/login">Anmelden</Link> · <Link to={HELP_LINKS.start}>Anleitung</Link>
      </p>
    </AuthFrame>
  );
}

export function ForgotPassword() {
  const { auth } = useApp();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const res = await auth.resetPassword?.(email);
    if (res && !res.ok) return setError(res.error);
    setSent(true);
  };

  return (
    <AuthFrame title="Passwort zurücksetzen">
      {sent ? (
        <p className="notice">Wenn die Adresse bei uns registriert ist, haben wir dir einen Link zum Zurücksetzen geschickt.</p>
      ) : (
        <form onSubmit={submit} className="form">
          <label htmlFor="email">E-Mail</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn">Link senden</button>
        </form>
      )}
      <p className="muted center"><Link to="/login">Zur Anmeldung</Link></p>
    </AuthFrame>
  );
}

export function ResetPassword() {
  const { auth, reload, notify } = useApp();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return setError('Das Passwort braucht mindestens 6 Zeichen.');
    const res = await auth.updatePassword?.(password);
    if (res && !res.ok) return setError(res.error);
    notify('Passwort geändert.');
    await reload();
    nav('/', { replace: true });
  };

  return (
    <AuthFrame title="Neues Passwort">
      <form onSubmit={submit} className="form">
        <label htmlFor="password">Neues Passwort (mind. 6 Zeichen)</label>
        <input id="password" type="password" autoComplete="new-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn">Passwort speichern</button>
      </form>
    </AuthFrame>
  );
}
