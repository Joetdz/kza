import { useMemo, useState } from 'react';
import type { Remittance } from '../api/logistics';
import { fmtMoney } from '../api/treasury';

type Filter = 'open' | 'due' | 'partial' | 'paid' | 'all';

const FILTERS: [Filter, string][] = [
  ['open', 'À verser'], ['partial', 'Partiels'], ['paid', 'Versés'], ['all', 'Tout'],
];
const STATUS: Record<Remittance['status'], { label: string; className: string }> = {
  due: { label: 'À verser', className: 'bg-red-50 text-red-600' },
  partial: { label: 'Partiel', className: 'bg-amber-50 text-amber-700' },
  paid: { label: 'Versé', className: 'bg-green-50 text-green-700' },
};
const PAGE = 50;

/** « 25 $ · 3 000 FC », the currencies that are there. */
const both = (usd: number, cdf: number) =>
  [usd ? fmtMoney(usd, 'USD') : '', cdf ? fmtMoney(cdf, 'CDF') : ''].filter(Boolean).join(' · ') || '—';

// Every amount the partners must hand over, one line per delivered order — made from the
// sale itself — with what their confirmed payments already cover, oldest first.
export function RemittancesList({ lines }: { lines: Remittance[] | null }) {
  const [filter, setFilter] = useState<Filter>('open');
  const [partnerId, setPartnerId] = useState('');
  const [shown, setShown] = useState(PAGE);

  const partners = useMemo(() => {
    const map = new Map<string, string>();
    (lines ?? []).forEach(l => map.set(l.partner.id, l.partner.name));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [lines]);

  const visible = useMemo(() => (lines ?? []).filter(l =>
    (!partnerId || l.partner.id === partnerId) &&
    (filter === 'all' || (filter === 'open' ? l.status !== 'paid' : l.status === filter))), [lines, partnerId, filter]);

  const restUsd = visible.reduce((s, l) => s + l.restUsd, 0);
  const restCdf = visible.reduce((s, l) => s + l.restCdf, 0);

  return (
    <div>
      <h3 className="text-sm font-bold text-gray-900 mb-2">À verser par commande</h3>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide">
          {FILTERS.map(([key, label]) => (
            <button key={key} onClick={() => { setFilter(key); setShown(PAGE); }} aria-pressed={filter === key}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold ${filter === key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {label}
            </button>
          ))}
        </div>
        {partners.length > 1 && (
          <select value={partnerId} onChange={e => { setPartnerId(e.target.value); setShown(PAGE); }}
            className="border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs bg-surface">
            <option value="">Tous les partenaires</option>
            {partners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
      </div>

      {!lines ? (
        <p className="text-sm text-gray-400 py-4">Chargement…</p>
      ) : visible.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          {filter === 'open' ? 'Rien à verser : tout est réglé.' : 'Aucune commande ici.'}
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-gray-50 mb-2 text-sm">
            <span className="text-gray-600">{visible.length} commande{visible.length > 1 ? 's' : ''}</span>
            <span className="font-black text-gray-900">Reste : {both(restUsd, restCdf)}</span>
          </div>
          <div className="bg-surface rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
            {visible.slice(0, shown).map(l => (
              <div key={l.orderId} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    <span className="text-indigo-600">#{l.orderNumber}</span> · {l.customerName}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {l.partner.name} · livrée le {new Date(`${l.deliveredOn}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    {l.city ? ` · ${l.city}` : ''}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Dû {both(Math.max(0, l.dueUsd), Math.max(0, l.dueCdf))}
                    {l.status === 'partial' && ` · déjà versé ${both(l.paidUsd, l.paidCdf)}`}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS[l.status].className}`}>{STATUS[l.status].label}</span>
                  {l.status !== 'paid' && <p className="text-sm font-black text-gray-900 mt-0.5 whitespace-nowrap">{both(l.restUsd, l.restCdf)}</p>}
                </div>
              </div>
            ))}
          </div>
          {visible.length > shown && (
            <button onClick={() => setShown(n => n + PAGE)} className="w-full mt-2 py-2 text-xs font-semibold text-indigo-600">
              Voir {Math.min(PAGE, visible.length - shown)} de plus ({visible.length - shown} restantes)
            </button>
          )}
        </>
      )}
      <p className="text-[11px] text-gray-400 mt-2">
        Chaque commande livrée crée sa ligne : les $ encaissés (ou le total de la commande), plus les FC encaissés moins
        les frais de livraison. Les versements confirmés couvrent les commandes les plus anciennes d'abord.
      </p>
    </div>
  );
}
