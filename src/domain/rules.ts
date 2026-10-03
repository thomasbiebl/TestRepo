import { DEFAULT_SETTINGS, type BookOptions, type Booking, type Settings, type Snapshot, type Trip, type TripPhase, type User } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const interestEndFor = (createdAt: string, days: number = DEFAULT_SETTINGS.interestDays): string =>
  new Date(Date.parse(createdAt) + days * DAY_MS).toISOString();

export function getTripPhase(trip: Trip, now: number): TripPhase {
  if (trip.cancelledAt) return 'cancelled';
  if (now >= Date.parse(trip.departure)) return 'closed';
  if (now < Date.parse(trip.interestEndsAt)) return 'interest';
  return 'open';
}

/** Trips on which a confirmed seat counts as taken: departed, not cancelled, not marked as no-show. */
function countedBookings(user: User, trips: Trip[], bookings: Booking[], now: number) {
  const departed = new Map(trips.filter((t) => Date.parse(t.departure) <= now && !t.cancelledAt).map((t) => [t.id, t]));
  return bookings.flatMap((b) => {
    const trip = departed.get(b.tripId);
    return b.userId === user.id && b.status === 'confirmed' && trip ? [{ b, trip }] : [];
  });
}

/** Trips a user has taken: start value plus confirmed seats on departed trips, no-shows excluded. */
export function pastTripCount(user: User, trips: Trip[], bookings: Booking[], now: number): number {
  return user.baseTrips + countedBookings(user, trips, bookings, now).filter(({ b }) => b.attended !== false).length;
}

export function noShowCount(user: User, trips: Trip[], bookings: Booking[], now: number): number {
  return countedBookings(user, trips, bookings, now).filter(({ b }) => b.attended === false).length;
}

/** Points for the allocation ranking: start value plus trip points, minus the no-show penalty. */
export function userScore(user: User, trips: Trip[], bookings: Booking[], now: number, settings: Settings): number {
  const counted = countedBookings(user, trips, bookings, now);
  const earned = counted.filter(({ b }) => b.attended !== false).reduce((sum, { trip }) => sum + trip.points, 0);
  const noShows = counted.filter(({ b }) => b.attended === false).length;
  return Math.max(0, user.baseTrips + earned - noShows * settings.noShowPenalty);
}

export const byTrip = (bookings: Booking[], tripId: string) => bookings.filter((b) => b.tripId === tripId);

/** Seats a booking takes: the person plus companions. */
export const seatsOf = (b: Booking) => 1 + b.companions;

/** Confirmed seats of a trip (people, not bookings). */
export const confirmedCount = (bookings: Booking[], tripId: string) =>
  byTrip(bookings, tripId).filter((b) => b.status === 'confirmed').reduce((sum, b) => sum + seatsOf(b), 0);

export const freeSeats = (trip: Trip, bookings: Booking[]) => Math.max(0, trip.seats - confirmedCount(bookings, trip.id));

/** Interested members of a trip, best claim first: highest score, then earliest interest. */
export function rankInterested(trip: Trip, snap: Snapshot, now: number): { booking: Booking; user: User; score: number }[] {
  const users = new Map(snap.users.map((u) => [u.id, u]));
  return byTrip(snap.bookings, trip.id)
    .filter((b) => b.status === 'interested')
    .flatMap((booking) => {
      const user = users.get(booking.userId);
      return user ? [{ booking, user, score: userScore(user, snap.trips, snap.bookings, now, snap.settings) }] : [];
    })
    .sort((a, b) => b.score - a.score || a.booking.createdAt.localeCompare(b.booking.createdAt));
}

/** Which of the ranked bookings get a seat: groups that no longer fit are skipped, later ones may still fit. */
export function fitsInOrder(bookings: Booking[], seats: number): boolean[] {
  let used = 0;
  return bookings.map((b) => {
    if (used + seatsOf(b) > seats) return false;
    used += seatsOf(b);
    return true;
  });
}

/** Waiting list of a trip in queue order. */
export const waitlistOf = (bookings: Booking[], tripId: string) =>
  byTrip(bookings, tripId)
    .filter((b) => b.status === 'waitlist')
    .sort((a, b) => (a.queuedAt ?? a.createdAt).localeCompare(b.queuedAt ?? b.createdAt));

