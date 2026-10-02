import type { User } from '../domain/types';

export interface AuthService {
  currentUserId(): string | null;
  register(input: { name: string; email: string; password: string; wantsMembership: boolean }): Promise<{ ok: true; user: User } | { ok: false; error: string }>;
  login(email: string, password: string): Promise<{ ok: true; user: User } | { ok: false; error: string }>;
  logout(): void;
}
