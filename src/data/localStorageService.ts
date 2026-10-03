import { DEFAULT_SETTINGS, type Snapshot, type Trip, type User } from '../domain/types';
import { deriveAudit } from '../domain/audit';
import { deriveNotifications } from '../domain/notifications';
import { allocateAll, allocateTrip, cancelBlockedReason, createBooking, getTripPhase, interestEndFor, promoteWaitlist, validateSettings } from '../domain/rules';
import type { DataService, Result, TripInput } from './DataService';
import { buildSeed } from './seed';
import { sessionUserId } from './session';

const KEY = 'fanclub.data.v1';
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });
const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Fills fields that older stored data does not have yet. */
function migrate(raw: Partial<Snapshot>): Snapshot {
  return {
    users: (raw.users ?? []).map((u) => ({ ...u, emailPersonal: u.emailPersonal ?? true, emailBroadcast: u.emailBroadcast ?? false })),
    trips: (raw.trips ?? []).map((t) => ({ ...t, notes: t.notes ?? '', stops: t.stops ?? [], buses: t.buses ?? 1, points: t.points ?? 1 })),
    bookings: (raw.bookings ?? []).map((b) => ({ ...b, companions: b.companions ?? 0, companionNames: b.companionNames ?? '', paid: b.paid ?? false })),
    news: raw.news ?? [],
    notifications: raw.notifications ?? [],
    roster: raw.roster ?? [],
    audit: raw.audit ?? [],
    settings: { ...DEFAULT_SETTINGS, ...raw.settings },
  };
}

/** Keeps all data in this browser. Good for trying the app out, not for sharing between devices. */
export class LocalStorageService implements DataService {
  private cache: Snapshot | null = null;

