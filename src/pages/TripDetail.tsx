import { Navigate, useParams } from 'react-router-dom';
import { Badge, Countdown, PhaseBadge, SeatBar, StatusBadge, fmtDate, fmtPrice, shortName } from '../components/ui';
import { byTrip, confirmedCount, freeSeats, getTripPhase, pastTripCount, rankInterested, waitlistOf } from '../domain/rules';
import { useApp } from '../state/AppContext';

export function TripDetail() {
  const { id } = useParams();
  const { snap, user, now, act, data } = useApp();
  const trip = snap?.trips.find((t) => t.id === id);
  if (!snap || !user) return null;
  if (!trip) return <Navigate to="/" replace />;

  const phase = getTripPhase(trip, now);
  const mine = byTrip(snap.bookings, trip.id).find((b) => b.userId === user.id);
  const confirmed = confirmedCount(snap.bookings, trip.id);
  const free = freeSeats(trip, snap.bookings);
  const waitlist = waitlistOf(snap.bookings, trip.id);
  const ranked = rankInterested(trip, snap, now);
  const myRank = ranked.findIndex((r) => r.booking.userId === user.id) + 1;
  const myTrips = pastTripCount(user, snap.trips, snap.bookings, now);
  const waitPos = mine?.status === 'waitlist' ? waitlist.findIndex((b) => b.id === mine.id) + 1 : 0;

  const book = () => act(() => data.book(trip.id, user.id), phase === 'interest' ? 'Interesse bekundet.' : undefined);
  const cancel = () => act(() => data.cancel(trip.id, user.id), mine?.status === 'interested' ? 'Interesse zurückgezogen.' : 'Buchung storniert.');

  const mainLabel = phase === 'interest' ? 'Interesse bekunden' : free > 0 ? 'Platz buchen' : 'Auf die Warteliste';
  const cancelLabel = mine?.status === 'interested' ? 'Interesse zurückziehen' : mine?.status === 'waitlist' ? 'Von der Warteliste streichen' : 'Buchung stornieren';

  return (
    <>
      <h1 className="title">{trip.title}</h1>
      <div className="stack">
        <section className={`card${phase === 'interest' ? ' hot' : ''}`}>
          <PhaseBadge phase={phase} />
          {phase === 'interest' && (
            <>
              <Countdown ms={Date.parse(trip.interestEndsAt) - now} />
              <p className="muted">Danach werden die Plätze automatisch nach bisherigen Fahrten an die Interessenten vergeben. Freie Plätze können dann alle buchen.</p>
            </>
          )}
          {phase === 'open' && (
            <>
              <SeatBar value={confirmed} max={trip.seats} full={free === 0} />
              <p className="muted">{free > 0 ? `Noch ${free} von ${trip.seats} Plätzen frei.` : `Ausgebucht. ${waitlist.length} auf der Warteliste.`}</p>
            </>
          )}
          {phase === 'closed' && <p className="muted">Diese Fahrt ist abgefahren. {confirmed} Mitfahrer.</p>}
        </section>

        {mine && (
          <section className="card">
            <div className="row between">
              <h3>Dein Status</h3>
              <StatusBadge status={mine.status} />
            </div>
            <p className="muted">
              {mine.status === 'interested' && (myRank <= trip.seats
                ? `Du hast ${myTrips} bisherige Fahrten und liegst auf Rang ${myRank} von ${ranked.length}. Bei ${trip.seats} Plätzen bist du aktuell dabei.`
                : `Du hast ${myTrips} bisherige Fahrten und liegst auf Rang ${myRank} von ${ranked.length}. Aktuell reichen die Plätze (${trip.seats}) nicht bis zu dir.`)}
              {mine.status === 'confirmed' && 'Dein Platz ist sicher. Wir freuen uns auf dich.'}
              {mine.status === 'waitlist' && `Du bist auf Platz ${waitPos} der Warteliste und rückst automatisch nach, sobald ein Platz frei wird.`}
            </p>
          </section>
        )}

        {phase === 'interest' && user.isMember && ranked.length > 0 && (
          <section className="card">
            <h3>Rangliste (bisherige Fahrten)</h3>
            <ol className="rank">
              {ranked.map((r, i) => (
                <li key={r.booking.id} className={r.booking.userId === user.id ? 'me' : ''} data-in={i < trip.seats ? 'true' : 'false'}>
                  <span>{i + 1} · {r.booking.userId === user.id ? 'Du' : shortName(r.user.name)}</span>
                  <b>{r.trips}</b>
                </li>
              ))}
            </ol>
            <p className="muted">{trip.seats} Plätze. Bei Gleichstand zählt, wer zuerst Interesse bekundet hat.</p>
          </section>
        )}

        <section className="card">
          <h3>Details</h3>
          <dl className="kv">
            <dt>Abfahrt</dt><dd>{fmtDate(trip.departure)}</dd>
            <dt>Treffpunkt</dt><dd>{trip.meetingPoint}</dd>
            <dt>Preis</dt><dd>{fmtPrice(trip.price)} pro Person</dd>
            <dt>Plätze</dt><dd>{trip.seats}</dd>
          </dl>
        </section>

        {phase === 'interest' && !user.isMember && !mine && (
          <p className="notice">
            Diese Fahrt ist zuerst Mitgliedern vorbehalten. Wenn nach der Platzvergabe Plätze frei sind, kannst du hier buchen.
            {user.memberRequested && <> Deine Mitgliedschaft wird noch geprüft. <Badge>In Prüfung</Badge></>}
          </p>
        )}

        {phase !== 'closed' && !mine && (phase === 'open' || user.isMember) && (
          <button className="btn" onClick={book}>{mainLabel}</button>
        )}
        {phase !== 'closed' && mine && (
          <button className="btn ghost" onClick={cancel}>{cancelLabel}</button>
        )}
      </div>
    </>
  );
}
