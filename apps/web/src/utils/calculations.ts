import type {
  Product, Sale, Expense, SalesGoal,
  ProductAnalytics, GlobalKpis, ProductClassification,
} from '../types';
import { differenceInDays, parseISO } from 'date-fns';

function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

function classify(
  netMarginPct: number,
  roi: number,
  stockRotationDays: number,
  cpa: number,
  cpaThreshold: number,
): ProductClassification {
  if (netMarginPct < 0 || (cpa > 0 && cpa > cpaThreshold)) return 'stop';
  if (netMarginPct >= 20 && roi >= 50 && stockRotationDays > 0 && stockRotationDays <= 14) return 'scale';
  if (netMarginPct >= 10) return 'profitable';
  return 'monitor';
}

// Compare uniquement la partie YYYY-MM-DD pour éviter les décalages UTC/local
// L'API Prisma retourne des dates ISO complètes (2026-04-06T00:00:00.000Z)
// qui peuvent décaler d'un jour selon le fuseau horaire du client.
function inRange(dateStr: string, from: string, to: string): boolean {
  try {
    const d = dateStr.slice(0, 10);
    return d >= from && d <= to;
  } catch { return false; }
}

// ─── Product Analytics ─────────────────────────────────────────────────────
export function computeProductAnalytics(
  products: Product[],
  sales: Sale[],
  expenses: Expense[],
  cpaThreshold: number,
  fromDate: string,
  toDate: string,
): ProductAnalytics[] {
  const periodDays = Math.max(1, differenceInDays(parseISO(toDate), parseISO(fromDate)));

  const filteredSales = sales.filter(s => inRange(s.date, fromDate, toDate));
  const filteredExpenses = expenses.filter(e => inRange(e.date, fromDate, toDate));

  return products.map(product => {
    const pid = product.id;

    // Revenue & units sold
    let totalUnitsSold = 0;
    let totalRevenue = 0;
    let conversions = 0;

    filteredSales.forEach(sale => {
      const items = sale.items.filter(i => i.productId === pid);
      if (items.length > 0) {
        conversions++;
        items.forEach(item => {
          totalUnitsSold += item.quantity;
          totalRevenue += item.quantity * item.unitPrice;
        });
      }
    });

    const avgSalePrice = safeDiv(totalRevenue, totalUnitsSold);
    const totalCOGS = totalUnitsSold * product.acquisitionCost;
    const grossProfit = totalRevenue - totalCOGS;
    const grossMarginPct = safeDiv(grossProfit, totalRevenue) * 100;

    // Expenses
    const adExpenses = filteredExpenses.filter(e => e.category === 'pub' && e.productId === pid);
    const otherExpenses = filteredExpenses.filter(e => e.category !== 'pub' && e.productId === pid);
    const totalAdSpend = adExpenses.reduce((s, e) => s + e.amount, 0);
    const totalOtherExpenses = otherExpenses.reduce((s, e) => s + e.amount, 0);

    const netProfit = grossProfit - totalAdSpend - totalOtherExpenses;
    const netMarginPct = safeDiv(netProfit, totalRevenue) * 100;

    const cpa = safeDiv(totalAdSpend, conversions);
    const roi = safeDiv(netProfit, totalCOGS + totalAdSpend) * 100;

    // Stock rotation: days to sell current stock at current velocity
    const dailyVelocity = safeDiv(totalUnitsSold, periodDays);
    const stockRotationDays = dailyVelocity > 0
      ? Math.round(safeDiv(product.quantity, dailyVelocity))
      : 9999;

    const classification = classify(netMarginPct, roi, stockRotationDays, cpa, cpaThreshold);

    return {
      productId: pid,
      productName: product.name,
      totalUnitsSold,
      totalRevenue,
      avgSalePrice,
      totalCOGS,
      grossProfit,
      grossMarginPct,
      totalAdSpend,
      totalOtherExpenses,
      netProfit,
      netMarginPct,
      conversions,
      cpa,
      roi,
      currentStock: product.quantity,
      stockRotationDays,
      classification,
    };
  });
}

// ─── Global KPIs ─────────────────────────────────────────────────────────────
export function computeGlobalKpis(
  products: Product[],
  sales: Sale[],
  expenses: Expense[],
  fromDate: string,
  toDate: string,
): GlobalKpis {
  const filteredSales = sales.filter(s => inRange(s.date, fromDate, toDate));
  const filteredExpenses = expenses.filter(e => inRange(e.date, fromDate, toDate));

  let totalRevenue = 0;
  let totalCOGS = 0;

  filteredSales.forEach(sale => {
    sale.items.forEach(item => {
      totalRevenue += item.quantity * item.unitPrice;
      const product = products.find(p => p.id === item.productId);
      if (product) totalCOGS += item.quantity * product.acquisitionCost;
    });
  });

  const grossProfit = totalRevenue - totalCOGS;
  const grossMarginPct = safeDiv(grossProfit, totalRevenue) * 100;
  const totalExpenses = filteredExpenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = grossProfit - totalExpenses;
  const netMarginPct = safeDiv(netProfit, totalRevenue) * 100;
  const totalOrders = filteredSales.length;
  const avgOrderValue = safeDiv(totalRevenue, totalOrders);
  const totalAdSpend = filteredExpenses
    .filter(e => e.category === 'pub')
    .reduce((s, e) => s + e.amount, 0);
  const totalStockValue = products.reduce((s, p) => s + p.quantity * (p.sellingPrice > 0 ? p.sellingPrice : p.acquisitionCost), 0);

  return {
    totalRevenue, totalCOGS, grossProfit, grossMarginPct,
    totalExpenses, netProfit, netMarginPct,
    totalOrders, avgOrderValue, totalAdSpend, totalStockValue,
  };
}

