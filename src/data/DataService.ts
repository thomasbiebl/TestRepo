import type { Snapshot, Trip, User } from '../domain/types';

export type Result = { ok: true } | { ok: false; error: string };

export type TripInput = Pick<Trip, 'title' | 'departure' | 'meetingPoint' | 'price' | 'seats'>;

/**
 * Everything the UI needs from storage. The local implementation keeps data in the browser;
 * a database-backed one (e.g. Supabase) only has to implement this interface.
 */
export interface DataService {
  /** Current data. Also hands out seats for trips whose interest phase has ended. */
  load(): Promise<Snapshot>;

  /** Stores a freshly registered user (a real backend does this in its auth step). */
  addUser(user: User): Promise<Result>;
  updateUser(id: string, patch: Partial<Pick<User, 'isMember' | 'isAdmin' | 'memberRequested' | 'baseTrips' | 'name'>>): Promise<Result>;
  deleteUser(id: string): Promise<Result>;

  saveTrip(id: string | null, input: TripInput): Promise<Result>;
  deleteTrip(id: string): Promise<Result>;
  /** Admin helper: ends the members-only phase right now. */
  endInterestNow(tripId: string): Promise<Result>;

  /** Interest (members, phase 1) or booking (phase 2). */
  book(tripId: string, userId: string): Promise<Result>;
  cancel(tripId: string, userId: string): Promise<Result>;

  resetDemo(): Promise<void>;
}
