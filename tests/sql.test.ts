import { readdirSync, readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Runs the Supabase migration against an in-memory Postgres and checks the server-side rules
 * (booking, allocation, waiting list, access control) the same way the app uses them.
 */
const dir = new URL('../supabase/migrations/', import.meta.url);
const migrations = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(new URL(f, dir), 'utf8'));

// Minimal stand-ins for what Supabase provides: roles, auth.users and auth.uid().
const supabaseStub = `
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
`;

let db: PGlite;
const ids: Record<string, string> = {};

async function addUser(key: string, opts: { member?: boolean; admin?: boolean; base?: number } = {}) {
  const res = await db.query<{ id: string }>(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [`${key}@x.de`, JSON.stringify({ name: key })],
  );
  const id = res.rows[0]!.id;
  ids[key] = id;
  await db.query(`update profiles set is_member = $2, is_admin = $3, base_trips = $4 where id = $1`, [id, !!opts.member, !!opts.admin, opts.base ?? 0]);
}

/** Runs a statement as a logged-in user (RLS applies). */
async function as<T = Record<string, unknown>>(key: string, sql: string, params: unknown[] = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${ids[key]}', false)`);
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec(`reset role`);
  }
}
const asErr = async (key: string, sql: string, params: unknown[] = []) =>
  as(key, sql, params).then(() => '', (e: Error) => e.message);

async function addTrip(seats: number, interestHours = 72): Promise<string> {
  const res = await as<{ id: string }>('admin',
    `insert into trips (title, departure, meeting_point, price, seats) values ('Augsburg', now() + interval '14 days', 'P', 20, $1) returning id`,
    [seats]);
  const id = res[0]!.id;
  await db.query(`update trips set interest_ends_at = now() + make_interval(hours => $2) where id = $1`, [id, interestHours]);
  return id;
}
const statuses = async (trip: string) =>
  Object.fromEntries((await db.query<{ n: string; status: string }>(
    `select split_part(p.email, '@', 1) n, b.status from bookings b join profiles p on p.id = b.user_id where b.trip_id = $1`, [trip])).rows.map((r) => [r.n, r.status]));
/** Moves the end of the interest phase into the past, as if the days had gone by. */
const endInterest = (trip: string) => db.query(`update trips set interest_ends_at = now() - interval '1 minute' where id = $1`, [trip]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(supabaseStub);
  for (const m of migrations) await db.exec(m);
}, 60_000);
afterAll(() => db.close());

beforeEach(async () => {
  await db.exec(`delete from bookings; delete from trips; delete from news; delete from auth.users;
    update settings set club_name = 'Fanclub', interest_days = 3, guests_may_book = true, waitlist_enabled = true`);
  await addUser('admin', { member: true, admin: true });
  await addUser('anna', { member: true, base: 5 });
  await addUser('max', { member: true, base: 9 });
  await addUser('karl', { member: true, base: 9 });
  await addUser('lukas');
});

