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

export function BusinessSelector() {
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

  return (
    <>
      <div ref={ref} className="relative mx-3 mb-2">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-gray-800 hover:bg-gray-700 transition-colors text-left"
        >
          <Building2 size={15} className="text-indigo-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white truncate">
              {current ? (
                <>
                  {COUNTRY_FLAGS[current.country] ?? ''} {current.name}
                </>
              ) : 'Choisir un business'}
            </div>
            {current && (
              <div className="text-[10px] text-gray-400">{current.currency}</div>
            )}
          </div>
          <ChevronDown size={14} className={`text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
            {businesses.map(b => (
              <div
                key={b.id}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-700 cursor-pointer transition-colors group"
                onClick={async () => {
                  if (b.id !== currentBusinessId) await setCurrentBusiness(b.id);
                  setOpen(false);
                }}
              >
                <span className="text-sm">{COUNTRY_FLAGS[b.country] ?? ''}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-white truncate">{b.name}</div>
                  <div className="text-[10px] text-gray-400">{b.currency}</div>
                </div>
                {b.id === currentBusinessId && <Check size={13} className="text-indigo-400 shrink-0" />}
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setEditTarget(b);
                    setShowModal(true);
                    setOpen(false);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-gray-600 text-gray-400 hover:text-white transition-all"
                >
                  <Pencil size={12} />
                </button>
              </div>
            ))}

            <div className="border-t border-gray-700" />
            <button
              onClick={() => { setEditTarget(undefined); setShowModal(true); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-gray-700 transition-colors"
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
