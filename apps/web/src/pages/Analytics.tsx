import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, Legend,
} from 'recharts';
import { useStore } from '../store/useStore';
import { computeProductAnalytics } from '../utils/calculations';
import { useCurrency } from '../hooks/useCurrency';
import { pct, CLASS_CONFIG, CHART_COLORS } from '../utils/formatters';
import { Badge } from '../components/ui/Badge';
import { TrendingUp, TrendingDown, AlertTriangle, Clock, Zap, MapPin, ChevronDown, ChevronRight } from 'lucide-react';
import type { ProductClassification, ProductAnalytics } from '../types';

type SortKey = 'totalRevenue' | 'netProfit' | 'grossMarginPct' | 'roi' | 'cpa' | 'stockRotationDays';
type Tab = 'table' | 'strategy' | 'zones';

const CLASSES: ProductClassification[] = ['scale', 'profitable', 'monitor', 'stop'];
const CLASS_ICONS = { scale: TrendingUp, profitable: Zap, monitor: Clock, stop: AlertTriangle };

function ProductCard({ a, cpaThreshold, MAD }: { a: ProductAnalytics; cpaThreshold: number; MAD: (n: number) => string }) {
  const cfg = CLASS_CONFIG[a.classification];
  return (
    <div className={`rounded-2xl border p-4 ${cfg.bg} transition-all hover:shadow-md`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 truncate">{a.productName}</div>
          <div className="text-xs text-gray-500 mt-0.5">Stock: {a.currentStock} unités</div>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>
          {cfg.label}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-xs text-gray-500">CA</div>
          <div className="text-sm font-bold text-gray-900">{MAD(a.totalRevenue)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Profit</div>
          <div className={`text-sm font-bold ${a.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{MAD(a.netProfit)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Marge</div>
          <div className={`text-sm font-bold ${a.netMarginPct >= 15 ? 'text-emerald-700' : a.netMarginPct >= 0 ? 'text-amber-600' : 'text-red-600'}`}>{pct(a.netMarginPct)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">ROI</div>
          <div className={`text-sm font-bold ${a.roi >= 50 ? 'text-emerald-700' : 'text-amber-600'}`}>{pct(a.roi)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">CPA</div>
          <div className={`text-sm font-bold ${a.cpa > cpaThreshold && a.cpa > 0 ? 'text-red-600' : 'text-gray-700'}`}>
            {a.cpa > 0 ? MAD(a.cpa) : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Rotation</div>
          <div className={`text-sm font-bold ${a.stockRotationDays <= 14 ? 'text-emerald-700' : a.stockRotationDays <= 30 ? 'text-amber-600' : 'text-red-600'}`}>
            {a.stockRotationDays === 9999 ? '∞' : `${a.stockRotationDays}j`}
          </div>
        </div>
      </div>
      {a.cpa > cpaThreshold && a.cpa > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">
          <AlertTriangle size={12} /> CPA trop élevé ({MAD(a.cpa)}) — Revoir la pub
        </div>
      )}
    </div>
  );
}

export function Analytics() {
  const { products, sales, expenses, dateRange, cpaThreshold, setCpaThreshold } = useStore();
  const { fmt: MAD, currency } = useCurrency();
  const { from, to } = dateRange;
  const [sortKey, setSortKey] = useState<SortKey>('netProfit');
  const [sortDesc, setSortDesc] = useState(true);
  const [tab, setTab] = useState<Tab>('table');
  const [editingThreshold, setEditingThreshold] = useState(false);
  const [thresholdVal, setThresholdVal] = useState(cpaThreshold);

  const analytics = useMemo(
    () => computeProductAnalytics(products, sales, expenses, cpaThreshold, from, to),
    [products, sales, expenses, cpaThreshold, from, to]
  );

  const sorted = useMemo(() =>
    [...analytics].sort((a, b) => sortDesc ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]),
    [analytics, sortKey, sortDesc]
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDesc(d => !d);
    else { setSortKey(key); setSortDesc(true); }
  };

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => handleSort(k)}
      className={`text-xs font-medium px-2 py-1 rounded-lg transition-colors ${sortKey === k ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}
    >
      {label} {sortKey === k ? (sortDesc ? '↓' : '↑') : ''}
    </button>
  );

  const marginData = analytics
    .filter(a => a.totalRevenue > 0)
    .sort((a, b) => b.grossMarginPct - a.grossMarginPct)
    .map(a => ({
      name: a.productName.length > 12 ? a.productName.slice(0, 12) + '…' : a.productName,
      'Marge brute': +a.grossMarginPct.toFixed(1),
      'Marge nette': +a.netMarginPct.toFixed(1),
    }));

  const profitData = analytics
    .filter(a => a.totalRevenue > 0)
    .sort((a, b) => b.netProfit - a.netProfit)
    .map(a => ({
      name: a.productName.length > 12 ? a.productName.slice(0, 12) + '…' : a.productName,
      profit: Math.round(a.netProfit),
    }));

  const classColor = (c: string) => {
    const map: Record<string, string> = { scale: 'green', profitable: 'blue', monitor: 'amber', stop: 'red' };
    return (map[c] ?? 'gray') as 'green' | 'blue' | 'amber' | 'red' | 'gray';
  };

  const byClass = (cls: ProductClassification) =>
    analytics.filter(a => a.classification === cls).sort((a, b) => b.netProfit - a.netProfit);

  const totalProfit = analytics.reduce((s, a) => s + a.netProfit, 0);
  const scaleRevPotential = byClass('scale').reduce((s, a) => s + a.totalRevenue, 0);

  // ─── Stats par zone de livraison ────────────────────────────
  const zoneStats = useMemo(() => {
    const map: Record<string, {
      count: number; revenue: number; paid: number;
      products: Record<string, { name: string; qty: number; revenue: number }>;
    }> = {};

    sales.forEach(sale => {
      const zone = (sale as any).deliveryZone || 'Non spécifiée';
      const rev = sale.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
      if (!map[zone]) map[zone] = { count: 0, revenue: 0, paid: 0, products: {} };
      map[zone].count++;
      map[zone].revenue += rev;
      if (sale.status === 'paid') map[zone].paid++;

      sale.items.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        const name = product?.name ?? 'Inconnu';
        if (!map[zone].products[item.productId]) {
          map[zone].products[item.productId] = { name, qty: 0, revenue: 0 };
        }
        map[zone].products[item.productId].qty += item.quantity;
        map[zone].products[item.productId].revenue += item.quantity * item.unitPrice;
      });
    });

    return Object.entries(map)
      .map(([zone, s]) => ({
        zone,
        count: s.count,
        revenue: s.revenue,
        paid: s.paid,
        avg: s.count > 0 ? s.revenue / s.count : 0,
        products: Object.values(s.products).sort((a, b) => b.revenue - a.revenue),
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [sales, products]);

  const totalZoneRevenue = zoneStats.reduce((s, z) => s + z.revenue, 0);
  const [expandedZone, setExpandedZone] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analyse Financière</h1>
          <p className="text-sm text-gray-500">KPIs par produit — Période sélectionnée</p>
        </div>
        {/* CPA threshold control */}
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
          <AlertTriangle size={16} className="text-amber-500" />
          <span className="text-sm text-gray-600">Seuil CPA:</span>
          {editingThreshold ? (
            <div className="flex items-center gap-2">
              <input type="number" value={thresholdVal}
                onChange={e => setThresholdVal(+e.target.value)}
                className="w-20 border border-indigo-300 rounded-lg px-2 py-1 text-sm outline-none"
              />
              <button onClick={() => { setCpaThreshold(thresholdVal); setEditingThreshold(false); }}
                className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-lg">OK</button>
            </div>
          ) : (
            <button onClick={() => setEditingThreshold(true)} className="text-sm font-semibold text-indigo-700 hover:underline">
              {MAD(cpaThreshold)}
            </button>
          )}
        </div>
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-900 mb-4">Marges par produit (%)</h2>
          {marginData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={marginData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Legend />
                <Bar dataKey="Marge brute" fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Marge nette" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-52 flex items-center justify-center text-gray-400 text-sm">Pas de données</div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-900 mb-4">Profit net par produit ({currency})</h2>
          {profitData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={profitData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v: number) => MAD(v)} />
                <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                  {profitData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.profit >= 0 ? CHART_COLORS[idx % CHART_COLORS.length] : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-52 flex items-center justify-center text-gray-400 text-sm">Pas de données</div>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
        {(['table', 'strategy', 'zones'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            {t === 'table' ? '📊 Tableau' : t === 'strategy' ? '🎯 Stratégie' : '📍 Zones'}
          </button>
        ))}
      </div>

      {/* TABLE TAB */}
      {tab === 'table' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 mb-3">Tableau analytique détaillé</h2>
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-gray-500">Trier par:</span>
              <SortBtn k="netProfit" label="Profit net" />
              <SortBtn k="totalRevenue" label="CA" />
              <SortBtn k="grossMarginPct" label="Marge brute" />
              <SortBtn k="roi" label="ROI" />
              <SortBtn k="cpa" label="CPA" />
              <SortBtn k="stockRotationDays" label="Rotation" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-5 py-3">Produit</th>
                  <th className="text-right px-4 py-3">Unités</th>
                  <th className="text-right px-4 py-3">CA</th>
                  <th className="text-right px-4 py-3">Marge brute</th>
                  <th className="text-right px-4 py-3">Pub</th>
                  <th className="text-right px-4 py-3">Profit net</th>
                  <th className="text-right px-4 py-3">Marge%</th>
                  <th className="text-right px-4 py-3">ROI</th>
                  <th className="text-right px-4 py-3">CPA</th>
                  <th className="text-right px-4 py-3">Rotation</th>
                  <th className="text-center px-4 py-3">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sorted.map(a => (
                  <tr key={a.productId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{a.productName}</div>
                      <div className="text-xs text-gray-400">Stock: {a.currentStock}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{a.totalUnitsSold}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{MAD(a.totalRevenue)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{MAD(a.grossProfit)}</td>
                    <td className="px-4 py-3 text-right text-indigo-600">{a.totalAdSpend > 0 ? MAD(a.totalAdSpend) : '—'}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${a.netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      <span className="flex items-center justify-end gap-1">
                        {a.netProfit >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {MAD(a.netProfit)}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${a.netMarginPct >= 20 ? 'text-emerald-600' : a.netMarginPct >= 0 ? 'text-amber-600' : 'text-red-500'}`}>
                      {pct(a.netMarginPct)}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${a.roi >= 50 ? 'text-emerald-600' : a.roi >= 0 ? 'text-amber-600' : 'text-red-500'}`}>
                      {pct(a.roi)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-medium ${a.cpa > cpaThreshold && a.cpa > 0 ? 'text-red-500' : 'text-gray-700'}`}>
                        {a.cpa > 0 ? MAD(a.cpa) : '—'}
                        {a.cpa > cpaThreshold && <AlertTriangle size={12} className="inline ml-1" />}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {a.stockRotationDays === 9999 ? '∞ j' : `${a.stockRotationDays} j`}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge color={classColor(a.classification)} size="sm">
                        {CLASS_CONFIG[a.classification]?.label ?? a.classification}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr>
                    <td colSpan={11} className="text-center py-12 text-gray-400">
                      Aucune donnée disponible pour la période sélectionnée
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ZONES TAB */}
      {tab === 'zones' && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="text-xs text-gray-500 mb-1">Zones actives</div>
              <div className="text-3xl font-black text-gray-900">{zoneStats.length}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="text-xs text-gray-500 mb-1">Zone top CA</div>
              <div className="text-lg font-bold text-indigo-700 truncate">{zoneStats[0]?.zone ?? '—'}</div>
              <div className="text-xs text-gray-400">{MAD(zoneStats[0]?.revenue ?? 0)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="text-xs text-gray-500 mb-1">Zone top commandes</div>
              <div className="text-lg font-bold text-emerald-700 truncate">
                {[...zoneStats].sort((a, b) => b.count - a.count)[0]?.zone ?? '—'}
              </div>
              <div className="text-xs text-gray-400">
                {[...zoneStats].sort((a, b) => b.count - a.count)[0]?.count ?? 0} ventes
              </div>
            </div>
          </div>

          {/* Bar chart */}
          {zoneStats.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MapPin size={16} className="text-indigo-500" /> CA par zone ({currency})
              </h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={zoneStats.slice(0, 12).map(z => ({
                    name: z.zone.replace('Kinshasa — ', 'KIN/'),
                    CA: Math.round(z.revenue),
                  }))}
                  margin={{ top: 5, right: 10, bottom: 40, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: number) => MAD(v)} />
                  <Bar dataKey="CA" radius={[4, 4, 0, 0]}>
                    {zoneStats.slice(0, 12).map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Ranking table */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Classement des zones</h2>
            </div>
            {zoneStats.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">
                Aucune vente avec zone de livraison renseignée
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {zoneStats.map((z, idx) => {
                  const pctRevenue = totalZoneRevenue > 0 ? (z.revenue / totalZoneRevenue) * 100 : 0;
                  const color = CHART_COLORS[idx % CHART_COLORS.length];
                  const isExpanded = expandedZone === z.zone;
                  return (
                    <div key={z.zone}>
                      {/* Zone row */}
                      <button
                        onClick={() => setExpandedZone(isExpanded ? null : z.zone)}
                        className="w-full flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="w-6 text-sm font-bold text-gray-400 shrink-0">#{idx + 1}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <MapPin size={12} style={{ color }} />
                            <span className="text-sm font-medium text-gray-900 truncate">{z.zone}</span>
                            <span className="text-xs text-gray-400 ml-1">({z.products.length} produit{z.products.length > 1 ? 's' : ''})</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div className="h-1.5 rounded-full" style={{ width: `${pctRevenue}%`, backgroundColor: color }} />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-bold text-gray-900">{MAD(z.revenue)}</div>
                          <div className="text-xs text-gray-400">{pctRevenue.toFixed(1)}% du CA</div>
                        </div>
                        <div className="text-right shrink-0 w-20">
                          <div className="text-sm font-semibold text-indigo-600">{z.count} ventes</div>
                          <div className="text-xs text-gray-400">moy. {MAD(z.avg)}</div>
                        </div>
                        <div className="shrink-0 text-gray-400">
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </div>
                      </button>

                      {/* Product breakdown */}
                      {isExpanded && (
                        <div className="bg-gray-50 border-t border-gray-100 px-5 py-3">
                          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 ml-10">
                            Produits vendus dans cette zone
                          </div>
                          <div className="space-y-1 ml-10">
                            {z.products.map((p, pIdx) => {
                              const pctOfZone = z.revenue > 0 ? (p.revenue / z.revenue) * 100 : 0;
                              return (
                                <div key={pIdx} className="flex items-center gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="text-sm text-gray-700 truncate">{p.name}</span>
                                      <span className="text-xs text-gray-400 ml-2 shrink-0">{p.qty} unité{p.qty > 1 ? 's' : ''}</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-1">
                                      <div className="h-1 rounded-full bg-indigo-400" style={{ width: `${pctOfZone}%` }} />
                                    </div>
                                  </div>
                                  <div className="text-sm font-semibold text-gray-900 shrink-0 w-24 text-right">
                                    {MAD(p.revenue)}
                                  </div>
                                  <div className="text-xs text-gray-400 shrink-0 w-10 text-right">
                                    {pctOfZone.toFixed(0)}%
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* STRATEGY TAB */}
      {tab === 'strategy' && (
        <div className="space-y-6">
          {/* Summary strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {CLASSES.map(cls => {
              const cfg = CLASS_CONFIG[cls];
              const Icon = CLASS_ICONS[cls];
              const list = byClass(cls);
              return (
                <div key={cls} className={`rounded-2xl border p-4 ${cfg.bg}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={16} className={cfg.color} />
                    <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <div className="text-3xl font-black text-gray-900">{list.length}</div>
                  <div className="text-xs text-gray-500">produit{list.length > 1 ? 's' : ''}</div>
                </div>
              );
            })}
          </div>

          {/* Insights */}
          <div className="grid lg:grid-cols-3 gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <div className="text-sm font-semibold text-emerald-800 mb-1">🚀 Potentiel de scaling</div>
              <div className="text-2xl font-black text-emerald-700">{MAD(scaleRevPotential)}</div>
              <div className="text-xs text-emerald-600 mt-1">CA des produits à scaler</div>
            </div>
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4">
              <div className="text-sm font-semibold text-indigo-800 mb-1">💰 Profit net total</div>
              <div className={`text-2xl font-black ${totalProfit >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>{MAD(totalProfit)}</div>
              <div className="text-xs text-indigo-600 mt-1">Sur tous les produits</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <div className="text-sm font-semibold text-amber-800 mb-1">⚠️ Alertes CPA</div>
              <div className="text-2xl font-black text-amber-700">
                {analytics.filter(a => a.cpa > cpaThreshold && a.cpa > 0).length}
              </div>
              <div className="text-xs text-amber-600 mt-1">Produits au-dessus du seuil</div>
            </div>
          </div>

          {/* Classification swim lanes */}
          {CLASSES.map(cls => {
            const list = byClass(cls);
            if (list.length === 0) return null;
            const cfg = CLASS_CONFIG[cls];
            const Icon = CLASS_ICONS[cls];
            return (
              <div key={cls}>
                <div className="flex items-center gap-2 mb-3 px-1">
                  <Icon size={18} className={cfg.color} />
                  <h2 className={`text-lg font-bold ${cfg.color}`}>{cfg.label}</h2>
                  <span className="text-sm text-gray-400">({list.length})</span>
                </div>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {list.map(a => <ProductCard key={a.productId} a={a} cpaThreshold={cpaThreshold} MAD={MAD} />)}
                </div>
              </div>
            );
          })}

          {/* Stock rotation */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock size={18} className="text-blue-500" /> Rotation de stock
            </h2>
            <div className="space-y-3">
              {analytics
                .filter(a => a.currentStock > 0)
                .sort((a, b) => a.stockRotationDays - b.stockRotationDays)
                .map(a => {
                  const pct_val = a.stockRotationDays === 9999 ? 100 : Math.min(100, (a.stockRotationDays / 60) * 100);
                  const label = a.stockRotationDays === 9999 ? 'Stock mort'
                    : a.stockRotationDays <= 7 ? 'Rapide — restocker'
                    : a.stockRotationDays <= 14 ? 'Bonne vitesse'
                    : a.stockRotationDays <= 30 ? 'Vitesse moyenne'
                    : 'Lent — stock dormant';
                  const color = a.stockRotationDays <= 7 ? '#10b981' : a.stockRotationDays <= 14 ? '#6366f1' : a.stockRotationDays <= 30 ? '#f59e0b' : '#ef4444';
                  return (
                    <div key={a.productId} className="flex items-center gap-3">
                      <div className="w-36 sm:w-48 text-sm font-medium text-gray-700 truncate">{a.productName}</div>
                      <div className="flex-1">
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div className="h-2 rounded-full transition-all" style={{ width: `${pct_val}%`, backgroundColor: color }} />
                        </div>
                      </div>
                      <div className="text-right w-32 shrink-0">
                        <span className="text-sm font-semibold" style={{ color }}>
                          {a.stockRotationDays === 9999 ? '∞' : `${a.stockRotationDays} j`}
                        </span>
                        <div className="text-xs text-gray-400">{label}</div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
