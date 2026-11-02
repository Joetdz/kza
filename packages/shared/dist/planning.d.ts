export interface PlanProduct {
    id: string;
    name?: string;
    sellingPrice: number;
    acquisitionCost: number;
}
export interface PlanSaleItem {
    productId?: string | null;
    quantity: number;
    unitPrice: number;
    unitCost?: number | null;
}
export interface PlanSale {
    date: string;
    createdAt?: string | null;
    status?: string | null;
    items: PlanSaleItem[];
}
export interface PlanExpense {
    date: string;
    createdAt?: string | null;
    category: string;
    amount: number;
    productId?: string | null;
}
export interface PlanRecurringExpense {
    active: boolean;
    frequency: string;
    amount: number;
    category: string;
    month?: number | null;
}
export interface PlanForecast {
    startMonth: string;
    monthlyGrowthPct: number;
    horizonMonths: number;
    products: {
        productId: string;
        quantity: number;
        adBudgetOverride?: number | null;
    }[];
    expenses: {
        amount: number;
    }[];
}
export interface ForecastMonth {
    label: string;
    monthKey: string;
    quantitiesByProduct: Record<string, number>;
    adBudgetByProduct: Record<string, number>;
    revenue: number;
    cogs: number;
    grossProfit: number;
    adBudget: number;
    knownOpexByCategory: Record<string, number>;
    manualOpexTotal: number;
    totalOpex: number;
    ebitda: number;
}
/** Closing starts with this month: earlier months were never planned month by month. */
export declare const CLOSING_START_MONTH = "2026-10";
/** "2026-10" + 3 → "2027-01" */
export declare function addMonths(monthKey: string, n: number): string;
/** Months from a to b ("2026-10" → "2027-01" = 3). */
export declare function monthsBetween(a: string, b: string): number;
export declare function monthLabel(monthKey: string): string;
/** The business's calendar month at that instant ("YYYY-MM"). */
export declare function localMonth(at: Date | string, timeZone: string): string;
/** First month the forecast applies to: its start month, or the current month when unset. */
export declare function forecastStartMonth(forecast: Pick<PlanForecast, 'startMonth'>, currentMonth: string): string;
export declare function computeAdSpendPerUnit(products: PlanProduct[], sales: PlanSale[], expenses: PlanExpense[]): Record<string, number>;
/**
 * The forecast month by month over its horizon. `currentMonth` stands for the start
 * month when the forecast has none.
 */
export declare function computeBudgetForecast(products: PlanProduct[], sales: PlanSale[], expenses: PlanExpense[], recurringExpenses: PlanRecurringExpense[], forecast: PlanForecast, currentMonth: string): ForecastMonth[];
/**
 * The same plan restarted at a later month: quantities and ad budget overrides carry
 * the growth of the months skipped, so every projected figure stays identical.
 */
export declare function advanceForecast<T extends PlanForecast>(forecast: T, currentMonth: string, newStart: string): {
    startMonth: string;
    products: {
        productId: string;
        quantity: number;
        adBudgetOverride: number | null;
    }[];
};
export interface ClosingRef {
    month: string;
    closedAt: string;
}
export interface CountingContext {
    timeZone: string;
    /** closedAt per closed month. */
    closedAt: Record<string, string>;
    /** Earliest closing: entries recorded before closing existed count by their date. */
    firstClosedAt: string | null;
}
export declare function countingContext(closings: ClosingRef[], timeZone: string): CountingContext;
/**
 * The month an entry counts for: its own month, unless it was recorded after that
 * month was closed — then the month that was open when it was recorded.
 */
export declare function countingMonth(entry: {
    date: string;
    createdAt?: string | null;
}, ctx: CountingContext): string;
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
export declare function computeMonthRealized(month: string, products: PlanProduct[], sales: PlanSale[], expenses: PlanExpense[], ctx: CountingContext): MonthRealized;
/** Realized between two dates (included), by each entry's own date. */
export declare function computeRangeRealized(from: string, to: string, products: PlanProduct[], sales: PlanSale[], expenses: PlanExpense[]): MonthRealized;
export type GoalPeriod = 'day' | 'week' | 'month';
/** First and last day (included) of the day or the Monday-to-Sunday week around `today`. */
export declare function periodRange(period: 'day' | 'week', today: string): {
    from: string;
    to: string;
};
/** Every day of a month ("YYYY-MM-DD"). */
export declare function monthDays(monthKey: string): string[];
/** The Monday-to-Sunday weeks touching a month; the first and last can overlap its neighbours. */
export declare function monthWeeks(monthKey: string): {
    from: string;
    to: string;
}[];
/**
 * The plan for a few days: each day gets an equal share of its own month's plan, so a
 * week across two months takes from both. null = no plan covers any of these days.
 */
export declare function computeRangePlan(months: ForecastMonth[], from: string, to: string): ForecastMonth | null;
/** Everything a closed month needs to be shown forever, whatever changes afterwards. */
export interface ClosingData {
    month: string;
    label: string;
    /** null = no forecast covered this month. */
    plan: ForecastMonth | null;
    realized: MonthRealized;
    /** Names and prices as they were at closing. */
    products: Record<string, {
        name: string;
        sellingPrice: number;
        acquisitionCost: number;
    }>;
}
export interface MonthlyClosing {
    month: string;
    closedAt: string;
    data: ClosingData;
}
export declare function buildClosingData(month: string, inputs: {
    products: PlanProduct[];
    sales: PlanSale[];
    expenses: PlanExpense[];
    recurringExpenses: PlanRecurringExpense[];
    forecast: PlanForecast | null;
    ctx: CountingContext;
}): ClosingData;
/** Average achievement over the planned products, capped at 100 % each. */
export declare function planAchievementPct(plan: ForecastMonth | null, realized: MonthRealized): number | null;
