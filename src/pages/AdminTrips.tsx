import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PhaseBadge, StatusBadge, fmtDate } from '../components/ui';
import type { TripInput } from '../data/DataService';
import { byTrip, confirmedCount, getTripPhase, pastTripCount } from '../domain/rules';
import type { Settings, Trip } from '../domain/types';
import { useApp } from '../state/AppContext';

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface FormState { title: string; departure: string; meetingPoint: string; price: string; seats: string; kickoff: string; returnTime: string; notes: string; stops: string; buses: string; points: string }

const emptyForm = (s: Settings): FormState => {
  const d = new Date(Date.now() + 14 * 86_400_000);
  d.setHours(8, 0, 0, 0);
  return { title: '', departure: toLocalInput(d.toISOString()), meetingPoint: s.defaultMeetingPoint, price: String(s.defaultPrice), seats: String(s.defaultSeats), kickoff: '', returnTime: '', notes: '', stops: '', buses: '1', points: '1' };
};

function TripForm({ initial, onSubmit, onCancel }: { initial: FormState; onSubmit: (i: TripInput) => void; onCancel: () => void }) {
  const [f, setF] = useState(initial);
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      title: f.title.trim(),
      departure: new Date(f.departure).toISOString(),
      meetingPoint: f.meetingPoint.trim(),
      price: Math.max(0, Number(f.price) || 0),
      seats: Math.floor(Number(f.seats) || 0),
      kickoff: f.kickoff ? new Date(f.kickoff).toISOString() : undefined,
      returnTime: f.returnTime ? new Date(f.returnTime).toISOString() : undefined,
      notes: f.notes.trim(),
      stops: [...new Set(f.stops.split('\n').map((x) => x.trim()).filter(Boolean))],
      buses: Math.floor(Number(f.buses) || 1),
      points: Math.floor(Number(f.points)),
    });
  };
  return (
    <form className="card form" onSubmit={submit}>
      <label htmlFor="t-title">Titel</label>
      <input id="t-title" required placeholder="z. B. Augsburg (A)" value={f.title} onChange={set('title')} />
      <label htmlFor="t-dep">Abfahrt</label>
      <input id="t-dep" type="datetime-local" required value={f.departure} onChange={set('departure')} />
      <label htmlFor="t-meet">Treffpunkt</label>
      <input id="t-meet" required value={f.meetingPoint} onChange={set('meetingPoint')} />
      <div className="row">
        <div className="grow">
          <label htmlFor="t-price">Preis (€)</label>
          <input id="t-price" type="number" min={0} step="0.5" required value={f.price} onChange={set('price')} />
        </div>
        <div className="grow">
          <label htmlFor="t-seats">Plätze</label>
          <input id="t-seats" type="number" min={1} required value={f.seats} onChange={set('seats')} />
        </div>
      </div>
      <label htmlFor="t-kick">Anstoß (optional)</label>
      <input id="t-kick" type="datetime-local" value={f.kickoff} onChange={set('kickoff')} />
      <label htmlFor="t-ret">Rückfahrt (optional)</label>
      <input id="t-ret" type="datetime-local" value={f.returnTime} onChange={set('returnTime')} />
      <div className="row">
        <div className="grow">
          <label htmlFor="t-buses">Busse</label>
          <input id="t-buses" type="number" min={1} max={10} required value={f.buses} onChange={set('buses')} />
        </div>
        <div className="grow">
          <label htmlFor="t-points">Punkte für die Rangfolge</label>
          <input id="t-points" type="number" min={0} max={10} required value={f.points} onChange={set('points')} />
        </div>
      </div>
      <label htmlFor="t-stops">Zustiegsstellen (eine pro Zeile, optional)</label>
      <textarea id="t-stops" rows={3} placeholder={'Parkplatz Stadion\nBahnhof Nord'} value={f.stops} onChange={set('stops')} />
      <label htmlFor="t-notes">Hinweise für Mitfahrer (optional)</label>
      <textarea id="t-notes" rows={3} value={f.notes} onChange={set('notes')} />
      <button className="btn">Speichern</button>
      <button type="button" className="btn ghost" onClick={onCancel}>Abbrechen</button>
    </form>
  );
}

