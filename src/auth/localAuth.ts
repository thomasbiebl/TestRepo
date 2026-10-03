import type { Result } from '../data/DataService';
import { hashPassword } from '../data/seed';
import { SESSION_KEY } from '../data/session';
import type { LocalStorageService } from '../data/localStorageService';
import type { User } from '../domain/types';
import type { AuthService } from './AuthService';


/**
 * Demo login: users and password hashes live in the browser. This is NOT secure and only
 * meant for trying the app. Production uses SupabaseAuth.
 */
export class LocalAuth implements AuthService {
  readonly isDemo = true;

  constructor(private data: LocalStorageService) {}

  async restore() {
    return this.currentUserId();
  }

  currentUserId(): string | null {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  }

  private setSession(id: string | null) {
    try {
      if (id) localStorage.setItem(SESSION_KEY, id);
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
  }

  async login(email: string, password: string) {
    const snap = await this.data.load();
    const user = snap.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || user.passwordHash !== (await hashPassword(password))) {
      return { ok: false as const, error: 'E-Mail oder Passwort stimmt nicht.' };
    }
    this.setSession(user.id);
    return { ok: true as const, userId: user.id };
  }

  async register(input: { name: string; email: string; password: string; wantsMembership: boolean }) {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    if (!name) return { ok: false as const, error: 'Bitte einen Namen angeben.' };
    if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false as const, error: 'Bitte eine gültige E-Mail-Adresse angeben.' };
    if (input.password.length < 6) return { ok: false as const, error: 'Das Passwort braucht mindestens 6 Zeichen.' };

    const user: User = {
      id: crypto.randomUUID?.() ?? `${Date.now()}`,
      email, name, passwordHash: await hashPassword(input.password), isMember: false, isAdmin: false,
      memberRequested: input.wantsMembership, baseTrips: 0, createdAt: new Date().toISOString(),
      emailPersonal: true, emailBroadcast: false,
    };
    const stored = await this.data.addUser(user);
    if (!stored.ok) return { ok: false as const, error: stored.error };
    this.setSession(user.id);
    return { ok: true as const, userId: user.id };
  }

  async updatePassword(password: string): Promise<Result> {
    const id = this.currentUserId();
    if (!id) return { ok: false, error: 'Bitte melde dich an.' };
    if (password.length < 6) return { ok: false, error: 'Das Passwort braucht mindestens 6 Zeichen.' };
    return this.data.setPasswordHash(id, await hashPassword(password));
  }

  logout() {
    this.setSession(null);
  }
}
