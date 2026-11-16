import { Suspense, useEffect, useRef, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Menu, Calendar, LogOut, ChevronRight, Sun, Moon, Monitor, LayoutGrid } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../hooks/useCurrency';
import { useTheme } from '../../hooks/useTheme';
import { useLayout, SIDEBAR_WIDTH } from '../../hooks/useLayout';
import { Sidebar } from './Sidebar';
import { useModules } from '../../hooks/useModules';
import { useRole } from '../../hooks/useRole';
import { useSegment } from '../../hooks/useSegment';
import { orderNav } from '@kza/shared';
import { Toaster } from '../ui/Toaster';
import { PageSkeleton } from '../ui/Skeleton';
import { NAV, breadcrumbFor } from '../../navigation';
import { prefetchPages } from '../../lazyPages';

const THEME_ICON = { light: Sun, dark: Moon, system: Monitor } as const;
const THEME_LABEL = { light: 'Thème clair', dark: 'Thème sombre', system: 'Thème du système' } as const;

/** How many pages the phone's bottom bar shows beside « Menu ». */
const MOBILE_TABS = 4;

export function AppShell() {
  const { toggleSidebar, dateRange, setDateRange, showInUsd, toggleCurrencyDisplay, businesses, currentBusinessId } = useStore();
  const { user, signOut } = useAuth();
  const { bizCurrency } = useCurrency();
  const { pref, cycle } = useTheme();
  const { collapsed } = useLayout();
  const location = useLocation();
  const { has: hasModule } = useModules();
  const { canSeeFinances } = useRole();
  const { sector, terms } = useSegment();

  const business = businesses.find(b => b.id === currentBusinessId);
  const visibleNav = orderNav(NAV, sector)
    .filter(item => (!item.finance || canSeeFinances) && (!item.module || hasModule(item.module)))
    .map(item => item.to === '/stock' ? { ...item, label: terms.catalogue } : item);
  const trail = breadcrumbFor(location.pathname, visibleNav);
  const ThemeIcon = THEME_ICON[pref];

  // The other pages' code loads in the background once this one is on screen: the next
  // module opens at once.
  useEffect(() => { prefetchPages(); }, []);

  // User menu
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const initial = (user?.email ?? '?').charAt(0).toUpperCase();

  return (
    <div className="min-h-screen">
      <Sidebar />

      {/* Main area — offset for the desktop sidebar, following its width */}
      <div className={`flex flex-col min-h-screen transition-[margin] duration-300 ease-out-soft ${collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-20 glass border-b">
          <div className="px-3 sm:px-6 h-14 sm:h-16 flex items-center gap-2 sm:gap-3">
            <button
              className="lg:hidden p-2 -ml-1 rounded-xl hover:bg-surface-2 text-fg-2"
              onClick={toggleSidebar}
              aria-label="Ouvrir le menu"
            >
              <Menu size={20} />
            </button>

            {/* Breadcrumb: the business, then the page */}
            <nav className="flex-1 min-w-0 flex items-center gap-1 text-sm" aria-label="Fil d'Ariane">
              {business && (
                <>
                  <span className="hidden sm:inline text-fg-3 truncate max-w-[160px]">{business.name}</span>
                  <ChevronRight size={14} className="hidden sm:inline text-fg-4 shrink-0" />
                </>
              )}
              {trail.map((label, i) => (
                <span key={label} className="flex items-center gap-1 min-w-0">
                  {i > 0 && <ChevronRight size={14} className="text-fg-4 shrink-0" />}
                  <span className={`truncate ${i === trail.length - 1 ? 'font-semibold text-fg' : 'text-fg-3'}`}>{label}</span>
                </span>
              ))}
            </nav>

            {/* Currency toggle — shown only when business currency is not USD */}
            {bizCurrency !== 'USD' && (
              <div className="hidden sm:flex items-center gap-0.5 bg-surface-2 border border-line rounded-xl p-0.5">
                {[bizCurrency, 'USD'].map(c => (
                  <button
                    key={c}
                    onClick={() => {
                      const wantUsd = c === 'USD';
                      if (wantUsd !== showInUsd) toggleCurrencyDisplay();
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 ${
                      (c === 'USD') === showInUsd ? 'bg-surface text-fg shadow-soft' : 'text-fg-3 hover:text-fg'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            {/* Date range (desktop) */}
            <DateRange from={dateRange.from} to={dateRange.to} onChange={setDateRange} className="hidden lg:flex" />

            {/* Theme */}
            <button onClick={cycle} title={THEME_LABEL[pref]} aria-label={THEME_LABEL[pref]}
              className="p-2 rounded-xl text-fg-2 hover:text-fg hover:bg-surface-2">
              <ThemeIcon size={18} />
            </button>

            {/* User menu */}
            <div ref={menuRef} className="relative">
              <button onClick={() => setMenuOpen(o => !o)} aria-haspopup="menu" aria-expanded={menuOpen}
                className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-white text-sm font-bold flex items-center justify-center shadow-soft ring-2 ring-surface">
                {initial}
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 top-full mt-2 w-64 glass-strong border rounded-2xl shadow-float p-1.5 animate-scale-in origin-top-right">
                  <div className="px-3 py-2">
                    <p className="text-xs text-fg-3">Connecté en tant que</p>
                    <p className="text-sm font-medium text-fg truncate" title={user?.email ?? ''}>{user?.email}</p>
                  </div>
                  {bizCurrency !== 'USD' && (
                    <button onClick={() => { toggleCurrencyDisplay(); }} role="menuitem"
                      className="sm:hidden w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm text-fg-2 hover:bg-surface-2">
                      Afficher en <span className="font-semibold text-fg">{showInUsd ? bizCurrency : 'USD'}</span>
                    </button>
                  )}
                  <button onClick={signOut} role="menuitem"
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-600 hover:bg-red-50">
                    <LogOut size={15} /> Se déconnecter
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Date range on its own row below lg: it never overflows */}
          <div className="lg:hidden px-3 sm:px-6 pb-2">
            <DateRange from={dateRange.from} to={dateRange.to} onChange={setDateRange} className="flex" />
          </div>
        </header>

        {/* Page content — fade in on route change; a skeleton while a page's code loads */}
        <main key={location.pathname} className="flex-1 p-4 sm:p-6 pb-mobile-nav lg:pb-6 animate-fade-in-up overflow-x-hidden">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>

        {/* Mobile bottom bar: the segment's key pages, and the menu for the rest */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-20 glass-strong border-t" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="grid h-16" style={{ gridTemplateColumns: `repeat(${Math.min(visibleNav.length, MOBILE_TABS) + 1}, minmax(0, 1fr))` }}>
            {visibleNav.slice(0, MOBILE_TABS).map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center gap-1 text-[10px] font-semibold transition-colors ${isActive ? 'text-indigo-700' : 'text-fg-3'}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`flex items-center justify-center w-12 h-7 rounded-full transition-all duration-200 ${isActive ? 'bg-indigo-600/10' : ''}`}>
                      <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                    </span>
                    <span className="truncate max-w-[72px]">{label}</span>
                  </>
                )}
              </NavLink>
            ))}
            <button onClick={toggleSidebar} className="flex flex-col items-center justify-center gap-1 text-[10px] font-semibold text-fg-3">
              <span className="flex items-center justify-center w-12 h-7 rounded-full"><LayoutGrid size={20} /></span>
              Menu
            </button>
          </div>
        </nav>
      </div>

      {/* Global toast notifications */}
      <Toaster />
    </div>
  );
}

function DateRange({ from, to, onChange, className = '' }: { from: string; to: string; onChange: (from: string, to: string) => void; className?: string }) {
  return (
    <div className={`items-center gap-2 bg-surface-2 border border-line rounded-xl px-3 py-1.5 ${className}`}>
      <Calendar size={14} className="text-fg-4 shrink-0" />
      <input
        type="date"
        value={from}
        max={to}
        onChange={e => e.target.value && onChange(e.target.value, to)}
        className="text-xs !bg-transparent outline-none text-fg-2 flex-1 min-w-0 lg:flex-none lg:w-28"
      />
      <span className="text-fg-4">→</span>
      <input
        type="date"
        value={to}
        min={from}
        onChange={e => e.target.value && onChange(from, e.target.value)}
        className="text-xs !bg-transparent outline-none text-fg-2 flex-1 min-w-0 lg:flex-none lg:w-28"
      />
    </div>
  );
}
