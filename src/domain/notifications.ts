import type { Booking, Notification, NotificationType, Snapshot, Trip } from './types';

/** Types that concern one person directly. Everything else goes to all users. */
export const PERSONAL_TYPES: NotificationType[] = ['allocated', 'waitlisted', 'promoted', 'trip_cancelled'];

const when = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' Uhr';

/**
 * Finds out what changed between two states and returns the messages people should get.
 * The database does the same with triggers; the browser demo uses this function.
 */
export function deriveNotifications(before: Snapshot, after: Snapshot, now: number, newId: () => string): Notification[] {
  const out: Notification[] = [];
  const stamp = new Date(now).toISOString();
  const add = (userId: string, type: NotificationType, title: string, body: string, tripId?: string) =>
    out.push({ id: newId(), userId, type, title, body, tripId, createdAt: stamp });

  const tripOf = (id: string): Trip | undefined => after.trips.find((t) => t.id === id);
  const beforeBooking = new Map(before.bookings.map((b) => [b.id, b]));
  const userIds = new Set(after.users.map((u) => u.id));

  for (const b of after.bookings as Booking[]) {
    const old = beforeBooking.get(b.id);
    const trip = tripOf(b.tripId);
    if (!old || !trip || old.status === b.status || !userIds.has(b.userId)) continue;
    if (old.status === 'interested' && b.status === 'confirmed') {
      add(b.userId, 'allocated', `Platz bestätigt: ${trip.title}`, `Du hast einen Platz bekommen. Abfahrt: ${when(trip.departure)}.`, trip.id);
    } else if (old.status === 'interested' && b.status === 'waitlist') {
      add(b.userId, 'waitlisted', `Warteliste: ${trip.title}`, 'Leider hat es nicht für einen Platz gereicht. Du bist auf der Warteliste und rückst automatisch nach.', trip.id);
    } else if (old.status === 'waitlist' && b.status === 'confirmed') {
      add(b.userId, 'promoted', `Platz frei: ${trip.title}`, `Du bist von der Warteliste nachgerückt und hast jetzt einen Platz. Abfahrt: ${when(trip.departure)}.`, trip.id);
    }
  }

  const beforeTrips = new Map(before.trips.map((t) => [t.id, t]));
  for (const trip of after.trips) {
    const old = beforeTrips.get(trip.id);
    if (!old) {
      for (const u of after.users) add(u.id, 'new_trip', `Neue Fahrt: ${trip.title}`, `Abfahrt ${when(trip.departure)}. Jetzt in der App ansehen.`, trip.id);
    } else if (trip.cancelledAt && !old.cancelledAt) {
      for (const b of after.bookings.filter((x) => x.tripId === trip.id && userIds.has(x.userId))) {
        add(b.userId, 'trip_cancelled', `Fahrt abgesagt: ${trip.title}`, trip.cancelReason ?? 'Die Fahrt wurde leider abgesagt.', trip.id);
      }
    }
  }

  const beforeNews = new Set(before.news.map((n) => n.id));
  for (const post of after.news.filter((n) => !beforeNews.has(n.id))) {
    for (const u of after.users.filter((x) => x.id !== post.authorId)) add(u.id, 'news', post.title, post.body.slice(0, 140));
  }
  return out;
}
