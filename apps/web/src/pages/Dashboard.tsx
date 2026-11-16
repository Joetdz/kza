import { useMemo, useState, type ReactNode } from 'react';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, CreditCard, Package,
  AlertTriangle, ShoppingBag, Target, Zap, Filter, ArrowRight, Receipt, BarChart3, Boxes,
  type LucideIcon,
} from 'lucide-react';
import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns';
import { useStore } from '../store/useStore';
import { useCurrency } from '../hooks/useCurrency';
import { useCountUp } from '../hooks/useCountUp';
import {
  computeGlobalKpis, computeProductAnalytics,
  getSalesTimeSeries, getChannelRevenue, getExpenseBreakdown,
} from '../utils/calculations';
import { pct, formatDate, formatDateShort, CHANNEL_COLORS, EXPENSE_LABELS, EXPENSE_COLORS } from '../utils/formatters';
import { Badge } from '../components/ui/Badge';
import { FirstSteps } from '../components/FirstSteps';
import { useModules } from '../hooks/useModules';
import { useSegment } from '../hooks/useSegment';
import { useChartTheme } from '../hooks/useChartTheme';
import { allItems } from '@kza/shared';

const SALE_STATUS: Record<string, { label: string; color: 'green' | 'amber' | 'red' | 'indigo' }> = {
  paid: { label: 'Payé', color: 'green' },
  pending: { label: 'En attente', color: 'amber' },
  cancelled: { label: 'Annulé', color: 'red' },
  credit: { label: 'À crédit', color: 'indigo' },
};

/** The change from the previous period, as « +12 % » — none when there is nothing to compare to. */
function changeOf(now: number, before: number): number | null {
  if (!before) return null;
  return ((now - before) / Math.abs(before)) * 100;
}

function Delta({ value, invert = false, className = '' }: { value: number | null; invert?: boolean; className?: string }) {
  if (value === null || !Number.isFinite(value)) return null;
  const good = invert ? value <= 0 : value >= 0;
  const Icon = value >= 0 ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'} ${className}`}>
      <Icon size={12} /> {value >= 0 ? '+' : ''}{value.toFixed(0)} %
    </span>
  );
}

/** A figure that counts up to its value. */
function Figure({ value, className }: { value: string; className: string }) {
  return <span className={className}>{useCountUp(value)}</span>;
}

