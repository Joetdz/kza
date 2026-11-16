import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { X, ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useAuth } from '../../contexts/AuthContext';
import { useRole } from '../../hooks/useRole';
import { useLayout } from '../../hooks/useLayout';
import { BusinessSelector } from '../BusinessSelector';
import { useModules } from '../../hooks/useModules';
import { useSegment } from '../../hooks/useSegment';
import { orderNav } from '@kza/shared';
import { NAV, NAV_GROUPS, TEAM_NAV, ADMIN_NAV, type NavItem, type NavGroup } from '../../navigation';

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);

/** Sections folded by the user, kept on this device. */
const FOLDED_KEY = 'kza_nav_folded';

/** The brand mark: a gradient tile with the K. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <div
      className="shrink-0 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-800 text-white font-black flex items-center justify-center shadow-glow select-none"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      aria-hidden
    >
      K
    </div>
  );
}

export function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useStore();
  const { collapsed, toggleCollapsed } = useLayout();
  const { user } = useAuth();
  const { canSeeFinances, canManageTeam } = useRole();
  const { has } = useModules();
  const { pathname } = useLocation();

  const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());
  const { sector, segment, terms } = useSegment();
  // The segment's key pages come first within their section, and the catalogue is named
  // in its words ("Prestations" for a salon, "Catalogue" when stock isn't tracked).
  const visibleNav = orderNav(NAV, sector)
    .filter(item => (!item.finance || canSeeFinances) && (!item.module || has(item.module)))
    .map(item => item.to === '/stock' ? { ...item, label: terms.catalogue } : item);

  const [folded, setFolded] = useState<Set<NavGroup>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(FOLDED_KEY) ?? '[]')); } catch { return new Set(); }
  });
  const toggleGroup = (key: NavGroup) => setFolded(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    try { localStorage.setItem(FOLDED_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
    return next;
  });
  const isCurrent = (to: string) => (to === '/' ? pathname === '/' : pathname.startsWith(to));
  const close = () => sidebarOpen && toggleSidebar();
  // On the phone the drawer is always the full one.
  const compact = collapsed;

  const renderLink = ({ to, icon: Icon, label }: NavItem, tone: 'brand' | 'amber' = 'brand') => (
    <NavLink
      key={to}
      to={to}
      end={to === '/'}
      onClick={close}
      title={compact ? label : undefined}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-150
         ${compact ? 'lg:justify-center lg:px-0 px-3 py-2.5' : 'px-3 py-2.5'}
         ${isActive
          ? tone === 'amber'
            ? 'bg-amber-500/10 text-amber-700'
            : 'bg-indigo-600/10 text-indigo-700 shadow-[inset_0_0_0_1px_rgb(var(--indigo-500)/0.15)]'
          : 'text-fg-2 hover:text-fg hover:bg-surface-2'}`
      }
    >
      {({ isActive }) => (
        <>
          {/* The active page's mark on the left edge. */}
          <span className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full transition-all duration-200
            ${isActive ? (tone === 'amber' ? 'bg-amber-500' : 'bg-indigo-600') : 'bg-transparent'} ${compact ? 'lg:hidden' : ''}`} />
          <Icon size={18} className={`shrink-0 transition-transform duration-200 ${isActive ? '' : 'group-hover:scale-110'}`} />
          <span className={`truncate ${compact ? 'lg:hidden' : ''}`}>{label}</span>
        </>
      )}
    </NavLink>
  );

  return (
    <>
      {/* Overlay (mobile) */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-30 lg:hidden animate-fade-in" onClick={toggleSidebar} />
      )}

      <aside
        className={`fixed top-0 left-0 h-[100dvh] z-40 flex flex-col glass border-r transition-[transform,width] duration-300 ease-out-soft
          w-[280px] ${compact ? 'lg:w-[76px]' : 'lg:w-[260px]'}
          ${sidebarOpen ? 'translate-x-0 shadow-float' : '-translate-x-full'} lg:translate-x-0 lg:shadow-none`}
      >
        {/* Brand */}
        <div className={`flex items-center gap-3 border-b border-line/70 ${compact ? 'lg:justify-center lg:px-0 px-4' : 'px-4'} h-16 shrink-0`}>
          <BrandMark />
          <div className={`min-w-0 flex-1 ${compact ? 'lg:hidden' : ''}`}>
            <div className="text-[17px] font-black tracking-tight text-fg leading-tight">Kzion</div>
            <div className="text-[11px] text-fg-3 truncate">{segment?.label ?? 'Gestion commerciale'}</div>
          </div>
          <button className="lg:hidden p-2 -mr-1 rounded-lg text-fg-3 hover:text-fg hover:bg-surface-2" onClick={toggleSidebar} aria-label="Fermer le menu">
            <X size={18} />
          </button>
        </div>

        {/* Business selector */}
        <div className="pt-3 px-3">
          <BusinessSelector compact={compact} />
        </div>

        {/* Navigation: the dashboard, then one section per theme */}
        <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-0.5 scrollbar-hide">
          {visibleNav.filter(i => !i.group).map(i => renderLink(i))}

          {NAV_GROUPS.map(({ key, label }) => {
            const items = visibleNav.filter(i => i.group === key);
            if (items.length === 0) return null;
            // The section holding the current page always shows it.
            const open = !folded.has(key) || items.some(i => isCurrent(i.to));
            return (
              <div key={key} className="pt-3">
                {compact ? (
                  <div className="hidden lg:block mx-3 mb-2 border-t border-line/70" />
                ) : null}
                <button onClick={() => toggleGroup(key)} aria-expanded={open}
                  className={`w-full flex items-center justify-between px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-4 hover:text-fg-2 ${compact ? 'lg:hidden' : ''}`}>
                  {label}
                  <ChevronDown size={13} className={`transition-transform duration-200 ${open ? '' : '-rotate-90'}`} />
                </button>
                {(open || compact) && <div className="space-y-0.5">{items.map(i => renderLink(i))}</div>}
              </div>
            );
          })}

          {(canManageTeam || isAdmin) && (
            <div className="pt-3 mt-2 border-t border-line/70 space-y-0.5">
              {canManageTeam && renderLink(TEAM_NAV)}
              {isAdmin && renderLink(ADMIN_NAV, 'amber')}
            </div>
          )}
        </nav>

        {/* Footer: fold the sidebar to its icons (desktop) */}
        <div className="hidden lg:flex items-center border-t border-line/70 px-3 py-2.5">
          <button onClick={toggleCollapsed} title={collapsed ? 'Déployer le menu' : 'Réduire le menu'}
            className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium text-fg-3 hover:text-fg hover:bg-surface-2 ${compact ? 'mx-auto' : ''}`}>
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            {!compact && <span>Réduire</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
