import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { SupabaseService } from '../src/data/supabaseService';

import { readdirSync } from 'node:fs';
const migrationDir = new URL('../supabase/migrations/', import.meta.url);
const migration = readdirSync(migrationDir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(new URL(f, migrationDir), 'utf8')).join('\n');

/** A recording stand-in for the Supabase client, so we can check what the service asks for. */
function fakeClient(tables: Record<string, unknown[]>, loggedIn = true) {
  const calls: string[] = [];
  const query = (table: string) => {
    const q: Record<string, unknown> = {
      select: () => q, eq: () => q, order: () => q, limit: () => q, insert: (r: unknown) => (calls.push(`insert ${table} ${JSON.stringify(r)}`), q),
      update: (r: unknown) => (calls.push(`update ${table} ${JSON.stringify(r)}`), q),
      delete: () => (calls.push(`delete ${table}`), q),
      maybeSingle: () => Promise.resolve({ data: tables[table]?.[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ data: tables[table] ?? [], error: null }),
    };
    return q;
  };
  const client = {
    auth: { getSession: () => Promise.resolve({ data: { session: loggedIn ? { user: { id: 'u1' } } : null } }) },
    from: (t: string) => query(t),
    rpc: (fn: string, args?: unknown) => (calls.push(`rpc ${fn} ${JSON.stringify(args ?? {})}`), Promise.resolve({ data: { added: 1, updated: 0, promoted: 0 }, error: null })),
  };
  return { sb: client as unknown as SupabaseClient, calls };
}

describe('SupabaseService', () => {
  it('maps database rows and merges names with full profiles', async () => {
    const { sb, calls } = fakeClient({
      settings: [{ club_name: 'FC Test', interest_days: 2, guests_may_book: false, waitlist_enabled: true, default_seats: 40, default_price: '25.50', default_meeting_point: 'Hbf' }],
      public_profiles: [{ id: 'u1', name: 'Anna', base_trips: 3, is_member: true }, { id: 'u2', name: 'Max', base_trips: 9, is_member: true }],
      profiles: [{ id: 'u1', email: 'anna@x.de', name: 'Anna', is_member: true, is_admin: true, member_requested: false, base_trips: 3, created_at: '2026-01-01T00:00:00Z' }],
      trips: [{ id: 't1', title: 'A', departure: '2026-12-01T08:00:00Z', meeting_point: 'P', price: '28.00', seats: 50, created_at: '2026-11-01T00:00:00Z', interest_ends_at: '2026-11-04T00:00:00Z', allocated_at: null, kickoff: null, return_time: null, notes: '', cancelled_at: null, cancel_reason: null, stops: null, buses: 1, points: 2 }],
      bookings: [{ id: 'b1', trip_id: 't1', user_id: 'u1', status: 'interested', created_at: '2026-11-02T00:00:00Z', queued_at: null, companions: 1, companion_names: 'Petra', stop: null, bus: null, paid: true, attended: false }],
      notifications: [{ id: 'x1', user_id: 'u1', type: 'allocated', title: 'Platz bestätigt', body: 'b', trip_id: 't1', created_at: '2026-11-05T00:00:00Z', read_at: null }],
      audit_log: [{ id: 7, at: '2026-11-06T00:00:00Z', actor_id: null, actor_name: 'System', action: 'trip_created', detail: 'Augsburg' }],
      member_roster: [{ email: 'max@x.de', name: 'Max', member_number: '7' }],
      member_secrets: [{ member_code: 'geheim' }],
      news: [{ id: 'n1', title: 'Hi', body: 'Text', author_id: null, pinned: true, created_at: '2026-11-01T00:00:00Z', updated_at: null }],
    });
    const snap = await new SupabaseService(sb).load();
    expect(calls).toContain('rpc allocate_due_trips {}');
    expect(snap.settings).toMatchObject({ clubName: 'FC Test', interestDays: 2, guestsMayBook: false, defaultPrice: 25.5 });
    expect(snap.trips[0]).toMatchObject({ meetingPoint: 'P', price: 28, allocatedAt: undefined });
    expect(snap.bookings[0]).toMatchObject({ tripId: 't1', userId: 'u1', status: 'interested', companions: 1, companionNames: 'Petra', paid: true, attended: false });
    expect(snap.trips[0]).toMatchObject({ points: 2 });
    expect(snap.audit).toEqual([{ id: '7', at: '2026-11-06T00:00:00Z', actorId: '', actorName: 'System', action: 'trip_created', detail: 'Augsburg' }]);
    expect(snap.roster).toEqual([{ email: 'max@x.de', name: 'Max', memberNumber: '7' }]);
    expect(snap.settings.memberCode).toBe('geheim');
    expect(snap.notifications[0]).toMatchObject({ userId: 'u1', type: 'allocated', tripId: 't1', readAt: undefined });
    expect(snap.news[0]).toMatchObject({ authorId: '', pinned: true });
    const anna = snap.users.find((u) => u.id === 'u1')!;
    const max = snap.users.find((u) => u.id === 'u2')!;
    expect(anna).toMatchObject({ email: 'anna@x.de', isAdmin: true });
    expect(max).toMatchObject({ name: 'Max', email: '', isAdmin: false, baseTrips: 9 });
  });

  it('returns only the settings when nobody is logged in', async () => {
    const { sb, calls } = fakeClient({ settings: [] }, false);
    const snap = await new SupabaseService(sb).load();
    expect(snap.trips).toEqual([]);
    expect(snap.settings.clubName).toBe('Fanclub');
    expect(calls).toEqual([]);
  });

  it('only calls database functions that exist, with the parameter names the SQL declares', async () => {
    const { sb, calls } = fakeClient({});
    const svc = new SupabaseService(sb);
    await svc.book('t1', 'u1', { companions: 2, companionNames: 'A, B', stop: 'Bahnhof' });
    await svc.cancel('t1', 'u1');
    await svc.endInterestNow('t1');
    await svc.deleteUser('u2');
    await svc.cancelTrip('t1', 'Schnee');
    await svc.importRoster([{ email: 'a@b.de', name: 'A', memberNumber: '1' }]);
    await svc.clearRoster();
    await svc.redeemMemberCode('u1', 'abcd');
    await svc.markNotificationsRead('u1');
    await svc.updateNotificationPrefs('u1', { emailPersonal: true, emailBroadcast: false });
    await svc.setBookingBus('b1', 2);
    await svc.setBookingPaid('b1', true);
    await svc.setBookingAttendance('b1', null);
    await svc.updateMyName('u1', 'Neu');
    await svc.deleteMyAccount('u1');
    const rpcs = calls.filter((c) => c.startsWith('rpc ')).map((c) => /^rpc (\w+) (.*)$/.exec(c)!);
    expect(rpcs.length).toBe(15);
    for (const [, fn, args] of rpcs) {
      const decl = [...migration.matchAll(new RegExp(`create function public\\.${fn}\\(([^)]*)\\)`, 'g'))].at(-1);
      expect(decl, `function ${fn} exists in migration`).not.toBeNull();
      for (const key of Object.keys(JSON.parse(args!) as object)) expect(decl![1]).toContain(key);
    }
  });

  it('writes trips and settings with snake_case columns that exist in the schema', async () => {
    const { sb, calls } = fakeClient({});
    const svc = new SupabaseService(sb);
    await svc.saveTrip(null, { title: 'A', departure: '2026-12-01T08:00:00.000Z', meetingPoint: 'P', price: 10, seats: 5, notes: '', stops: [], buses: 1, points: 1 });
    await svc.saveSettings({ clubName: 'X', interestDays: 1, guestsMayBook: true, waitlistEnabled: true, defaultSeats: 1, defaultPrice: 0, defaultMeetingPoint: 'P', cancelDeadlineHours: 0, maxCompanions: 3, noShowPenalty: 0, memberCode: 'abcd' });
    const written = calls.filter((c) => /^(insert|update)/.test(c)).flatMap((c) => Object.keys(JSON.parse(c.slice(c.indexOf('{')))));
    expect(written.length).toBeGreaterThan(8);
    for (const col of written) expect(migration, `column ${col}`).toContain(col);
  });
});
