import type { Trip } from './types';

const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lines longer than 75 characters are folded as the calendar format requires. */
const fold = (line: string) => line.match(/.{1,74}/g)?.join('\r\n ') ?? line;

/** An iCalendar file with the departure of a trip, to open in the phone's calendar. */
export function buildIcs(trip: Trip, now = new Date()): string {
  const end = trip.returnTime ?? new Date(Date.parse(trip.departure) + 12 * 3_600_000).toISOString();
  const description = [trip.kickoff ? `Anstoß: ${new Date(trip.kickoff).toLocaleString('de-DE')}` : '', trip.notes].filter(Boolean).join('\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Fanclub Busfahrten//DE',
    'BEGIN:VEVENT',
    `UID:${trip.id}@fanclub-busfahrten`,
    `DTSTAMP:${stamp(now.toISOString())}`,
    `DTSTART:${stamp(trip.departure)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(`Busfahrt: ${trip.title}`)}`,
    `LOCATION:${escape(trip.meetingPoint)}`,
    ...(description ? [`DESCRIPTION:${escape(description)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
