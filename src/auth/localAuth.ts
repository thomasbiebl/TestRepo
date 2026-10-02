import type { DataService } from '../data/DataService';
import { hashPassword } from '../data/seed';
import type { User } from '../domain/types';
import type { AuthService } from './AuthService';

const SESSION_KEY = 'fanclub.session.v1';

/**
 * Demo login: users and password hashes live in the browser. This is NOT secure and only
 * meant for trying the app. Replace with a real auth provider (e.g. Supabase) later.
 */
export class LocalAuth implements AuthService {
  constructor(private data: DataService) {}

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
    return { ok: true as const, user };
  }

  async register(input: { name: string; email: string; password: string; wantsMembership: boolean }) {
    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();
    if (!name) return { ok: false as const, error: 'Bitte einen Namen angeben.' };
    if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false as const, error: 'Bitte eine gültige E-Mail-Adresse angeben.' };
    if (input.password.length < 6) return { ok: false as const, error: 'Das Passwort braucht mindestens 6 Zeichen.' };
    const snap = await this.data.load();
    if (snap.users.some((u) => u.email === email)) return { ok: false as const, error: 'Diese E-Mail-Adresse ist schon registriert.' };

    const user: User = {
      id: crypto.randomUUID?.() ?? `${Date.now()}`,
      email, name, passwordHash: await hashPassword(input.password), isMember: false, isAdmin: false,
      memberRequested: input.wantsMembership, baseTrips: 0, createdAt: new Date().toISOString(),
    };
    const stored = await this.data.addUser(user);
    if (!stored.ok) return { ok: false as const, error: stored.error };
    this.setSession(user.id);
    return { ok: true as const, user };
  }

  logout() {
    this.setSession(null);
  }
}
