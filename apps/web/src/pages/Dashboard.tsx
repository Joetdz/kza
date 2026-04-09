import { useMemo, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  TrendingUp, DollarSign, CreditCard, Package,
  AlertTriangle, ShoppingBag, Target, Zap, Filter,
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useCurrency } from '../hooks/useCurrency';
import {
  computeGlobalKpis, computeProductAnalytics,
  getSalesTimeSeries, getChannelRevenue, getExpenseBreakdown,
} from '../utils/calculations';
import { pct, formatDateShort, CHANNEL_COLORS, EXPENSE_LABELS, EXPENSE_COLORS, CHART_COLORS } from '../utils/formatters';
import { KpiCard } from '../components/ui/KpiCard';
import { Badge } from '../components/ui/Badge';

export function Dashboard() {
  const { products, sales, expenses, dateRange, cpaThreshold } = useStore();
  const { fmt: MAD } = useCurrency();
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

  const lowStockProducts = selectedProductId === 'all'
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {selectedProduct ? `Vue produit — ${selectedProduct.name}` : 'Vue CEO — Toute la boutique'}
          </p>
        </div>
        {/* Product filter */}
        <div className="flex items-center gap-2">
          <Filter size={15} className="text-gray-400" />
          <select
            value={selectedProductId}
            onChange={e => setSelectedProductId(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
          >
            <option value="all">Toute la boutique</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Chiffre d'affaires"
          value={MAD(kpis.totalRevenue)}
          sub={`${kpis.totalOrders} commandes`}
          icon={TrendingUp}
          iconColor="text-indigo-500"
        />
        <KpiCard
          label="Profit net"
          value={MAD(kpis.netProfit)}
          sub={`Marge ${pct(kpis.netMarginPct)}`}
          icon={DollarSign}
          iconColor={kpis.netProfit >= 0 ? 'text-emerald-500' : 'text-red-500'}
          trend={kpis.netProfit >= 0 ? 'up' : 'down'}
          trendLabel={kpis.netProfit >= 0 ? 'Positif' : 'Négatif'}
        />
        <KpiCard
          label="Dépenses totales"
          value={MAD(kpis.totalExpenses)}
          sub={`Pub: ${MAD(kpis.totalAdSpend)}`}
          icon={CreditCard}
          iconColor="text-amber-500"
        />
        <KpiCard
          label="Marge brute"
          value={pct(kpis.grossMarginPct)}
          sub={MAD(kpis.grossProfit)}
          icon={Target}
          iconColor="text-blue-500"
        />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Panier moyen"
          value={MAD(kpis.avgOrderValue)}
          sub={`${kpis.totalOrders} commandes`}
          icon={ShoppingBag}
          iconColor="text-purple-500"
        />
        <KpiCard
          label="Stock critique"
          value={`${lowStockProducts.length}`}
          sub={lowStockProducts.length > 0 ? 'Produits en alerte' : 'Tout est OK'}
          icon={AlertTriangle}
          iconColor={lowStockProducts.length > 0 ? 'text-red-500' : 'text-emerald-500'}
          trend={lowStockProducts.length > 0 ? 'down' : 'up'}
          trendLabel={lowStockProducts.length > 0 ? 'Action requise' : 'Stock OK'}
        />
        <KpiCard
          label="Valeur du stock"
          value={MAD(kpis.totalStockValue)}
          sub={selectedProduct
            ? `${selectedProduct.quantity} unités × ${MAD(selectedProduct.sellingPrice > 0 ? selectedProduct.sellingPrice : selectedProduct.acquisitionCost)}`
            : `${products.length} produits`}
          icon={Package}
          iconColor="text-cyan-500"
        />
        <KpiCard
          label="Budget pub"
          value={MAD(kpis.totalAdSpend)}
          sub={kpis.totalRevenue > 0 ? `ROAS ${(kpis.totalRevenue / (kpis.totalAdSpend || 1)).toFixed(1)}x` : '—'}
          icon={Zap}
          iconColor="text-pink-500"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-900 mb-4">CA & Profit — Évolution</h2>
          {timeSeries.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={timeSeries} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <defs>
                  <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tickFormatter={formatAxisDate} tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
                <Tooltip
                  formatter={(v: number, name: string) => [MAD(v), name === 'revenue' ? 'CA' : 'Profit']}
                  labelFormatter={formatAxisDate}
                />
                <Area type="monotone" dataKey="revenue" stroke="#6366f1" fill="url(#gradRevenue)" strokeWidth={2} name="revenue" />
                <Area type="monotone" dataKey="profit" stroke="#10b981" fill="url(#gradProfit)" strokeWidth={2} name="profit" />
                <Legend formatter={v => v === 'revenue' ? 'CA' : 'Profit'} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-52 flex items-center justify-center text-gray-400 text-sm">
              Pas de ventes sur la période sélectionnée
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-900 mb-4">Dépenses par catégorie</h2>
          {expenseBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={expenseBreakdown}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${EXPENSE_LABELS[name] ?? name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {expenseBreakdown.map((entry) => (
                    <Cell key={entry.name} fill={EXPENSE_COLORS[entry.name] ?? CHART_COLORS[0]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number, name: string) => [MAD(v), EXPENSE_LABELS[name] ?? name]} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-52 flex items-center justify-center text-gray-400 text-sm">
              Aucune dépense sur la période
            </div>
          )}
        </div>
      </div>

      {/* Channel Revenue */}
      {channelData.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-900 mb-4">CA par canal de vente</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={channelData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <XAxis dataKey="channel" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v: number) => MAD(v)} />
              <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                {channelData.map((entry) => (
                  <Cell key={entry.channel} fill={CHANNEL_COLORS[entry.channel] ?? '#6366f1'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Bottom Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top Products — hidden when filtering a single product */}
        {selectedProductId === 'all' && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-900 mb-4">Top produits (CA)</h2>
            <div className="space-y-3">
              {topProducts.map(({ product, rev }, i) => (
                <div key={product!.id} className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{product!.name}</div>
                    <div className="text-xs text-gray-500">{product!.sku}</div>
                  </div>
                  <div className="text-sm font-semibold text-gray-900">{MAD(rev)}</div>
                </div>
              ))}
              {topProducts.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">Aucune vente enregistrée</p>
              )}
            </div>
          </div>
        )}

        {/* Product detail card when a product is selected */}
        {selectedProduct && productAnalytics && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h2 className="font-semibold text-gray-900 mb-4">Détail — {selectedProduct.name}</h2>
            <div className="space-y-3">
              {[
                { label: 'Unités vendues', value: `${productAnalytics.totalUnitsSold} unités` },
                { label: 'Prix moyen de vente', value: MAD(productAnalytics.avgSalePrice) },
                { label: 'Coût acquisition unitaire', value: MAD(selectedProduct.acquisitionCost) },
                { label: 'ROI', value: pct(productAnalytics.roi) },
                { label: 'CPA moyen', value: productAnalytics.cpa > 0 ? MAD(productAnalytics.cpa) : '—' },
                { label: 'Stock actuel', value: `${selectedProduct.quantity} unités` },
                { label: 'Rotation stock', value: productAnalytics.stockRotationDays < 9999 ? `${productAnalytics.stockRotationDays}j` : '—' },
              ].map(row => (
                <div key={row.label} className="flex justify-between text-sm">
                  <span className="text-gray-500">{row.label}</span>
                  <span className="font-semibold text-gray-900">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Low Stock Alerts */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-500" />
            Alertes stock
          </h2>
          {lowStockProducts.length > 0 ? (
            <div className="space-y-3">
              {lowStockProducts.map(p => (
                <div key={p.id} className="flex items-center gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{p.name}</div>
                    <div className="text-xs text-gray-500">{p.supplier}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-red-600">{p.quantity}</div>
                    <div className="text-xs text-gray-400">seuil: {p.alertThreshold}</div>
                  </div>
                  <Badge color="red" size="sm">Critique</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <Package size={36} className="mb-2 text-emerald-400" />
              <p className="text-sm">
                {selectedProduct ? `Stock ${selectedProduct.name} OK` : 'Tous les stocks sont OK'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
