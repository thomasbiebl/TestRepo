import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PhaseBadge, StatusBadge, fmtDate } from '../components/ui';
import type { TripInput } from '../data/DataService';
import { byTrip, getTripPhase, pastTripCount } from '../domain/rules';
import type { Trip } from '../domain/types';
import { useApp } from '../state/AppContext';

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface FormState { title: string; departure: string; meetingPoint: string; price: string; seats: string }

const emptyForm = (): FormState => {
  const d = new Date(Date.now() + 14 * 86_400_000);
  d.setHours(8, 0, 0, 0);
  return { title: '', departure: toLocalInput(d.toISOString()), meetingPoint: 'Parkplatz Stadion', price: '30', seats: '50' };
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
  if (!snap) return null;

  const save = async (id: string | null, input: TripInput) => {
    if (await act(() => data.saveTrip(id, input), id ? 'Fahrt gespeichert.' : 'Fahrt erstellt. Die Interessensphase für Mitglieder läuft 3 Tage.')) setEditing(null);
  };

  const trips = [...snap.trips].sort((a, b) => b.departure.localeCompare(a.departure));
  const users = new Map(snap.users.map((u) => [u.id, u]));

  return (
    <>
      <h1 className="title">Fahrten</h1>
      {editing ? (
        <TripForm
          initial={editing === 'new' ? emptyForm() : { title: editing.title, departure: toLocalInput(editing.departure), meetingPoint: editing.meetingPoint, price: String(editing.price), seats: String(editing.seats) }}
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
                <span className="muted">{list.filter((b) => b.status === 'confirmed').length} / {t.seats} bestätigt</span>
              </div>
              <h3>{t.title}</h3>
              <div className="muted">{fmtDate(t.departure)} · {list.filter((b) => b.status === 'interested').length} Interessenten · {list.filter((b) => b.status === 'waitlist').length} Warteliste</div>
              <div className="chips">
                <button className="chip" onClick={() => setOpen(isOpen ? null : t.id)}>{isOpen ? 'Teilnehmer ausblenden' : 'Teilnehmer'}</button>
                <button className="chip" onClick={() => setEditing(t)}>Bearbeiten</button>
                {phase === 'interest' && <button className="chip" onClick={() => void act(() => data.endInterestNow(t.id), 'Plätze vergeben.')}>Interessensphase beenden</button>}
                {confirmId === t.id ? (
                  <>
                    <button className="chip danger" onClick={() => { setConfirmId(null); void act(() => data.deleteTrip(t.id), 'Fahrt gelöscht.'); }}>Wirklich löschen</button>
                    <button className="chip" onClick={() => setConfirmId(null)}>Abbrechen</button>
                  </>
                ) : (
                  <button className="chip" onClick={() => setConfirmId(t.id)}>Löschen</button>
                )}
              </div>
              {isOpen && (
                <ul className="people">
                  {list.length === 0 && <li className="muted">Noch keine Einträge.</li>}
                  {[...list]
                    .sort((a, b) => a.status.localeCompare(b.status) || a.createdAt.localeCompare(b.createdAt))
                    .map((b) => {
                      const u = users.get(b.userId);
                      return (
                        <li key={b.id}>
                          <span>{u?.name ?? 'Unbekannt'} <small className="muted">· {u ? pastTripCount(u, snap.trips, snap.bookings, now) : 0} Fahrten{u && !u.isMember ? ' · Gast' : ''}</small></span>
                          <StatusBadge status={b.status} />
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
