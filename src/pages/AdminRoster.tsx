import { useState } from 'react';
import { Badge } from '../components/ui';
import { parseRoster } from '../domain/roster';
import { useApp } from '../state/AppContext';

/** Import of the club's member list: people on it become members as soon as they have an account. */
export function AdminRoster() {
  const { snap, act, data, notify } = useApp();
  const [text, setText] = useState('');
  const [filter, setFilter] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  if (!snap) return null;

  const parsed = parseRoster(text);
  const registered = new Set(snap.users.map((u) => u.email.toLowerCase()));
  const shown = snap.roster.filter((r) => `${r.email} ${r.name} ${r.memberNumber}`.toLowerCase().includes(filter.trim().toLowerCase())).slice(0, 50);

  const doImport = async () => {
    const res = await data.importRoster(parsed.entries);
    if (!res.ok) return notify(res.error);
    setText('');
    await act(async () => ({ ok: true }), `${res.added} neu, ${res.updated} aktualisiert, ${res.promoted} bereits registrierte Personen sind jetzt Mitglied.`);
  };

  return (
    <>
      <h1 className="title">Mitgliederliste</h1>
      <p className="muted">Füge die Liste deiner Mitglieder ein, eine Person pro Zeile, zum Beispiel aus Excel kopiert: E-Mail, Name, Mitgliedsnummer (die Reihenfolge ist egal, nur die E-Mail ist Pflicht). Wer sich mit einer dieser E-Mail-Adressen registriert, ist sofort Mitglied. Bereits registrierte Personen werden gleich zu Mitgliedern.</p>

      <section className="card form">
        <label htmlFor="r-text">Liste einfügen</label>
        <textarea id="r-text" rows={6} placeholder={'max@example.org;Max Huber;1024\nanna@example.org;Anna Maier;1025'} value={text} onChange={(e) => setText(e.target.value)} />
        {text.trim() && (
          <p className="muted">
            {parsed.entries.length} Einträge erkannt{parsed.errors.length > 0 && `, ${parsed.errors.length} Zeilen übersprungen`}.
          </p>
        )}
        {parsed.errors.slice(0, 5).map((e) => <p key={e} className="error">{e}</p>)}
        <button className="btn" disabled={parsed.entries.length === 0} onClick={() => void doImport()}>
          {parsed.entries.length > 0 ? `${parsed.entries.length} Mitglieder importieren` : 'Importieren'}
        </button>
      </section>

      <section className="card form">
        <h3>Aktuelle Liste <Badge>{snap.roster.length}</Badge></h3>
        {snap.roster.length === 0 ? (
          <p className="muted">Noch keine Liste importiert.</p>
        ) : (
          <>
            <label htmlFor="r-filter">Suchen</label>
            <input id="r-filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <ul className="people">
              {shown.map((r) => (
                <li key={r.email}>
                  <span>{r.name || r.email}<small className="muted"> · {r.email}{r.memberNumber ? ` · Nr. ${r.memberNumber}` : ''}</small></span>
                  {registered.has(r.email) && <Badge tone="green">registriert</Badge>}
                </li>
              ))}
            </ul>
            {snap.roster.length > shown.length && <p className="muted">Es werden höchstens 50 Einträge angezeigt. Nutze die Suche.</p>}
            {confirmClear ? (
              <div className="chips">
                <button className="chip danger" onClick={() => { setConfirmClear(false); void act(() => data.clearRoster(), 'Liste geleert. Bestehende Mitglieder bleiben Mitglieder.'); }}>Liste wirklich leeren</button>
                <button className="chip" onClick={() => setConfirmClear(false)}>Abbrechen</button>
              </div>
            ) : (
              <button className="chip" onClick={() => setConfirmClear(true)}>Liste leeren</button>
            )}
          </>
        )}
      </section>
    </>
  );
}
