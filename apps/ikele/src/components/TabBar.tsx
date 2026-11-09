import { Home, Search, Store, User } from 'lucide-react';

export type Tab = 'feed' | 'stores' | 'search' | 'account';

const TABS: { key: Tab; label: string; href: string; Icon: typeof Home }[] = [
  { key: 'feed', label: 'Pour toi', href: '#/', Icon: Home },
  { key: 'stores', label: 'Boutiques', href: '#/boutiques', Icon: Store },
  { key: 'search', label: 'Recherche', href: '#/recherche', Icon: Search },
  { key: 'account', label: 'Compte', href: '#/compte', Icon: User },
];

/** The bottom bar of the main screens, black as TikTok's. */
export function TabBar({ active }: { active: Tab }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-black border-t border-white/10"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="max-w-md mx-auto grid grid-cols-4 h-14">
        {TABS.map(({ key, label, href, Icon }) => (
          <a key={key} href={href} aria-current={active === key ? 'page' : undefined}
            className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${active === key ? 'text-white' : 'text-white/50'}`}>
            <Icon size={22} strokeWidth={active === key ? 2.5 : 2} />
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}
