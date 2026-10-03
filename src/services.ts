import type { AuthService } from './auth/AuthService';
import { supabaseConfig } from './config';
import type { DataService } from './data/DataService';

export interface Services {
  data: DataService;
  auth: AuthService;
}

/** Picks Supabase when configured, otherwise the browser-only demo. Each backend loads on demand. */
export async function createServices(): Promise<Services> {
  if (supabaseConfig) {
    const [{ createClient }, { SupabaseService }, { SupabaseAuth }] = await Promise.all([
      import('@supabase/supabase-js'),
      import('./data/supabaseService'),
      import('./auth/supabaseAuth'),
    ]);
    const sb = createClient(supabaseConfig.url, supabaseConfig.anonKey, { auth: { flowType: 'pkce' } });
    return { data: new SupabaseService(sb), auth: new SupabaseAuth(sb) };
  }
  const [{ LocalStorageService }, { LocalAuth }] = await Promise.all([
    import('./data/localStorageService'),
    import('./auth/localAuth'),
  ]);
  const data = new LocalStorageService();
  return { data, auth: new LocalAuth(data) };
}
