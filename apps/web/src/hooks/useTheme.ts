import { useEffect } from 'react';
import { create } from 'zustand';

export type ThemePref = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'kza_theme';
const META_COLORS: Record<Theme, string> = { light: '#F4F6FB', dark: '#0B0F19' };

const media = () => (typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null);
const systemTheme = (): Theme => (media()?.matches ? 'dark' : 'light');
const resolve = (pref: ThemePref): Theme => (pref === 'system' ? systemTheme() : pref);

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch { return 'system'; }
}

interface ThemeStore {
  pref: ThemePref;
  theme: Theme;
  setPref: (pref: ThemePref) => void;
  /** light → dark → system → light. */
  cycle: () => void;
}

export const useThemeStore = create<ThemeStore>()((set, get) => ({
  pref: readPref(),
  theme: resolve(readPref()),
  setPref: pref => {
    try { localStorage.setItem(STORAGE_KEY, pref); } catch { /* private mode */ }
    set({ pref, theme: resolve(pref) });
  },
  cycle: () => {
    const next: Record<ThemePref, ThemePref> = { light: 'dark', dark: 'system', system: 'light' };
    get().setPref(next[get().pref]);
  },
}));

/** Puts the theme on <html> while the caller is mounted; the public pages stay light. */
function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLORS[theme]);
}
function clear() {
  delete document.documentElement.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#4f46e5');
}

/**
 * The app's theme: the user's choice, or the system's. Mount it once (the AppShell): it
 * applies the theme instantly, follows the system while on « system », and removes it
 * when the shell unmounts, so the storefront and login pages keep their own look.
 */
export function useTheme() {
  const { pref, theme, setPref, cycle } = useThemeStore();

  useEffect(() => {
    apply(theme);
  }, [theme]);

  useEffect(() => {
    const m = media();
    if (!m) return;
    const onChange = () => { if (useThemeStore.getState().pref === 'system') useThemeStore.setState({ theme: systemTheme() }); };
    m.addEventListener('change', onChange);
    return () => { m.removeEventListener('change', onChange); clear(); };
  }, []);

  return { pref, theme, setPref, cycle };
}
