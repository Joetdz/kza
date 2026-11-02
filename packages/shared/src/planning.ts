// ─── Monthly plan: forecast, realized, closing ───────────────────────────────
// The budget forecast projects month by month from one input (a quantity per product
// for its first month) with compound growth. A month that has ended is closed: its plan
// and what was actually achieved are frozen in a snapshot (MonthlyClosing) and never
// change again — later price changes, deleted products or late entries don't touch it.
//
// Late entries: a sale or expense recorded after its month was closed counts for the
// month in which it was recorded (the one open at the time), not the closed one.
//
// Shared by the web app (live view) and the API (closing job) so both compute the
// exact same figures.

import { utcToLocal } from './time';

export interface PlanProduct { id: string; name?: string; sellingPrice: number; acquisitionCost: number }
export interface PlanSaleItem { productId?: string | null; quantity: number; unitPrice: number; unitCost?: number | null }
export interface PlanSale { date: string; createdAt?: string | null; status?: string | null; items: PlanSaleItem[] }
export interface PlanExpense { date: string; createdAt?: string | null; category: string; amount: number; productId?: string | null }
export interface PlanRecurringExpense { active: boolean; frequency: string; amount: number; category: string; month?: number | null }
export interface PlanForecast {
  startMonth: string;
  monthlyGrowthPct: number;
  horizonMonths: number;
  products: { productId: string; quantity: number; adBudgetOverride?: number | null }[];
  expenses: { amount: number }[];
}

export interface ForecastMonth {
  label: string;
  monthKey: string; // "YYYY-MM"
  quantitiesByProduct: Record<string, number>; // projected quantity (after growth), per product
  adBudgetByProduct: Record<string, number>;   // projected ad budget (computed or overridden), per product
  revenue: number;
  cogs: number;
  grossProfit: number;
  adBudget: number;
  knownOpexByCategory: Record<string, number>; // known recurring expenses, projected
  manualOpexTotal: number;                      // lines typed by hand on this forecast
  totalOpex: number;
  ebitda: number;
}

/** Closing starts with this month: earlier months were never planned month by month. */
export const CLOSING_START_MONTH = '2026-10';

// ─── Months ──────────────────────────────────────────────────────────────────

const isMonthKey = (m: string) => /^\d{4}-\d{2}$/.test(m);

