import { lazy, type ComponentType } from 'react';

/**
 * Every page as a separate chunk, loaded when first opened. The import functions live
 * here so that the shell can load the remaining pages in the background (prefetchPages)
 * once the first one is on screen.
 */
const loaders = {
  Dashboard: () => import('./pages/Dashboard'),
  Stock: () => import('./pages/Stock'),
  Sales: () => import('./pages/Sales'),
  Expenses: () => import('./pages/Expenses'),
  Treasury: () => import('./pages/Treasury'),
  Analytics: () => import('./pages/Analytics'),
  Goals: () => import('./pages/Goals'),
  Fundraising: () => import('./pages/Fundraising'),
  Export: () => import('./pages/Export'),
  StorePage: () => import('./pages/StorePage'),
  AdminDashboard: () => import('./pages/AdminDashboard'),
  Logistics: () => import('./pages/Logistics'),
  Clients: () => import('./pages/Clients'),
  Agenda: () => import('./pages/Agenda'),
  Credit: () => import('./pages/Credit'),
  Documents: () => import('./pages/Documents'),
  Team: () => import('./pages/Team'),
  WhatsAppLayout: () => import('./pages/whatsapp/WhatsAppLayout'),
  Inbox: () => import('./pages/whatsapp/Inbox'),
  AIConfig: () => import('./pages/whatsapp/AIConfig'),
  Automations: () => import('./pages/whatsapp/Automations'),
  KnowledgeBase: () => import('./pages/whatsapp/KnowledgeBase'),
  Audience: () => import('./pages/whatsapp/Audience'),
  // Outside the shell
  Landing: () => import('./pages/Landing'),
  PublicStore: () => import('./pages/PublicStore'),
  CustomerAccount: () => import('./pages/CustomerAccount'),
  ResetPasswordPage: () => import('./pages/ResetPasswordPage'),
  InvestorPortal: () => import('./pages/InvestorPortal'),
  PartnerPortal: () => import('./pages/PartnerPortal'),
  AcceptInvite: () => import('./pages/AcceptInvite'),
  Pricing: () => import('./pages/Pricing'),
} as const;

type Loaders = typeof loaders;

/** The page's component, from its module's named export of the same name. */
export function lazyPage<K extends keyof Loaders>(name: K) {
  return lazy(async () => {
    const mod = await loaders[name]() as Record<string, ComponentType<any>>;
    return { default: mod[name] };
  });
}

/** The pages of the shell, loaded in idle time: a later navigation shows them at once. */
const SHELL_PAGES: (keyof Loaders)[] = [
  'Dashboard', 'Stock', 'Sales', 'Expenses', 'Treasury', 'Analytics', 'Clients', 'Logistics',
  'Goals', 'Credit', 'Documents', 'Agenda', 'StorePage', 'WhatsAppLayout', 'Inbox', 'Team',
  'Fundraising', 'Export', 'AIConfig', 'Automations', 'KnowledgeBase', 'Audience', 'AdminDashboard',
];
let prefetched = false;
export function prefetchPages() {
  if (prefetched) return;
  prefetched = true;
  const run = () => {
    // One at a time, each in its own idle slot: the page on screen keeps all the CPU.
    let i = 0;
    const next = () => {
      const name = SHELL_PAGES[i++];
      if (!name) return;
      loaders[name]().catch(() => {}).finally(() => schedule(next));
    };
    next();
  };
  schedule(run, 1500);
}
function schedule(fn: () => void, timeout = 0) {
  if ('requestIdleCallback' in window) (window as any).requestIdleCallback(fn, { timeout: 4000 + timeout });
  else setTimeout(fn, 300 + timeout);
}
