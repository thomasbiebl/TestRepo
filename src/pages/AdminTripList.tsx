import { Link, Navigate, useParams } from 'react-router-dom';
import { Badge, StatusBadge, fmtDate, fmtPrice } from '../components/ui';
import { buildParticipantCsv, passengersByBus, type Passenger } from '../domain/participants';
import { amountDue, byTrip, seatsOf, tripTotals, waitlistOf } from '../domain/rules';
import { downloadFile } from '../lib/download';
import { useApp } from '../state/AppContext';

/** Passenger list for the bus driver and the treasurer: boarding, payment, print and CSV. */
export function AdminTripList() {
  const { id } = useParams();
  const { snap, act, data } = useApp();
  const trip = snap?.trips.find((t) => t.id === id);
  if (!snap) return null;
  if (!trip) return <Navigate to="/admin/trips" replace />;

  const groups = passengersByBus(trip, snap);
  const totals = tripTotals(trip, snap.bookings);
  const users = new Map(snap.users.map((u) => [u.id, u]));
  const waiting = waitlistOf(snap.bookings, trip.id);
  const interested = byTrip(snap.bookings, trip.id).filter((b) => b.status === 'interested');

  const csvName = `teilnehmer-${trip.title.replace(/\W+/g, '-').toLowerCase()}.csv`;

  const row = ({ booking: b, user }: Passenger) => (
    <li key={b.id} className="pax">
      <div className="pax-main">
        <b>{user?.name ?? 'Unbekannt'}</b>
        {b.companions > 0 && <span> +{b.companions}{b.companionNames ? ` (${b.companionNames})` : ''}</span>}
        <small className="muted">{[b.stop, seatsOf(b) > 1 ? `${seatsOf(b)} Plätze` : '', fmtPrice(amountDue(b, trip))].filter(Boolean).join(' · ')}</small>
        <small className="print-only">
          Bezahlt: {b.paid ? 'ja' : 'nein'} · Eingestiegen: {b.attended === true ? 'ja' : b.attended === false ? 'nicht erschienen' : '☐'}
        </small>
      </div>
      <div className="pax-actions no-print">
        <label className="check" htmlFor={`paid-${b.id}`}>
          <input id={`paid-${b.id}`} type="checkbox" checked={b.paid} onChange={(e) => void act(() => data.setBookingPaid(b.id, e.target.checked))} />
          bezahlt
        </label>
        <div className="seg" role="group" aria-label={`Einstieg ${user?.name ?? ''}`}>
          <button className="chip" aria-pressed={b.attended === true} onClick={() => void act(() => data.setBookingAttendance(b.id, b.attended === true ? null : true))}>da</button>
          <button className="chip" aria-pressed={b.attended === false} onClick={() => void act(() => data.setBookingAttendance(b.id, b.attended === false ? null : false))}>fehlt</button>
        </div>
      </div>
    </li>
  );

  return (
    <>
      <h1 className="title">{trip.title}</h1>
      <p className="muted">{fmtDate(trip.departure)} · {trip.meetingPoint}</p>

      <section className="card">
        <h3>Kasse</h3>
        <dl className="kv">
          <dt>Mitfahrer</dt><dd>{totals.people} von {trip.seats} Plätzen</dd>
          <dt>Erwartet</dt><dd>{fmtPrice(totals.expected)}</dd>
          <dt>Bezahlt</dt><dd>{fmtPrice(totals.paid)}</dd>
          <dt>Offen</dt><dd><b>{fmtPrice(totals.open)}</b></dd>
        </dl>
      </section>

      <div className="chips no-print">
        <button className="chip" onClick={() => downloadFile(csvName, buildParticipantCsv(trip, snap), 'text/csv;charset=utf-8')}>CSV herunterladen</button>
        <button className="chip" onClick={() => window.print()}>Drucken</button>
        <Link className="chip" to="/admin/trips">Zurück zu den Fahrten</Link>
      </div>

      {groups.size === 0 && <p className="notice">Noch keine bestätigten Mitfahrer.</p>}
      {[...groups].map(([bus, list]) => (
        <section key={bus} className="card">
          <h3>{trip.buses > 1 ? (bus === 0 ? 'Noch keinem Bus zugeordnet' : `Bus ${bus}`) : 'Mitfahrer'} <Badge>{list.reduce((n, p) => n + seatsOf(p.booking), 0)} Plätze</Badge></h3>
          <ul className="pax-list">{list.map(row)}</ul>
        </section>
      ))}

      {waiting.length > 0 && (
        <section className="card">
          <h3>Warteliste</h3>
          <ul className="pax-list">
            {waiting.map((b, i) => (
              <li key={b.id} className="pax">
                <div className="pax-main"><b>{i + 1}. {users.get(b.userId)?.name ?? 'Unbekannt'}</b>{b.companions > 0 && <span> +{b.companions}</span>}</div>
                <StatusBadge status={b.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {interested.length > 0 && <p className="muted">{interested.length} Interessenten warten noch auf die Vergabe.</p>}
    </>
  );
}
