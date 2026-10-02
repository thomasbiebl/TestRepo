import { useState, type FormEvent } from 'react';
import { validateSettings } from '../domain/rules';
import { DEFAULT_SETTINGS, type Settings } from '../domain/types';
import { useApp } from '../state/AppContext';

type Draft = Record<'clubName' | 'interestDays' | 'defaultSeats' | 'defaultPrice' | 'defaultMeetingPoint', string> &
  Pick<Settings, 'guestsMayBook' | 'waitlistEnabled'>;

const toDraft = (s: Settings): Draft => ({
  clubName: s.clubName,
  interestDays: String(s.interestDays),
  defaultSeats: String(s.defaultSeats),
  defaultPrice: String(s.defaultPrice),
  defaultMeetingPoint: s.defaultMeetingPoint,
  guestsMayBook: s.guestsMayBook,
  waitlistEnabled: s.waitlistEnabled,
});

const fromDraft = (d: Draft): Settings => ({
  clubName: d.clubName,
  interestDays: Number(d.interestDays),
  defaultSeats: Number(d.defaultSeats),
  defaultPrice: Number(d.defaultPrice),
  defaultMeetingPoint: d.defaultMeetingPoint,
  guestsMayBook: d.guestsMayBook,
  waitlistEnabled: d.waitlistEnabled,
});

export function AdminSettings() {
  const { snap, act, data } = useApp();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  if (!snap) return null;
  const d = draft ?? toDraft(snap.settings);
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => setDraft({ ...d, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next = fromDraft(d);
    const problem = validateSettings(next);
    setError(problem ?? '');
    if (problem) return;
    if (await act(() => data.saveSettings(next), 'Einstellungen gespeichert.')) setDraft(null);
  };

  return (
    <>
      <h1 className="title">Einstellungen</h1>
      <form className="stack" onSubmit={submit}>
        <section className="card form">
          <h3>Verein</h3>
          <label htmlFor="s-name">Vereinsname</label>
          <input id="s-name" required value={d.clubName} onChange={set('clubName')} />
        </section>

        <section className="card form">
          <h3>Platzvergabe</h3>
          <label htmlFor="s-days">Vorlauf für Mitglieder (Tage)</label>
          <input id="s-days" type="number" inputMode="numeric" min={0} max={30} step={1} required value={d.interestDays} onChange={set('interestDays')} />
          <p className="muted">So lange können nur Mitglieder Interesse bekunden, bevor die Plätze vergeben werden. 0 vergibt sofort, alle können gleich buchen. Gilt für neu angelegte Fahrten, bestehende behalten ihre Frist.</p>
          <label className="check" htmlFor="s-guests">
            <input id="s-guests" type="checkbox" checked={d.guestsMayBook} onChange={(e) => setDraft({ ...d, guestsMayBook: e.target.checked })} />
            Nicht-Mitglieder dürfen nach der Vergabe freie Plätze buchen
          </label>
          <label className="check" htmlFor="s-wait">
            <input id="s-wait" type="checkbox" checked={d.waitlistEnabled} onChange={(e) => setDraft({ ...d, waitlistEnabled: e.target.checked })} />
            Warteliste bei ausgebuchten Fahrten
          </label>
        </section>

        <section className="card form">
          <h3>Vorgaben für neue Fahrten</h3>
          <div className="row">
            <div className="grow">
              <label htmlFor="s-seats">Plätze</label>
              <input id="s-seats" type="number" inputMode="numeric" min={1} step={1} required value={d.defaultSeats} onChange={set('defaultSeats')} />
            </div>
            <div className="grow">
              <label htmlFor="s-price">Preis (€)</label>
              <input id="s-price" type="number" inputMode="decimal" min={0} step="0.5" required value={d.defaultPrice} onChange={set('defaultPrice')} />
            </div>
          </div>
          <label htmlFor="s-meet">Treffpunkt</label>
          <input id="s-meet" required value={d.defaultMeetingPoint} onChange={set('defaultMeetingPoint')} />
        </section>

        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn">Speichern</button>
        <button type="button" className="btn ghost" onClick={() => { setDraft(toDraft(DEFAULT_SETTINGS)); setError(''); }}>Standardwerte einsetzen</button>
      </form>
    </>
  );
}
