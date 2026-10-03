import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_THEME, THEMES } from './index';

const KEY = 'fanclub.theme';

interface ThemeCtx {
  theme: string;
  setTheme: (id: string) => void;
}
const Ctx = createContext<ThemeCtx>({ theme: DEFAULT_THEME, setTheme: () => {} });
export const useTheme = () => useContext(Ctx);

function stored(): string {
  try {
    const id = localStorage.getItem(KEY);
    if (id && THEMES.some((t) => t.id === id)) return id;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState(stored);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const bar = THEMES.find((t) => t.id === theme)?.barColor;
    if (bar) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bar);
  }, [theme]);

  const value = useMemo<ThemeCtx>(
    () => ({
      theme,
      setTheme: (id) => {
        setThemeState(id);
        try {
          localStorage.setItem(KEY, id);
        } catch {
          /* ignore */
        }
      },
    }),
    [theme],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
