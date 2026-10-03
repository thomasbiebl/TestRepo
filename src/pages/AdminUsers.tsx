import { useState } from 'react';
import { Badge } from '../components/ui';
import { pastTripCount } from '../domain/rules';
import { useApp } from '../state/AppContext';

export function AdminUsers() {
  const { snap, user: me, now, act, data } = useApp();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (!snap) return null;
  const users = [...snap.users].sort((a, b) => Number(b.memberRequested) - Number(a.memberRequested) || a.name.localeCompare(b.name));

  return (
    <>
      <h1 className="title">Benutzer</h1>
      <div className="stack">
        {users.map((u) => {
          const self = u.id === me?.id;
          return (
            <section key={u.id} className="card">
              <div className="row between">
                <div>
                  <h3>{u.name}</h3>
                  <div className="muted">{u.email}</div>
                </div>
                <div className="chips">
                  {u.memberRequested && <Badge tone="red">Anfrage</Badge>}
                  {u.isMember ? <Badge tone="green">Mitglied</Badge> : <Badge>Gast</Badge>}
                  {u.isAdmin && <Badge tone="blue">Admin</Badge>}
                </div>
              </div>
              <div className="row between">
                <label htmlFor={`m-${u.id}`} className="check">
                  <input id={`m-${u.id}`} type="checkbox" checked={u.isMember} onChange={(e) => void act(() => data.updateUser(u.id, { isMember: e.target.checked }))} />
                  Mitglied
                </label>
                <label htmlFor={`a-${u.id}`} className="check">
                  <input id={`a-${u.id}`} type="checkbox" checked={u.isAdmin} disabled={self} onChange={(e) => void act(() => data.updateUser(u.id, { isAdmin: e.target.checked }))} />
                  Admin
                </label>
              </div>
              <div className="row between">
                <label htmlFor={`b-${u.id}`} className="muted">Fahrten vor der App</label>
                <input
                  id={`b-${u.id}`}
                  className="num"
                  type="number"
                  min={0}
                  defaultValue={u.baseTrips}
                  onBlur={(e) => {
                    const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                    if (n !== u.baseTrips) void act(() => data.updateUser(u.id, { baseTrips: n }), 'Gespeichert.');
                  }}
                />
              </div>
              <div className="row between">
                <span className="muted">Fahrten gesamt: <b>{pastTripCount(u, snap.trips, snap.bookings, now)}</b></span>
                {!self && (confirmId === u.id ? (
                  <span className="chips">
                    <button className="chip danger" onClick={() => { setConfirmId(null); void act(() => data.deleteUser(u.id), 'Benutzer gelöscht.'); }}>Wirklich löschen</button>
                    <button className="chip" onClick={() => setConfirmId(null)}>Abbrechen</button>
                  </span>
                ) : (
                  <button className="chip" onClick={() => setConfirmId(u.id)}>Löschen</button>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
