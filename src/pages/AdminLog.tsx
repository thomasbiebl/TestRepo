import { useState } from 'react';
import { Badge } from '../components/ui';
import { AUDIT_LABEL } from '../domain/audit';
import { useApp } from '../state/AppContext';

const fmt = (iso: string) => new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Who changed what and when. Read-only, newest first. */
export function AdminLog() {
  const { snap } = useApp();
  const [filter, setFilter] = useState('');
  if (!snap) return null;
  const q = filter.trim().toLowerCase();
  const rows = [...snap.audit]
    .sort((a, b) => b.at.localeCompare(a.at))
    .filter((e) => !q || `${e.actorName} ${AUDIT_LABEL[e.action] ?? e.action} ${e.detail}`.toLowerCase().includes(q));

  return (
    <>
      <h1 className="title">Änderungsprotokoll</h1>
      <p className="muted">Hier siehst du, wer wann etwas geändert hat. Die Platzvergabe selbst und eigene Buchungen stehen nicht im Protokoll.</p>
      <div className="form">
        <label htmlFor="log-filter">Suchen</label>
        <input id="log-filter" placeholder="Name, Fahrt, Änderung …" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      {rows.length === 0 && <p className="notice">{snap.audit.length === 0 ? 'Noch keine Änderungen protokolliert.' : 'Nichts gefunden.'}</p>}
      <div className="stack">
        {rows.map((e) => (
          <article key={e.id} className="card log">
            <div className="row between">
              <Badge tone="blue">{AUDIT_LABEL[e.action] ?? e.action}</Badge>
              <span className="muted">{fmt(e.at)}</span>
            </div>
            {e.detail && <p className="prose">{e.detail}</p>}
            <span className="muted">von {e.actorName || 'System'}</span>
          </article>
        ))}
      </div>
    </>
  );
}
