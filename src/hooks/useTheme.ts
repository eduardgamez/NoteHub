import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const STORAGE_KEY = 'notehub-theme';

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(saved: string | null, prefersDark: boolean): Theme {
  if (saved === 'light' || saved === 'dark') return saved;
  return prefersDark ? 'dark' : 'light';
}

function applyTheme(theme: Theme, preference: 'system' | Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#191a1a' : '#f7f7f5');
}

export function useTheme() {
  const [theme, setResolvedTheme] = useState<Theme>(() => {
    const applied = document.documentElement.dataset.theme;
    return applied === 'dark' ? 'dark' : 'light';
  });
  const [followsSystem, setFollowsSystem] = useState(() => !localStorage.getItem(STORAGE_KEY));

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      if (localStorage.getItem(STORAGE_KEY)) return;
      const next = event.matches ? 'dark' : 'light';
      setResolvedTheme(next);
      applyTheme(next, 'system');
    };
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setResolvedTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      setFollowsSystem(false);
      applyTheme(next, next);
      return next;
    });
  }, []);

  const chooseTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    setFollowsSystem(false);
    setResolvedTheme(next);
    applyTheme(next, next);
  }, []);

  const useSystemTheme = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    const next = systemTheme();
    setResolvedTheme(next);
    setFollowsSystem(true);
    applyTheme(next, 'system');
  }, []);

  return { theme, followsSystem, toggleTheme, chooseTheme, useSystemTheme };
}
