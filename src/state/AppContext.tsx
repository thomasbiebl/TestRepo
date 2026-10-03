import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AuthService } from '../auth/AuthService';
import type { DataService, Result } from '../data/DataService';
import type { Snapshot, User } from '../domain/types';
import { Loading } from '../components/Loading';
import { RecoveryButtons } from '../components/RecoveryButtons';
import { createServices, type Services } from '../services';

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

/** Starts the configured backend (Supabase or browser demo) and restores the session. */
export function AppProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<{ services: Services; userId: string | null } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    createServices()
      .then(async (services) => ({ services, userId: await services.auth.restore() }))
      .then((b) => alive && setBoot(b))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return (
      <div className="auth">
        <div className="auth-box">
          <h1 className="title">Die App konnte nicht starten</h1>
          <p className="muted">Eine Programmdatei konnte nicht geladen werden, oft wegen einer veralteten Version im Zwischenspeicher.</p>
          <RecoveryButtons />
        </div>
      </div>
    );
  }
  if (!boot) return <Loading />;
  return <AppState services={boot.services} initialUserId={boot.userId}>{children}</AppState>;
}

function AppState({ services, initialUserId, children }: { services: Services; initialUserId: string | null; children: ReactNode }) {
  const { data, auth } = services;
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [userId, setUserId] = useState<string | null>(initialUserId);
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const notifyRef = useRef<(msg: string) => void>(() => {});

  const reload = useCallback(async () => {
    try {
      setSnap(await data.load());
      setNow(Date.now());
    } catch {
      notifyRef.current('Die Daten konnten nicht geladen werden. Bitte prüfe deine Internetverbindung.');
    }
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

  notifyRef.current = notify;

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
