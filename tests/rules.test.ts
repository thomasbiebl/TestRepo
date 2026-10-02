import { describe, expect, it } from 'vitest';
import {
  allocateTrip, createBooking, getTripPhase, interestEndFor, pastTripCount, promoteWaitlist, waitlistOf,
} from '../src/domain/rules';
import type { Booking, Snapshot, Trip, User } from '../src/domain/types';

const DAY = 86_400_000;
const T0 = Date.parse('2026-11-01T10:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

const user = (id: string, o: Partial<User> = {}): User => ({
  id, email: `${id}@x.de`, name: id, passwordHash: '', isMember: true, isAdmin: false,
  memberRequested: false, baseTrips: 0, createdAt: iso(T0), ...o,
});
const trip = (o: Partial<Trip> = {}): Trip => ({
  id: 't1', title: 'Augsburg', departure: iso(T0 + 14 * DAY), meetingPoint: 'P', price: 20, seats: 2,
  createdAt: iso(T0), interestEndsAt: interestEndFor(iso(T0)), ...o,
});
const booking = (userId: string, status: Booking['status'], at = 0, tripId = 't1'): Booking => ({
  id: `${tripId}-${userId}`, tripId, userId, status, createdAt: iso(T0 + at),
});
const snap = (users: User[], trips: Trip[], bookings: Booking[]): Snapshot => ({ users, trips, bookings });

describe('phases', () => {
  it('switches after 3 days and closes at departure', () => {
    const t = trip();
    expect(getTripPhase(t, T0 + 3 * DAY - 1)).toBe('interest');
    expect(getTripPhase(t, T0 + 3 * DAY)).toBe('open');
    expect(getTripPhase(t, T0 + 14 * DAY)).toBe('closed');
  });
});

describe('allocation', () => {
  const users = [user('a', { baseTrips: 5 }), user('b', { baseTrips: 9 }), user('c', { baseTrips: 9 })];
  const base = snap(users, [trip()], [booking('a', 'interested', 1), booking('b', 'interested', 3), booking('c', 'interested', 2)]);

  it('does nothing while the interest phase runs', () => {
    expect(allocateTrip(base, 't1', T0 + DAY)).toBe(base);
  });

  it('ranks by past trips, ties by earlier interest, rest goes to the waiting list', () => {
    const out = allocateTrip(base, 't1', T0 + 3 * DAY);
    const status = Object.fromEntries(out.bookings.map((b) => [b.userId, b.status]));
    expect(status).toEqual({ c: 'confirmed', b: 'confirmed', a: 'waitlist' });
    expect(out.trips[0]?.allocatedAt).toBeDefined();
  });

  it('is idempotent', () => {
    const once = allocateTrip(base, 't1', T0 + 3 * DAY);
    expect(allocateTrip(once, 't1', T0 + 4 * DAY)).toBe(once);
  });

  it('counts confirmed seats on departed trips', () => {
    const old = trip({ id: 'old', departure: iso(T0 - DAY) });
    const s = snap([user('a', { baseTrips: 2 })], [old], [booking('a', 'confirmed', -DAY, 'old')]);
    expect(pastTripCount(s.users[0]!, s.trips, s.bookings, T0)).toBe(3);
  });
});

describe('booking', () => {
  const guest = user('g', { isMember: false });
  const member = user('m');
  const s = snap([guest, member], [trip()], []);

  it('blocks non-members during the interest phase', () => {
    expect(createBooking(s, s.trips[0]!, guest, T0 + DAY, 'x').ok).toBe(false);
    const r = createBooking(s, s.trips[0]!, member, T0 + DAY, 'x');
    expect(r.ok && r.booking.status).toBe('interested');
  });

  it('lets everyone book when open, and uses the waiting list when full', () => {
    const now = T0 + 4 * DAY;
    const full = snap([guest, member], [trip()], [booking('a', 'confirmed'), booking('b', 'confirmed')]);
    const r1 = createBooking(s, s.trips[0]!, guest, now, 'x');
    expect(r1.ok && r1.booking.status).toBe('confirmed');
    const r2 = createBooking(full, full.trips[0]!, guest, now, 'x');
    expect(r2.ok && r2.booking.status).toBe('waitlist');
  });

  it('rejects double bookings and departed trips', () => {
    const has = snap([member], [trip()], [booking('m', 'confirmed')]);
    expect(createBooking(has, has.trips[0]!, member, T0 + 4 * DAY, 'x').ok).toBe(false);
    expect(createBooking(s, s.trips[0]!, member, T0 + 15 * DAY, 'x').ok).toBe(false);
  });
});

describe('waiting list', () => {
  it('promotes in queue order when a seat frees up', () => {
    const t = trip();
    const bookings: Booking[] = [
      booking('a', 'confirmed'),
      { ...booking('w2', 'waitlist'), queuedAt: iso(T0 + 20) },
      { ...booking('w1', 'waitlist'), queuedAt: iso(T0 + 10) },
    ];
    const out = promoteWaitlist(bookings, t);
    expect(out.find((b) => b.userId === 'w1')?.status).toBe('confirmed');
    expect(waitlistOf(out, 't1').map((b) => b.userId)).toEqual(['w2']);
  });
});
