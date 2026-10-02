import type { Booking, Snapshot, Trip, User } from '../domain/types';
import { interestEndFor } from '../domain/rules';

const DAY = 86_400_000;
const HOUR = 3_600_000;

export const DEMO_PASSWORD = 'demo123';
export const ADMIN_EMAIL = 'admin@fanclub.test';
export const ADMIN_PASSWORD = 'admin123';

export async function hashPassword(password: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`fanclub:${password}`));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `plain:${password}`;
}

/** Demo data relative to `now`, so both phases are visible right after the first start. */
export async function buildSeed(now = Date.now()): Promise<Snapshot> {
  const iso = (ms: number) => new Date(ms).toISOString();
  const demoHash = await hashPassword(DEMO_PASSWORD);
  const mk = (id: string, name: string, baseTrips: number, isMember = true): User => ({
    id, name, email: `${id}@fanclub.test`, passwordHash: demoHash, isMember, isAdmin: false,
    memberRequested: false, baseTrips, createdAt: iso(now - 90 * DAY),
  });
  const users: User[] = [
    { ...mk('admin', 'Admin', 30), email: ADMIN_EMAIL, passwordHash: await hashPassword(ADMIN_PASSWORD), isAdmin: true },
    mk('max', 'Max Huber', 23),
    mk('julia', 'Julia Schmid', 21),
    mk('karl', 'Karl Bauer', 19),
    mk('anna', 'Anna Maier', 17),
    mk('sophie', 'Sophie Braun', 9),
    mk('lukas', 'Lukas Weiß', 0, false),
  ];

  const trips: Trip[] = [
    {
      id: 'augsburg', title: 'Augsburg (A)', departure: iso(now + 12 * DAY), meetingPoint: 'Parkplatz Stadion',
      price: 28, seats: 4, createdAt: iso(now - (3 * DAY - 30 * HOUR)),
      interestEndsAt: interestEndFor(iso(now - (3 * DAY - 30 * HOUR))),
    },
    {
      id: 'leipzig', title: 'Leipzig (A)', departure: iso(now + 30 * DAY), meetingPoint: 'Parkplatz Stadion',
      price: 45, seats: 6, createdAt: iso(now - 5 * DAY), interestEndsAt: iso(now - 2 * DAY), allocatedAt: iso(now - 2 * DAY),
    },
    {
      id: 'dortmund', title: 'Dortmund (A)', departure: iso(now + 45 * DAY), meetingPoint: 'Parkplatz Stadion',
      price: 38, seats: 3, createdAt: iso(now - 8 * DAY), interestEndsAt: iso(now - 5 * DAY), allocatedAt: iso(now - 5 * DAY),
    },
  ];

  const b = (tripId: string, userId: string, status: Booking['status'], ago: number): Booking => ({
    id: `${tripId}-${userId}`, tripId, userId, status, createdAt: iso(now - ago),
    queuedAt: status === 'waitlist' ? iso(now - ago) : undefined,
  });
  const bookings: Booking[] = [
    b('augsburg', 'sophie', 'interested', 40 * HOUR),
    b('augsburg', 'karl', 'interested', 30 * HOUR),
    b('augsburg', 'max', 'interested', 20 * HOUR),
    b('augsburg', 'julia', 'interested', 10 * HOUR),
    b('leipzig', 'max', 'confirmed', 4 * DAY),
    b('leipzig', 'julia', 'confirmed', 4 * DAY),
    b('leipzig', 'karl', 'confirmed', 3 * DAY),
    b('leipzig', 'lukas', 'confirmed', 1 * DAY),
    b('dortmund', 'max', 'confirmed', 6 * DAY),
    b('dortmund', 'anna', 'confirmed', 6 * DAY),
    b('dortmund', 'sophie', 'confirmed', 5 * DAY),
    b('dortmund', 'lukas', 'waitlist', 2 * DAY),
  ];
  return { users, trips, bookings };
}
