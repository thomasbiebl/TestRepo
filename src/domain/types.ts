export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  isMember: boolean;
  isAdmin: boolean;
  /** Member request from registration, waiting for an admin decision. */
  memberRequested: boolean;
  /** Trips taken before the app existed (set by admins). */
  baseTrips: number;
  createdAt: string;
  /** E-mail for personal messages: seat confirmed, moved up, trip cancelled. */
  emailPersonal: boolean;
  /** E-mail for messages to everyone: new trip, news. */
  emailBroadcast: boolean;
}

export interface Trip {
  id: string;
  title: string;
  /** Departure, ISO string. */
  departure: string;
  meetingPoint: string;
  /** Price per person in euro. */
  price: number;
  seats: number;
  createdAt: string;
  /** End of the members-only interest phase. */
  interestEndsAt: string;
  /** Set once the seats have been handed out after the interest phase. */
  allocatedAt?: string;
  /** Kick-off of the match, for information. */
  kickoff?: string;
  /** Planned departure of the way back. */
  returnTime?: string;
  /** Free text hints for passengers. */
  notes: string;
  cancelledAt?: string;
  cancelReason?: string;
  /** Boarding points. Empty means there is a single meeting point. */
  stops: string[];
  /** Number of buses. Admins assign passengers to a bus. */
  buses: number;
  /** Points a confirmed seat earns for the allocation ranking once the trip has taken place. */
  points: number;
}

export type BookingStatus = 'interested' | 'confirmed' | 'waitlist';

export interface Booking {
  id: string;
  tripId: string;
  userId: string;
  status: BookingStatus;
  createdAt: string;
  /** Position in the waiting list (ISO time, smaller = earlier). */
  queuedAt?: string;
  /** People brought along. The booking takes 1 + companions seats. */
  companions: number;
  companionNames: string;
  /** Chosen boarding point (only for trips with stops). */
  stop?: string;
  /** Bus assigned by an admin (1-based). */
  bus?: number;
  paid: boolean;
  /** Set by admins at boarding: true = boarded, false = did not show up, undefined = not recorded. */
  attended?: boolean;
}

/** What a person chooses when booking. */
export interface BookOptions {
  companions: number;
  companionNames: string;
  stop?: string;
}

export interface RosterEntry {
  /** Always lower case. */
  email: string;
  name: string;
  memberNumber: string;
}

export type AuditAction =
  | 'trip_created' | 'trip_updated' | 'trip_deleted' | 'trip_cancelled' | 'interest_ended'
  | 'news_created' | 'news_updated' | 'news_deleted' | 'settings_changed'
  | 'member_changed' | 'admin_changed' | 'points_changed' | 'user_deleted'
  | 'booking_paid' | 'booking_attended' | 'booking_bus'
  | 'roster_imported' | 'roster_cleared' | 'member_code_changed';

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string;
  actorName: string;
  action: AuditAction;
  detail: string;
}

export type NotificationType = 'allocated' | 'waitlisted' | 'promoted' | 'trip_cancelled' | 'new_trip' | 'news';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  tripId?: string;
  createdAt: string;
  readAt?: string;
}

export type TripPhase = 'interest' | 'open' | 'closed' | 'cancelled';

export interface NewsPost {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
  authorId: string;
  /** Pinned posts are shown first. */
  pinned: boolean;
}

/** Club-wide settings, editable by admins. */
export interface Settings {
  clubName: string;
  /** Days after trip creation in which only members can show interest. Applies to new trips. */
  interestDays: number;
  /** After the seats are handed out, may non-members book free seats too? */
  guestsMayBook: boolean;
  waitlistEnabled: boolean;
  defaultSeats: number;
  defaultPrice: number;
  defaultMeetingPoint: string;
  /** Confirmed seats can only be cancelled up to this many hours before departure (0 = until departure). */
  cancelDeadlineHours: number;
  /** How many people one booking may bring along (0 = off). */
  maxCompanions: number;
  /** Points deducted from the ranking score for each no-show (0 = off). */
  noShowPenalty: number;
  /** Code that makes a user a member when entered in the profile. Empty = off. Only admins get to see it. */
  memberCode: string;
}

export const DEFAULT_SETTINGS: Settings = {
  clubName: 'Fanclub',
  interestDays: 3,
  guestsMayBook: true,
  waitlistEnabled: true,
  defaultSeats: 50,
  defaultPrice: 30,
  defaultMeetingPoint: 'Parkplatz Stadion',
  cancelDeadlineHours: 0,
  maxCompanions: 3,
  noShowPenalty: 0,
  memberCode: '',
};

export interface Snapshot {
  users: User[];
  trips: Trip[];
  bookings: Booking[];
  news: NewsPost[];
  settings: Settings;
  /** Messages of the logged-in user (the demo keeps everyone's). */
  notifications: Notification[];
  /** Imported member list (admins only). */
  roster: RosterEntry[];
  /** Change log (admins only), newest first. */
  audit: AuditEntry[];
}
