import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_SETTINGS, type AuditEntry, type Booking, type NewsPost, type Notification, type RosterEntry, type Settings, type Snapshot, type Trip, type User } from '../domain/types';
import { validateSettings } from '../domain/rules';
import type { DataService, Result } from './DataService';

// Row shapes as they come from Postgres.
interface ProfileRow { id: string; email?: string; name: string; is_member: boolean; is_admin?: boolean; member_requested?: boolean; base_trips: number; created_at?: string; email_personal?: boolean; email_broadcast?: boolean }
interface TripRow { id: string; title: string; departure: string; meeting_point: string; price: number | string; seats: number; created_at: string; interest_ends_at: string; allocated_at: string | null; kickoff: string | null; return_time: string | null; notes: string; cancelled_at: string | null; cancel_reason: string | null; stops: string[] | null; buses: number; points: number }
interface BookingRow { id: string; trip_id: string; user_id: string; status: Booking['status']; created_at: string; queued_at: string | null; companions: number; companion_names: string; stop: string | null; bus: number | null; paid: boolean; attended: boolean | null }
interface NewsRow { id: string; title: string; body: string; author_id: string | null; pinned: boolean; created_at: string; updated_at: string | null }
interface NotificationRow { id: string; user_id: string; type: Notification['type']; title: string; body: string; trip_id: string | null; created_at: string; read_at: string | null }
interface AuditRow { id: number | string; at: string; actor_id: string | null; actor_name: string; action: AuditEntry['action']; detail: string }
interface RosterRow { email: string; name: string; member_number: string }
interface SettingsRow { club_name: string; interest_days: number; guests_may_book: boolean; waitlist_enabled: boolean; default_seats: number; default_price: number | string; default_meeting_point: string; cancel_deadline_hours: number; max_companions: number; no_show_penalty: number }

