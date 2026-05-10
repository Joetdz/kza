import { NavLink, Outlet } from 'react-router-dom';
import { MessageCircle, Bot, Zap, BookOpen, Users } from 'lucide-react';

const TABS = [
  { to: '/whatsapp',                end: true,  icon: MessageCircle, label: 'Boîte de réception' },
  { to: '/whatsapp/ia',             end: false, icon: Bot,           label: 'Agent IA' },
  { to: '/whatsapp/automatisations',end: false, icon: Zap,           label: 'Automatisations' },
  { to: '/whatsapp/base',           end: false, icon: BookOpen,      label: 'Base de connaissance' },
  { to: '/whatsapp/audience',       end: false, icon: Users,         label: 'Audience' },
];

export function WhatsAppLayout() {
  return (
    <div className="flex flex-col h-full">
      {/* Sub-nav */}
      <div className="border-b border-gray-100 bg-white px-1 sm:px-4">
        <nav className="flex">
          {TABS.map(({ to, end, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-1 px-2 sm:px-4 py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`
              }
            >
              <Icon size={15} />
              <span className="hidden sm:inline">{label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
