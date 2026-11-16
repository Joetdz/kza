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
    <div className="flex flex-col h-full gap-4">
      {/* Sub-nav: the module's sections, scrolling sideways on a phone */}
      <nav className="flex gap-1 bg-surface-2 border border-line p-1 rounded-2xl overflow-x-auto scrollbar-hide sm:w-fit">
        {TABS.map(({ to, end, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={label}
            className={({ isActive }) =>
              `shrink-0 flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                isActive ? 'bg-surface text-fg shadow-soft' : 'text-fg-3 hover:text-fg'
              }`
            }
          >
            <Icon size={15} />
            <span className="hidden sm:inline">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Page content */}
      <div className="flex-1 min-h-0">
        <Outlet />
      </div>
    </div>
  );
}
