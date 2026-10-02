import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { SupabaseAuth } from '../src/auth/supabaseAuth';

describe('SupabaseAuth social login', () => {
  it('sends the browser to the provider and returns to the app afterwards', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://verein.github.io' } });
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
    const auth = new SupabaseAuth({ auth: { signInWithOAuth } } as unknown as SupabaseClient);
    expect(await auth.loginWithProvider('google')).toEqual({ ok: true });
    expect(signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'https://verein.github.io/' } });
    signInWithOAuth.mockResolvedValue({ error: { message: 'Provider is not enabled' } });
    expect((await auth.loginWithProvider('apple')).ok).toBe(false);
    vi.unstubAllGlobals();
  });
});
