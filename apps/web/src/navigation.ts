import {
  LayoutDashboard, Package, ShoppingCart, CreditCard, BarChart2, Target, Download, MessageCircle,
  Store, Truck, Users, PiggyBank, CalendarDays, Wallet, FileText, Landmark, UserCog, Shield, type LucideIcon,
} from 'lucide-react';
import type { BusinessModuleKey } from '@kza/shared';

export type NavGroup = 'activity' | 'finance';

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Hidden from operators — the server enforces this too, so this is purely so an
   *  operator doesn't see links that would 403. */
  finance?: boolean;
  /** Hidden when that module is switched off for the business. */
  module?: BusinessModuleKey;
  group?: NavGroup;
}

/** The app's pages, as the sidebar, the mobile bar and the breadcrumb know them. */
export const NAV: NavItem[] = [
  { to: '/',           icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/stock',      icon: Package,         label: 'Stock',           group: 'activity' },
  { to: '/ventes',     icon: ShoppingCart,    label: 'Ventes',          group: 'activity', finance: true },
  { to: '/clients',    icon: Users,           label: 'Clients',         group: 'activity' },
  { to: '/agenda',     icon: CalendarDays,    label: 'Agenda',          group: 'activity', module: 'agenda' },
  { to: '/logistique', icon: Truck,           label: 'Logistique',      group: 'activity', module: 'logistics' },
  { to: '/boutique',   icon: Store,           label: 'Ma Boutique',     group: 'activity', module: 'online_store' },
  { to: '/whatsapp',   icon: MessageCircle,   label: 'WhatsApp CRM',    group: 'activity', module: 'whatsapp' },
  { to: '/depenses',   icon: CreditCard,      label: 'Dépenses',        group: 'finance', finance: true },
  { to: '/tresorerie', icon: Landmark,        label: 'Trésorerie',      group: 'finance', finance: true },
  { to: '/creances',   icon: Wallet,          label: 'Créances',        group: 'finance', finance: true, module: 'credit' },
  { to: '/factures',   icon: FileText,        label: 'Devis & factures', group: 'finance', finance: true, module: 'invoices' },
  { to: '/analytique', icon: BarChart2,       label: 'Analytique',      group: 'finance', finance: true },
  { to: '/objectifs',  icon: Target,          label: 'Objectifs',       group: 'finance', finance: true, module: 'goals' },
  { to: '/financement', icon: PiggyBank,      label: 'Levée de fonds',  group: 'finance', finance: true, module: 'fundraising' },
  { to: '/export',     icon: Download,        label: 'Export',          group: 'finance', finance: true },
];

export const NAV_GROUPS: { key: NavGroup; label: string }[] = [
  { key: 'activity', label: 'Activité' },
  { key: 'finance', label: 'Finances' },
];

export const TEAM_NAV: NavItem = { to: '/equipe', icon: UserCog, label: 'Équipe' };
export const ADMIN_NAV: NavItem = { to: '/admin', icon: Shield, label: 'Admin SaaS' };

/** The WhatsApp module's own tabs, for the breadcrumb. */
const SUB_LABELS: Record<string, string> = {
  '/whatsapp/ia': 'Agent IA',
  '/whatsapp/automatisations': 'Automatisations',
  '/whatsapp/base': 'Base de connaissances',
  '/whatsapp/audience': 'Audience',
};

/** « Dashboard », « WhatsApp CRM › Audience »… for the page at this path. */
export function breadcrumbFor(pathname: string, items: NavItem[]): string[] {
  const all = [...items, TEAM_NAV, ADMIN_NAV];
  const page = pathname === '/' ? all.find(i => i.to === '/') : all.filter(i => i.to !== '/' && pathname.startsWith(i.to)).sort((a, b) => b.to.length - a.to.length)[0];
  const trail = page ? [page.label] : [];
  const sub = SUB_LABELS[pathname.replace(/\/$/, '')];
  if (sub) trail.push(sub);
  return trail;
}
