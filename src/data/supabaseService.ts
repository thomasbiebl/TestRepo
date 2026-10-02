import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_SETTINGS, type Booking, type NewsPost, type Settings, type Snapshot, type Trip, type User } from '../domain/types';
import { validateSettings } from '../domain/rules';
import type { DataService, Result } from './DataService';

// Row shapes as they come from Postgres.
interface ProfileRow { id: string; email?: string; name: string; is_member: boolean; is_admin?: boolean; member_requested?: boolean; base_trips: number; created_at?: string }
interface TripRow { id: string; title: string; departure: string; meeting_point: string; price: number | string; seats: number; created_at: string; interest_ends_at: string; allocated_at: string | null }
interface BookingRow { id: string; trip_id: string; user_id: string; status: Booking['status']; created_at: string; queued_at: string | null }
interface NewsRow { id: string; title: string; body: string; author_id: string | null; pinned: boolean; created_at: string; updated_at: string | null }
interface SettingsRow { club_name: string; interest_days: number; guests_may_book: boolean; waitlist_enabled: boolean; default_seats: number; default_price: number | string; default_meeting_point: string }

const toUser = (r: ProfileRow): User => ({
  id: r.id, email: r.email ?? '', name: r.name, passwordHash: '', isMember: r.is_member, isAdmin: r.is_admin ?? false,
  memberRequested: r.member_requested ?? false, baseTrips: r.base_trips, createdAt: r.created_at ?? '',
});
const toTrip = (r: TripRow): Trip => ({
  id: r.id, title: r.title, departure: r.departure, meetingPoint: r.meeting_point, price: Number(r.price), seats: r.seats,
  createdAt: r.created_at, interestEndsAt: r.interest_ends_at, allocatedAt: r.allocated_at ?? undefined,
});
const toBooking = (r: BookingRow): Booking => ({
  id: r.id, tripId: r.trip_id, userId: r.user_id, status: r.status, createdAt: r.created_at, queuedAt: r.queued_at ?? undefined,
});
const toNews = (r: NewsRow): NewsPost => ({
  id: r.id, title: r.title, body: r.body, authorId: r.author_id ?? '', pinned: r.pinned, createdAt: r.created_at, updatedAt: r.updated_at ?? undefined,
});
const toSettings = (r: SettingsRow | null): Settings =>
  r ? {
    clubName: r.club_name, interestDays: r.interest_days, guestsMayBook: r.guests_may_book, waitlistEnabled: r.waitlist_enabled,
    defaultSeats: r.default_seats, defaultPrice: Number(r.default_price), defaultMeetingPoint: r.default_meeting_point,
  } : { ...DEFAULT_SETTINGS };

const ok: Result = { ok: true };
const fail = (error: { message: string } | null): Result => (error ? { ok: false, error: error.message } : ok);

/** Stores everything in Supabase (Postgres). Rules are enforced in the database, see supabase/migrations. */
export class SupabaseService implements DataService {
  constructor(private sb: SupabaseClient) {}

  async load(): Promise<Snapshot> {
    const { data: session } = await this.sb.auth.getSession();
    const settingsRes = await this.sb.from('settings').select('*').eq('id', 1).maybeSingle();
    if (settingsRes.error) throw settingsRes.error;
    const settings = toSettings(settingsRes.data as SettingsRow | null);
    if (!session.session) return { users: [], trips: [], bookings: [], news: [], settings };

    // Hands out seats for trips whose member phase is over. Safe to call any time.
    await this.sb.rpc('allocate_due_trips');

    const [names, profiles, trips, bookings, news] = await Promise.all([
      this.sb.from('public_profiles').select('id, name, base_trips, is_member'),
      this.sb.from('profiles').select('*'),
      this.sb.from('trips').select('*'),
      this.sb.from('bookings').select('*'),
      this.sb.from('news').select('*'),
    ]);
    for (const res of [names, profiles, trips, bookings, news]) if (res.error) throw res.error;

    // Everyone sees names; admins see full profiles, others only their own.
    const users = new Map((names.data as ProfileRow[]).map((r) => [r.id, toUser(r)]));
    for (const r of profiles.data as ProfileRow[]) users.set(r.id, toUser(r));

    return {
      users: [...users.values()],
      trips: (trips.data as TripRow[]).map(toTrip),
      bookings: (bookings.data as BookingRow[]).map(toBooking),
      news: (news.data as NewsRow[]).map(toNews),
      settings,
    };
  }