/**
 * Hands out the seats once the interest phase is over. Idempotent: does nothing before the
 * phase ends or when the trip was allocated already. Returns new trips and bookings arrays.
 */
export function allocateTrip(snap: Snapshot, tripId: string, now: number): Snapshot {
  const trip = snap.trips.find((t) => t.id === tripId);
  if (!trip || trip.cancelledAt || trip.allocatedAt || now < Date.parse(trip.interestEndsAt)) return snap;

  const ranked = rankInterested(trip, snap, now);
  const stamp = new Date(now).getTime();
  const changed = new Map<string, Booking>();
  // A group that no longer fits goes to the waiting list; smaller groups after it may still fit.
  const fits = fitsInOrder(ranked.map((r) => r.booking), trip.seats);
  ranked.forEach(({ booking }, i) => {
    if (fits[i]) {
      changed.set(booking.id, { ...booking, status: 'confirmed' });
    } else {
      changed.set(booking.id, { ...booking, status: 'waitlist', queuedAt: new Date(stamp + i).toISOString() });
    }
  });
  return {
    ...snap,
    trips: snap.trips.map((t) => (t.id === tripId ? { ...t, allocatedAt: new Date(now).toISOString() } : t)),
    bookings: snap.bookings.map((b) => changed.get(b.id) ?? b),
  };
}

export const allocateAll = (snap: Snapshot, now: number): Snapshot =>
  snap.trips.reduce((s, t) => allocateTrip(s, t.id, now), snap);

/** Moves people from the waiting list into free seats. */
export function promoteWaitlist(bookings: Booking[], trip: Trip): Booking[] {
  let free = freeSeats(trip, bookings);
  if (free <= 0) return bookings;
  const promote = new Set<string>();
  for (const b of waitlistOf(bookings, trip.id)) {
    if (seatsOf(b) <= free) {
      promote.add(b.id);
      free -= seatsOf(b);
    }
  }
  return bookings.map((b) => (promote.has(b.id) ? { ...b, status: 'confirmed', queuedAt: undefined } : b));
}

export type BookResult = { ok: true; booking: Booking } | { ok: false; error: string };

/** Checks the rules and creates the booking a user gets by tapping the main button. */
export function createBooking(
  snap: Snapshot,
  trip: Trip,
  user: User,
  now: number,
  id: string,
  options: BookOptions = { companions: 0, companionNames: '' },
): BookResult {
  if (byTrip(snap.bookings, trip.id).some((b) => b.userId === user.id)) {
    return { ok: false, error: 'Du hast diese Fahrt schon gebucht.' };
  }
  const { maxCompanions } = snap.settings;
  if (!Number.isInteger(options.companions) || options.companions < 0 || options.companions > maxCompanions) {
    return { ok: false, error: `Du kannst höchstens ${maxCompanions} Begleitpersonen mitbringen.` };
  }
  let stop: string | undefined;
  if (trip.stops.length > 0) {
    if (!options.stop || !trip.stops.includes(options.stop)) return { ok: false, error: 'Bitte wähle eine Zustiegsstelle.' };
    stop = options.stop;
  }
  const need = 1 + options.companions;
  const extra = { companions: options.companions, companionNames: options.companionNames.trim(), stop };
  const nowIso = new Date(now).toISOString();
  switch (getTripPhase(trip, now)) {
    case 'cancelled':
      return { ok: false, error: 'Die Fahrt wurde abgesagt.' };
    case 'closed':
      return { ok: false, error: 'Die Fahrt ist bereits abgefahren.' };
    case 'interest':
      if (!user.isMember) return { ok: false, error: 'Nur Mitglieder können jetzt Interesse bekunden.' };
      return { ok: true, booking: { id, tripId: trip.id, userId: user.id, status: 'interested', createdAt: nowIso, paid: false, ...extra } };
    case 'open': {
      if (!user.isMember && !snap.settings.guestsMayBook) {
        return { ok: false, error: 'Die Buchung ist zurzeit nur für Mitglieder möglich.' };
      }
      const full = freeSeats(trip, snap.bookings) < need;
      if (full && !snap.settings.waitlistEnabled) return { ok: false, error: 'Die Fahrt ist leider ausgebucht.' };
      return {
        ok: true,
        booking: {
          id,
          tripId: trip.id,
          userId: user.id,
          status: full ? 'waitlist' : 'confirmed',
          createdAt: nowIso,
          queuedAt: full ? nowIso : undefined,
          paid: false,
          ...extra,
        },
      };
    }
  }
}

