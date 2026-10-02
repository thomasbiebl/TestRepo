import type { SupabaseClient } from '@supabase/supabase-js';
import type { Result } from '../data/DataService';
import type { AuthService } from './AuthService';

const messages: Record<string, string> = {
  'Invalid login credentials': 'E-Mail oder Passwort stimmt nicht.',
  'Email not confirmed': 'Bitte bestätige zuerst deine E-Mail-Adresse. Den Link findest du in deiner Mailbox.',
  'User already registered': 'Diese E-Mail-Adresse ist schon registriert.',
};
const german = (m: string) => messages[m] ?? (m.includes('rate limit') ? 'Zu viele Versuche. Bitte warte kurz und versuche es erneut.' : m);

/** Where Supabase sends people back to after e-mail links (must be allowed in the Supabase dashboard). */
const appUrl = () => `${window.location.origin}${import.meta.env.BASE_URL}`;

export class SupabaseAuth implements AuthService {
  readonly isDemo = false;
  private uid: string | null = null;
  private recovery = new Set<() => void>();

  constructor(private sb: SupabaseClient) {}

  async restore() {
    const { data } = await this.sb.auth.getSession();
    this.uid = data.session?.user.id ?? null;
    this.sb.auth.onAuthStateChange((event, session) => {
      this.uid = session?.user.id ?? null;
      if (event === 'PASSWORD_RECOVERY') this.recovery.forEach((cb) => cb());
    });
    return this.uid;
  }

  currentUserId() {
    return this.uid;
  }

  async login(email: string, password: string) {
    const { data, error } = await this.sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) return { ok: false as const, error: german(error?.message ?? 'Anmeldung fehlgeschlagen.') };
    this.uid = data.user.id;
    return { ok: true as const, userId: data.user.id };
  }

  async register(input: { name: string; email: string; password: string; wantsMembership: boolean }) {
    const name = input.name.trim();
    if (!name) return { ok: false as const, error: 'Bitte einen Namen angeben.' };
    const { data, error } = await this.sb.auth.signUp({
      email: input.email.trim(),
      password: input.password,
      options: { data: { name, wants_membership: input.wantsMembership }, emailRedirectTo: appUrl() },
    });
    if (error) return { ok: false as const, error: german(error.message) };
    this.uid = data.session?.user.id ?? null;
    return { ok: true as const, userId: this.uid };
  }

  logout() {
    this.uid = null;
    void this.sb.auth.signOut();
  }

  async resetPassword(email: string): Promise<Result> {
    const { error } = await this.sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() });
    return error ? { ok: false, error: german(error.message) } : { ok: true };
  }

  async updatePassword(password: string): Promise<Result> {
    const { error } = await this.sb.auth.updateUser({ password });
    return error ? { ok: false, error: german(error.message) } : { ok: true };
  }

  onPasswordRecovery(callback: () => void) {
    this.recovery.add(callback);
    return () => void this.recovery.delete(callback);
  }
}
