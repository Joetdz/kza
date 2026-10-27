"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLOSING_START_MONTH = void 0;
exports.addMonths = addMonths;
exports.monthsBetween = monthsBetween;
exports.monthLabel = monthLabel;
exports.localMonth = localMonth;
exports.forecastStartMonth = forecastStartMonth;
exports.computeAdSpendPerUnit = computeAdSpendPerUnit;
exports.computeBudgetForecast = computeBudgetForecast;
exports.advanceForecast = advanceForecast;
exports.countingContext = countingContext;
exports.countingMonth = countingMonth;
exports.computeMonthRealized = computeMonthRealized;
exports.buildClosingData = buildClosingData;
exports.planAchievementPct = planAchievementPct;
const time_1 = require("./time");
/** Closing starts with this month: earlier months were never planned month by month. */
exports.CLOSING_START_MONTH = '2026-10';
// ─── Months ──────────────────────────────────────────────────────────────────
const isMonthKey = (m) => /^\d{4}-\d{2}$/.test(m);
/** "2026-10" + 3 → "2027-01" */
function addMonths(monthKey, n) {
    const [y, m] = monthKey.split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
/** Months from a to b ("2026-10" → "2027-01" = 3). */
function monthsBetween(a, b) {
    const [ya, ma] = a.split('-').map(Number);
    const [yb, mb] = b.split('-').map(Number);
    return (yb - ya) * 12 + (mb - ma);
}
function monthLabel(monthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
/** The business's calendar month at that instant ("YYYY-MM"). */
function localMonth(at, timeZone) {
    return (0, time_1.utcToLocal)(new Date(at), timeZone).date.slice(0, 7);
}
/** First month the forecast applies to: its start month, or the current month when unset. */
function forecastStartMonth(forecast, currentMonth) {
    return forecast.startMonth && isMonthKey(forecast.startMonth) ? forecast.startMonth : currentMonth;
}
// ─── Forecast ────────────────────────────────────────────────────────────────
// Ad spend per unit sold, per product, over the whole history — the default basis for
// an ad budget projected from a target quantity (overridable per product).
function computeAdSpendPerUnit(products, sales, expenses) {
    const result = {};
    products.forEach(p => {
        let units = 0;
        sales.forEach(s => s.items.forEach(i => { if (i.productId === p.id)
            units += i.quantity; }));
        const adSpend = expenses.filter(e => e.category === 'pub' && e.productId === p.id).reduce((s, e) => s + e.amount, 0);
        result[p.id] = units === 0 ? 0 : adSpend / units;
    });
    return result;
}
/**
 * The forecast month by month over its horizon. `currentMonth` stands for the start
 * month when the forecast has none.
 */
function computeBudgetForecast(products, sales, expenses, recurringExpenses, forecast, currentMonth) {
    const adSpendPerUnit = computeAdSpendPerUnit(products, sales, expenses);
    const qtyByProduct = {};
    const adBudgetOverrideByProduct = {};
    forecast.products.forEach(fp => {
        qtyByProduct[fp.productId] = fp.quantity;
        if (fp.adBudgetOverride != null)
            adBudgetOverrideByProduct[fp.productId] = fp.adBudgetOverride;
    });
    const manualOpexTotal = forecast.expenses.reduce((s, e) => s + e.amount, 0);
    const start = forecastStartMonth(forecast, currentMonth);
    const months = [];
    for (let i = 0; i < forecast.horizonMonths; i++) {
        const monthKey = addMonths(start, i);
        const monthNumber = Number(monthKey.slice(5, 7));
        const growthFactor = Math.pow(1 + forecast.monthlyGrowthPct / 100, i);
        let revenue = 0, cogs = 0, adBudget = 0;
        const quantitiesByProduct = {};
        const adBudgetByProduct = {};
        products.forEach(p => {
            const baseQty = qtyByProduct[p.id] ?? 0;
            if (baseQty <= 0)
                return;
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
        const knownOpexByCategory = {};
        recurringExpenses.forEach(r => {
            if (!r.active)
                return;
            let monthlyAmount = 0;
            switch (r.frequency) {
                case 'monthly':
                    monthlyAmount = r.amount;
                    break;
                case 'annual':
                    if ((r.month ?? 1) === monthNumber)
                        monthlyAmount = r.amount;
                    break;
                case 'weekly':
                    monthlyAmount = r.amount * 4.33;
                    break; // ~weeks per month
                case 'daily':
                    monthlyAmount = r.amount * 30;
                    break;
            }
            if (monthlyAmount > 0)
                knownOpexByCategory[r.category] = (knownOpexByCategory[r.category] ?? 0) + monthlyAmount;
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
function advanceForecast(forecast, currentMonth, newStart) {
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
function countingContext(closings, timeZone) {
    const closedAt = {};
    let first = null;
    for (const c of closings) {
        closedAt[c.month] = c.closedAt;
        if (!first || c.closedAt < first)
            first = c.closedAt;
    }
    return { timeZone, closedAt, firstClosedAt: first };
}
/**
 * The month an entry counts for: its own month, unless it was recorded after that
 * month was closed — then the month that was open when it was recorded.
 */
function countingMonth(entry, ctx) {
    const dateMonth = entry.date.slice(0, 7);
    if (!entry.createdAt)
        return dateMonth;
    const recordedMonth = localMonth(entry.createdAt, ctx.timeZone);
    if (recordedMonth <= dateMonth)
        return dateMonth;
    // Recorded after its month ended.
    const closed = ctx.closedAt[dateMonth];
    if (closed && entry.createdAt <= closed)
        return dateMonth; // in that month's snapshot
    if (!ctx.firstClosedAt || entry.createdAt < ctx.firstClosedAt)
        return dateMonth; // before closing existed
    return recordedMonth;
}
function computeMonthRealized(month, products, sales, expenses, ctx) {
    const cost = {};
    products.forEach(p => { cost[p.id] = p.acquisitionCost; });
    const r = {
        qtyByProduct: {}, revenueByProduct: {}, revenue: 0, cogs: 0,
        expensesByCategory: {}, pubByProduct: {}, expensesTotal: 0, profit: 0, lateEntries: 0,
    };
    for (const s of sales) {
        if (s.status === 'cancelled')
            continue;
        if (countingMonth(s, ctx) !== month)
            continue;
        if (s.date.slice(0, 7) !== month)
            r.lateEntries++;
        for (const i of s.items) {
            const amount = i.quantity * i.unitPrice;
            r.revenue += amount;
            if (!i.productId)
                continue;
            r.qtyByProduct[i.productId] = (r.qtyByProduct[i.productId] ?? 0) + i.quantity;
            r.revenueByProduct[i.productId] = (r.revenueByProduct[i.productId] ?? 0) + amount;
            r.cogs += i.quantity * (cost[i.productId] ?? 0);
        }
    }
    for (const e of expenses) {
        if (countingMonth(e, ctx) !== month)
            continue;
        if (e.date.slice(0, 7) !== month)
            r.lateEntries++;
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
function buildClosingData(month, inputs) {
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
    const snapshot = {};
    for (const p of products) {
        if (used.has(p.id))
            snapshot[p.id] = { name: p.name ?? '', sellingPrice: p.sellingPrice, acquisitionCost: p.acquisitionCost };
    }
    return { month, label: monthLabel(month), plan, realized, products: snapshot };
}
/** Average achievement over the planned products, capped at 100 % each. */
function planAchievementPct(plan, realized) {
    const ids = Object.keys(plan?.quantitiesByProduct ?? {});
    if (!plan || ids.length === 0)
        return null;
    const sum = ids.reduce((s, id) => {
        const target = plan.quantitiesByProduct[id];
        return s + (target > 0 ? Math.min(100, ((realized.qtyByProduct[id] ?? 0) / target) * 100) : 0);
    }, 0);
    return sum / ids.length;
}
