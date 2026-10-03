import { allocateTrip, rankInterested, seatsOf, waitlistOf } from '../domain/rules';
import { DEFAULT_SETTINGS, type Booking, type Snapshot, type Trip, type User } from '../domain/types';

export interface ExampleRow {
  name: string;
  score: number;
  seats: number;
  result: 'Platz' | 'Warteliste';
  /** Position on the waiting list (1 = first to move up). */
  waitPosition?: number;
}

export const EXAMPLE_SEATS = 6;

const T0 = Date.parse('2026-03-01T10:00:00Z');
const HOUR = 3_600_000;

/**
 * A made-up trip with six seats, used in the help to show how seats are handed out.
 * The result is calculated with the real allocation, so the help cannot drift from the app.
 */
export function exampleAllocation(): ExampleRow[] {
  const people: { id: string; name: string; score: number; companions: number; hoursAfterStart: number }[] = [
    { id: 'max', name: 'Max', score: 14, companions: 0, hoursAfterStart: 30 },
    { id: 'julia', name: 'Julia', score: 12, companions: 1, hoursAfterStart: 5 },
    { id: 'karl', name: 'Karl', score: 12, companions: 3, hoursAfterStart: 20 },
    { id: 'anna', name: 'Anna', score: 9, companions: 0, hoursAfterStart: 2 },
    { id: 'sophie', name: 'Sophie', score: 5, companions: 1, hoursAfterStart: 50 },
    { id: 'lukas', name: 'Lukas', score: 2, companions: 0, hoursAfterStart: 1 },
  ];
  const iso = (ms: number) => new Date(ms).toISOString();
  const users: User[] = people.map((p) => ({
    id: p.id, email: `${p.id}@example.org`, name: p.name, passwordHash: '', isMember: true, isAdmin: false,
    memberRequested: false, baseTrips: p.score, createdAt: iso(T0 - 1000 * HOUR), emailPersonal: true, emailBroadcast: false,
  }));
  const trip: Trip = {
    id: 'example', title: 'Beispiel', departure: iso(T0 + 600 * HOUR), meetingPoint: '', price: 30, seats: EXAMPLE_SEATS, notes: '',
    createdAt: iso(T0), interestEndsAt: iso(T0 + 72 * HOUR), stops: [], buses: 1, points: 1,
  };
  const bookings: Booking[] = people.map((p) => ({
    id: p.id, tripId: 'example', userId: p.id, status: 'interested', createdAt: iso(T0 + p.hoursAfterStart * HOUR),
    companions: p.companions, companionNames: '', paid: false,
  }));
  const before: Snapshot = {
    users, trips: [trip], bookings, news: [], notifications: [], roster: [], audit: [], settings: { ...DEFAULT_SETTINGS },
  };
  const now = T0 + 73 * HOUR;
  const after = allocateTrip(before, 'example', now);
  const waiting = waitlistOf(after.bookings, 'example').map((b) => b.id);
  return rankInterested(trip, before, now).map(({ booking, user, score }) => {
    const done = after.bookings.find((b) => b.id === booking.id)!;
    return {
      name: user.name,
      score,
      seats: seatsOf(booking),
      result: done.status === 'confirmed' ? 'Platz' : 'Warteliste',
      waitPosition: done.status === 'waitlist' ? waiting.indexOf(done.id) + 1 : undefined,
    };
  });
}
