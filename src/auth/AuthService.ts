import type { OAuthProvider } from '../config';
import type { Result } from '../data/DataService';

export type AuthResult = { ok: true; userId: string } | { ok: false; error: string };

export interface AuthService {
  /** True for the browser-only demo login, which is not secure. */
  readonly isDemo: boolean;
  /** Loads a stored session, if any. Call once at startup. */
  restore(): Promise<string | null>;
  currentUserId(): string | null;
  login(email: string, password: string): Promise<AuthResult>;
  /** `userId` is null while the e-mail address still has to be confirmed. */
  register(input: { name: string; email: string; password: string; wantsMembership: boolean }): Promise<
    { ok: true; userId: string | null } | { ok: false; error: string }
  >;
  logout(): void;

  /** Sets a new password for the logged-in user. */
  updatePassword(password: string): Promise<Result>;

  /** Social login providers that are switched on (empty in demo mode). */
  readonly oauthProviders?: OAuthProvider[];
  /** Sends the browser to the provider's login page. The user comes back logged in. */
  loginWithProvider?(provider: OAuthProvider): Promise<Result>;

  /** Optional: password reset by e-mail (not available in demo mode). */
  resetPassword?(email: string): Promise<Result>;
  /** Calls back when the user arrives through a password reset link. */
  onPasswordRecovery?(callback: () => void): () => void;
}