// ─── Time Series ──────────────────────────────────────────────────────────────
export function getSalesTimeSeries(
  products: Product[],
  sales: Sale[],
  fromDate: string,
  toDate: string,
): Array<{ date: string; revenue: number; profit: number }> {
  const map: Record<string, { revenue: number; cogs: number }> = {};

  sales
    .filter(s => inRange(s.date, fromDate, toDate))
    .forEach(sale => {
      const day = sale.date.split('T')[0];
      if (!map[day]) map[day] = { revenue: 0, cogs: 0 };
      sale.items.forEach(item => {
        map[day].revenue += item.quantity * item.unitPrice;
        const product = products.find(p => p.id === item.productId);
        if (product) map[day].cogs += item.quantity * product.acquisitionCost;
      });
    });

  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { revenue, cogs }]) => ({
      date,
      revenue: Math.round(revenue),
      profit: Math.round(revenue - cogs),
    }));
}

// ─── Channel Revenue ──────────────────────────────────────────────────────────
export function getChannelRevenue(
  sales: Sale[],
  fromDate: string,
  toDate: string,
) {
  const map: Record<string, number> = {};

  sales
    .filter(s => inRange(s.date, fromDate, toDate))
    .forEach(s => {
      const rev = s.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
      map[s.channel] = (map[s.channel] || 0) + rev;
    });

  return Object.entries(map)
    .map(([channel, revenue]) => ({ channel, revenue: Math.round(revenue) }))
    .sort((a, b) => b.revenue - a.revenue);
}

// ─── Expense Breakdown ────────────────────────────────────────────────────────
export function getExpenseBreakdown(
  expenses: Expense[],
  fromDate: string,
  toDate: string,
) {
  const map: Record<string, number> = {};

  expenses
    .filter(e => inRange(e.date, fromDate, toDate))
    .forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount; });

  return Object.entries(map).map(([name, value]) => ({ name, value }));
}

// ─── Goal Progress ────────────────────────────────────────────────────────────
export function computeGoalProgress(
  goals: SalesGoal[],
  sales: Sale[],
  products: Product[],
) {
  const now = new Date();
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(now); monthAgo.setDate(monthAgo.getDate() - 30);

  const calcPeriod = (salesToCalc: Sale[], productId: string) => {
    let qty = 0;
    let revenue = 0;
    salesToCalc.forEach(s => {
      const items = productId === 'all'
        ? s.items
        : s.items.filter(i => i.productId === productId);
      items.forEach(i => {
        qty += i.quantity;
        revenue += i.quantity * i.unitPrice;
      });
    });
    return { qty, revenue };
  };

  // Comparer les dates comme chaînes YYYY-MM-DD pour éviter les bugs de timezone
  const todayStr = now.toLocaleDateString('en-CA'); // YYYY-MM-DD en heure locale
  const weekAgoStr = new Date(now.getTime() - 7 * 86400000).toLocaleDateString('en-CA');
  const monthAgoStr = new Date(now.getTime() - 30 * 86400000).toLocaleDateString('en-CA');

  const weekSales = sales.filter(s => s.date.slice(0, 10) >= weekAgoStr);
  const monthSales = sales.filter(s => s.date.slice(0, 10) >= monthAgoStr);
  const todaySales = sales.filter(s => s.date.slice(0, 10) === todayStr);

  return goals.map(goal => {
    const day = calcPeriod(todaySales, goal.productId);
    const week = calcPeriod(weekSales, goal.productId);
    const month = calcPeriod(monthSales, goal.productId);
    const weeklyTarget = Math.ceil(goal.targetQty / 4);
    const dailyTarget = Math.ceil(goal.targetQty / 30);

    // CA cible : basé sur le prix de vente du produit (ou moyenne pondérée si 'all')
    let unitPrice = 0;
    if (goal.productId === 'all') {
      const withPrice = products.filter(p => p.sellingPrice > 0);
      unitPrice = withPrice.length > 0
        ? withPrice.reduce((s, p) => s + p.sellingPrice, 0) / withPrice.length
        : 0;
    } else {
      const prod = products.find(p => p.id === goal.productId);
      unitPrice = prod?.sellingPrice ?? 0;
    }

    return {
      goal,
      dailyQty: day.qty,
      dailyRevenue: day.revenue,
      dailyTarget,
      dailyRevenueTarget: dailyTarget * unitPrice,
      dailyPct: Math.min(100, safeDiv(day.qty, dailyTarget) * 100),
      weeklyQty: week.qty,
      weeklyRevenue: week.revenue,
      weeklyTarget,
      weeklyRevenueTarget: weeklyTarget * unitPrice,
      weeklyPct: Math.min(100, safeDiv(week.qty, weeklyTarget) * 100),
      monthlyQty: month.qty,
      monthlyRevenue: month.revenue,
      monthlyRevenueTarget: goal.targetQty * unitPrice,
      monthlyPct: Math.min(100, safeDiv(month.qty, goal.targetQty) * 100),
    };
  });
}
