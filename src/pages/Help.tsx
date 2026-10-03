import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Loading } from '../components/Loading';
import { DEFAULT_SETTINGS } from '../domain/types';
import { adminSections } from '../help/AdminHelp';
import { userSections } from '../help/UserHelp';
import { useApp } from '../state/AppContext';

/** The built-in guide: for members and guests, and for admins (with the full booking logic). */
export function Help() {
  const { snap, user } = useApp();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const isAdmin = !!user?.isAdmin;
  const tab = params.get('tab') === 'admin' && isAdmin ? 'admin' : 'user';
  const openId = params.get('open');
  const settings = snap?.settings ?? DEFAULT_SETTINGS;

  const sections = useMemo(() => (tab === 'admin' ? adminSections(settings) : userSections(settings)), [tab, settings]);
  const q = query.trim().toLowerCase();
  const shown = q ? sections.filter((s) => `${s.title} ${s.keywords}`.toLowerCase().includes(q)) : sections;

  // Opens and scrolls to the section named in ?open=... once the page is there.
  useEffect(() => {
    if (!openId) return;
    const el = document.getElementById(`help-${openId}`);
    if (el instanceof HTMLDetailsElement) {
      el.open = true;
      el.scrollIntoView({ block: 'start' });
    }
  }, [openId, tab]);

  const setTab = (next: 'user' | 'admin') => setParams(next === 'admin' ? { tab: 'admin' } : {}, { replace: true });
  const setAll = (open: boolean) => document.querySelectorAll<HTMLDetailsElement>('.help details').forEach((d) => { d.open = open; });
  const print = () => {
    setAll(true);
    window.print();
  };

  return (
    <div className="help">
      <h1 className="title">Hilfe</h1>
      <p className="muted">{tab === 'admin' ? 'Anleitung für Admins mit der genauen Buchungslogik.' : `So benutzt du die App${snap ? ` von ${snap.settings.clubName}` : ''}.`}</p>

      {isAdmin && (
        <div className="seg no-print" role="tablist" aria-label="Bereich">
          <button role="tab" aria-selected={tab === 'user'} className="chip" aria-pressed={tab === 'user'} onClick={() => setTab('user')}>Für Mitglieder</button>
          <button role="tab" aria-selected={tab === 'admin'} className="chip" aria-pressed={tab === 'admin'} onClick={() => setTab('admin')}>Für Admins</button>
        </div>
      )}

      <div className="form no-print">
        <label htmlFor="help-search">Suchen</label>
        <input id="help-search" type="search" placeholder="z. B. Warteliste, Punkte, stornieren" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="chips no-print">
        <button className="chip" onClick={() => setAll(true)}>Alles aufklappen</button>
        <button className="chip" onClick={() => setAll(false)}>Alles zuklappen</button>
        <button className="chip" onClick={print}>Drucken</button>
      </div>

      {shown.length === 0 && <p className="notice">Dazu habe ich nichts gefunden. Probiere ein anderes Wort.</p>}
      <div className="stack">
        {shown.map((s) => (
          <details key={`${tab}-${s.id}`} id={`help-${s.id}`} open={q ? true : undefined}>
            <summary>{s.title}</summary>
            <div className="help-body">{s.body}</div>
          </details>
        ))}
      </div>
    </div>
  );
}

/** Reachable with and without login. Logged in, it sits inside the normal layout with the tab bar. */
export function HelpPage() {
  const { snap, user } = useApp();
  if (!snap) return <Loading />;
  if (user) return <Layout><Help /></Layout>;
  return (
    <div className="shell">
      <main className="page">
        <Link to="/login" className="link-plain">‹ Zur Anmeldung</Link>
        <Help />
      </main>
    </div>
  );
}
