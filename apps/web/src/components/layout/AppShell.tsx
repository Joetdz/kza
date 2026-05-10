import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Menu, Calendar, LogOut, User } from 'lucide-react';
import {
  LayoutDashboard, Package, ShoppingCart,
  BarChart2, Target, MessageCircle,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useAuth } from '../../contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { Toaster } from '../ui/Toaster';

const mobileNav = [
  { to: '/',           icon: LayoutDashboard, end: true },
  { to: '/stock',      icon: Package,         end: false },
  { to: '/ventes',     icon: ShoppingCart,    end: false },
  { to: '/analytique', icon: BarChart2,       end: false },
  { to: '/objectifs',  icon: Target,          end: false },
  { to: '/whatsapp',   icon: MessageCircle,   end: false },
];

export function AppShell() {
  const { toggleSidebar, dateRange, setDateRange, currency, setCurrency } = useStore();
  const { user, signOut } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />

      {/* Main area — offset for desktop sidebar */}
      <div className="lg:ml-64 flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center gap-3">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            onClick={toggleSidebar}
          >
            <Menu size={20} />
          </button>

          <div className="flex-1" />

          {/* Currency selector */}
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-xl p-1">
            {(['USD', 'CDF'] as const).map(c => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 ${
                  currency === c
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          {/* Date range picker — hidden on mobile to avoid overflow */}
          <div className="hidden lg:flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
            <Calendar size={14} className="text-gray-400" />
            <input
              type="date"
              value={dateRange.from}
              onChange={e => setDateRange(e.target.value, dateRange.to)}
              className="text-xs bg-transparent outline-none text-gray-600 w-28"
            />
            <span className="text-gray-300">→</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={e => setDateRange(dateRange.from, e.target.value)}
              className="text-xs bg-transparent outline-none text-gray-600 w-28"
            />
          </div>

          {/* User info + logout */}
          <div className="hidden sm:flex items-center gap-1.5">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5">
              <User size={13} className="text-gray-400 shrink-0" />
              <span className="text-xs text-gray-600 max-w-28 truncate">{user?.email}</span>
            </div>
            <button
              onClick={signOut}
              title="Se déconnecter"
              className="p-2 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <LogOut size={16} />
            </button>
          </div>
        </header>

        {/* Page content — fade in on route change */}
        <main key={location.pathname} className="flex-1 p-4 sm:p-6 pb-24 lg:pb-6 animate-fade-in-up overflow-x-hidden">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-200 z-20 flex">
          {mobileNav.map(({ to, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2.5 transition-colors
                ${isActive ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`
              }
            >
              <Icon size={22} />
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Global toast notifications */}
      <Toaster />
    </div>
  );
}
