import { z } from 'zod';

// ─── Constantes ──────────────────────────────────────────────────────────────

export const SALE_CHANNELS = ['WhatsApp', 'Meta Ads', 'TikTok', 'Instagram', 'Boutique', 'Autre'] as const;
export const EXPENSE_CATEGORIES = ['pub', 'transport', 'stock', 'other'] as const;
export const MOVEMENT_TYPES = ['in', 'out'] as const;
export const SALE_STATUSES = ['paid', 'pending', 'cancelled'] as const;

// ─── Zones de livraison ───────────────────────────────────────────────────────

export const KINSHASA_COMMUNES = [
  'Bandalungwa', 'Barumbu', 'Bumbu', 'Gombe', 'Kalamu', 'Kasa-Vubu',
  'Kimbanseke', 'Kinshasa', 'Kisenso', 'Lemba', 'Limete', 'Lingwala',
  'Makala', 'Maluku', 'Masina', 'Matete', 'Mont-Ngafula', 'Ndjili',
  'Ngaba', 'Ngaliema', 'Ngiri-Ngiri', 'Nsele', 'Selembao', 'Kintambo',
] as const;

export const RDC_VILLES = [
  'Lubumbashi', 'Mbuji-Mayi', 'Kananga', 'Kisangani', 'Bukavu',
  'Goma', 'Kolwezi', 'Likasi', 'Boma', 'Matadi', 'Mbandaka',
  'Butembo', 'Uvira', 'Kalemie', 'Mwene-Ditu', 'Gandajika',
  'Kikwit', 'Tshikapa', 'Ilebo', 'Bandundu', 'Gemena',
  'Lisala', 'Bumba', 'Zongo',
] as const;

export const DELIVERY_ZONES = [
  ...KINSHASA_COMMUNES.map(c => `Kinshasa — ${c}`),
  ...RDC_VILLES,
  'Autre ville',
] as const;

export type DeliveryZone = typeof DELIVERY_ZONES[number];

// ─── Product ─────────────────────────────────────────────────────────────────

export const CreateProductSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional().default(''),
  category: z.string().default(''),
  quantity: z.number().min(0),
  alertThreshold: z.number().min(0),
  supplier: z.string().default(''),
  acquisitionCost: z.number().min(0),
  sellingPrice: z.number().min(0).default(0),
  imageUrl: z.string().optional(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const UpdateProductSchema = CreateProductSchema.partial();

export const ProductSchema = CreateProductSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// ─── Stock Movement ───────────────────────────────────────────────────────────

export const CreateMovementSchema = z.object({
  productId: z.string().uuid(),
  type: z.enum(MOVEMENT_TYPES),
  quantity: z.number().min(0.1),
  reason: z.string().default(''),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const MovementSchema = CreateMovementSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string(),
});

// ─── Sale ─────────────────────────────────────────────────────────────────────

export const SaleItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().min(0.1),
  unitPrice: z.number().min(0),
});

export const CreateSaleSchema = z.object({
  items: z.array(SaleItemSchema).min(1),
  channel: z.enum(SALE_CHANNELS),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().optional(),
  status: z.enum(SALE_STATUSES).default('paid'),
  deliveryZone: z.string().optional(),
});

export const SaleSchema = CreateSaleSchema.extend({
  id: z.string().uuid(),
  status: z.enum(SALE_STATUSES),
  deliveryZone: z.string().optional(),
  createdAt: z.string(),
});

// ─── Expense ──────────────────────────────────────────────────────────────────

export const CreateExpenseSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  productId: z.string().uuid().optional(),
  channel: z.enum(SALE_CHANNELS).optional(),
  amount: z.number().min(0),
  description: z.string().default(''),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const UpdateExpenseSchema = CreateExpenseSchema.partial();

export const ExpenseSchema = CreateExpenseSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string(),
});

// ─── Goal ─────────────────────────────────────────────────────────────────────

export const CreateGoalSchema = z.object({
  productId: z.string().min(1), // 'all' ou UUID produit
  targetQty: z.number().int().min(1),
});

export const UpdateGoalSchema = CreateGoalSchema.partial();

export const GoalSchema = CreateGoalSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string(),
});
