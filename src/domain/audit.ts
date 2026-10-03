import { BOOKING_STATUS_LABEL } from './rules';
import type { AuditAction, AuditEntry, Settings, Snapshot, Trip } from './types';

export const AUDIT_LABEL: Record<AuditAction, string> = {
  trip_created: 'Fahrt angelegt',
  trip_updated: 'Fahrt geändert',
  trip_deleted: 'Fahrt gelöscht',
  trip_cancelled: 'Fahrt abgesagt',
  interest_ended: 'Interessensphase beendet',
  news_created: 'News veröffentlicht',
  news_updated: 'News geändert',
  news_deleted: 'News gelöscht',
  settings_changed: 'Einstellungen geändert',
  member_changed: 'Mitgliedschaft geändert',
  admin_changed: 'Admin-Rechte geändert',
  points_changed: 'Startwert geändert',
  user_deleted: 'Konto gelöscht',
  booking_paid: 'Zahlung',
  booking_attended: 'Einstieg',
  booking_bus: 'Bus zugeordnet',
  booking_removed: 'Buchung storniert',
  roster_imported: 'Mitgliederliste importiert',
  roster_cleared: 'Mitgliederliste geleert',
  member_code_changed: 'Mitgliedscode',
};

const SETTING_LABEL: [keyof Settings, string][] = [
  ['clubName', 'Vereinsname'],
  ['interestDays', 'Vorlauf für Mitglieder'],
  ['guestsMayBook', 'Gäste dürfen buchen'],
  ['waitlistEnabled', 'Warteliste'],
  ['defaultSeats', 'Standard-Plätze'],
  ['defaultPrice', 'Standard-Preis'],
  ['defaultMeetingPoint', 'Standard-Treffpunkt'],
  ['cancelDeadlineHours', 'Stornofrist'],
  ['maxCompanions', 'Begleitpersonen'],
  ['noShowPenalty', 'Abzug bei Nichterscheinen'],
];

const TRIP_FIELDS: (keyof Trip)[] = ['title', 'departure', 'meetingPoint', 'price', 'seats', 'kickoff', 'returnTime', 'notes', 'stops', 'buses', 'points'];
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Describes what an admin changed between two states. The database does the same with triggers;
 * the browser demo uses this function. `quiet` leaves out the single membership changes that
 * come from a list import.
 */
export function deriveAudit(
  before: Snapshot,
  after: Snapshot,
  actor: { id: string; name: string } | null,
  now: number,
  newId: () => string,
  quiet = false,
): AuditEntry[] {
  const out: AuditEntry[] = [];
  const at = new Date(now).toISOString();
  const add = (action: AuditAction, detail: string) =>
    out.push({ id: newId(), at, actorId: actor?.id ?? '', actorName: actor?.name ?? 'System', action, detail });

  // trips
  const oldTrips = new Map(before.trips.map((t) => [t.id, t]));
  for (const t of after.trips) {
    const old = oldTrips.get(t.id);
    if (!old) add('trip_created', t.title);
    else if (t.cancelledAt && !old.cancelledAt) add('trip_cancelled', t.title + (t.cancelReason ? `: ${t.cancelReason}` : ''));
    else if (t.interestEndsAt !== old.interestEndsAt) add('interest_ended', t.title);
    else if (TRIP_FIELDS.some((f) => !same(t[f], old[f]))) add('trip_updated', t.title);
  }
  const newTrips = new Set(after.trips.map((t) => t.id));
  for (const t of before.trips) if (!newTrips.has(t.id)) add('trip_deleted', t.title);

  // news
  const oldNews = new Map(before.news.map((n) => [n.id, n]));
  for (const n of after.news) {
    const old = oldNews.get(n.id);
    if (!old) add('news_created', n.title);
    else if (n.title !== old.title || n.body !== old.body || n.pinned !== old.pinned) add('news_updated', n.title);
  }
  const newNews = new Set(after.news.map((n) => n.id));
  for (const n of before.news) if (!newNews.has(n.id)) add('news_deleted', n.title);

  // settings
  const changed = SETTING_LABEL.filter(([key]) => before.settings[key] !== after.settings[key]).map(([, label]) => label);
  if (changed.length > 0) add('settings_changed', changed.join(', '));
  if (before.settings.memberCode !== after.settings.memberCode) add('member_code_changed', after.settings.memberCode ? 'Code geändert' : 'Code entfernt');

  // users
  const oldUsers = new Map(before.users.map((u) => [u.id, u]));
  for (const u of after.users) {
    const old = oldUsers.get(u.id);
    if (!old) continue;
    if (u.isMember !== old.isMember && !quiet) add('member_changed', `${u.name}: ${u.isMember ? 'jetzt Mitglied' : 'kein Mitglied mehr'}`);
    if (u.isAdmin !== old.isAdmin) add('admin_changed', `${u.name}: ${u.isAdmin ? 'jetzt Admin' : 'kein Admin mehr'}`);
    if (u.baseTrips !== old.baseTrips) add('points_changed', `${u.name}: Startwert ${old.baseTrips} → ${u.baseTrips}`);
  }
  const newUsers = new Set(after.users.map((u) => u.id));
  for (const u of before.users) if (!newUsers.has(u.id)) add('user_deleted', `${u.name} (${u.email})`);

  // bookings
  const oldBookings = new Map(before.bookings.map((b) => [b.id, b]));
  const users = new Map(after.users.map((u) => [u.id, u]));
  for (const b of after.bookings) {
    const old = oldBookings.get(b.id);
    const trip = after.trips.find((t) => t.id === b.tripId);
    const who = users.get(b.userId);
    if (!old || !trip || !who) continue;
    const prefix = `${who.name} · ${trip.title}: `;
    if (b.paid !== old.paid) add('booking_paid', prefix + (b.paid ? 'bezahlt' : 'nicht bezahlt'));
    if (b.attended !== old.attended) add('booking_attended', prefix + (b.attended === true ? 'eingestiegen' : b.attended === false ? 'nicht erschienen' : 'zurückgesetzt'));
    if (b.bus !== old.bus) add('booking_bus', prefix + (b.bus ? `Bus ${b.bus}` : 'kein Bus'));
  }

  // bookings removed by somebody else (an admin); people cancelling themselves are not logged
  const afterBookings = new Set(after.bookings.map((b) => b.id));
  for (const b of before.bookings) {
    const trip = after.trips.find((t) => t.id === b.tripId);
    const who = users.get(b.userId);
    if (afterBookings.has(b.id) || !trip || !who || !actor || actor.id === b.userId) continue;
    add('booking_removed', `${who.name} · ${trip.title}: ${BOOKING_STATUS_LABEL[b.status]} storniert`);
  }

  // member list
  if (after.roster.length === 0 && before.roster.length > 0) {
    add('roster_cleared', `${before.roster.length} Einträge entfernt`);
  } else {
    const oldRoster = new Map(before.roster.map((r) => [r.email, r]));
    const added = after.roster.filter((r) => !oldRoster.has(r.email)).length;
    const updated = after.roster.filter((r) => {
      const old = oldRoster.get(r.email);
      return old && (old.name !== r.name || old.memberNumber !== r.memberNumber);
    }).length;
    if (added + updated > 0) {
      const promoted = after.users.filter((u) => u.isMember && !oldUsers.get(u.id)?.isMember).length;
      add('roster_imported', `${added} neu, ${updated} aktualisiert, ${promoted} zu Mitgliedern`);
    }
  }
  return out;
}
