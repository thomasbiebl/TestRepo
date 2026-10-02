const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * With both variables set the app talks to Supabase. Without them it runs in demo mode and
 * keeps everything in this browser. The anon key is meant to be public; access is protected
 * by the row level security rules in supabase/migrations.
 */
export const supabaseConfig = url && anonKey ? { url, anonKey } : null;

export const OAUTH_PROVIDERS = ['google', 'apple', 'facebook'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/**
 * Social login buttons to show, e.g. VITE_OAUTH_PROVIDERS=google,apple. Each provider has to be
 * switched on in the Supabase dashboard first (docs/SUPABASE.md).
 */
export const oauthProviders: OAuthProvider[] = supabaseConfig
  ? String(import.meta.env.VITE_OAUTH_PROVIDERS ?? '')
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter((p): p is OAuthProvider => (OAUTH_PROVIDERS as readonly string[]).includes(p))
  : [];
