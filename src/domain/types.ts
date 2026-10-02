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
};

export interface Snapshot {
  users: User[];
  trips: Trip[];
  bookings: Booking[];
  news: NewsPost[];
  settings: Settings;
}
