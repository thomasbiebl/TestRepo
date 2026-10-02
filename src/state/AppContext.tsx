import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AuthService } from '../auth/AuthService';
import { LocalAuth } from '../auth/localAuth';
import type { DataService, Result } from '../data/DataService';
import { LocalStorageService } from '../data/localStorageService';
import type { Snapshot, User } from '../domain/types';

interface AppCtx {
  snap: Snapshot | null;
  user: User | null;
  now: number;
  auth: AuthService;
  data: DataService;
  /** Runs a change, reloads the data and shows an error toast on failure. */
  act: (fn: () => Promise<Result>, success?: string) => Promise<boolean>;
  reload: () => Promise<void>;
  setSessionUser: (id: string | null) => void;
  toast: string | null;
  notify: (msg: string) => void;
}

const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
};

const TICK_MS = 30_000;

export function AppProvider({ children }: { children: ReactNode }) {
  // Swap these two lines for database-backed services later.
  const data = useMemo<DataService>(() => new LocalStorageService(), []);
  const auth = useMemo<AuthService>(() => new LocalAuth(data), [data]);

  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [userId, setUserId] = useState<string | null>(() => auth.currentUserId());
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const reload = useCallback(async () => {
    setSnap(await data.load());
    setNow(Date.now());
  }, [data]);

  useEffect(() => {
    void reload();
    const id = window.setInterval(() => void reload(), TICK_MS);
    return () => window.clearInterval(id);
  }, [reload]);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const act = useCallback(
    async (fn: () => Promise<Result>, success?: string) => {
      const res = await fn();
      await reload();
      if (!res.ok) notify(res.error);
      else if (success) notify(success);
      return res.ok;
    },
    [reload, notify],
  );

  const user = useMemo(() => snap?.users.find((u) => u.id === userId) ?? null, [snap, userId]);

  const value = useMemo<AppCtx>(
    () => ({ snap, user, now, auth, data, act, reload, setSessionUser: setUserId, toast, notify }),
    [snap, user, now, auth, data, act, reload, toast, notify],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
