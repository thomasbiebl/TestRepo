import type { BookOptions, NewsPost, RosterEntry, Settings, Snapshot, Trip, User } from '../domain/types';

export type Result = { ok: true } | { ok: false; error: string };

export type ImportResult = { ok: true; added: number; updated: number; promoted: number } | { ok: false; error: string };

export type NewsInput = Pick<NewsPost, 'title' | 'body' | 'pinned'>;

export type TripInput = Pick<Trip, 'title' | 'departure' | 'meetingPoint' | 'price' | 'seats' | 'notes' | 'kickoff' | 'returnTime' | 'stops' | 'buses' | 'points'>;

/**
 * Everything the UI needs from storage. The local implementation keeps data in the browser;
 * a database-backed one (e.g. Supabase) only has to implement this interface.
 */
export interface DataService {
  /** Current data. Also hands out seats for trips whose interest phase has ended. */
  load(): Promise<Snapshot>;

  updateUser(id: string, patch: Partial<Pick<User, 'isMember' | 'isAdmin' | 'memberRequested' | 'baseTrips' | 'name'>>): Promise<Result>;
  deleteUser(id: string): Promise<Result>;
  /** The logged-in user edits their own profile. */
  updateMyName(userId: string, name: string): Promise<Result>;
  /** The logged-in user deletes their own account and bookings. */
  deleteMyAccount(userId: string): Promise<Result>;

  saveTrip(id: string | null, input: TripInput): Promise<Result>;
  deleteTrip(id: string): Promise<Result>;
  /** Admin: cancels a trip. Bookings stay visible, nobody can book any more. */
  cancelTrip(tripId: string, reason: string): Promise<Result>;
  /** Admin helper: ends the members-only phase right now. */
  endInterestNow(tripId: string): Promise<Result>;

  /** Interest (members, phase 1) or booking (phase 2). */
  book(tripId: string, userId: string, options?: BookOptions): Promise<Result>;
  cancel(tripId: string, userId: string): Promise<Result>;
  /** Admin: assigns a booking to a bus (null = unassigned). */
  setBookingBus(bookingId: string, bus: number | null): Promise<Result>;
  /** Admin: removes somebody's booking (any status, ignores the cancellation deadline, not after departure). */
  adminCancelBooking(bookingId: string): Promise<Result>;
  /** Admin: marks a booking as paid or open. */
  setBookingPaid(bookingId: string, paid: boolean): Promise<Result>;
  /** Admin: boarded (true), did not show up (false), or not recorded (null). */
  setBookingAttendance(bookingId: string, attended: boolean | null): Promise<Result>;

  /** Admin: adds or updates the member list and makes registered people members. */
  importRoster(entries: RosterEntry[]): Promise<ImportResult>;
  clearRoster(): Promise<Result>;
  /** Becomes a member by entering the member code. */
  redeemMemberCode(userId: string, code: string): Promise<Result>;

  markNotificationsRead(userId: string): Promise<Result>;
  updateNotificationPrefs(userId: string, prefs: { emailPersonal: boolean; emailBroadcast: boolean }): Promise<Result>;

  saveNews(id: string | null, input: NewsInput, authorId: string): Promise<Result>;
  deleteNews(id: string): Promise<Result>;

  saveSettings(settings: Settings): Promise<Result>;

  /** Demo mode only. */
  resetDemo?(): Promise<void>;
}