describe('supabase schema', () => {
  it('creates a profile for each new account and lets the server set the trip timing', async () => {
    const { rows } = await db.query<{ name: string; is_admin: boolean }>(`select name, is_admin from profiles where id = $1`, [ids.anna]);
    expect(rows[0]).toEqual({ name: 'anna', is_admin: false });
    const trip = await addTrip(2);
    const t = (await db.query<{ days: number }>(`select extract(epoch from (interest_ends_at - created_at)) / 86400 as days from trips where id = $1`, [trip])).rows[0]!;
    expect(Math.round(t.days)).toBe(3); // default setting; addTrip then shortened it, so check creation separately below
  });

  it('uses the configured lead time for new trips', async () => {
    await as('admin', `update settings set interest_days = 1`);
    const res = await as<{ id: string }>('admin', `insert into trips (title, departure, meeting_point, price, seats, interest_ends_at, created_at) values ('X', now() + interval '9 days', 'P', 1, 5, now() + interval '99 days', now() - interval '99 days') returning id`);
    const { rows } = await db.query<{ hours: number }>(`select round(extract(epoch from (interest_ends_at - created_at)) / 3600) as hours from trips where id = $1`, [res[0]!.id]);
    expect(Number(rows[0]!.hours)).toBe(24);
  });

  it('keeps guests out during the interest phase and lets members show interest', async () => {
    const trip = await addTrip(2);
    expect(await asErr('lukas', `select book_trip($1)`, [trip])).toMatch(/Nur Mitglieder/);
    await as('anna', `select book_trip($1)`, [trip]);
    expect(await statuses(trip)).toEqual({ anna: 'interested' });
    expect(await asErr('anna', `select book_trip($1)`, [trip])).toMatch(/schon gebucht/);
  });

  it('allocates by past trips, ties by earlier interest, rest to the waiting list', async () => {
    const trip = await addTrip(2);
    await as('anna', `select book_trip($1)`, [trip]);
    await as('max', `select book_trip($1)`, [trip]);
    await as('karl', `select book_trip($1)`, [trip]);
    await endInterest(trip);
    await as('anna', `select allocate_due_trips()`);
    expect(await statuses(trip)).toEqual({ max: 'confirmed', karl: 'confirmed', anna: 'waitlist' });
    const again = await db.query(`select allocated_at from trips where id = $1`, [trip]);
    await as('anna', `select allocate_due_trips()`);
    expect((await db.query(`select allocated_at from trips where id = $1`, [trip])).rows).toEqual(again.rows);
  });

  it('allocates before an open booking, so nobody jumps the queue', async () => {
    const trip = await addTrip(1);
    await as('anna', `select book_trip($1)`, [trip]);
    await endInterest(trip);
    const status = await as<{ book_trip: string }>('lukas', `select book_trip($1)`, [trip]);
    expect(status[0]!.book_trip).toBe('waitlist');
    expect(await statuses(trip)).toEqual({ anna: 'confirmed', lukas: 'waitlist' });
  });

  it('promotes the waiting list when someone cancels', async () => {
    const trip = await addTrip(1);
    await as('anna', `select book_trip($1)`, [trip]);
    await endInterest(trip);
    await as('lukas', `select book_trip($1)`, [trip]);
    await as('anna', `select cancel_booking($1)`, [trip]);
    expect(await statuses(trip)).toEqual({ lukas: 'confirmed' });
  });

  it('applies guest and waiting list settings', async () => {
    const trip = await addTrip(1, 0);
    await endInterest(trip);
    await as('admin', `update settings set guests_may_book = false`);
    expect(await asErr('lukas', `select book_trip($1)`, [trip])).toMatch(/nur für Mitglieder/);
    await as('admin', `update settings set guests_may_book = true, waitlist_enabled = false`);
    await as('anna', `select book_trip($1)`, [trip]);
    expect(await asErr('lukas', `select book_trip($1)`, [trip])).toMatch(/ausgebucht/);
  });

  it('lets admins end the interest phase early, and nobody else', async () => {
    const trip = await addTrip(1);
    await as('anna', `select book_trip($1)`, [trip]);
    expect(await asErr('anna', `select admin_end_interest($1)`, [trip])).toMatch(/Admins/);
    await as('admin', `select admin_end_interest($1)`, [trip]);
    expect(await statuses(trip)).toEqual({ anna: 'confirmed' });
  });

  it('counts confirmed seats on departed trips as past trips', async () => {
    const trip = await addTrip(2, 0);
    await endInterest(trip);
    await as('anna', `select book_trip($1)`, [trip]);
    expect((await db.query(`select past_trips($1) as n`, [ids.anna])).rows[0]).toEqual({ n: 5 });
    await db.query(`update trips set departure = now() - interval '1 day' where id = $1`, [trip]);
    expect((await db.query(`select past_trips($1) as n`, [ids.anna])).rows[0]).toEqual({ n: 6 });
  });
});

describe('accounts', () => {
  it('creates a profile even without registration metadata', async () => {
    await db.query(`insert into auth.users (id, email) values (gen_random_uuid(), 'oauth@x.de')`);
    const { rows } = await db.query(`select name, member_requested from profiles where email = 'oauth@x.de'`);
    expect(rows).toEqual([{ name: 'oauth', member_requested: false }]);
  });
});

