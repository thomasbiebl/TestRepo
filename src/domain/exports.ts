import type { Snapshot, User } from './types';

/** Everything the app stores about one person, for the data export in the profile. */
export function buildMyExport(snap: Snapshot, user: User, now = new Date()) {
  const trips = new Map(snap.trips.map((t) => [t.id, t]));
  return {
    exportedAt: now.toISOString(),
    profile: {
      name: user.name,
      email: user.email,
      member: user.isMember,
      admin: user.isAdmin,
      membershipRequested: user.memberRequested,
      tripsBeforeApp: user.baseTrips,
      registeredAt: user.createdAt,
    },
    bookings: snap.bookings
      .filter((b) => b.userId === user.id)
      .map((b) => ({
        trip: trips.get(b.tripId)?.title ?? 'Gelöschte Fahrt',
        departure: trips.get(b.tripId)?.departure ?? null,
        status: b.status,
        bookedAt: b.createdAt,
      })),
  };
}
