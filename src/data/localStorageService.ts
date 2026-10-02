import type { Snapshot, Trip } from '../domain/types';
import { allocateAll, allocateTrip, createBooking, interestEndFor, promoteWaitlist, getTripPhase } from '../domain/rules';
import type { DataService, Result, TripInput } from './DataService';
import { buildSeed } from './seed';

const KEY = 'fanclub.data.v1';
const ok: Result = { ok: true };
const fail = (error: string): Result => ({ ok: false, error });
const uid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Keeps all data in this browser. Good for trying the app out, not for sharing between devices. */
export class LocalStorageService implements DataService {
  private cache: Snapshot | null = null;

  private async read(): Promise<Snapshot> {
    if (this.cache) return this.cache;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return (this.cache = JSON.parse(raw) as Snapshot);
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
  private async mutate(fn: (s: Snapshot, now: number) => Snapshot | string): Promise<Result> {
    const now = Date.now();
    const out = fn(await this.read(), now);
    if (typeof out === 'string') return fail(out);
    this.write(allocateAll(out, now));
    return ok;
  }

  async load(): Promise<Snapshot> {
    const snap = await this.read();
    const next = allocateAll(snap, Date.now());
    return next === snap ? snap : this.write(next);
  }

  addUser: DataService['addUser'] = (user) =>
    this.mutate((s) =>
      s.users.some((u) => u.email === user.email) ? 'Diese E-Mail-Adresse ist schon registriert.' : { ...s, users: [...s.users, user] },
    );

  updateUser: DataService['updateUser'] = (id, patch) =>
    this.mutate((s) => {
      if (!s.users.some((u) => u.id === id)) return 'Benutzer nicht gefunden.';
      const clean = { ...patch };
      if (clean.isMember) clean.memberRequested = false;
      return { ...s, users: s.users.map((u) => (u.id === id ? { ...u, ...clean } : u)) };
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
      if (Number.isNaN(Date.parse(input.departure))) return 'Bitte eine gültige Abfahrtszeit angeben.';
      if (id === null) {
        const createdAt = new Date(now).toISOString();
        const trip: Trip = { id: uid(), ...input, createdAt, interestEndsAt: interestEndFor(createdAt) };
        return { ...s, trips: [trip, ...s.trips] };
      }
      const existing = s.trips.find((t) => t.id === id);
      if (!existing) return 'Fahrt nicht gefunden.';
      const trips = s.trips.map((t) => (t.id === id ? { ...t, ...input } : t));
      const updated = trips.find((t) => t.id === id)!;
      return { ...s, trips, bookings: promoteWaitlist(s.bookings, updated) };
    });

  deleteTrip: DataService['deleteTrip'] = (id) =>
    this.mutate((s) => ({ ...s, trips: s.trips.filter((t) => t.id !== id), bookings: s.bookings.filter((b) => b.tripId !== id) }));

  endInterestNow: DataService['endInterestNow'] = (tripId) =>
    this.mutate((s, now) => {
      const trip = s.trips.find((t) => t.id === tripId);
      if (!trip) return 'Fahrt nicht gefunden.';
      if (getTripPhase(trip, now) !== 'interest') return 'Die Interessensphase ist schon vorbei.';
      const trips = s.trips.map((t) => (t.id === tripId ? { ...t, interestEndsAt: new Date(now).toISOString() } : t));
      return allocateTrip({ ...s, trips }, tripId, now);
    });

  book: DataService['book'] = (tripId, userId) =>
    this.mutate((s, now) => {
      const trip = s.trips.find((t) => t.id === tripId);
      const user = s.users.find((u) => u.id === userId);
      if (!trip || !user) return 'Fahrt oder Benutzer nicht gefunden.';
      const res = createBooking(s, trip, user, now, uid());
      return res.ok ? { ...s, bookings: [...s.bookings, res.booking] } : res.error;
    });

  cancel: DataService['cancel'] = (tripId, userId) =>
    this.mutate((s, now) => {
      const trip = s.trips.find((t) => t.id === tripId);
      const mine = s.bookings.find((b) => b.tripId === tripId && b.userId === userId);
      if (!trip || !mine) return 'Keine Buchung gefunden.';
      if (getTripPhase(trip, now) === 'closed') return 'Die Fahrt ist bereits abgefahren.';
      const rest = s.bookings.filter((b) => b.id !== mine.id);
      return { ...s, bookings: promoteWaitlist(rest, trip) };
    });

  async resetDemo(): Promise<void> {
    this.write(await buildSeed());
  }
}