describe('trip info, cancellation and deadline', () => {
  it('lets admins cancel a trip, after which nobody can book and nothing is allocated', async () => {
    const trip = await addTrip(2);
    await as('anna', `select book_trip($1)`, [trip]);
    expect(await asErr('anna', `select admin_cancel_trip($1, 'x')`, [trip])).toMatch(/Admins/);
    await as('admin', `select admin_cancel_trip($1, 'Schnee')`, [trip]);
    expect((await db.query(`select cancel_reason from trips where id = $1`, [trip])).rows[0]).toEqual({ cancel_reason: 'Schnee' });
    expect(await asErr('max', `select book_trip($1)`, [trip])).toMatch(/abgesagt/);
    await endInterest(trip);
    await as('anna', `select allocate_due_trips()`);
    expect(await statuses(trip)).toEqual({ anna: 'interested' });
    expect(await asErr('admin', `select admin_cancel_trip($1, '')`, [trip])).toMatch(/schon abgesagt/);
  });

  it('keeps cancellation state out of reach when inserting a trip', async () => {
    const res = await as<{ id: string; cancelled_at: unknown }>('admin',
      `insert into trips (title, departure, meeting_point, price, seats, cancelled_at) values ('X', now() + interval '5 days', 'P', 1, 1, now()) returning id, cancelled_at`);
    expect(res[0]!.cancelled_at).toBeNull();
  });

  it('stores kickoff, return time and notes', async () => {
    const res = await as<{ notes: string; kickoff: string | null }>('admin',
      `insert into trips (title, departure, meeting_point, price, seats, notes, kickoff, return_time) values ('X', now() + interval '5 days', 'P', 1, 1, 'Hinweis', now() + interval '5 days', now() + interval '6 days') returning notes, kickoff`);
    expect(res[0]!.notes).toBe('Hinweis');
    expect(res[0]!.kickoff).not.toBeNull();
  });

  it('enforces the cancellation deadline for confirmed seats only', async () => {
    await as('admin', `update settings set cancel_deadline_hours = 48`);
    const trip = await addTrip(2, 0);
    await endInterest(trip);
    await as('anna', `select book_trip($1)`, [trip]);
    await as('max', `select book_trip($1)`, [trip]);
    await as('karl', `select book_trip($1)`, [trip]);
    await as('anna', `select cancel_booking($1)`, [trip]); // far before departure: fine
    await db.query(`update trips set departure = now() + interval '24 hours' where id = $1`, [trip]);
    expect(await asErr('max', `select cancel_booking($1)`, [trip])).toMatch(/48 Stunden/);
    expect(await asErr('lukas', `select cancel_booking($1)`, [trip])).toMatch(/Keine Buchung/);
    await as('admin', `update settings set cancel_deadline_hours = 0`);
    await as('max', `select cancel_booking($1)`, [trip]);
  });
});

describe('companions, stops and buses', () => {
  const nBooked = async (trip: string) =>
    (await db.query<{ n: number }>(`select coalesce(sum(1 + companions), 0)::int as n from bookings where trip_id = $1 and status = 'confirmed'`, [trip])).rows[0]!.n;

  it('counts companions as seats and uses the waiting list for groups that do not fit', async () => {
    const trip = await addTrip(4, 0);
    await endInterest(trip);
    await as('anna', `select book_trip($1, 2)`, [trip]);
    expect(await nBooked(trip)).toBe(3);
    const st = await as<{ book_trip: string }>('max', `select book_trip($1, 1)`, [trip]);
    expect(st[0]!.book_trip).toBe('waitlist');
    const st2 = await as<{ book_trip: string }>('karl', `select book_trip($1)`, [trip]);
    expect(st2[0]!.book_trip).toBe('confirmed');
    expect(await asErr('lukas', `select book_trip($1, 9)`, [trip])).toMatch(/höchstens 3/);
  });

  it('allocates groups greedily by rank and promotes whoever fits after a cancellation', async () => {
    const trip = await addTrip(4);
    await as('max', `select book_trip($1, 2)`, [trip]);   // 9 trips, needs 3
    await as('karl', `select book_trip($1, 2)`, [trip]);  // 9 trips, needs 3 -> does not fit
    await as('anna', `select book_trip($1, 0)`, [trip]);  // 5 trips, needs 1 -> fits
    await endInterest(trip);
    await as('anna', `select allocate_due_trips()`);
    expect(await statuses(trip)).toEqual({ max: 'confirmed', karl: 'waitlist', anna: 'confirmed' });
    await as('max', `select cancel_booking($1)`, [trip]);
    expect(await statuses(trip)).toEqual({ karl: 'confirmed', anna: 'confirmed' });
  });

  it('requires a boarding point from the list when the trip has stops', async () => {
    const res = await as<{ id: string }>('admin', `insert into trips (title, departure, meeting_point, price, seats, stops, buses) values ('S', now() + interval '9 days', 'P', 1, 9, array['Stadion', 'Bahnhof'], 2) returning id`);
    const trip = res[0]!.id;
    await db.query(`update trips set interest_ends_at = now() - interval '1 minute' where id = $1`, [trip]);
    expect(await asErr('anna', `select book_trip($1)`, [trip])).toMatch(/Zustiegsstelle/);
    expect(await asErr('anna', `select book_trip($1, 0, '', 'Flughafen')`, [trip])).toMatch(/Zustiegsstelle/);
    await as('anna', `select book_trip($1, 0, '', 'Bahnhof')`, [trip]);
    expect((await db.query(`select stop from bookings where trip_id = $1`, [trip])).rows[0]).toEqual({ stop: 'Bahnhof' });
  });

  it('lets only admins assign a booking to an existing bus', async () => {
    const res = await as<{ id: string }>('admin', `insert into trips (title, departure, meeting_point, price, seats, buses) values ('B', now() + interval '9 days', 'P', 1, 9, 2) returning id`);
    const trip = res[0]!.id;
    await db.query(`update trips set interest_ends_at = now() - interval '1 minute' where id = $1`, [trip]);
    await as('anna', `select book_trip($1)`, [trip]);
    const booking = (await db.query<{ id: string }>(`select id from bookings where trip_id = $1`, [trip])).rows[0]!.id;
    expect(await asErr('anna', `select admin_set_booking_bus($1, 1)`, [booking])).toMatch(/Admins/);
    expect(await asErr('admin', `select admin_set_booking_bus($1, 3)`, [booking])).toMatch(/Bus gibt es/);
    await as('admin', `select admin_set_booking_bus($1, 2)`, [booking]);
    expect((await db.query(`select bus from bookings where id = $1`, [booking])).rows[0]).toEqual({ bus: 2 });
  });
});

