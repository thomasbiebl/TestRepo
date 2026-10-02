import { describe, expect, it } from 'vitest';
import { buildMyExport } from '../src/domain/exports';
import { deriveAudit } from '../src/domain/audit';
import { buildIcs } from '../src/domain/ics';
import { deriveNotifications } from '../src/domain/notifications';
import { buildParticipantCsv, passengersByBus } from '../src/domain/participants';
import {
  allocateAll, allocateTrip, cancelBlockedReason, createBooking, freeSeats, getTripPhase, interestEndFor, noShowCount, pastTripCount, promoteWaitlist, tripTotals, userScore, validateSettings, waitlistOf,
} from '../src/domain/rules';
import { DEFAULT_SETTINGS, type Booking, type Settings, type Snapshot, type Trip, type User } from '../src/domain/types';

const DAY = 86_400_000;
const T0 = Date.parse('2026-11-01T10:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

const user = (id: string, o: Partial<User> = {}): User => ({
  id, email: `${id}@x.de`, name: id, passwordHash: '', isMember: true, isAdmin: false,
  memberRequested: false, baseTrips: 0, createdAt: iso(T0), emailPersonal: true, emailBroadcast: false, ...o,
});
const trip = (o: Partial<Trip> = {}): Trip => ({
  id: 't1', title: 'Augsburg', departure: iso(T0 + 14 * DAY), meetingPoint: 'P', price: 20, seats: 2, notes: '', stops: [], buses: 1, points: 1,
  createdAt: iso(T0), interestEndsAt: interestEndFor(iso(T0)), ...o,
});
const booking = (userId: string, status: Booking['status'], at = 0, tripId = 't1'): Booking => ({
  id: `${tripId}-${userId}`, tripId, userId, status, createdAt: iso(T0 + at), companions: 0, companionNames: '', paid: false,
});
const snap = (users: User[], trips: Trip[], bookings: Booking[], settings: Partial<Settings> = {}): Snapshot => ({
  users, trips, bookings, news: [], notifications: [], roster: [], audit: [], settings: { ...DEFAULT_SETTINGS, ...settings },
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

describe('companions and boarding points', () => {
  const group = (userId: string, companions: number, status: Booking['status'], at = 0): Booking => ({ ...booking(userId, status, at), companions });

  it('counts people, not bookings, against the seats', () => {
    const s = snap([user('a'), user('b'), user('c')], [trip({ seats: 4 })], [group('a', 2, 'confirmed')]);
    expect(freeSeats(s.trips[0]!, s.bookings)).toBe(1);
    const open = T0 + 4 * DAY;
    const two = createBooking(s, s.trips[0]!, user('b'), open, 'x', { companions: 1, companionNames: '' });
    expect(two.ok && two.booking.status).toBe('waitlist');
    const one = createBooking(s, s.trips[0]!, user('c'), open, 'y', { companions: 0, companionNames: '' });
    expect(one.ok && one.booking.status).toBe('confirmed');
  });

  it('limits companions to the setting and can switch them off', () => {
    const m = user('m');
    const s = snap([m], [trip()], [], { maxCompanions: 1 });
    const tooMany = createBooking(s, s.trips[0]!, m, T0 + DAY, 'x', { companions: 2, companionNames: '' });
    expect(tooMany.ok).toBe(false);
    const off = snap([m], [trip()], [], { maxCompanions: 0 });
    expect(createBooking(off, off.trips[0]!, m, T0 + DAY, 'x', { companions: 1, companionNames: '' }).ok).toBe(false);
  });

  it('skips a group that does not fit, lets smaller later claims in, and promotes whoever fits', () => {
    const users = [user('a', { baseTrips: 9 }), user('b', { baseTrips: 8 }), user('c', { baseTrips: 7 })];
    const t = trip({ seats: 4 });
    const s = snap(users, [t], [group('a', 2, 'interested', 1), group('b', 2, 'interested', 2), group('c', 0, 'interested', 3)]);
    const out = allocateTrip(s, 't1', T0 + 3 * DAY);
    const status = Object.fromEntries(out.bookings.map((b) => [b.userId, b.status]));
    expect(status).toEqual({ a: 'confirmed', b: 'waitlist', c: 'confirmed' });
    // a cancels: the group of three (b) needs 3 seats but only 3 are free -> promoted
    const rest = out.bookings.filter((b) => b.userId !== 'a');
    const promoted = promoteWaitlist(rest, out.trips[0]!);
    expect(promoted.find((b) => b.userId === 'b')?.status).toBe('confirmed');
  });

  it('requires a valid boarding point when the trip has stops', () => {
    const m = user('m');
    const t = trip({ stops: ['Stadion', 'Bahnhof'] });
    const s = snap([m], [t], []);
    expect(createBooking(s, t, m, T0 + DAY, 'x').ok).toBe(false);
    expect(createBooking(s, t, m, T0 + DAY, 'x', { companions: 0, companionNames: '', stop: 'Flughafen' }).ok).toBe(false);
    const ok = createBooking(s, t, m, T0 + DAY, 'x', { companions: 0, companionNames: '', stop: 'Bahnhof' });
    expect(ok.ok && ok.booking.stop).toBe('Bahnhof');
    const plain = trip();
    const noStop = createBooking(snap([m], [plain], []), plain, m, T0 + DAY, 'x', { companions: 0, companionNames: '', stop: 'Egal' });
    expect(noStop.ok && noStop.booking.stop).toBeUndefined();
  });
});

describe('points, no-shows and payment', () => {
  const past = (id: string, points = 1, o: Partial<Trip> = {}) => trip({ id, departure: iso(T0 - DAY), points, ...o });
  const seat = (userId: string, tripId: string, attended?: boolean): Booking => ({ ...booking(userId, 'confirmed', -DAY, tripId), attended });

  it('earns the points of each trip taken and ignores cancelled trips', () => {
    const u = user('a', { baseTrips: 2 });
    const trips = [past('p1', 3), past('p2', 1), past('p3', 5, { cancelledAt: iso(T0 - 2 * DAY) })];
    const bookings = [seat('a', 'p1'), seat('a', 'p2'), seat('a', 'p3')];
    expect(userScore(u, trips, bookings, T0, DEFAULT_SETTINGS)).toBe(2 + 3 + 1);
    expect(pastTripCount(u, trips, bookings, T0)).toBe(4);
  });

  it('gives nothing for a no-show and deducts the penalty, never below zero', () => {
    const u = user('a', { baseTrips: 1 });
    const trips = [past('p1', 2), past('p2', 2)];
    const bookings = [seat('a', 'p1', true), seat('a', 'p2', false)];
    expect(userScore(u, trips, bookings, T0, DEFAULT_SETTINGS)).toBe(1 + 2);
    expect(userScore(u, trips, bookings, T0, { ...DEFAULT_SETTINGS, noShowPenalty: 2 })).toBe(1);
    expect(userScore(u, trips, bookings, T0, { ...DEFAULT_SETTINGS, noShowPenalty: 10 })).toBe(0);
    expect(noShowCount(u, trips, bookings, T0)).toBe(1);
    expect(pastTripCount(u, trips, bookings, T0)).toBe(2);
  });

  it('ranks interested members by score, so a no-show can lose the seat', () => {
    const a = user('a', { baseTrips: 5 });
    const b = user('b', { baseTrips: 5 });
    const old = past('p1');
    const settings = { noShowPenalty: 3 };
    const s = snap([a, b], [old, trip({ seats: 1 })], [seat('a', 'p1', false), seat('b', 'p1', true), booking('a', 'interested', 1), booking('b', 'interested', 2)], settings);
    const out = allocateTrip(s, 't1', T0 + 3 * DAY);
    expect(out.bookings.filter((x) => x.tripId === 't1').map((x) => [x.userId, x.status])).toEqual([['a', 'waitlist'], ['b', 'confirmed']]);
  });

  it('sums up what is expected, paid and open for confirmed bookings only', () => {
    const t = trip({ price: 25 });
    const bookings: Booking[] = [
      { ...booking('a', 'confirmed'), companions: 1, paid: true },
      { ...booking('b', 'confirmed') },
      { ...booking('c', 'waitlist') },
    ];
    expect(tripTotals(t, bookings)).toEqual({ people: 3, expected: 75, paid: 50, open: 25 });
  });

  it('builds a passenger list per bus and an Excel friendly CSV', () => {
    const t = trip({ buses: 2, price: 10 });
    const users = [user('anna', { name: 'Anna' }), user('bert', { name: 'Bert "B"' }), user('cora', { name: 'Cora' })];
    const bookings: Booking[] = [
      { ...booking('anna', 'confirmed'), bus: 2, stop: 'Bahnhof', paid: true, attended: true },
      { ...booking('bert', 'confirmed'), bus: 1, companions: 1, companionNames: 'Moritz' },
      { ...booking('cora', 'confirmed') },
      { ...booking('cora2', 'waitlist') },
    ];
    const s = snap(users, [t], bookings);
    const groups = passengersByBus(t, s);
    expect([...groups.keys()]).toEqual([1, 2, 0]);
    const csv = buildParticipantCsv(t, s);
    expect(csv.startsWith('﻿"Name";"E-Mail"')).toBe(true);
    expect(csv).toContain('"Bert ""B""";"bert@x.de";"bestätigt";"2";"1";"Moritz";"";"1";"20,00";"nein";""');
    expect(csv).toContain('"Anna";"anna@x.de";"bestätigt";"1";"0";"";"Bahnhof";"2";"10,00";"ja";"ja"');
  });
});

describe('notifications', () => {
  let n = 0;
  const id = () => `n${++n}`;
  const types = (list: { userId: string; type: string }[]) => list.map((x) => `${x.userId}:${x.type}`).sort();

  it('tells people about the allocation: confirmed or waiting list', () => {
    const users = [user('a', { baseTrips: 9 }), user('b', { baseTrips: 1 })];
    const before = snap(users, [trip({ seats: 1 })], [booking('a', 'interested', 1), booking('b', 'interested', 2)]);
    const after = allocateAll(before, T0 + 3 * DAY);
    expect(types(deriveNotifications(before, after, T0 + 3 * DAY, id))).toEqual(['a:allocated', 'b:waitlisted']);
  });

  it('tells a person who moved up from the waiting list, but not about their own booking', () => {
    const before = snap([user('a'), user('w')], [trip()], [booking('a', 'confirmed'), { ...booking('w', 'waitlist'), queuedAt: iso(T0) }]);
    const after = { ...before, bookings: promoteWaitlist(before.bookings.filter((b) => b.userId !== 'a'), before.trips[0]!) };
    expect(types(deriveNotifications(before, after, T0, id))).toEqual(['w:promoted']);
    const booked = { ...before, bookings: [...before.bookings, booking('x', 'confirmed')] };
    expect(deriveNotifications(before, booked, T0, id)).toEqual([]);
  });

  it('sends new trips to everybody, news to everybody but the author, and cancellations to booked people', () => {
    const users = [user('a'), user('b'), user('c')];
    const base = snap(users, [], []);
    const withTrip = { ...base, trips: [trip()] };
    expect(types(deriveNotifications(base, withTrip, T0, id))).toEqual(['a:new_trip', 'b:new_trip', 'c:new_trip']);

    const withNews = { ...base, news: [{ id: 'x', title: 'Hallo', body: 'Text', authorId: 'a', pinned: false, createdAt: iso(T0) }] };
    expect(types(deriveNotifications(base, withNews, T0, id))).toEqual(['b:news', 'c:news']);

    const booked = snap(users, [trip()], [booking('a', 'confirmed'), booking('b', 'interested')]);
    const cancelled = { ...booked, trips: [trip({ cancelledAt: iso(T0), cancelReason: 'Schnee' })] };
    const out = deriveNotifications(booked, cancelled, T0, id);
    expect(types(out)).toEqual(['a:trip_cancelled', 'b:trip_cancelled']);
    expect(out[0]!.body).toBe('Schnee');
  });

  it('does not repeat messages when nothing changed', () => {
    const s = snap([user('a')], [trip()], [booking('a', 'confirmed')]);
    expect(deriveNotifications(s, s, T0, id)).toEqual([]);
  });
});

describe('change log', () => {
  let n = 0;
  const id = () => `a${++n}`;
  const admin = { id: 'admin', name: 'Admin' };
  const actions = (list: { action: string }[]) => list.map((e) => e.action);

  it('describes trip, news and settings changes with who did it', () => {
    const before = snap([user('a')], [trip()], []);
    const after = {
      ...before,
      trips: [trip({ seats: 5 }), trip({ id: 't2', title: 'Mainz' })],
      news: [{ id: 'x', title: 'Neu', body: 'b', authorId: 'admin', pinned: false, createdAt: iso(T0) }],
      settings: { ...before.settings, interestDays: 1, maxCompanions: 0, memberCode: 'Adler' },
    };
    const out = deriveAudit(before, after, admin, T0, id);
    expect(actions(out)).toEqual(['trip_updated', 'trip_created', 'news_created', 'settings_changed', 'member_code_changed']);
    expect(out[3]!.detail).toBe('Vorlauf für Mitglieder, Begleitpersonen');
    expect(out.every((e) => e.actorName === 'Admin')).toBe(true);
    expect(out.map((e) => e.detail).join('|')).not.toContain('Adler');
  });

  it('logs cancellations, early end of the interest phase and deletions', () => {
    const before = snap([user('a')], [trip(), trip({ id: 't2', title: 'Weg' })], []);
    const after = { ...before, trips: [trip({ cancelledAt: iso(T0), cancelReason: 'Schnee' })] };
    expect(deriveAudit(before, after, admin, T0, id).map((e) => `${e.action}:${e.detail}`)).toEqual(['trip_cancelled:Augsburg: Schnee', 'trip_deleted:Weg']);
    const ended = { ...before, trips: [trip({ interestEndsAt: iso(T0) }), before.trips[1]!] };
    expect(actions(deriveAudit(before, ended, admin, T0, id))).toEqual(['interest_ended']);
  });

  it('logs user, payment and attendance changes, and ignores what the system does on its own', () => {
    const before = snap([user('a', { name: 'Anna' })], [trip()], [booking('a', 'interested')]);
    const allocated = allocateAll(before, T0 + 3 * DAY);
    expect(deriveAudit(before, allocated, null, T0, id)).toEqual([]);
    const after = {
      ...allocated,
      users: [{ ...allocated.users[0]!, isAdmin: true, baseTrips: 4 }],
      bookings: allocated.bookings.map((b) => ({ ...b, paid: true, attended: false, bus: 2 })),
    };
    const out = deriveAudit(allocated, after, admin, T0, id);
    expect(out.map((e) => e.detail)).toEqual([
      'Anna: jetzt Admin', 'Anna: Startwert 0 → 4', 'Anna · Augsburg: bezahlt', 'Anna · Augsburg: nicht erschienen', 'Anna · Augsburg: Bus 2',
    ]);
    const gone = { ...after, users: [] };
    expect(deriveAudit(after, gone, admin, T0, id).map((e) => e.action)).toContain('user_deleted');
  });

  it('logs list imports once, without a line for every new member when quiet', () => {
    const before = snap([user('a', { isMember: false })], [], []);
    const after = { ...before, users: [{ ...before.users[0]!, isMember: true }], roster: [{ email: 'a@x.de', name: 'A', memberNumber: '1' }] };
    expect(deriveAudit(before, after, admin, T0, id, true).map((e) => `${e.action}:${e.detail}`)).toEqual(['roster_imported:1 neu, 0 aktualisiert, 1 zu Mitgliedern']);
    expect(actions(deriveAudit(before, after, admin, T0, id))).toContain('member_changed');
    expect(actions(deriveAudit(after, { ...after, roster: [] }, admin, T0, id))).toEqual(['roster_cleared']);
  });
});
