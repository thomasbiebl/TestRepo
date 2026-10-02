import type { ReactNode } from 'react';
import { formatCountdown } from '../domain/rules';
import type { BookingStatus, Trip, TripPhase } from '../domain/types';

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + ' Uhr';

export const fmtPrice = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export function Badge({ tone = 'gray', children }: { tone?: 'red' | 'blue' | 'gray' | 'green'; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function PhaseBadge({ phase }: { phase: TripPhase }) {
  if (phase === 'interest') return <Badge tone="red">Interesse · Mitglieder</Badge>;
  if (phase === 'open') return <Badge tone="blue">Offene Buchung</Badge>;
  return <Badge>Abgefahren</Badge>;
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  interested: 'Interesse bekundet',
  confirmed: 'Platz bestätigt',
  waitlist: 'Warteliste',
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={status === 'confirmed' ? 'green' : status === 'interested' ? 'blue' : 'gray'}>{STATUS_LABEL[status]}</Badge>;
}

export function SeatBar({ value, max, full }: { value: number; max: number; full?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="bar" role="img" aria-label={`${value} von ${max}`}>
      <i data-full={full || value >= max ? 'true' : 'false'} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Countdown({ ms }: { ms: number }) {
  const { days, hours, minutes } = formatCountdown(ms);
  return (
    <div className="count" aria-label={`${days} Tage ${hours} Stunden ${minutes} Minuten`}>
      {[
        [days, 'Tage'],
        [hours, 'Std'],
        [minutes, 'Min'],
      ].map(([n, l]) => (
        <div key={l}>
          <b>{String(n).padStart(2, '0')}</b>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}

export const shortName = (name: string) => {
  const [first, ...rest] = name.trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1]![0]}.` : (first ?? name);
};

export const tripLine = (t: Trip) => `${fmtDate(t.departure)} · ${t.seats} Plätze`;