  updateUser: DataService['updateUser'] = async (id, patch) => {
    const row: Record<string, unknown> = {};
    if (patch.isMember !== undefined) row.is_member = patch.isMember;
    if (patch.isAdmin !== undefined) row.is_admin = patch.isAdmin;
    if (patch.memberRequested !== undefined) row.member_requested = patch.memberRequested;
    if (patch.baseTrips !== undefined) row.base_trips = patch.baseTrips;
    if (patch.name !== undefined) row.name = patch.name;
    if (patch.isMember) row.member_requested = false;
    const { error } = await this.sb.from('profiles').update(row).eq('id', id);
    return fail(error);
  };

  deleteUser: DataService['deleteUser'] = async (id) => fail((await this.sb.rpc('admin_delete_user', { p_user: id })).error);

  updateMyName: DataService['updateMyName'] = async (_id, name) => fail((await this.sb.rpc('update_my_name', { p_name: name })).error);

  deleteMyAccount: DataService['deleteMyAccount'] = async () => fail((await this.sb.rpc('delete_my_account')).error);

  saveTrip: DataService['saveTrip'] = async (id, input) => {
    const row = {
      title: input.title, departure: input.departure, meeting_point: input.meetingPoint, price: input.price, seats: input.seats,
    };
    const { error } = id === null ? await this.sb.from('trips').insert(row) : await this.sb.from('trips').update(row).eq('id', id);
    return fail(error);
  };

  deleteTrip: DataService['deleteTrip'] = async (id) => fail((await this.sb.from('trips').delete().eq('id', id)).error);

  endInterestNow: DataService['endInterestNow'] = async (tripId) =>
    fail((await this.sb.rpc('admin_end_interest', { p_trip: tripId })).error);

  // The user comes from the session on the server, so the id argument is not needed here.
  book: DataService['book'] = async (tripId) => fail((await this.sb.rpc('book_trip', { p_trip: tripId })).error);

  cancel: DataService['cancel'] = async (tripId) => fail((await this.sb.rpc('cancel_booking', { p_trip: tripId })).error);

  saveNews: DataService['saveNews'] = async (id, input) => {
    const title = input.title.trim();
    const body = input.body.trim();
    if (!title || !body) return { ok: false, error: 'Bitte Titel und Text angeben.' };
    const row = { title, body, pinned: input.pinned };
    const { error } = id === null
      ? await this.sb.from('news').insert(row)
      : await this.sb.from('news').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id);
    return fail(error);
  };

  deleteNews: DataService['deleteNews'] = async (id) => fail((await this.sb.from('news').delete().eq('id', id)).error);

  saveSettings: DataService['saveSettings'] = async (settings) => {
    const clean = { ...settings, clubName: settings.clubName.trim(), defaultMeetingPoint: settings.defaultMeetingPoint.trim() };
    const problem = validateSettings(clean);
    if (problem) return { ok: false, error: problem };
    const { error } = await this.sb.from('settings').update({
      club_name: clean.clubName, interest_days: clean.interestDays, guests_may_book: clean.guestsMayBook,
      waitlist_enabled: clean.waitlistEnabled, default_seats: clean.defaultSeats, default_price: clean.defaultPrice,
      default_meeting_point: clean.defaultMeetingPoint,
    }).eq('id', 1);
    return fail(error);
  };
}
