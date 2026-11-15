import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, ShoppingCart, CreditCard,
  BarChart2, Target, Download, X, LogOut, MessageCircle, Shield, Store, Truck, Users, UserCog, PiggyBank, CalendarDays, Wallet, FileText, Landmark,
  ChevronDown,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useAuth } from '../../contexts/AuthContext';
import { useRole } from '../../hooks/useRole';
import { BusinessSelector } from '../BusinessSelector';
import { useModules } from '../../hooks/useModules';
import { useSegment } from '../../hooks/useSegment';
import { orderNav, type BusinessModuleKey } from '@kza/shared';

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);

type GroupKey = 'activity' | 'finance';

interface NavItem {
  to: string;
  icon: typeof Package;
  label: string;
  /** Hides the link from operators — the server enforces this too, so this is purely so
   *  an operator doesn't see links that would 403. */
  finance?: boolean;
  /** Hides the link when that module is switched off for the business. */
  module?: BusinessModuleKey;
  group?: GroupKey;
}

const nav: NavItem[] = [
  { to: '/',           icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/stock',      icon: Package,         label: 'Stock',          group: 'activity' },
  { to: '/ventes',     icon: ShoppingCart,    label: 'Ventes',         group: 'activity', finance: true },
  { to: '/clients',    icon: Users,           label: 'Clients',        group: 'activity' },
  { to: '/agenda',     icon: CalendarDays,    label: 'Agenda',         group: 'activity', module: 'agenda' },
  { to: '/logistique', icon: Truck,           label: 'Logistique',     group: 'activity', module: 'logistics' },
  { to: '/boutique',   icon: Store,           label: 'Ma Boutique',    group: 'activity', module: 'online_store' },
  { to: '/whatsapp',   icon: MessageCircle,   label: 'WhatsApp CRM',   group: 'activity', module: 'whatsapp' },
  { to: '/depenses',   icon: CreditCard,      label: 'Dépenses',       group: 'finance', finance: true },
  { to: '/tresorerie', icon: Landmark,        label: 'Trésorerie',     group: 'finance', finance: true },
  { to: '/creances',   icon: Wallet,          label: 'Créances',       group: 'finance', finance: true, module: 'credit' },
  { to: '/factures',   icon: FileText,        label: 'Devis & factures', group: 'finance', finance: true, module: 'invoices' },
  { to: '/analytique', icon: BarChart2,       label: 'Analytique',     group: 'finance', finance: true },
  { to: '/objectifs',  icon: Target,          label: 'Objectifs',      group: 'finance', finance: true, module: 'goals' },
  { to: '/financement', icon: PiggyBank,      label: 'Levée de fonds', group: 'finance', finance: true, module: 'fundraising' },
  { to: '/export',     icon: Download,        label: 'Export',         group: 'finance', finance: true },
];

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: 'activity', label: 'Activité' },
  { key: 'finance', label: 'Finances' },
];

/** Sections folded by the user, kept on this device. */
const FOLDED_KEY = 'kza_nav_folded';

const linkClass = (active: boolean, tone: 'indigo' | 'amber' = 'indigo') =>
  `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${active
    ? tone === 'amber' ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30'
    : tone === 'amber' ? 'text-amber-400 hover:text-white hover:bg-gray-800' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`;

export function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useStore();
  const { user, signOut } = useAuth();
  const { canSeeFinances, canManageTeam } = useRole();
  const { has } = useModules();
  const { pathname } = useLocation();

  const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());
  const { sector, segment, terms } = useSegment();
  // The segment's key pages come first within their section, and the catalogue is named
  // in its words ("Prestations" for a salon, "Catalogue" when stock isn't tracked).
  const visibleNav = orderNav(nav, sector)
    .filter(item => (!item.finance || canSeeFinances) && (!item.module || has(item.module)))
    .map(item => item.to === '/stock' ? { ...item, label: terms.catalogue } : item);

  const [folded, setFolded] = useState<Set<GroupKey>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FOLDED_KEY) ?? '[]')); } catch { return new Set(); }
  });
  const toggleGroup = (key: GroupKey) => setFolded(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    try { localStorage.setItem(FOLDED_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
    return next;
  });
  const isCurrent = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
  const close = () => sidebarOpen && toggleSidebar();

  const renderLink = ({ to, icon: Icon, label }: NavItem) => (
    <NavLink key={to} to={to} end={to === '/'} onClick={close} className={({ isActive }) => linkClass(isActive)}>
      <Icon size={17} className="shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  );

  return (
    <>
      {/* Overlay (mobile) */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={toggleSidebar} />
      )}

      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-gray-900 z-40 flex flex-col transition-transform duration-300
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div>
            <div className="text-2xl font-black text-white tracking-tight">KZA</div>
            <div className="text-xs text-gray-400 mt-0.5">{segment?.label ?? 'Gestion commerciale'}</div>
          </div>
          <button className="lg:hidden text-gray-400 hover:text-white" onClick={toggleSidebar}>
            <X size={20} />
          </button>
        </div>

        {/* Business selector */}
        <div className="pt-3">
          <BusinessSelector />
        </div>

        {/* Navigation: the dashboard, then one section per theme */}
        <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-0.5 scrollbar-hide">
          {visibleNav.filter(i => !i.group).map(renderLink)}

          {GROUPS.map(({ key, label }) => {
            const items = visibleNav.filter(i => i.group === key);
            if (items.length === 0) return null;
            // The section holding the current page always shows it.
            const open = !folded.has(key) || items.some(i => isCurrent(i.to));
            return (
              <div key={key} className="pt-3">
                <button onClick={() => toggleGroup(key)} aria-expanded={open}
                  className="w-full flex items-center justify-between px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300">
                  {label}
                  <ChevronDown size={13} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
                </button>
                {open && <div className="space-y-0.5">{items.map(renderLink)}</div>}
              </div>
            );
          })}

          {(canManageTeam || isAdmin) && (
            <div className="pt-3 mt-2 border-t border-gray-800 space-y-0.5">
              {/* Team management — owner only */}
              {canManageTeam && (
                <NavLink to="/equipe" onClick={close} className={({ isActive }) => linkClass(isActive)}>
                  <UserCog size={17} className="shrink-0" /> Équipe
                </NavLink>
              )}
              {/* Admin link — visible only for admin users */}
              {isAdmin && (
                <NavLink to="/admin" end onClick={close} className={({ isActive }) => linkClass(isActive, 'amber')}>
                  <Shield size={17} className="shrink-0" /> Admin SaaS
                </NavLink>
              )}
            </div>
          )}
        </nav>

        {/* Footer: the account, on one line */}
        <div className="px-4 py-3 border-t border-gray-700 flex items-center gap-2">
          <div className="flex-1 min-w-0 text-xs text-gray-400 truncate" title={user?.email ?? ''}>{user?.email}</div>
          <button onClick={signOut} title="Se déconnecter" aria-label="Se déconnecter"
            className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors shrink-0">
            <LogOut size={15} />
          </button>
        </div>
      </aside>
    </>
  );
}
