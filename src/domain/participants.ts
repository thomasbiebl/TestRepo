import { amountDue, byTrip, seatsOf } from './rules';
import type { Booking, Snapshot, Trip, User } from './types';

export interface Passenger {
  booking: Booking;
  user: User | undefined;
}

const byStopThenName = (a: Passenger, b: Passenger) =>
  (a.booking.stop ?? '').localeCompare(b.booking.stop ?? '', 'de') || (a.user?.name ?? '').localeCompare(b.user?.name ?? '', 'de');

/** Confirmed passengers grouped by bus (0 = not assigned yet), sorted by boarding point and name. */
export function passengersByBus(trip: Trip, snap: Snapshot): Map<number, Passenger[]> {
  const users = new Map(snap.users.map((u) => [u.id, u]));
  const groups = new Map<number, Passenger[]>();
  for (const booking of byTrip(snap.bookings, trip.id).filter((b) => b.status === 'confirmed')) {
    const key = trip.buses > 1 ? (booking.bus ?? 0) : 1;
    groups.set(key, [...(groups.get(key) ?? []), { booking, user: users.get(booking.userId) }]);
  }
  for (const [key, list] of groups) groups.set(key, list.sort(byStopThenName));
  return new Map([...groups].sort(([a], [b]) => (a === 0 ? 99 : a) - (b === 0 ? 99 : b)));
}

const STATUS = { confirmed: 'bestätigt', waitlist: 'Warteliste', interested: 'Interesse' } as const;
const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

/** Passenger list as CSV for Excel (semicolon separated, UTF-8 with BOM). */
export function buildParticipantCsv(trip: Trip, snap: Snapshot): string {
  const users = new Map(snap.users.map((u) => [u.id, u]));
  const rows = byTrip(snap.bookings, trip.id)
    .sort((a, b) => a.status.localeCompare(b.status) || (a.stop ?? '').localeCompare(b.stop ?? '', 'de') || a.createdAt.localeCompare(b.createdAt))
    .map((b) => {
      const u = users.get(b.userId);
      const attended = b.attended === true ? 'ja' : b.attended === false ? 'nicht erschienen' : '';
      return [
        u?.name ?? 'Unbekannt', u?.email ?? '', STATUS[b.status], seatsOf(b), b.companions, b.companionNames,
        b.stop ?? '', b.bus ?? '', b.status === 'confirmed' ? amountDue(b, trip).toFixed(2).replace('.', ',') : '',
        b.status === 'confirmed' ? (b.paid ? 'ja' : 'nein') : '', attended,
      ].map(cell).join(';');
    });
  const header = ['Name', 'E-Mail', 'Status', 'Plätze', 'Begleitpersonen', 'Namen Begleitpersonen', 'Zustieg', 'Bus', 'Betrag (EUR)', 'Bezahlt', 'Eingestiegen'];
  return '﻿' + [header.map(cell).join(';'), ...rows].join('\r\n') + '\r\n';
}