/** "2026-10" + 3 → "2027-01" */
export function addMonths(monthKey: string, n: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Months from a to b ("2026-10" → "2027-01" = 3). */
export function monthsBetween(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** The business's calendar month at that instant ("YYYY-MM"). */
export function localMonth(at: Date | string, timeZone: string): string {
  return utcToLocal(new Date(at), timeZone).date.slice(0, 7);
}

/** First month the forecast applies to: its start month, or the current month when unset. */
export function forecastStartMonth(forecast: Pick<PlanForecast, 'startMonth'>, currentMonth: string): string {
  return forecast.startMonth && isMonthKey(forecast.startMonth) ? forecast.startMonth : currentMonth;
}

// ─── Forecast ────────────────────────────────────────────────────────────────

// Ad spend per unit sold, per product, over the whole history — the default basis for
// an ad budget projected from a target quantity (overridable per product).
export function computeAdSpendPerUnit(products: PlanProduct[], sales: PlanSale[], expenses: PlanExpense[]): Record<string, number> {
  const result: Record<string, number> = {};
  products.forEach(p => {
    let units = 0;
    sales.forEach(s => s.items.forEach(i => { if (i.productId === p.id) units += i.quantity; }));
    const adSpend = expenses.filter(e => e.category === 'pub' && e.productId === p.id).reduce((s, e) => s + e.amount, 0);
    result[p.id] = units === 0 ? 0 : adSpend / units;
  });
  return result;
}

/**
 * The forecast month by month over its horizon. `currentMonth` stands for the start
 * month when the forecast has none.
 */
export function computeBudgetForecast(
  products: PlanProduct[],
  sales: PlanSale[],
  expenses: PlanExpense[],
  recurringExpenses: PlanRecurringExpense[],
  forecast: PlanForecast,
  currentMonth: string,
): ForecastMonth[] {
  const adSpendPerUnit = computeAdSpendPerUnit(products, sales, expenses);

  const qtyByProduct: Record<string, number> = {};
  const adBudgetOverrideByProduct: Record<string, number> = {};
  forecast.products.forEach(fp => {
    qtyByProduct[fp.productId] = fp.quantity;
    if (fp.adBudgetOverride != null) adBudgetOverrideByProduct[fp.productId] = fp.adBudgetOverride;
  });

  const manualOpexTotal = forecast.expenses.reduce((s, e) => s + e.amount, 0);
  const start = forecastStartMonth(forecast, currentMonth);

  const months: ForecastMonth[] = [];
  for (let i = 0; i < forecast.horizonMonths; i++) {
    const monthKey = addMonths(start, i);
    const monthNumber = Number(monthKey.slice(5, 7));
    const growthFactor = Math.pow(1 + forecast.monthlyGrowthPct / 100, i);

    let revenue = 0, cogs = 0, adBudget = 0;
    const quantitiesByProduct: Record<string, number> = {};
    const adBudgetByProduct: Record<string, number> = {};
    products.forEach(p => {
      const baseQty = qtyByProduct[p.id] ?? 0;
      if (baseQty <= 0) return;
      const qty = baseQty * growthFactor;
      quantitiesByProduct[p.id] = qty;
      revenue += qty * p.sellingPrice;
      cogs += qty * p.acquisitionCost;
      // Same compound growth as the quantity: the override (or the default) is the
      // first month's, the following months follow growthFactor.
      const baseAdBudget = adBudgetOverrideByProduct[p.id] ?? (baseQty * (adSpendPerUnit[p.id] ?? 0));
      const productAdBudget = baseAdBudget * growthFactor;
      adBudgetByProduct[p.id] = productAdBudget;
      adBudget += productAdBudget;
    });

    const knownOpexByCategory: Record<string, number> = {};
    recurringExpenses.forEach(r => {
      if (!r.active) return;
      let monthlyAmount = 0;
      switch (r.frequency) {
        case 'monthly': monthlyAmount = r.amount; break;
        case 'annual': if ((r.month ?? 1) === monthNumber) monthlyAmount = r.amount; break;
        case 'weekly': monthlyAmount = r.amount * 4.33; break; // ~weeks per month
        case 'daily': monthlyAmount = r.amount * 30; break;
      }
      if (monthlyAmount > 0) knownOpexByCategory[r.category] = (knownOpexByCategory[r.category] ?? 0) + monthlyAmount;
    });

    const knownOpexTotal = Object.values(knownOpexByCategory).reduce((s, v) => s + v, 0);
    const totalOpex = adBudget + knownOpexTotal + manualOpexTotal;
    const grossProfit = revenue - cogs;

    months.push({
      label: monthLabel(monthKey),
      monthKey, quantitiesByProduct, adBudgetByProduct, revenue, cogs, grossProfit, adBudget,
      knownOpexByCategory, manualOpexTotal, totalOpex, ebitda: grossProfit - totalOpex,
    });
  }
  return months;
}

/**
 * The same plan restarted at a later month: quantities and ad budget overrides carry
 * the growth of the months skipped, so every projected figure stays identical.
 */
export function advanceForecast<T extends PlanForecast>(forecast: T, currentMonth: string, newStart: string): {
  startMonth: string;
  products: { productId: string; quantity: number; adBudgetOverride: number | null }[];
} {
  const skipped = monthsBetween(forecastStartMonth(forecast, currentMonth), newStart);
  const factor = Math.pow(1 + forecast.monthlyGrowthPct / 100, Math.max(0, skipped));
  return {
    startMonth: newStart,
    products: forecast.products.map(p => ({
      productId: p.productId,
      quantity: p.quantity * factor,
      adBudgetOverride: p.adBudgetOverride != null ? p.adBudgetOverride * factor : null,
    })),
  };
}

// ─── Which month an entry counts for ────────────────────────────────────────

export interface ClosingRef { month: string; closedAt: string }

export interface CountingContext {
  timeZone: string;
  /** closedAt per closed month. */
  closedAt: Record<string, string>;
  /** Earliest closing: entries recorded before closing existed count by their date. */
  firstClosedAt: string | null;
}

export function countingContext(closings: ClosingRef[], timeZone: string): CountingContext {
  const closedAt: Record<string, string> = {};
  let first: string | null = null;
  for (const c of closings) {
    closedAt[c.month] = c.closedAt;
    if (!first || c.closedAt < first) first = c.closedAt;
  }
  return { timeZone, closedAt, firstClosedAt: first };
}

/**
 * The month an entry counts for: its own month, unless it was recorded after that
 * month was closed — then the month that was open when it was recorded.
 */
export function countingMonth(entry: { date: string; createdAt?: string | null }, ctx: CountingContext): string {
  const dateMonth = entry.date.slice(0, 7);
  if (!entry.createdAt) return dateMonth;
  const recordedMonth = localMonth(entry.createdAt, ctx.timeZone);
  if (recordedMonth <= dateMonth) return dateMonth;
  // Recorded after its month ended.
  const closed = ctx.closedAt[dateMonth];
  if (closed && entry.createdAt <= closed) return dateMonth;                      // in that month's snapshot
  if (!ctx.firstClosedAt || entry.createdAt < ctx.firstClosedAt) return dateMonth; // before closing existed
  return recordedMonth;
}

// ─── Realized ────────────────────────────────────────────────────────────────

export interface MonthRealized {
  qtyByProduct: Record<string, number>;
  revenueByProduct: Record<string, number>;
  revenue: number;
  /** Units sold × purchase cost. */
  cogs: number;
  expensesByCategory: Record<string, number>;
  /** Ad spend per product ('__none__' = not tied to a product). */
  pubByProduct: Record<string, number>;
  expensesTotal: number;
  profit: number;
  /** Entries dated in an earlier, closed month but recorded during this one. */
  lateEntries: number;
}

export function computeMonthRealized(
  month: string,
  products: PlanProduct[],
  sales: PlanSale[],
  expenses: PlanExpense[],
  ctx: CountingContext,
): MonthRealized {
  return computeRealized(
    products, sales, expenses,
    entry => countingMonth(entry, ctx) === month,
    entry => entry.date.slice(0, 7) !== month,
  );
}

/** Realized between two dates (included), by each entry's own date. */
export function computeRangeRealized(
  from: string,
  to: string,
  products: PlanProduct[],
  sales: PlanSale[],
  expenses: PlanExpense[],
): MonthRealized {
  return computeRealized(products, sales, expenses, entry => {
    const day = entry.date.slice(0, 10);
    return day >= from && day <= to;
  }, () => false);
}

function computeRealized(
  products: PlanProduct[],
  sales: PlanSale[],
  expenses: PlanExpense[],
  counts: (entry: { date: string; createdAt?: string | null }) => boolean,
  isLate: (entry: { date: string }) => boolean,
): MonthRealized {
  const cost: Record<string, number> = {};
  products.forEach(p => { cost[p.id] = p.acquisitionCost; });

  const r: MonthRealized = {
    qtyByProduct: {}, revenueByProduct: {}, revenue: 0, cogs: 0,
    expensesByCategory: {}, pubByProduct: {}, expensesTotal: 0, profit: 0, lateEntries: 0,
  };

  for (const s of sales) {
    if (s.status === 'cancelled') continue;
    if (!counts(s)) continue;
    if (isLate(s)) r.lateEntries++;
    for (const i of s.items) {
      const amount = i.quantity * i.unitPrice;
      r.revenue += amount;
      r.cogs += i.quantity * (i.unitCost ?? cost[i.productId ?? ''] ?? 0);
      if (!i.productId) continue;
      r.qtyByProduct[i.productId] = (r.qtyByProduct[i.productId] ?? 0) + i.quantity;
      r.revenueByProduct[i.productId] = (r.revenueByProduct[i.productId] ?? 0) + amount;
    }
  }
  for (const e of expenses) {
    if (!counts(e)) continue;
    if (isLate(e)) r.lateEntries++;
    r.expensesByCategory[e.category] = (r.expensesByCategory[e.category] ?? 0) + e.amount;
    r.expensesTotal += e.amount;
    if (e.category === 'pub') {
      const key = e.productId ?? '__none__';
      r.pubByProduct[key] = (r.pubByProduct[key] ?? 0) + e.amount;
    }
  }
  r.profit = r.revenue - r.cogs - r.expensesTotal;
  return r;
}

// ─── Today / this week ───────────────────────────────────────────────────────

export type GoalPeriod = 'day' | 'week' | 'month';

/** First and last day (included) of the day or the Monday-to-Sunday week around `today`. */
export function periodRange(period: 'day' | 'week', today: string): { from: string; to: string } {
  if (period === 'day') return { from: today, to: today };
  const day = new Date(`${today}T00:00:00Z`);
  const fromMonday = (day.getUTCDay() + 6) % 7;
  const shifted = (days: number) => new Date(day.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  return { from: shifted(-fromMonday), to: shifted(6 - fromMonday) };
}

function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Every day of a month ("YYYY-MM-DD"). */
export function monthDays(monthKey: string): string[] {
  return Array.from({ length: daysInMonth(monthKey) }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, '0')}`);
}

/** The Monday-to-Sunday weeks touching a month; the first and last can overlap its neighbours. */
export function monthWeeks(monthKey: string): { from: string; to: string }[] {
  const weeks: { from: string; to: string }[] = [];
  for (const day of monthDays(monthKey)) {
    const week = periodRange('week', day);
    if (weeks[weeks.length - 1]?.from !== week.from) weeks.push(week);
  }
  return weeks;
}

/**
 * The plan for a few days: each day gets an equal share of its own month's plan, so a
 * week across two months takes from both. null = no plan covers any of these days.
 */
export function computeRangePlan(months: ForecastMonth[], from: string, to: string): ForecastMonth | null {
  const plan: ForecastMonth = {
    label: from === to ? from : `${from} → ${to}`,
    monthKey: from.slice(0, 7),
    quantitiesByProduct: {}, adBudgetByProduct: {}, revenue: 0, cogs: 0, grossProfit: 0, adBudget: 0,
    knownOpexByCategory: {}, manualOpexTotal: 0, totalOpex: 0, ebitda: 0,
  };
  const addAll = (into: Record<string, number>, values: Record<string, number>, share: number) => {
    for (const [key, value] of Object.entries(values)) into[key] = (into[key] ?? 0) + value * share;
  };

  let covered = false;
  const end = new Date(`${to}T00:00:00Z`).getTime();
  for (let t = new Date(`${from}T00:00:00Z`).getTime(); t <= end; t += 86_400_000) {
    const monthKey = new Date(t).toISOString().slice(0, 7);
    const month = months.find(m => m.monthKey === monthKey);
    if (!month) continue;
    covered = true;
    const share = 1 / daysInMonth(monthKey);
    addAll(plan.quantitiesByProduct, month.quantitiesByProduct, share);
    addAll(plan.adBudgetByProduct, month.adBudgetByProduct, share);
    addAll(plan.knownOpexByCategory, month.knownOpexByCategory, share);
    plan.revenue += month.revenue * share;
    plan.cogs += month.cogs * share;
    plan.grossProfit += month.grossProfit * share;
    plan.adBudget += month.adBudget * share;
    plan.manualOpexTotal += month.manualOpexTotal * share;
    plan.totalOpex += month.totalOpex * share;
    plan.ebitda += month.ebitda * share;
  }
  return covered ? plan : null;
}

// ─── Closing ─────────────────────────────────────────────────────────────────

/** Everything a closed month needs to be shown forever, whatever changes afterwards. */
export interface ClosingData {
  month: string;
  label: string;
  /** null = no forecast covered this month. */
  plan: ForecastMonth | null;
  realized: MonthRealized;
  /** Names and prices as they were at closing. */
  products: Record<string, { name: string; sellingPrice: number; acquisitionCost: number }>;
}

export interface MonthlyClosing { month: string; closedAt: string; data: ClosingData }

export function buildClosingData(
  month: string,
  inputs: {
    products: PlanProduct[];
    sales: PlanSale[];
    expenses: PlanExpense[];
    recurringExpenses: PlanRecurringExpense[];
    forecast: PlanForecast | null;
    ctx: CountingContext;
  },
): ClosingData {
  const { products, sales, expenses, recurringExpenses, forecast, ctx } = inputs;
  const plan = forecast
    ? computeBudgetForecast(products, sales, expenses, recurringExpenses, forecast, month).find(m => m.monthKey === month) ?? null
    : null;
  const realized = computeMonthRealized(month, products, sales, expenses, ctx);

  const used = new Set([
    ...Object.keys(plan?.quantitiesByProduct ?? {}),
    ...Object.keys(plan?.adBudgetByProduct ?? {}),
    ...Object.keys(realized.qtyByProduct),
    ...Object.keys(realized.pubByProduct),
  ]);
  const snapshot: ClosingData['products'] = {};
  for (const p of products) {
    if (used.has(p.id)) snapshot[p.id] = { name: p.name ?? '', sellingPrice: p.sellingPrice, acquisitionCost: p.acquisitionCost };
  }
  return { month, label: monthLabel(month), plan, realized, products: snapshot };
}

/** Average achievement over the planned products, capped at 100 % each. */
export function planAchievementPct(plan: ForecastMonth | null, realized: MonthRealized): number | null {
  const ids = Object.keys(plan?.quantitiesByProduct ?? {});
  if (!plan || ids.length === 0) return null;
  const sum = ids.reduce((s, id) => {
    const target = plan.quantitiesByProduct[id];
    return s + (target > 0 ? Math.min(100, ((realized.qtyByProduct[id] ?? 0) / target) * 100) : 0);
  }, 0);
  return sum / ids.length;
}
