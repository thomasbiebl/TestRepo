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

export type TripPhase = 'interest' | 'open' | 'closed';

export interface Snapshot {
  users: User[];
  trips: Trip[];
  bookings: Booking[];
}
