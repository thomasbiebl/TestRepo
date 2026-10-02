import { Link } from 'react-router-dom';
import { StatusBadge, fmtDate, fmtPrice } from '../components/ui';
import { pastTripCount } from '../domain/rules';
import { useApp } from '../state/AppContext';

export function MyBookings() {
  const { snap, user, now } = useApp();
  if (!snap || !user) return null;
  const rows = snap.bookings
    .filter((b) => b.userId === user.id)
    .flatMap((b) => {
      const trip = snap.trips.find((t) => t.id === b.tripId);
      return trip ? [{ b, trip }] : [];
    })
    .sort((a, c) => c.trip.departure.localeCompare(a.trip.departure));
  return (
    <>
      <h1 className="title">Meine Buchungen</h1>
      <p className="muted">Bisherige Fahrten: <b>{pastTripCount(user, snap.trips, snap.bookings, now)}</b></p>
      {rows.length === 0 && <p className="notice">Du hast noch keine Fahrt gebucht. Schau bei den Fahrten vorbei.</p>}
      <div className="stack">
        {rows.map(({ b, trip }) => (
          <Link key={b.id} to={`/trip/${trip.id}`} className="card trip">
            <div className="row between">
              <StatusBadge status={b.status} />
              <span className="muted">{fmtPrice(trip.price)}</span>
            </div>
            <h3>{trip.title}</h3>
            <div className="muted">{fmtDate(trip.departure)}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