describe('own profile', () => {
  it('lets users change their own name, and nothing else', async () => {
    await as('anna', `select update_my_name('Anna Neu')`);
    expect((await db.query(`select name from profiles where id = $1`, [ids.anna])).rows[0]).toEqual({ name: 'Anna Neu' });
    expect(await asErr('anna', `select update_my_name('  ')`)).toMatch(/Namen/);
  });

  it('deletes the own account with bookings and promotes the waiting list', async () => {
    const trip = await addTrip(1);
    await as('anna', `select book_trip($1)`, [trip]);
    await endInterest(trip);
    await as('lukas', `select book_trip($1)`, [trip]);
    await as('anna', `select delete_my_account()`);
    expect((await db.query(`select count(*)::int as n from profiles where id = $1`, [ids.anna])).rows[0]).toEqual({ n: 0 });
    expect(await statuses(trip)).toEqual({ lukas: 'confirmed' });
  });

  it('keeps the last admin from deleting the account', async () => {
    expect(await asErr('admin', `select delete_my_account()`)).toMatch(/einzige Admin/);
  });
});

describe('access control', () => {
  it('only admins can write trips, news, settings and profile flags', async () => {
    const trip = await addTrip(2);
    expect(await asErr('anna', `insert into trips (title, departure, meeting_point, price, seats) values ('X', now() + interval '1 day', 'P', 1, 1)`)).toMatch(/row-level security/);
    expect(await asErr('anna', `insert into news (title, body) values ('a', 'b')`)).toMatch(/row-level security/);
    await as('anna', `update settings set club_name = 'Hacked'`);
    await as('anna', `update trips set seats = 99 where id = $1`, [trip]);
    await as('anna', `update profiles set is_admin = true where id = $1`, [ids.anna]);
    expect((await db.query(`select club_name from settings`)).rows[0]).toEqual({ club_name: 'Fanclub' });
    expect((await db.query(`select seats from trips where id = $1`, [trip])).rows[0]).toEqual({ seats: 2 });
    expect((await db.query(`select is_admin from profiles where id = $1`, [ids.anna])).rows[0]).toEqual({ is_admin: false });
    await as('admin', `insert into news (title, body) values ('Hallo', 'Welt')`);
    expect((await db.query(`select count(*)::int as n from news`)).rows[0]).toEqual({ n: 1 });
  });

  it('forbids direct booking writes', async () => {
    const trip = await addTrip(2);
    expect(await asErr('lukas', `insert into bookings (trip_id, user_id, status) values ($1, $2, 'confirmed')`, [trip, ids.lukas])).toMatch(/permission denied/);
  });

  it('hides other profiles (and emails) from normal users but shows names', async () => {
    const own = await as<{ email: string }>('anna', `select email from profiles`);
    expect(own).toEqual([{ email: 'anna@x.de' }]);
    const names = await as<{ name: string }>('anna', `select name from public_profiles order by name`);
    expect(names.map((n) => n.name)).toContain('max');
    const all = await as('admin', `select id from profiles`);
    expect(all).toHaveLength(5);
  });

  it('lets admins delete users, which promotes the waiting list', async () => {
    const trip = await addTrip(1);
    await as('anna', `select book_trip($1)`, [trip]);
    await endInterest(trip);
    await as('lukas', `select book_trip($1)`, [trip]);
    expect(await asErr('anna', `select admin_delete_user($1)`, [ids.max])).toMatch(/Admins/);
    await as('admin', `select admin_delete_user($1)`, [ids.anna]);
    expect(await statuses(trip)).toEqual({ lukas: 'confirmed' });
  });

  it('shows the club name to anonymous visitors only', async () => {
    await db.exec(`set role anon`);
    expect((await db.query(`select club_name from settings`)).rows).toHaveLength(1);
    await expect(db.query(`select * from trips`)).rejects.toThrow(/permission denied/);
    await db.exec(`reset role`);
  });
});