export function formatCountdown(ms: number): { days: number; hours: number; minutes: number } {
  const total = Math.max(0, Math.floor(ms / 60000));
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
}

/** Returns an error message for invalid settings, or null when they are fine. */
export function validateSettings(s: Settings): string | null {
  if (!s.clubName.trim()) return 'Bitte einen Vereinsnamen angeben.';
  if (!Number.isInteger(s.interestDays) || s.interestDays < 0 || s.interestDays > 30) {
    return 'Der Vorlauf für Mitglieder muss zwischen 0 und 30 Tagen liegen.';
  }
  if (!Number.isInteger(s.defaultSeats) || s.defaultSeats < 1) return 'Mindestens ein Platz als Standard.';
  const code = s.memberCode.trim();
  if (code && (code.length < 4 || code.length > 40)) return 'Der Mitgliedscode braucht 4 bis 40 Zeichen.';
  if (!Number.isInteger(s.noShowPenalty) || s.noShowPenalty < 0 || s.noShowPenalty > 10) {
    return 'Der Abzug bei Nichterscheinen muss zwischen 0 und 10 Punkten liegen.';
  }
  if (!Number.isInteger(s.maxCompanions) || s.maxCompanions < 0 || s.maxCompanions > 10) {
    return 'Begleitpersonen: zwischen 0 und 10 pro Buchung.';
  }
  if (!Number.isInteger(s.cancelDeadlineHours) || s.cancelDeadlineHours < 0 || s.cancelDeadlineHours > 720) {
    return 'Die Stornofrist muss zwischen 0 und 720 Stunden liegen.';
  }
  if (!(s.defaultPrice >= 0)) return 'Der Standardpreis darf nicht negativ sein.';
  if (!s.defaultMeetingPoint.trim()) return 'Bitte einen Standard-Treffpunkt angeben.';
  return null;
}

/**
 * Tells why a booking cannot be cancelled (null = it can). Interest and waiting list entries
 * can always be withdrawn; confirmed seats are bound by the cancellation deadline.
 */
export function cancelBlockedReason(booking: Booking, trip: Trip, settings: Settings, now: number): string | null {
  if (getTripPhase(trip, now) === 'closed') return 'Die Fahrt ist bereits abgefahren.';
  if (booking.status !== 'confirmed' || settings.cancelDeadlineHours <= 0) return null;
  const deadline = Date.parse(trip.departure) - settings.cancelDeadlineHours * 3_600_000;
  if (now < deadline) return null;
  return `Stornieren ist nur bis ${settings.cancelDeadlineHours} Stunden vor der Abfahrt möglich. Bitte melde dich beim Admin.`;
}

/** What a booking costs: the price per person for every seat it takes. */
export const amountDue = (b: Booking, trip: Trip) => trip.price * seatsOf(b);

/** Money overview of a trip, counting confirmed bookings only. */
export function tripTotals(trip: Trip, bookings: Booking[]) {
  const confirmed = byTrip(bookings, trip.id).filter((b) => b.status === 'confirmed');
  const expected = confirmed.reduce((sum, b) => sum + amountDue(b, trip), 0);
  const paid = confirmed.filter((b) => b.paid).reduce((sum, b) => sum + amountDue(b, trip), 0);
  return { people: confirmed.reduce((sum, b) => sum + seatsOf(b), 0), expected, paid, open: expected - paid };
}

/** Why an admin cannot cancel a booking (null = fine). The cancellation deadline does not apply to admins. */
export function adminCancelBlockedReason(trip: Trip, now: number): string | null {
  return now >= Date.parse(trip.departure) ? 'Die Fahrt ist bereits abgefahren.' : null;
}

export const BOOKING_STATUS_LABEL = { confirmed: 'Platz bestätigt', waitlist: 'Warteliste', interested: 'Interesse' } as const;
