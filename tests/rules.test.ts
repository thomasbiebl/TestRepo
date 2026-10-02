import { describe, expect, it } from 'vitest';
import { buildMyExport } from '../src/domain/exports';
import { buildIcs } from '../src/domain/ics';
import {
  allocateTrip, cancelBlockedReason, createBooking, getTripPhase, interestEndFor, pastTripCount, promoteWaitlist, validateSettings, waitlistOf,
} from '../src/domain/rules';
import { DEFAULT_SETTINGS, type Booking, type Settings, type Snapshot, type Trip, type User } from '../src/domain/types';

const DAY = 86_400_000;
const T0 = Date.parse('2026-11-01T10:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

const user = (id: string, o: Partial<User> = {}): User => ({
  id, email: `${id}@x.de`, name: id, passwordHash: '', isMember: true, isAdmin: false,
  memberRequested: false, baseTrips: 0, createdAt: iso(T0), ...o,
});
const trip = (o: Partial<Trip> = {}): Trip => ({
  id: 't1', title: 'Augsburg', departure: iso(T0 + 14 * DAY), meetingPoint: 'P', price: 20, seats: 2, notes: '',
  createdAt: iso(T0), interestEndsAt: interestEndFor(iso(T0)), ...o,
});
const booking = (userId: string, status: Booking['status'], at = 0, tripId = 't1'): Booking => ({
  id: `${tripId}-${userId}`, tripId, userId, status, createdAt: iso(T0 + at),
});
const snap = (users: User[], trips: Trip[], bookings: Booking[], settings: Partial<Settings> = {}): Snapshot => ({
  users, trips, bookings, news: [], settings: { ...DEFAULT_SETTINGS, ...settings },
});

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

describe('settings', () => {
  it('uses the configured lead time for the interest end', () => {
    expect(interestEndFor(iso(T0), 1)).toBe(iso(T0 + DAY));
    expect(interestEndFor(iso(T0), 0)).toBe(iso(T0));
    expect(interestEndFor(iso(T0))).toBe(iso(T0 + 3 * DAY));
  });

  it('blocks guests after the allocation when guestsMayBook is off', () => {
    const guest = user('g', { isMember: false });
    const member = user('m');
    const s = snap([guest, member], [trip()], [], { guestsMayBook: false });
    const now = T0 + 4 * DAY;
    expect(createBooking(s, s.trips[0]!, guest, now, 'x').ok).toBe(false);
    expect(createBooking(s, s.trips[0]!, member, now, 'x').ok).toBe(true);
  });

  it('refuses bookings on a full trip when the waiting list is off', () => {
    const member = user('m');
    const s = snap([member], [trip()], [booking('a', 'confirmed'), booking('b', 'confirmed')], { waitlistEnabled: false });
    expect(createBooking(s, s.trips[0]!, member, T0 + 4 * DAY, 'x').ok).toBe(false);
  });

  it('validates settings', () => {
    expect(validateSettings(DEFAULT_SETTINGS)).toBeNull();
    expect(validateSettings({ ...DEFAULT_SETTINGS, interestDays: -1 })).not.toBeNull();
    expect(validateSettings({ ...DEFAULT_SETTINGS, interestDays: 1.5 })).not.toBeNull();
    expect(validateSettings({ ...DEFAULT_SETTINGS, interestDays: 31 })).not.toBeNull();
    expect(validateSettings({ ...DEFAULT_SETTINGS, defaultSeats: 0 })).not.toBeNull();
    expect(validateSettings({ ...DEFAULT_SETTINGS, clubName: '  ' })).not.toBeNull();
  });
});

describe('data export', () => {
  it('contains the profile and own bookings only', () => {
    const me = user('a', { name: 'Anna', baseTrips: 4 });
    const other = user('b');
    const s = snap([me, other], [trip()], [booking('a', 'confirmed'), booking('b', 'confirmed')]);
    const out = buildMyExport(s, me, new Date(T0));
    expect(out.profile).toMatchObject({ name: 'Anna', tripsBeforeApp: 4 });
    expect(out.bookings).toHaveLength(1);
    expect(out.bookings[0]).toMatchObject({ trip: 'Augsburg', status: 'confirmed' });
    expect(JSON.stringify(out)).not.toContain('passwordHash');
  });
});

describe('cancelled trips and cancellation deadline', () => {
  const cancelled = trip({ cancelledAt: iso(T0 + DAY), cancelReason: 'Schnee' });

  it('reports the cancelled phase, refuses bookings and allocation', () => {
    expect(getTripPhase(cancelled, T0 + 2 * DAY)).toBe('cancelled');
    const m = user('m');
    const s = snap([m], [cancelled], [booking('m', 'interested')]);
    const r = createBooking(s, cancelled, m, T0 + 4 * DAY, 'x');
    expect(r.ok).toBe(false);
    expect(allocateTrip(s, 't1', T0 + 4 * DAY)).toBe(s);
  });

  it('binds confirmed seats to the deadline, but never interest or waiting list entries', () => {
    const t = trip();
    const settings = { ...DEFAULT_SETTINGS, cancelDeadlineHours: 48 };
    const dep = Date.parse(t.departure);
    expect(cancelBlockedReason(booking('a', 'confirmed'), t, settings, dep - 49 * 3_600_000)).toBeNull();
    expect(cancelBlockedReason(booking('a', 'confirmed'), t, settings, dep - 47 * 3_600_000)).toMatch(/48 Stunden/);
    expect(cancelBlockedReason(booking('a', 'waitlist'), t, settings, dep - 1 * 3_600_000)).toBeNull();
    expect(cancelBlockedReason(booking('a', 'confirmed'), t, DEFAULT_SETTINGS, dep - 1)).toBeNull();
    expect(cancelBlockedReason(booking('a', 'confirmed'), t, DEFAULT_SETTINGS, dep + 1)).toMatch(/abgefahren/);
  });

  it('validates the deadline setting', () => {
    expect(validateSettings({ ...DEFAULT_SETTINGS, cancelDeadlineHours: 721 })).not.toBeNull();
    expect(validateSettings({ ...DEFAULT_SETTINGS, cancelDeadlineHours: 24 })).toBeNull();
  });
});

describe('calendar export', () => {
  it('builds a valid event with escaped text and CRLF lines', () => {
    const ics = buildIcs(trip({ title: 'Augsburg, (A)', notes: 'Treffpunkt; pünktlich\nGetränke mit', kickoff: iso(T0 + 14 * DAY + 5 * 3_600_000) }), new Date(T0));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART:20261115T100000Z');
    expect(ics).toContain('SUMMARY:Busfahrt: Augsburg\\, (A)');
    expect(ics.replace(/\r\n /g, '')).toContain('Treffpunkt\\; pünktlich\\nGetränke mit');
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
  });
});
