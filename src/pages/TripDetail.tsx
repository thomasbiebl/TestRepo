import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Badge, Countdown, PhaseBadge, SeatBar, StatusBadge, fmtDate, fmtPrice, shortName } from '../components/ui';
import { buildIcs } from '../domain/ics';
import { byTrip, cancelBlockedReason, confirmedCount, fitsInOrder, freeSeats, getTripPhase, pastTripCount, rankInterested, waitlistOf } from '../domain/rules';
import { downloadFile } from '../lib/download';
import { useApp } from '../state/AppContext';

export function TripDetail() {
  const { id } = useParams();
  const { snap, user, now, act, data } = useApp();
  const trip = snap?.trips.find((t) => t.id === id);
  const [companions, setCompanions] = useState(0);
  const [names, setNames] = useState('');
  const [stop, setStop] = useState('');
  if (!snap || !user) return null;
  if (!trip) return <Navigate to="/" replace />;

  const phase = getTripPhase(trip, now);
  const mine = byTrip(snap.bookings, trip.id).find((b) => b.userId === user.id);
  const confirmed = confirmedCount(snap.bookings, trip.id);
  const free = freeSeats(trip, snap.bookings);
  const waitlist = waitlistOf(snap.bookings, trip.id);
  const ranked = rankInterested(trip, snap, now);
  const myRank = ranked.findIndex((r) => r.booking.userId === user.id) + 1;
  const fits = fitsInOrder(ranked.map((r) => r.booking), trip.seats);
  const need = 1 + companions;
  const chosenStop = trip.stops.length ? stop || trip.stops[0] : undefined;
  const myTrips = pastTripCount(user, snap.trips, snap.bookings, now);
  const { guestsMayBook, waitlistEnabled } = snap.settings;
  const mayTry = phase === 'open' ? user.isMember || guestsMayBook : user.isMember;
  const soldOut = phase === 'open' && free === 0 && !waitlistEnabled;
  const cancelBlock = mine ? cancelBlockedReason(mine, trip, snap.settings, now) : null;
  const waitPos = mine?.status === 'waitlist' ? waitlist.findIndex((b) => b.id === mine.id) + 1 : 0;

  const book = () =>
    act(() => data.book(trip.id, user.id, { companions, companionNames: names, stop: chosenStop }), phase === 'interest' ? 'Interesse bekundet.' : undefined);
  const cancel = () => act(() => data.cancel(trip.id, user.id), mine?.status === 'interested' ? 'Interesse zurückgezogen.' : 'Buchung storniert.');

  const seatsText = need > 1 ? ` (${need} Plätze)` : '';
  const mainLabel = (phase === 'interest' ? 'Interesse bekunden' : free >= need ? 'Platz buchen' : 'Auf die Warteliste') + seatsText;
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
          {phase === 'cancelled' && (
            <p className="muted"><b>Diese Fahrt wurde abgesagt.</b>{trip.cancelReason ? ` ${trip.cancelReason}` : ''}</p>
          )}
        </section>

        {mine && (
          <section className="card">
            <div className="row between">
              <h3>Dein Status</h3>
              <StatusBadge status={mine.status} />
            </div>
            <p className="muted">
              {mine.status === 'interested' && (fits[myRank - 1]
                ? `Du hast ${myTrips} bisherige Fahrten und liegst auf Rang ${myRank} von ${ranked.length}. Bei ${trip.seats} Plätzen bist du aktuell dabei.`
                : `Du hast ${myTrips} bisherige Fahrten und liegst auf Rang ${myRank} von ${ranked.length}. Aktuell reichen die Plätze (${trip.seats}) nicht bis zu dir.`)}
              {mine.status === 'confirmed' && 'Dein Platz ist sicher. Wir freuen uns auf dich.'}
              {mine.status === 'waitlist' && `Du bist auf Platz ${waitPos} der Warteliste und rückst automatisch nach, sobald ein Platz frei wird.`}
            </p>
            {(mine.companions > 0 || mine.stop || mine.bus) && (
              <p className="muted">
                {[
                  mine.companions > 0 ? `Du + ${mine.companions} Begleitperson${mine.companions > 1 ? 'en' : ''}${mine.companionNames ? ` (${mine.companionNames})` : ''}` : '',
                  mine.stop ? `Zustieg: ${mine.stop}` : '',
                  mine.bus ? `Bus ${mine.bus}` : '',
                ].filter(Boolean).join(' · ')}
              </p>
            )}
          </section>
        )}

        {phase === 'interest' && user.isMember && ranked.length > 0 && (
          <section className="card">
            <h3>Rangliste (bisherige Fahrten)</h3>
            <ol className="rank">
              {ranked.map((r, i) => (
                <li key={r.booking.id} className={r.booking.userId === user.id ? 'me' : ''} data-in={fits[i] ? 'true' : 'false'}>
                  <span>{i + 1} · {r.booking.userId === user.id ? 'Du' : shortName(r.user.name)}{r.booking.companions > 0 ? ` +${r.booking.companions}` : ''}</span>
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
            {trip.kickoff && <><dt>Anstoß</dt><dd>{fmtDate(trip.kickoff)}</dd></>}
            {trip.returnTime && <><dt>Rückfahrt</dt><dd>{fmtDate(trip.returnTime)}</dd></>}
            <dt>Preis</dt><dd>{fmtPrice(trip.price)} pro Person</dd>
            <dt>Plätze</dt><dd>{trip.seats}</dd>
          </dl>
          {trip.notes && <p className="prose">{trip.notes}</p>}
          {phase !== 'cancelled' && (
            <button className="chip" onClick={() => downloadFile(`busfahrt-${trip.title.replace(/\W+/g, '-').toLowerCase()}.ics`, buildIcs(trip), 'text/calendar;charset=utf-8')}>
              Zum Kalender hinzufügen
            </button>
          )}
        </section>

        {phase === 'interest' && !user.isMember && !mine && (
          <p className="notice">
            Diese Fahrt ist zuerst Mitgliedern vorbehalten. Wenn nach der Platzvergabe Plätze frei sind, kannst du hier buchen.
            {user.memberRequested && <> Deine Mitgliedschaft wird noch geprüft. <Badge>In Prüfung</Badge></>}
          </p>
        )}

        {phase === 'open' && !mine && !mayTry && (
          <p className="notice">Die Buchung ist zurzeit nur für Mitglieder möglich.</p>
        )}
        {soldOut && !mine && <p className="notice">Diese Fahrt ist ausgebucht.</p>}

        {phase !== 'closed' && phase !== 'cancelled' && !mine && mayTry && !soldOut && (
          <>
            {(snap.settings.maxCompanions > 0 || trip.stops.length > 0) && (
              <section className="card form">
                <h3>Deine Buchung</h3>
                {trip.stops.length > 0 && (
                  <>
                    <label htmlFor="b-stop">Zustiegsstelle</label>
                    <select id="b-stop" value={chosenStop} onChange={(e) => setStop(e.target.value)}>
                      {trip.stops.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </>
                )}
                {snap.settings.maxCompanions > 0 && (
                  <>
                    <label htmlFor="b-comp">Begleitpersonen</label>
                    <select id="b-comp" value={companions} onChange={(e) => setCompanions(Number(e.target.value))}>
                      {Array.from({ length: snap.settings.maxCompanions + 1 }, (_, i) => (
                        <option key={i} value={i}>{i === 0 ? 'Keine, nur ich' : `${i} Begleitperson${i > 1 ? 'en' : ''}`}</option>
                      ))}
                    </select>
                    {companions > 0 && (
                      <>
                        <label htmlFor="b-names">Namen der Begleitpersonen (optional)</label>
                        <input id="b-names" value={names} onChange={(e) => setNames(e.target.value)} />
                        <p className="muted">Jede Begleitperson belegt einen Platz und bezahlt den Fahrpreis.</p>
                      </>
                    )}
                  </>
                )}
              </section>
            )}
            <button className="btn" onClick={book}>{mainLabel}</button>
          </>
        )}
        {phase !== 'closed' && phase !== 'cancelled' && mine && (
          cancelBlock ? <p className="notice">{cancelBlock}</p> : <button className="btn ghost" onClick={cancel}>{cancelLabel}</button>
        )}
      </div>
    </>
  );
}
