import { create } from 'zustand';

const COLLAPSED_KEY = 'kza_sidebar_collapsed';

interface LayoutStore {
  /** Desktop sidebar reduced to its icons; remembered on this device. */
  collapsed: boolean;
  toggleCollapsed: () => void;
}

/** The pieces of the shell that several components share: the sidebar's width for now. */
export const useLayout = create<LayoutStore>()(set => ({
  collapsed: (() => { try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; } })(),
  toggleCollapsed: () => set(s => {
    const collapsed = !s.collapsed;
    try { localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
    return { collapsed };
  }),
}));

/** The width the sidebar takes on desktop, as the main area's left margin. */
export const SIDEBAR_WIDTH = { expanded: 'lg:ml-[260px]', collapsed: 'lg:ml-[76px]' } as const;