const toUser = (r: ProfileRow): User => ({
  id: r.id, email: r.email ?? '', name: r.name, passwordHash: '', isMember: r.is_member, isAdmin: r.is_admin ?? false,
  memberRequested: r.member_requested ?? false, baseTrips: r.base_trips, createdAt: r.created_at ?? '',
  emailPersonal: r.email_personal ?? true, emailBroadcast: r.email_broadcast ?? false,
});
const toNotification = (r: NotificationRow): Notification => ({
  id: r.id, userId: r.user_id, type: r.type, title: r.title, body: r.body, tripId: r.trip_id ?? undefined,
  createdAt: r.created_at, readAt: r.read_at ?? undefined,
});
const toTrip = (r: TripRow): Trip => ({
  id: r.id, title: r.title, departure: r.departure, meetingPoint: r.meeting_point, price: Number(r.price), seats: r.seats,
  createdAt: r.created_at, interestEndsAt: r.interest_ends_at, allocatedAt: r.allocated_at ?? undefined,
  kickoff: r.kickoff ?? undefined, returnTime: r.return_time ?? undefined, notes: r.notes ?? '',
  cancelledAt: r.cancelled_at ?? undefined, cancelReason: r.cancel_reason ?? undefined,
  stops: r.stops ?? [], buses: r.buses, points: r.points,
});
const toBooking = (r: BookingRow): Booking => ({
  id: r.id, tripId: r.trip_id, userId: r.user_id, status: r.status, createdAt: r.created_at, queuedAt: r.queued_at ?? undefined,
  companions: r.companions, companionNames: r.companion_names, stop: r.stop ?? undefined, bus: r.bus ?? undefined,
  paid: r.paid, attended: r.attended ?? undefined,
});
const toNews = (r: NewsRow): NewsPost => ({
  id: r.id, title: r.title, body: r.body, authorId: r.author_id ?? '', pinned: r.pinned, createdAt: r.created_at, updatedAt: r.updated_at ?? undefined,
});
const toSettings = (r: SettingsRow | null): Settings =>
  r ? {
    clubName: r.club_name, interestDays: r.interest_days, guestsMayBook: r.guests_may_book, waitlistEnabled: r.waitlist_enabled,
    defaultSeats: r.default_seats, defaultPrice: Number(r.default_price), defaultMeetingPoint: r.default_meeting_point,
    cancelDeadlineHours: r.cancel_deadline_hours, maxCompanions: r.max_companions,
    noShowPenalty: r.no_show_penalty, memberCode: '',
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
    if (!session.session) return { users: [], trips: [], bookings: [], news: [], settings, notifications: [], roster: [], audit: [] };

    // Hands out seats for trips whose member phase is over. Safe to call any time.
    await this.sb.rpc('allocate_due_trips');

    const [names, profiles, trips, bookings, news, notifications, roster, secrets, audit] = await Promise.all([
      this.sb.from('public_profiles').select('id, name, base_trips, is_member'),
      this.sb.from('profiles').select('*'),
      this.sb.from('trips').select('*'),
      this.sb.from('bookings').select('*'),
      this.sb.from('news').select('*'),
      this.sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(100),
      this.sb.from('member_roster').select('*').order('email'),
      this.sb.from('member_secrets').select('member_code').eq('id', 1).maybeSingle(),
      this.sb.from('audit_log').select('*').order('at', { ascending: false }).limit(200),
    ]);
    for (const res of [names, profiles, trips, bookings, news, notifications, roster, secrets, audit]) if (res.error) throw res.error;

    // Everyone sees names; admins see full profiles, others only their own.
    const users = new Map((names.data as ProfileRow[]).map((r) => [r.id, toUser(r)]));
    for (const r of profiles.data as ProfileRow[]) users.set(r.id, toUser(r));

    return {
      users: [...users.values()],
      trips: (trips.data as TripRow[]).map(toTrip),
      bookings: (bookings.data as BookingRow[]).map(toBooking),
      news: (news.data as NewsRow[]).map(toNews),
      // The member code is only returned to admins; everybody else gets an empty one.
      settings: { ...settings, memberCode: (secrets.data as { member_code: string } | null)?.member_code ?? '' },
      notifications: (notifications.data as NotificationRow[]).map(toNotification),
      audit: (audit.data as AuditRow[]).map((r): AuditEntry => ({ id: String(r.id), at: r.at, actorId: r.actor_id ?? '', actorName: r.actor_name, action: r.action, detail: r.detail })),
      roster: (roster.data as RosterRow[]).map((r): RosterEntry => ({ email: r.email, name: r.name, memberNumber: r.member_number })),
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
      notes: input.notes, kickoff: input.kickoff ?? null, return_time: input.returnTime ?? null,
      stops: input.stops, buses: input.buses, points: input.points,
    };
    const { error } = id === null ? await this.sb.from('trips').insert(row) : await this.sb.from('trips').update(row).eq('id', id);
    return fail(error);
  };

  cancelTrip: DataService['cancelTrip'] = async (tripId, reason) =>
    fail((await this.sb.rpc('admin_cancel_trip', { p_trip: tripId, p_reason: reason })).error);

  deleteTrip: DataService['deleteTrip'] = async (id) => fail((await this.sb.from('trips').delete().eq('id', id)).error);

  endInterestNow: DataService['endInterestNow'] = async (tripId) =>
    fail((await this.sb.rpc('admin_end_interest', { p_trip: tripId })).error);

  // The user comes from the session on the server, so the id argument is not needed here.
  book: DataService['book'] = async (tripId, _userId, options) =>
    fail((await this.sb.rpc('book_trip', {
      p_trip: tripId,
      p_companions: options?.companions ?? 0,
      p_names: options?.companionNames ?? '',
      p_stop: options?.stop ?? null,
    })).error);

  adminCancelBooking: DataService['adminCancelBooking'] = async (bookingId) =>
    fail((await this.sb.rpc('admin_cancel_booking', { p_booking: bookingId })).error);

  setBookingPaid: DataService['setBookingPaid'] = async (bookingId, paid) =>
    fail((await this.sb.rpc('admin_set_booking_paid', { p_booking: bookingId, p_paid: paid })).error);

  setBookingAttendance: DataService['setBookingAttendance'] = async (bookingId, attended) =>
    fail((await this.sb.rpc('admin_set_booking_attended', { p_booking: bookingId, p_attended: attended })).error);

  setBookingBus: DataService['setBookingBus'] = async (bookingId, bus) =>
    fail((await this.sb.rpc('admin_set_booking_bus', { p_booking: bookingId, p_bus: bus })).error);

  cancel: DataService['cancel'] = async (tripId) => fail((await this.sb.rpc('cancel_booking', { p_trip: tripId })).error);

  markNotificationsRead: DataService['markNotificationsRead'] = async () => fail((await this.sb.rpc('mark_notifications_read')).error);

  updateNotificationPrefs: DataService['updateNotificationPrefs'] = async (_userId, prefs) =>
    fail((await this.sb.rpc('update_my_notification_prefs', { p_personal: prefs.emailPersonal, p_broadcast: prefs.emailBroadcast })).error);

  importRoster: DataService['importRoster'] = async (entries) => {
    const { data, error } = await this.sb.rpc('admin_import_roster', { p_entries: entries });
    if (error) return { ok: false, error: error.message };
    const r = data as { added: number; updated: number; promoted: number };
    return { ok: true, added: r.added, updated: r.updated, promoted: r.promoted };
  };

  clearRoster: DataService['clearRoster'] = async () => fail((await this.sb.rpc('admin_clear_roster')).error);

  redeemMemberCode: DataService['redeemMemberCode'] = async (_userId, code) => {
    const { data, error } = await this.sb.rpc('redeem_member_code', { p_code: code });
    if (error) return fail(error);
    return data === false ? { ok: false, error: 'Dieser Code stimmt nicht.' } : ok;
  };

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
      default_meeting_point: clean.defaultMeetingPoint, cancel_deadline_hours: clean.cancelDeadlineHours,
      max_companions: clean.maxCompanions, no_show_penalty: clean.noShowPenalty,
    }).eq('id', 1);
    if (error) return fail(error);
    return fail((await this.sb.rpc('admin_set_member_code', { p_code: clean.memberCode })).error);
  };
}
