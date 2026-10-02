const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * With both variables set the app talks to Supabase. Without them it runs in demo mode and
 * keeps everything in this browser. The anon key is meant to be public; access is protected
 * by the row level security rules in supabase/migrations.
 */
export const supabaseConfig = url && anonKey ? { url, anonKey } : null;