  private async read(): Promise<Snapshot> {
    if (this.cache) return this.cache;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return this.write(migrate(JSON.parse(raw) as Partial<Snapshot>));
    } catch {
      /* corrupt or blocked storage: start over with demo data */
    }
    return this.write(await buildSeed());
  }

  private write(snap: Snapshot): Snapshot {
    this.cache = snap;
    try {
      localStorage.setItem(KEY, JSON.stringify(snap));
    } catch {
      /* storage unavailable: the app keeps working for this session */
    }
    return snap;
  }

  /** Reads, applies a change, hands out due seats and stores the result. */
  private async mutate(fn: (s: Snapshot, now: number) => Snapshot | string, quiet = false): Promise<Result> {
    const now = Date.now();
    const start = await this.read();
    const out = fn(allocateAll(start, now), now);
    if (typeof out === 'string') return fail(out);
    const end = allocateAll(out, now);
    this.write(this.withAudit(start, this.withNotifications(start, end, now), now, quiet));
    return ok;
  }

  /** Adds change log entries for what the logged-in person changed. */
  private withAudit(before: Snapshot, after: Snapshot, now: number, quiet: boolean): Snapshot {
    const id = sessionUserId();
    const person = [...before.users, ...after.users].find((u) => u.id === id);
    const actor = person ? { id: person.id, name: person.name } : null;
    const fresh = deriveAudit(before, after, actor, now, uid, quiet);
    return fresh.length === 0 ? after : { ...after, audit: [...fresh, ...after.audit].slice(0, 500) };
  }

  /** Adds the messages that follow from the difference between two states. */
  private withNotifications(before: Snapshot, after: Snapshot, now: number): Snapshot {
    const fresh = deriveNotifications(before, after, now, uid);
    return fresh.length === 0 ? after : { ...after, notifications: [...fresh, ...after.notifications].slice(0, 500) };
  }

  async load(): Promise<Snapshot> {
    const snap = await this.read();
    const next = allocateAll(snap, Date.now());
    return next === snap ? snap : this.write(this.withNotifications(snap, next, Date.now()));
  }

  addUser = (user: User): Promise<Result> =>
    this.mutate((s) => {
      if (s.users.some((u) => u.email === user.email)) return 'Diese E-Mail-Adresse ist schon registriert.';
      const onRoster = s.roster.some((r) => r.email === user.email.toLowerCase());
      return { ...s, users: [...s.users, onRoster ? { ...user, isMember: true, memberRequested: false } : user] };
    });

  importRoster: DataService['importRoster'] = async (entries) => {
    let added = 0;
    let updated = 0;
    let promoted = 0;
    const res = await this.mutate((s) => {
      const roster = new Map(s.roster.map((r) => [r.email, r]));
      for (const e of entries) {
        if (roster.has(e.email)) updated++;
        else added++;
        roster.set(e.email, e);
      }
      const users = s.users.map((u) => {
        if (u.isMember || !roster.has(u.email.toLowerCase())) return u;
        promoted++;
        return { ...u, isMember: true, memberRequested: false };
      });
      return { ...s, roster: [...roster.values()], users };
    }, true);
    return res.ok ? { ok: true, added, updated, promoted } : res;
  };

  clearRoster: DataService['clearRoster'] = () => this.mutate((s) => ({ ...s, roster: [] }));

  redeemMemberCode: DataService['redeemMemberCode'] = (userId, code) =>
    this.mutate((s) => {
      const expected = s.settings.memberCode.trim().toLowerCase();
      if (!expected || code.trim().toLowerCase() !== expected) return 'Dieser Code stimmt nicht.';
      return { ...s, users: s.users.map((u) => (u.id === userId ? { ...u, isMember: true, memberRequested: false } : u)) };
    });

  updateUser: DataService['updateUser'] = (id, patch) =>
    this.mutate((s) => {
      if (!s.users.some((u) => u.id === id)) return 'Benutzer nicht gefunden.';
      const clean = { ...patch };
      if (clean.isMember) clean.memberRequested = false;
      return { ...s, users: s.users.map((u) => (u.id === id ? { ...u, ...clean } : u)) };
    });

  updateMyName: DataService['updateMyName'] = (id, name) =>
    this.mutate((s) => {
      const clean = name.trim();
      if (!clean) return 'Bitte einen Namen angeben.';
      return { ...s, users: s.users.map((u) => (u.id === id ? { ...u, name: clean } : u)) };
    });

  setPasswordHash = (id: string, passwordHash: string): Promise<Result> =>
    this.mutate((s) => ({ ...s, users: s.users.map((u) => (u.id === id ? { ...u, passwordHash } : u)) }));

  deleteMyAccount: DataService['deleteMyAccount'] = (id) =>
    this.mutate((s) => {
      const me = s.users.find((u) => u.id === id);
      if (me?.isAdmin && !s.users.some((u) => u.isAdmin && u.id !== id)) {
        return 'Du bist der einzige Admin. Ernenne zuerst jemand anderen zum Admin.';
      }
      const bookings = s.bookings.filter((b) => b.userId !== id);
      return { ...s, users: s.users.filter((u) => u.id !== id), notifications: s.notifications.filter((n) => n.userId !== id), bookings: s.trips.reduce((acc, t) => promoteWaitlist(acc, t), bookings) };
    });

  deleteUser: DataService['deleteUser'] = (id) =>
    this.mutate((s) => {
      const bookings = s.bookings.filter((b) => b.userId !== id);
      const trips = s.trips;
      const promoted = trips.reduce((acc, t) => promoteWaitlist(acc, t), bookings);
      return { ...s, users: s.users.filter((u) => u.id !== id), bookings: promoted };
    });

  saveTrip: DataService['saveTrip'] = (id, input: TripInput) =>
    this.mutate((s, now) => {
      if (input.seats < 1) return 'Mindestens ein Platz.';
      if (!Number.isInteger(input.points) || input.points < 0 || input.points > 10) return 'Die Punkte müssen zwischen 0 und 10 liegen.';
      if (!Number.isInteger(input.buses) || input.buses < 1 || input.buses > 10) return 'Die Zahl der Busse muss zwischen 1 und 10 liegen.';
      if (Number.isNaN(Date.parse(input.departure))) return 'Bitte eine gültige Abfahrtszeit angeben.';
      if (id === null) {
        const createdAt = new Date(now).toISOString();
        const trip: Trip = { id: uid(), ...input, notes: input.notes ?? '', createdAt, interestEndsAt: interestEndFor(createdAt, s.settings.interestDays) };
        return { ...s, trips: [trip, ...s.trips] };
      }
      const existing = s.trips.find((t) => t.id === id);
      if (!existing) return 'Fahrt nicht gefunden.';
      const trips = s.trips.map((t) => (t.id === id ? { ...t, ...input } : t));
      const updated = trips.find((t) => t.id === id)!;
      return { ...s, trips, bookings: promoteWaitlist(s.bookings, updated) };
    });

  cancelTrip: DataService['cancelTrip'] = (tripId, reason) =>
    this.mutate((s, now) => {
      const trip = s.trips.find((t) => t.id === tripId);
      if (!trip || trip.cancelledAt) return 'Fahrt nicht gefunden oder schon abgesagt.';
      const cancelled = { ...trip, cancelledAt: new Date(now).toISOString(), cancelReason: reason.trim() || undefined };
      return { ...s, trips: s.trips.map((t) => (t.id === tripId ? cancelled : t)) };
    });

  deleteTrip: DataService['deleteTrip'] = (id) =>
    this.mutate((s) => ({ ...s, trips: s.trips.filter((t) => t.id !== id), bookings: s.bookings.filter((b) => b.tripId !== id) }));

  endInterestNow: DataService['endInterestNow'] = (tripId) =>
    this.mutate((s, now) => {
      const trip = s.trips.find((t) => t.id === tripId);
      if (!trip) return 'Fahrt nicht gefunden.';
      if (trip.cancelledAt) return 'Die Fahrt wurde abgesagt.';
      if (getTripPhase(trip, now) !== 'interest') return 'Die Interessensphase ist schon vorbei.';
      const trips = s.trips.map((t) => (t.id === tripId ? { ...t, interestEndsAt: new Date(now).toISOString() } : t));
      return allocateTrip({ ...s, trips }, tripId, now);
    });

  book: DataService['book'] = (tripId, userId, options) =>
    this.mutate((s, now) => {
      const trip = s.trips.find((t) => t.id === tripId);
      const user = s.users.find((u) => u.id === userId);
      if (!trip || !user) return 'Fahrt oder Benutzer nicht gefunden.';
      const res = createBooking(s, trip, user, now, uid(), options);
      return res.ok ? { ...s, bookings: [...s.bookings, res.booking] } : res.error;
    });

  setBookingBus: DataService['setBookingBus'] = (bookingId, bus) =>
    this.mutate((s) => {
      const booking = s.bookings.find((b) => b.id === bookingId);
      const trip = s.trips.find((t) => t.id === booking?.tripId);
      if (!booking || !trip) return 'Buchung nicht gefunden.';
      if (bus !== null && (bus < 1 || bus > trip.buses)) return 'Diesen Bus gibt es bei der Fahrt nicht.';
      return { ...s, bookings: s.bookings.map((b) => (b.id === bookingId ? { ...b, bus: bus ?? undefined } : b)) };
    });

  setBookingPaid: DataService['setBookingPaid'] = (bookingId, paid) =>
    this.mutate((s) =>
      s.bookings.some((b) => b.id === bookingId)
        ? { ...s, bookings: s.bookings.map((b) => (b.id === bookingId ? { ...b, paid } : b)) }
        : 'Buchung nicht gefunden.',
    );

  setBookingAttendance: DataService['setBookingAttendance'] = (bookingId, attended) =>
    this.mutate((s) => {
      const booking = s.bookings.find((b) => b.id === bookingId);
      if (!booking) return 'Buchung nicht gefunden.';
      if (booking.status !== 'confirmed') return 'Nur bestätigte Buchungen können abgehakt werden.';
      return { ...s, bookings: s.bookings.map((b) => (b.id === bookingId ? { ...b, attended: attended ?? undefined } : b)) };
    });

  cancel: DataService['cancel'] = (tripId, userId) =>
    this.mutate((s, now) => {
      const trip = s.trips.find((t) => t.id === tripId);
      const mine = s.bookings.find((b) => b.tripId === tripId && b.userId === userId);
      if (!trip || !mine) return 'Keine Buchung gefunden.';
      const blocked = cancelBlockedReason(mine, trip, s.settings, now);
      if (blocked) return blocked;
      const rest = s.bookings.filter((b) => b.id !== mine.id);
      return { ...s, bookings: promoteWaitlist(rest, trip) };
    });

  markNotificationsRead: DataService['markNotificationsRead'] = (userId) =>
    this.mutate((s, now) => ({
      ...s,
      notifications: s.notifications.map((n) => (n.userId === userId && !n.readAt ? { ...n, readAt: new Date(now).toISOString() } : n)),
    }));

  updateNotificationPrefs: DataService['updateNotificationPrefs'] = (userId, prefs) =>
    this.mutate((s) => ({ ...s, users: s.users.map((u) => (u.id === userId ? { ...u, ...prefs } : u)) }));

  saveNews: DataService['saveNews'] = (id, input, authorId) =>
    this.mutate((s, now) => {
      const title = input.title.trim();
      const body = input.body.trim();
      if (!title || !body) return 'Bitte Titel und Text angeben.';
      const stamp = new Date(now).toISOString();
      if (id === null) {
        return { ...s, news: [{ id: uid(), title, body, pinned: input.pinned, authorId, createdAt: stamp }, ...s.news] };
      }
      if (!s.news.some((n) => n.id === id)) return 'News nicht gefunden.';
      return { ...s, news: s.news.map((n) => (n.id === id ? { ...n, title, body, pinned: input.pinned, updatedAt: stamp } : n)) };
    });

  deleteNews: DataService['deleteNews'] = (id) => this.mutate((s) => ({ ...s, news: s.news.filter((n) => n.id !== id) }));

  saveSettings: DataService['saveSettings'] = (settings) =>
    this.mutate((s) => {
      const clean = { ...settings, clubName: settings.clubName.trim(), defaultMeetingPoint: settings.defaultMeetingPoint.trim() };
      return validateSettings(clean) ?? { ...s, settings: clean };
    });

  async resetDemo(): Promise<void> {
    this.write(await buildSeed());
  }
}
