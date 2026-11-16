import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, Pencil, Check, Building2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { BusinessModal } from './BusinessModal';

const COUNTRY_FLAGS: Record<string, string> = {
  CD: '🇨🇩', CG: '🇨🇬', CM: '🇨🇲', CI: '🇨🇮', SN: '🇸🇳', ML: '🇲🇱',
  BF: '🇧🇫', NE: '🇳🇪', TG: '🇹🇬', BJ: '🇧🇯', GA: '🇬🇦', GN: '🇬🇳',
  RW: '🇷🇼', BI: '🇧🇮', TZ: '🇹🇿', UG: '🇺🇬', MG: '🇲🇬', MR: '🇲🇷',
  MA: '🇲🇦', DZ: '🇩🇿', TN: '🇹🇳',
};

/** Which business the app works on. `compact`: the icon alone (the sidebar folded). */
export function BusinessSelector({ compact = false }: { compact?: boolean }) {
  const { businesses, currentBusinessId, setCurrentBusiness } = useStore();
  const [open, setOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<typeof businesses[0] | undefined>(undefined);
  const ref = useRef<HTMLDivElement>(null);

  const current = businesses.find(b => b.id === currentBusinessId);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  if (businesses.length === 0) return null;

  const flag = current ? COUNTRY_FLAGS[current.country] : undefined;

  return (
    <>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(o => !o)}
          title={compact ? current?.name : undefined}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`w-full flex items-center gap-2.5 rounded-xl bg-surface border border-line hover:border-line-strong hover:shadow-soft transition-all text-left
            ${compact ? 'lg:justify-center lg:px-0 lg:py-2 px-3 py-2' : 'px-3 py-2'}`}
        >
          <span className="w-8 h-8 rounded-lg bg-indigo-600/10 text-indigo-700 flex items-center justify-center shrink-0 text-base">
            {flag ?? <Building2 size={15} />}
          </span>
          <div className={`flex-1 min-w-0 ${compact ? 'lg:hidden' : ''}`}>
            <div className="text-xs font-semibold text-fg truncate">{current?.name ?? 'Choisir un business'}</div>
            {current && <div className="text-[10px] text-fg-3">{current.currency}</div>}
          </div>
          <ChevronDown size={14} className={`text-fg-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''} ${compact ? 'lg:hidden' : ''}`} />
        </button>

        {open && (
          <div role="listbox" className={`absolute top-full mt-1.5 glass-strong border rounded-2xl shadow-float z-50 overflow-hidden animate-scale-in origin-top-left
            ${compact ? 'left-0 w-64' : 'left-0 right-0'}`}>
            {businesses.map(b => (
              <div
                key={b.id}
                role="option"
                aria-selected={b.id === currentBusinessId}
                className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors group ${b.id === currentBusinessId ? 'bg-indigo-600/[0.08]' : 'hover:bg-surface-2'}`}
                onClick={async () => {
                  if (b.id !== currentBusinessId) await setCurrentBusiness(b.id);
                  setOpen(false);
                }}
              >
                <span className="text-base w-6 text-center">{COUNTRY_FLAGS[b.country] ?? '🏢'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-fg truncate">{b.name}</div>
                  <div className="text-[10px] text-fg-3">{b.currency}</div>
                </div>
                {b.id === currentBusinessId && <Check size={13} className="text-indigo-600 shrink-0" />}
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setEditTarget(b);
                    setShowModal(true);
                    setOpen(false);
                  }}
                  aria-label={`Modifier ${b.name}`}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-lg hover:bg-surface-3 text-fg-3 hover:text-fg transition-all"
                >
                  <Pencil size={12} />
                </button>
              </div>
            ))}

            <div className="border-t border-line" />
            <button
              onClick={() => { setEditTarget(undefined); setShowModal(true); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-indigo-700 hover:bg-indigo-600/[0.08] transition-colors"
            >
              <Plus size={14} /> Nouveau business
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <BusinessModal
          business={editTarget}
          onClose={() => { setShowModal(false); setEditTarget(undefined); }}
        />
      )}
    </>
  );
}
