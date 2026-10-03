import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Badge, StatusBadge, fmtDate, fmtPrice } from '../components/ui';
import { buildParticipantCsv, passengersByBus, type Passenger } from '../domain/participants';
import { adminCancelBlockedReason, amountDue, byTrip, seatsOf, tripTotals, waitlistOf } from '../domain/rules';
import { downloadFile } from '../lib/download';
import { HELP_LINKS } from '../help/sections';
import { useApp } from '../state/AppContext';

/** Passenger list for the bus driver and the treasurer: boarding, payment, print and CSV. */
export function AdminTripList() {
  const { id } = useParams();
  const { snap, act, data } = useApp();
  const trip = snap?.trips.find((t) => t.id === id);
  const [removeId, setRemoveId] = useState<string | null>(null);
  if (!snap) return null;
  if (!trip) return <Navigate to="/admin/trips" replace />;

  const groups = passengersByBus(trip, snap);
  const totals = tripTotals(trip, snap.bookings);
  const users = new Map(snap.users.map((u) => [u.id, u]));
  const waiting = waitlistOf(snap.bookings, trip.id);
  const interested = byTrip(snap.bookings, trip.id).filter((b) => b.status === 'interested');

  const canRemove = !adminCancelBlockedReason(trip, Date.now());
  const nameOf = (userId: string) => users.get(userId)?.name ?? 'Unbekannt';

  /** Admin cancels somebody's booking, with a second tap to confirm. */
  const removeControl = (bookingId: string, userId: string) => {
    if (!canRemove) return null;
    return removeId === bookingId ? (
      <span className="chips no-print">
        <button className="chip danger" onClick={() => { setRemoveId(null); void act(() => data.adminCancelBooking(bookingId), `Buchung von ${nameOf(userId)} storniert. Die Person wird benachrichtigt.`); }}>
          Wirklich stornieren
        </button>
        <button className="chip" onClick={() => setRemoveId(null)}>Abbrechen</button>
      </span>
    ) : (
      <button className="chip no-print" aria-label={`Buchung von ${nameOf(userId)} stornieren`} onClick={() => setRemoveId(bookingId)}>Stornieren</button>
    );
  };

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
        {removeControl(b.id, b.userId)}
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
        <Link className="chip" to={HELP_LINKS.adminList}>Hilfe zur Liste und Kasse</Link>
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
                <div className="pax-actions no-print">
                  <StatusBadge status={b.status} />
                  {removeControl(b.id, b.userId)}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {interested.length > 0 && (
        <section className="card">
          <h3>Interessenten <Badge>{interested.length}</Badge></h3>
          <p className="muted">Sie warten noch auf die Vergabe.</p>
          <ul className="pax-list">
            {interested.map((b) => (
              <li key={b.id} className="pax">
                <div className="pax-main"><b>{nameOf(b.userId)}</b>{b.companions > 0 && <span> +{b.companions}</span>}</div>
                <div className="pax-actions no-print">{removeControl(b.id, b.userId)}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {canRemove && <p className="muted no-print">Beim Stornieren bekommt die Person eine Mitteilung. Die Stornofrist gilt für Admins nicht, die Warteliste rückt automatisch nach.</p>}
    </>
  );
}