export function AdminTrips() {
  const { snap, now, act, data } = useApp();
  const [editing, setEditing] = useState<Trip | 'new' | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  if (!snap) return null;

  const save = async (id: string | null, input: TripInput) => {
    if (await act(() => data.saveTrip(id, input), id ? 'Fahrt gespeichert.' : `Fahrt erstellt. Mitglieder haben ${snap.settings.interestDays === 1 ? '1 Tag' : `${snap.settings.interestDays} Tage`} Vorlauf.`)) setEditing(null);
  };

  const trips = [...snap.trips].sort((a, b) => b.departure.localeCompare(a.departure));
  const users = new Map(snap.users.map((u) => [u.id, u]));

  return (
    <>
      <h1 className="title">Fahrten</h1>
      {editing ? (
        <TripForm
          initial={editing === 'new' ? emptyForm(snap.settings) : { title: editing.title, departure: toLocalInput(editing.departure), meetingPoint: editing.meetingPoint, price: String(editing.price), seats: String(editing.seats), kickoff: editing.kickoff ? toLocalInput(editing.kickoff) : '', returnTime: editing.returnTime ? toLocalInput(editing.returnTime) : '', notes: editing.notes, stops: editing.stops.join('\n'), buses: String(editing.buses), points: String(editing.points) }}
          onSubmit={(i) => void save(editing === 'new' ? null : editing.id, i)}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button className="btn" onClick={() => setEditing('new')}>+ Neue Fahrt</button>
      )}

      <div className="stack list">
        {trips.map((t) => {
          const phase = getTripPhase(t, now);
          const list = byTrip(snap.bookings, t.id);
          const isOpen = open === t.id;
          return (
            <section key={t.id} className="card">
              <div className="row between">
                <PhaseBadge phase={phase} />
                <span className="muted">{confirmedCount(snap.bookings, t.id)} / {t.seats} bestätigt</span>
              </div>
              <h3>{t.title}</h3>
              <div className="muted">{fmtDate(t.departure)} · {list.filter((b) => b.status === 'interested').length} Interessenten · {list.filter((b) => b.status === 'waitlist').length} Warteliste</div>
              <div className="chips">
                <button className="chip" onClick={() => setOpen(isOpen ? null : t.id)}>{isOpen ? 'Teilnehmer ausblenden' : 'Teilnehmer'}</button>
                <Link className="chip" to={`/admin/trips/${t.id}/list`}>Liste &amp; Kasse</Link>
                <button className="chip" onClick={() => setEditing(t)}>Bearbeiten</button>
                {phase === 'interest' && <button className="chip" onClick={() => void act(() => data.endInterestNow(t.id), 'Plätze vergeben.')}>Interessensphase beenden</button>}
                {(phase === 'interest' || phase === 'open') && <button className="chip" onClick={() => { setCancelId(cancelId === t.id ? null : t.id); setReason(''); }}>Fahrt absagen</button>}
                {confirmId === t.id ? (
                  <>
                    <button className="chip danger" onClick={() => { setConfirmId(null); void act(() => data.deleteTrip(t.id), 'Fahrt gelöscht.'); }}>Wirklich löschen</button>
                    <button className="chip" onClick={() => setConfirmId(null)}>Abbrechen</button>
                  </>
                ) : (
                  <button className="chip" onClick={() => setConfirmId(t.id)}>Löschen</button>
                )}
              </div>
              {cancelId === t.id && (
                <div className="form">
                  <label htmlFor={`c-${t.id}`}>Grund der Absage (optional, sehen alle)</label>
                  <input id={`c-${t.id}`} value={reason} onChange={(e) => setReason(e.target.value)} />
                  <div className="chips">
                    <button className="chip danger" onClick={() => { setCancelId(null); void act(() => data.cancelTrip(t.id, reason), 'Fahrt abgesagt.'); }}>Fahrt jetzt absagen</button>
                    <button className="chip" onClick={() => setCancelId(null)}>Abbrechen</button>
                  </div>
                </div>
              )}
              {isOpen && (
                <ul className="people">
                  {list.length === 0 && <li className="muted">Noch keine Einträge.</li>}
                  {[...list]
                    .sort((a, b) => a.status.localeCompare(b.status) || a.createdAt.localeCompare(b.createdAt))
                    .map((b) => {
                      const u = users.get(b.userId);
                      return (
                        <li key={b.id}>
                          <span>
                            {u?.name ?? 'Unbekannt'}
                            <small className="muted">
                              {' '}· {u ? pastTripCount(u, snap.trips, snap.bookings, now) : 0} Fahrten{u && !u.isMember ? ' · Gast' : ''}
                              {b.companions > 0 ? ` · +${b.companions}${b.companionNames ? ` (${b.companionNames})` : ''}` : ''}
                              {b.stop ? ` · ${b.stop}` : ''}
                            </small>
                          </span>
                          <span className="chips">
                            {b.status === 'confirmed' && t.buses > 1 && (
                              <select
                                aria-label={`Bus für ${u?.name ?? 'Buchung'}`}
                                value={b.bus ?? ''}
                                onChange={(e) => void act(() => data.setBookingBus(b.id, e.target.value ? Number(e.target.value) : null))}
                              >
                                <option value="">Bus?</option>
                                {Array.from({ length: t.buses }, (_, i) => <option key={i + 1} value={i + 1}>Bus {i + 1}</option>)}
                              </select>
                            )}
                            <StatusBadge status={b.status} />
                          </span>
                        </li>
                      );
                    })}
                </ul>
              )}
            </section>
          );
        })}
        <Link className="muted center" to="/admin">‹ Admin-Übersicht</Link>
      </div>
    </>
  );
}