/** A medium headline card: label, figure, one line under it, the change from before. */
function MetricCard({ icon: Icon, label, value, sub, delta, invertDelta, tone = 'default', className = '' }: {
  icon: LucideIcon; label: string; value: string; sub?: ReactNode; delta?: number | null; invertDelta?: boolean;
  tone?: 'default' | 'positive' | 'negative'; className?: string;
}) {
  const valueColor = { default: 'text-fg', positive: 'text-emerald-700', negative: 'text-red-700' }[tone];
  return (
    <div className={`card card-hover p-4 sm:p-5 flex flex-col gap-2 min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs sm:text-sm font-medium text-fg-3 truncate">{label}</span>
        <span className="p-1.5 rounded-lg bg-surface-2 text-fg-3 shrink-0"><Icon size={15} /></span>
      </div>
      <Figure value={value} className={`text-xl sm:text-2xl font-bold tracking-tight truncate ${valueColor}`} />
      <div className="flex items-center gap-2 flex-wrap min-h-[20px]">
        {delta !== undefined && <Delta value={delta ?? null} invert={invertDelta} />}
        {sub && <span className="text-xs text-fg-3 truncate">{sub}</span>}
      </div>
    </div>
  );
}

/** A small figure in the strip of secondary indicators. */
function MiniMetric({ icon: Icon, label, value, tone = 'default' }: { icon: LucideIcon; label: string; value: string; tone?: 'default' | 'warning' | 'positive' }) {
  const color = { default: 'text-fg', warning: 'text-red-700', positive: 'text-emerald-700' }[tone];
  return (
    <div className="card px-4 py-3 flex items-center gap-3 min-w-[180px] lg:min-w-0 shrink-0">
      <span className="p-2 rounded-xl bg-surface-2 text-fg-3 shrink-0"><Icon size={16} /></span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-fg-3 truncate">{label}</p>
        <Figure value={value} className={`block text-base font-bold tracking-tight truncate ${color}`} />
      </div>
    </div>
  );
}

function Panel({ title, action, children, className = '' }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 sm:p-5 min-w-0 ${className}`}>
      <div className="flex items-center justify-between gap-2 mb-4">
        <h2 className="font-semibold text-fg">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const SeeAll = ({ href, label = 'Tout voir' }: { href: string; label?: string }) => (
  <a href={href} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline">
    {label} <ArrowRight size={12} />
  </a>
);

const PanelEmpty = ({ children }: { children: ReactNode }) => (
  <div className="h-40 flex items-center justify-center text-fg-4 text-sm text-center px-4">{children}</div>
);

export function Dashboard() {
  const { products, sales, expenses, dateRange, cpaThreshold } = useStore();
  const { fmt: MAD } = useCurrency();
  const { has } = useModules();
  const { terms, words } = useSegment();
  const chart = useChartTheme();
  // Services-only businesses have no stock to watch.
  const tracksStock = has('stock');
  const { from, to } = dateRange;

  const [selectedProductId, setSelectedProductId] = useState<string>('all');
  const selectedProduct = products.find(p => p.id === selectedProductId) ?? null;

  // Filtered data for a single product
  const filteredSales = useMemo(() => {
    if (selectedProductId === 'all') return sales;
    return sales
      .filter(s => s.items.some(i => i.productId === selectedProductId))
      .map(s => ({ ...s, items: s.items.filter(i => i.productId === selectedProductId) }));
  }, [sales, selectedProductId]);

  const filteredExpenses = useMemo(() => {
    if (selectedProductId === 'all') return expenses;
    return expenses.filter(e => !e.productId || e.productId === selectedProductId);
  }, [expenses, selectedProductId]);

  // KPIs — global or product-specific
  const globalKpis = useMemo(
    () => computeGlobalKpis(products, filteredSales, filteredExpenses, from, to),
    [products, filteredSales, filteredExpenses, from, to]
  );

  const productAnalytics = useMemo(() => {
    if (selectedProductId === 'all') return null;
    const all = computeProductAnalytics(products, sales, expenses, cpaThreshold, from, to);
    return all.find(a => a.productId === selectedProductId) ?? null;
  }, [selectedProductId, products, sales, expenses, cpaThreshold, from, to]);

  // Merge: use productAnalytics fields when available, else globalKpis
  const kpis = useMemo(() => {
    if (!productAnalytics) return globalKpis;
    return {
      totalRevenue: productAnalytics.totalRevenue,
      totalCOGS: productAnalytics.totalCOGS,
      grossProfit: productAnalytics.grossProfit,
      grossMarginPct: productAnalytics.grossMarginPct,
      totalExpenses: productAnalytics.totalAdSpend + productAnalytics.totalOtherExpenses,
      netProfit: productAnalytics.netProfit,
      netMarginPct: productAnalytics.netMarginPct,
      totalOrders: productAnalytics.conversions,
      avgOrderValue: productAnalytics.avgSalePrice,
      totalAdSpend: productAnalytics.totalAdSpend,
      totalStockValue: selectedProduct
        ? selectedProduct.quantity * (selectedProduct.sellingPrice > 0 ? selectedProduct.sellingPrice : selectedProduct.acquisitionCost)
        : globalKpis.totalStockValue,
    };
  }, [productAnalytics, globalKpis, selectedProduct]);

  const timeSeries = useMemo(
    () => getSalesTimeSeries(products, filteredSales, from, to),
    [products, filteredSales, from, to]
  );

  const channelData = useMemo(
    () => getChannelRevenue(filteredSales, from, to),
    [filteredSales, from, to]
  );

  const expenseBreakdown = useMemo(
    () => getExpenseBreakdown(filteredExpenses, from, to),
    [filteredExpenses, from, to]
  );

  const lowStockProducts = !tracksStock ? [] : selectedProductId === 'all'
    ? products.filter(p => p.quantity <= p.alertThreshold)
    : products.filter(p => p.id === selectedProductId && p.quantity <= p.alertThreshold);

  const productRevMap: Record<string, number> = {};
  sales.forEach(s => {
    s.items.forEach(i => {
      productRevMap[i.productId] = (productRevMap[i.productId] || 0) + i.quantity * i.unitPrice;
    });
  });
  const topProducts = Object.entries(productRevMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([id, rev]) => ({ product: products.find(p => p.id === id), rev }))
    .filter(x => x.product);

  const formatAxisDate = (dateStr: string) => {
    try { return formatDateShort(dateStr); } catch { return dateStr; }
  };

  // The previous period of the same length, for the « vs before » changes (all products only:
  // a single product's figures come from another calculation).
  const previous = useMemo(() => {
    if (selectedProductId !== 'all') return null;
    try {
      const start = parseISO(from);
      const days = differenceInCalendarDays(parseISO(to), start) + 1;
      if (!(days > 0)) return null;
      const prevTo = subDays(start, 1);
      const prevFrom = subDays(prevTo, days - 1);
      return computeGlobalKpis(products, sales, expenses, format(prevFrom, 'yyyy-MM-dd'), format(prevTo, 'yyyy-MM-dd'));
    } catch { return null; }
  }, [selectedProductId, products, sales, expenses, from, to]);
  const vs = (key: 'totalRevenue' | 'netProfit' | 'totalExpenses' | 'grossProfit') =>
    previous ? changeOf(kpis[key], previous[key]) : undefined;

  // The period's most recent sales.
  const recentSales = useMemo(() => filteredSales
    .filter(s => s.date.slice(0, 10) >= from && s.date.slice(0, 10) <= to)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    .slice(0, 5), [filteredSales, from, to]);

  const expenseTotal = expenseBreakdown.reduce((s, e) => s + e.value, 0);
  const expenseRows = [...expenseBreakdown].sort((a, b) => b.value - a.value);
  const channelRows = [...channelData].sort((a, b) => b.revenue - a.revenue);
  const channelMax = Math.max(1, ...channelRows.map(c => c.revenue));
  const topMax = Math.max(1, ...topProducts.map(t => t.rev));
  const roas = kpis.totalAdSpend > 0 ? kpis.totalRevenue / kpis.totalAdSpend : null;
  const revenueChange = vs('totalRevenue');

  return (
    <div className="space-y-5 sm:space-y-6 overflow-x-hidden">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight text-fg leading-tight">Dashboard</h1>
          <p className="text-xs sm:text-sm text-fg-3 mt-1 truncate">
            {selectedProduct ? `Vue détaillée — ${selectedProduct.name}` : "Vue d'ensemble de ton activité"}
          </p>
        </div>
        {/* Product filter */}
        <label className="flex items-center gap-2 w-full sm:w-auto">
          <Filter size={15} className="text-fg-4 shrink-0" />
          <select value={selectedProductId} onChange={e => setSelectedProductId(e.target.value)} className="input sm:w-56 !py-2">
            <option value="all">{allItems(terms)}</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>

      {selectedProductId === 'all' && <FirstSteps />}

      {/* ── The headline: revenue large, then profit, spending, gross margin ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 stagger">
        <div className="col-span-2 relative overflow-hidden rounded-2xl p-5 sm:p-6 text-white shadow-card bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800">
          {/* Light shapes for depth */}
          <div className="absolute -right-10 -top-12 w-48 h-48 rounded-full bg-white/10 blur-2xl" aria-hidden />
          <div className="absolute right-6 bottom-0 w-32 h-32 rounded-full bg-violet-300/20 blur-2xl" aria-hidden />
          <div className="relative">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-white/80">Chiffre d'affaires</span>
              <span className="p-2 rounded-xl bg-white/15"><TrendingUp size={18} /></span>
            </div>
            <Figure value={MAD(kpis.totalRevenue)} className="block mt-3 text-[34px] sm:text-[42px] leading-none font-bold tracking-tight" />
            <div className="mt-4 flex items-center gap-2 flex-wrap text-sm text-white/85">
              <span>{kpis.totalOrders} commande{kpis.totalOrders > 1 ? 's' : ''}</span>
              {revenueChange !== undefined && revenueChange !== null && Number.isFinite(revenueChange) && (
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${revenueChange >= 0 ? 'bg-emerald-400/20 text-emerald-100' : 'bg-red-400/25 text-red-100'}`}>
                  {revenueChange >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {revenueChange >= 0 ? '+' : ''}{revenueChange.toFixed(0)} % vs période précédente
                </span>
              )}
            </div>
          </div>
        </div>
        <MetricCard icon={DollarSign} label="Profit net" value={MAD(kpis.netProfit)}
          sub={`Marge ${pct(kpis.netMarginPct)}`} delta={vs('netProfit')}
          tone={kpis.netProfit >= 0 ? 'positive' : 'negative'} />
        <MetricCard icon={CreditCard} label="Dépenses" value={MAD(kpis.totalExpenses)}
          sub={`Pub ${MAD(kpis.totalAdSpend)}`} delta={vs('totalExpenses')} invertDelta />
        <MetricCard icon={Target} label="Marge brute" value={pct(kpis.grossMarginPct)}
          sub={MAD(kpis.grossProfit)} delta={vs('grossProfit')} className="col-span-2 lg:col-span-1" />
      </div>

      {/* ── Secondary indicators: a strip that scrolls on a phone ── */}
      <div className="flex lg:grid lg:grid-cols-4 gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide stagger">
        <MiniMetric icon={ShoppingBag} label="Panier moyen" value={MAD(kpis.avgOrderValue)} />
        <MiniMetric icon={Zap} label={roas !== null ? `Budget pub · ROAS ${roas.toFixed(1)}x` : 'Budget pub'} value={MAD(kpis.totalAdSpend)} />
        {tracksStock && <MiniMetric icon={Boxes} label="Valeur du stock" value={MAD(kpis.totalStockValue)} />}
        {tracksStock && (
          <MiniMetric icon={AlertTriangle} label="Stock critique"
            value={lowStockProducts.length > 0 ? `${lowStockProducts.length} ${lowStockProducts.length > 1 ? terms.items : terms.item}` : 'Tout est OK'}
            tone={lowStockProducts.length > 0 ? 'warning' : 'positive'} />
        )}
      </div>

      {/* ── Revenue and profit over the period ── */}
      <Panel
        title="CA & profit — évolution"
        action={
          <div className="flex items-center gap-3 text-xs text-fg-3">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: chart.brand }} /> CA</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: chart.success }} /> Profit</span>
          </div>
        }
      >
        {timeSeries.length > 0 ? (
          <div className="h-[200px] sm:h-[260px] -ml-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeries} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chart.brand} stopOpacity={0.28} />
                    <stop offset="95%" stopColor={chart.brand} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chart.success} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={chart.success} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={chart.grid} />
                <XAxis dataKey="date" tickFormatter={formatAxisDate} tick={{ fontSize: chart.tickFontSize, fill: chart.axis }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis tick={{ fontSize: chart.tickFontSize, fill: chart.axis }} tickFormatter={v => `${Math.round(v / 1000)}k`} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  {...chart.tooltip}
                  formatter={(v: number, name: string) => [MAD(v), name === 'revenue' ? 'CA' : 'Profit']}
                  labelFormatter={formatAxisDate}
                />
                <Area type="monotone" dataKey="revenue" stroke={chart.brand} fill="url(#gradRevenue)" strokeWidth={2} name="revenue" dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
                <Area type="monotone" dataKey="profit" stroke={chart.success} fill="url(#gradProfit)" strokeWidth={2} name="profit" dot={false} activeDot={{ r: 5, strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <PanelEmpty>Pas de ventes sur la période sélectionnée</PanelEmpty>
        )}
      </Panel>

      {/* ── Where the money goes, where it comes from ── */}
      <div className="grid lg:grid-cols-2 gap-4 sm:gap-6">
        <Panel title="Dépenses par catégorie" action={<SeeAll href="#/depenses" />}>
          {expenseRows.length > 0 ? (
            <div className="flex flex-col sm:flex-row items-center gap-5">
              <div className="relative w-[170px] h-[170px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={expenseRows} dataKey="value" nameKey="name" innerRadius={58} outerRadius={80} paddingAngle={2} stroke="none">
                      {expenseRows.map((entry, i) => (
                        <Cell key={entry.name} fill={EXPENSE_COLORS[entry.name] ?? chart.colors[i % chart.colors.length]} />
                      ))}
                    </Pie>
                    <Tooltip {...chart.tooltip} formatter={(v: number, name: string) => [MAD(v), EXPENSE_LABELS[name] ?? name]} />
                  </PieChart>
                </ResponsiveContainer>
                {/* The total in the middle of the ring */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[11px] text-fg-3">Total</span>
                  <span className="text-sm font-bold text-fg tabular-nums">{MAD(expenseTotal)}</span>
                </div>
              </div>
              <ul className="flex-1 w-full space-y-2.5">
                {expenseRows.map((e, i) => {
                  const color = EXPENSE_COLORS[e.name] ?? chart.colors[i % chart.colors.length];
                  const share = expenseTotal ? (e.value / expenseTotal) * 100 : 0;
                  return (
                    <li key={e.name} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                        <span className="flex-1 min-w-0 truncate text-fg-2">{EXPENSE_LABELS[e.name] ?? e.name}</span>
                        <span className="font-semibold text-fg tabular-nums">{MAD(e.value)}</span>
                        <span className="w-10 text-right text-xs text-fg-3 tabular-nums">{share.toFixed(0)} %</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <PanelEmpty>Aucune dépense sur la période</PanelEmpty>
          )}
        </Panel>

        <Panel title="CA par canal de vente" action={<SeeAll href="#/ventes" />}>
          {channelRows.length > 0 ? (
            <ul className="space-y-3.5">
              {channelRows.map(c => (
                <li key={c.channel}>
                  <div className="flex items-center justify-between gap-2 text-sm mb-1.5">
                    <span className="flex items-center gap-2 min-w-0 text-fg-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CHANNEL_COLORS[c.channel] ?? chart.brand }} />
                      <span className="truncate">{c.channel}</span>
                    </span>
                    <span className="font-semibold text-fg tabular-nums">{MAD(c.revenue)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full rounded-full transition-[width] duration-700 ease-out-soft"
                      style={{ width: `${(c.revenue / channelMax) * 100}%`, background: CHANNEL_COLORS[c.channel] ?? chart.brand }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <PanelEmpty>Aucune vente sur la période</PanelEmpty>
          )}
        </Panel>
      </div>

      {/* ── To act on: best sellers, stock to refill, latest sales ── */}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
        {/* Top Products — hidden when filtering a single product */}
        {selectedProductId === 'all' && (
          <Panel title={`Top ${terms.items} (CA)`} action={<SeeAll href="#/analytique" label="Analyse" />}>
            {topProducts.length > 0 ? (
              <ol className="space-y-3">
                {topProducts.map(({ product, rev }, i) => (
                  <li key={product!.id} className="animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-lg bg-indigo-600/10 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-fg truncate">{product!.name}</span>
                          <span className="text-sm font-semibold text-fg tabular-nums shrink-0">{MAD(rev)}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                          <div className="h-full rounded-full bg-indigo-500 transition-[width] duration-700 ease-out-soft" style={{ width: `${(rev / topMax) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <PanelEmpty>Aucune vente enregistrée</PanelEmpty>
            )}
          </Panel>
        )}

        {/* Product detail card when a product is selected */}
        {selectedProduct && productAnalytics && (
          <Panel title={`Détail — ${selectedProduct.name}`}>
            <dl className="space-y-3">
              {[
                { label: 'Unités vendues', value: `${productAnalytics.totalUnitsSold} unités` },
                { label: 'Prix moyen de vente', value: MAD(productAnalytics.avgSalePrice) },
                { label: 'Coût acquisition unitaire', value: MAD(selectedProduct.acquisitionCost) },
                { label: 'ROI', value: pct(productAnalytics.roi) },
                { label: 'CPA moyen', value: productAnalytics.cpa > 0 ? MAD(productAnalytics.cpa) : '—' },
                { label: 'Stock actuel', value: `${selectedProduct.quantity} unités` },
                { label: 'Rotation stock', value: productAnalytics.stockRotationDays < 9999 ? `${productAnalytics.stockRotationDays}j` : '—' },
              ].map(row => (
                <div key={row.label} className="flex justify-between gap-3 text-sm">
                  <dt className="text-fg-3">{row.label}</dt>
                  <dd className="font-semibold text-fg tabular-nums">{row.value}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        )}

        {/* Low Stock Alerts */}
        {tracksStock && (
          <Panel
            title={<span className="flex items-center gap-2"><AlertTriangle size={17} className="text-amber-500" /> Alertes stock</span>}
            action={lowStockProducts.length > 0 ? <SeeAll href="#/stock" label="Au stock" /> : undefined}
          >
            {lowStockProducts.length > 0 ? (
              <ul className="space-y-2">
                {lowStockProducts.slice(0, 6).map(p => (
                  <li key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-100">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-fg truncate">{p.name}</div>
                      <div className="text-xs text-fg-3">seuil {p.alertThreshold}{p.supplier ? ` · ${p.supplier}` : ''}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-red-700 tabular-nums leading-tight">{p.quantity}</div>
                      <div className="text-[10px] text-fg-4">en stock</div>
                    </div>
                  </li>
                ))}
                {lowStockProducts.length > 6 && (
                  <li className="text-xs text-fg-3 text-center pt-1">+ {lowStockProducts.length - 6} autre{lowStockProducts.length - 6 > 1 ? 's' : ''}</li>
                )}
              </ul>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-fg-3">
                <Package size={34} className="mb-2 text-emerald-500" />
                <p className="text-sm">{selectedProduct ? `Stock ${selectedProduct.name} OK` : 'Tous les stocks sont OK'}</p>
              </div>
            )}
          </Panel>
        )}

        {/* Latest sales of the period */}
        <Panel title={<span className="flex items-center gap-2"><Receipt size={17} className="text-indigo-600" /> Ventes récentes</span>}
          action={<SeeAll href="#/ventes" />}>
          {recentSales.length > 0 ? (
            <ul className="divide-y divide-line">
              {recentSales.map((s, i) => {
                const total = s.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
                const st = SALE_STATUS[s.status] ?? SALE_STATUS.paid;
                return (
                  <li key={s.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 animate-fade-in-up" style={{ animationDelay: `${i * 50}ms` }}>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CHANNEL_COLORS[s.channel] ?? chart.brand }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-fg truncate">{s.customerName || s.channel}</div>
                      <div className="text-xs text-fg-3 truncate">{formatDate(s.date)} · {s.channel}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-fg tabular-nums">{MAD(total)}</div>
                      <Badge color={st.color} size="sm">{st.label}</Badge>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <PanelEmpty><span className="flex flex-col items-center gap-2"><BarChart3 size={28} className="text-fg-4" /> Aucune vente sur la période</span></PanelEmpty>
          )}
        </Panel>
      </div>
    </div>
  );
}
