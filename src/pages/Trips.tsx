import { Link } from 'react-router-dom';
import { Badge, PhaseBadge, SeatBar, StatusBadge, fmtDate, fmtPrice } from '../components/ui';
import { confirmedCount, freeSeats, getTripPhase, waitlistOf, byTrip } from '../domain/rules';
import type { Trip } from '../domain/types';
import { useApp } from '../state/AppContext';
import { fmtDay, sortNews } from './News';

function TripCard({ trip }: { trip: Trip }) {
  const { snap, user, now } = useApp();
  if (!snap || !user) return null;
  const phase = getTripPhase(trip, now);
  const mine = snap.bookings.find((b) => b.tripId === trip.id && b.userId === user.id);
  const interested = byTrip(snap.bookings, trip.id).filter((b) => b.status === 'interested').length;
  const free = freeSeats(trip, snap.bookings);
  const waiting = waitlistOf(snap.bookings, trip.id).length;
  const confirmed = confirmedCount(snap.bookings, trip.id);

  let info: string;
  let value: number;
  if (phase === 'cancelled') {
    info = trip.cancelReason ? `Abgesagt: ${trip.cancelReason}` : 'Diese Fahrt wurde abgesagt.';
    value = confirmed;
  } else if (phase === 'interest') {
    info = `${interested} Interessenten · ${trip.seats} Plätze`;
    value = interested;
  } else if (free === 0 && phase === 'open') {
    info = waiting ? `Ausgebucht · ${waiting} auf der Warteliste` : 'Ausgebucht';
    value = trip.seats;
  } else {
    info = phase === 'open' ? `Noch ${free} von ${trip.seats} Plätzen frei` : `${confirmed} Mitfahrer`;
    value = confirmed;
  }

  return (
    <Link to={`/trip/${trip.id}`} className={`card trip${phase === 'interest' ? ' hot' : ''}${phase === 'closed' || phase === 'cancelled' ? ' past' : ''}`}>
      <div className="row between">
        <PhaseBadge phase={phase} />
        {mine && <StatusBadge status={mine.status} />}
      </div>
      <h3>{trip.title}</h3>
      <div className="muted">{fmtDate(trip.departure)} · {fmtPrice(trip.price)}</div>
      <SeatBar value={value} max={trip.seats} full={phase !== 'interest' && free === 0} />
      <div className="muted">{info}</div>
    </Link>
  );
}

export function Trips() {
  const { snap, now } = useApp();
  if (!snap) return null;
  const upcoming = snap.trips.filter((t) => Date.parse(t.departure) > now).sort((a, b) => a.departure.localeCompare(b.departure));
  const latestNews = sortNews(snap.news)[0];
  const past = snap.trips.filter((t) => Date.parse(t.departure) <= now).sort((a, b) => b.departure.localeCompare(a.departure));
  return (
    <>
      <h1 className="title">Bus<span className="accent-text">fahrten</span></h1>
      {latestNews && (
        <Link to="/news" className="card news-teaser">
          <span className="muted">News · {fmtDay(latestNews.createdAt)}</span>
          <h3>{latestNews.title}</h3>
        </Link>
      )}
      {upcoming.length === 0 && <p className="muted">Zurzeit sind keine Fahrten geplant.</p>}
      <div className="stack">
        {upcoming.map((t) => <TripCard key={t.id} trip={t} />)}
      </div>
      {past.length > 0 && (
        <>
          <h2 className="sub">Vergangene Fahrten <Badge>{past.length}</Badge></h2>
          <div className="stack">{past.map((t) => <TripCard key={t.id} trip={t} />)}</div>
        </>
      )}
    </>
  );
}
