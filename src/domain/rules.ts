import { DEFAULT_SETTINGS, type Booking, type Settings, type Snapshot, type Trip, type TripPhase, type User } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export const interestEndFor = (createdAt: string, days: number = DEFAULT_SETTINGS.interestDays): string =>
  new Date(Date.parse(createdAt) + days * DAY_MS).toISOString();

export function getTripPhase(trip: Trip, now: number): TripPhase {
  if (now >= Date.parse(trip.departure)) return 'closed';
  if (now < Date.parse(trip.interestEndsAt)) return 'interest';
  return 'open';
}

/** Trips a user has taken: start value plus confirmed seats on trips already departed. */
export function pastTripCount(user: User, trips: Trip[], bookings: Booking[], now: number): number {
  const departed = new Set(trips.filter((t) => Date.parse(t.departure) <= now).map((t) => t.id));
  const taken = bookings.filter(
    (b) => b.userId === user.id && b.status === 'confirmed' && departed.has(b.tripId),
  ).length;
  return user.baseTrips + taken;
}

export const byTrip = (bookings: Booking[], tripId: string) => bookings.filter((b) => b.tripId === tripId);

export const confirmedCount = (bookings: Booking[], tripId: string) =>
  byTrip(bookings, tripId).filter((b) => b.status === 'confirmed').length;

export const freeSeats = (trip: Trip, bookings: Booking[]) => Math.max(0, trip.seats - confirmedCount(bookings, trip.id));

/** Interested members of a trip, best claim first: most past trips, then earliest interest. */
export function rankInterested(trip: Trip, snap: Snapshot, now: number): { booking: Booking; user: User; trips: number }[] {
  const users = new Map(snap.users.map((u) => [u.id, u]));
  return byTrip(snap.bookings, trip.id)
    .filter((b) => b.status === 'interested')
    .flatMap((booking) => {
      const user = users.get(booking.userId);
      return user ? [{ booking, user, trips: pastTripCount(user, snap.trips, snap.bookings, now) }] : [];
    })
    .sort((a, b) => b.trips - a.trips || a.booking.createdAt.localeCompare(b.booking.createdAt));
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
  if (!trip || trip.allocatedAt || now < Date.parse(trip.interestEndsAt)) return snap;

  const ranked = rankInterested(trip, snap, now);
  const stamp = new Date(now).getTime();
  const changed = new Map<string, Booking>();
  ranked.forEach(({ booking }, i) => {
    changed.set(
      booking.id,
      i < trip.seats
        ? { ...booking, status: 'confirmed' }
        : { ...booking, status: 'waitlist', queuedAt: new Date(stamp + i).toISOString() },
    );
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
  const promote = new Set(waitlistOf(bookings, trip.id).slice(0, free).map((b) => b.id));
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
): BookResult {
  if (byTrip(snap.bookings, trip.id).some((b) => b.userId === user.id)) {
    return { ok: false, error: 'Du hast diese Fahrt schon gebucht.' };
  }
  const nowIso = new Date(now).toISOString();
  switch (getTripPhase(trip, now)) {
    case 'closed':
      return { ok: false, error: 'Die Fahrt ist bereits abgefahren.' };
    case 'interest':
      if (!user.isMember) return { ok: false, error: 'Nur Mitglieder können jetzt Interesse bekunden.' };
      return { ok: true, booking: { id, tripId: trip.id, userId: user.id, status: 'interested', createdAt: nowIso } };
    case 'open': {
      if (!user.isMember && !snap.settings.guestsMayBook) {
        return { ok: false, error: 'Die Buchung ist zurzeit nur für Mitglieder möglich.' };
      }
      const full = freeSeats(trip, snap.bookings) === 0;
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
  if (!(s.defaultPrice >= 0)) return 'Der Standardpreis darf nicht negativ sein.';
  if (!s.defaultMeetingPoint.trim()) return 'Bitte einen Standard-Treffpunkt angeben.';
  return null;
}
