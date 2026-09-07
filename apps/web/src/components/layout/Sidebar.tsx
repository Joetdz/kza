import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Package, ShoppingCart, CreditCard,
  BarChart2, Target, Download, X, LogOut, MessageCircle, Shield, Store, Truck, Users, UserCog,
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { useAuth } from '../../contexts/AuthContext';
import { useRole } from '../../hooks/useRole';
import { BusinessSelector } from '../BusinessSelector';

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS ?? '')
  .split(',').map((e: string) => e.trim().toLowerCase()).filter(Boolean);

// `finance: true` hides the link from operators — the server enforces this too,
// so this is purely so an operator doesn't see links that would 403.
const nav = [
  { to: '/',           icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/stock',      icon: Package,         label: 'Stock' },
  { to: '/ventes',     icon: ShoppingCart,    label: 'Ventes',      finance: true },
  { to: '/depenses',   icon: CreditCard,      label: 'Dépenses',    finance: true },
  { to: '/analytique', icon: BarChart2,       label: 'Analytique',  finance: true },
  { to: '/objectifs',  icon: Target,          label: 'Objectifs',   finance: true },
  { to: '/boutique',   icon: Store,           label: 'Ma Boutique' },
  { to: '/export',     icon: Download,        label: 'Export',      finance: true },
  { to: '/whatsapp',   icon: MessageCircle,   label: 'WhatsApp CRM' },
  { to: '/logistique', icon: Truck,           label: 'Logistique' },
  { to: '/clients',    icon: Users,           label: 'Clients' },
];

export function Sidebar() {
  const { sidebarOpen, toggleSidebar } = useStore();
  const { user, signOut } = useAuth();
  const { canSeeFinances, canManageTeam } = useRole();

  const isAdmin = !!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());
  const visibleNav = nav.filter(item => !item.finance || canSeeFinances);

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
        <div className="flex items-center justify-between px-5 py-5 border-b border-gray-700">
          <div>
            <div className="text-2xl font-black text-white tracking-tight">KZA</div>
            <div className="text-xs text-gray-400 mt-0.5">Gestion E-Commerce</div>
          </div>
          <button className="lg:hidden text-gray-400 hover:text-white" onClick={toggleSidebar}>
            <X size={20} />
          </button>
        </div>

        {/* Business selector */}
        <div className="pt-3">
          <BusinessSelector />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-1">
          {visibleNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => sidebarOpen && toggleSidebar()}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                ${isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}

          {/* Team management — owner only */}
          {canManageTeam && (
            <NavLink
              to="/equipe"
              onClick={() => sidebarOpen && toggleSidebar()}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                ${isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              <UserCog size={18} />
              Équipe
            </NavLink>
          )}

          {/* Admin link — visible only for admin users */}
          {isAdmin && (
            <>
              <div className="my-2 border-t border-gray-700" />
              <NavLink
                to="/admin"
                end
                onClick={() => sidebarOpen && toggleSidebar()}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${isActive
                    ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30'
                    : 'text-amber-400 hover:text-white hover:bg-gray-800'
                  }`
                }
              >
                <Shield size={18} />
                Admin SaaS
              </NavLink>
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-700 space-y-2">
          <div className="text-xs text-gray-400 truncate">{user?.email}</div>
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-red-400 transition-colors"
          >
            <LogOut size={13} /> Se déconnecter
          </button>
        </div>
      </aside>
    </>
  );
}
