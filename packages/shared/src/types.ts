import { z } from 'zod';
import {
  ProductSchema,
  CreateProductSchema,
  UpdateProductSchema,
  MovementSchema,
  CreateMovementSchema,
  SaleSchema,
  SaleItemSchema,
  CreateSaleSchema,
  ExpenseSchema,
  CreateExpenseSchema,
  UpdateExpenseSchema,
  GoalSchema,
  CreateGoalSchema,
  UpdateGoalSchema,
} from './schemas';
import type { SALE_CHANNELS, EXPENSE_CATEGORIES, MOVEMENT_TYPES, SALE_STATUSES } from './schemas';

// ─── Enums ───────────────────────────────────────────────────────────────────

export type SaleChannel = typeof SALE_CHANNELS[number];
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];
export type MovementType = typeof MOVEMENT_TYPES[number];
export type SaleStatus = typeof SALE_STATUSES[number];
// DeliveryZone already exported from schemas.ts

// ─── Domain types (inferred from Zod) ────────────────────────────────────────

export type Product = z.infer<typeof ProductSchema>;
export type CreateProductDto = z.infer<typeof CreateProductSchema>;
export type UpdateProductDto = z.infer<typeof UpdateProductSchema>;

export type StockMovement = z.infer<typeof MovementSchema>;
export type CreateMovementDto = z.infer<typeof CreateMovementSchema>;

export type SaleItem = z.infer<typeof SaleItemSchema>;
export type Sale = z.infer<typeof SaleSchema>;
export type CreateSaleDto = z.infer<typeof CreateSaleSchema>;

export type Expense = z.infer<typeof ExpenseSchema>;
export type CreateExpenseDto = z.infer<typeof CreateExpenseSchema>;
export type UpdateExpenseDto = z.infer<typeof UpdateExpenseSchema>;

export type SalesGoal = z.infer<typeof GoalSchema>;
export type CreateGoalDto = z.infer<typeof CreateGoalSchema>;
export type UpdateGoalDto = z.infer<typeof UpdateGoalSchema>;

// ─── Computed / Analytics (frontend only, never stored) ──────────────────────

export type ProductClassification = 'scale' | 'profitable' | 'monitor' | 'stop';

export interface ProductAnalytics {
  productId: string;
  productName: string;
  totalUnitsSold: number;
  totalRevenue: number;
  avgSalePrice: number;
  totalCOGS: number;
  grossProfit: number;
  grossMarginPct: number;
  totalAdSpend: number;
  totalOtherExpenses: number;
  netProfit: number;
  netMarginPct: number;
  conversions: number;
  cpa: number;
  roi: number;
  currentStock: number;
  stockRotationDays: number;
  classification: ProductClassification;
}

export interface GlobalKpis {
  totalRevenue: number;
  totalCOGS: number;
  grossProfit: number;
  grossMarginPct: number;
  totalExpenses: number;
  netProfit: number;
  netMarginPct: number;
  totalOrders: number;
  avgOrderValue: number;
  totalAdSpend: number;
  totalStockValue: number;
}
