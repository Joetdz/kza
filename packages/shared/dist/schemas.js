"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoalSchema = exports.UpdateGoalSchema = exports.CreateGoalSchema = exports.ExpenseSchema = exports.UpdateExpenseSchema = exports.CreateExpenseSchema = exports.SaleSchema = exports.CreateSaleSchema = exports.SaleItemSchema = exports.MovementSchema = exports.CreateMovementSchema = exports.ProductSchema = exports.UpdateProductSchema = exports.CreateProductSchema = exports.DELIVERY_ZONES = exports.RDC_VILLES = exports.KINSHASA_COMMUNES = exports.SALE_STATUSES = exports.MOVEMENT_TYPES = exports.EXPENSE_CATEGORIES = exports.SALE_CHANNELS = void 0;
const zod_1 = require("zod");
// ─── Constantes ──────────────────────────────────────────────────────────────
exports.SALE_CHANNELS = ['WhatsApp', 'Meta Ads', 'TikTok', 'Instagram', 'Boutique', 'Autre'];
exports.EXPENSE_CATEGORIES = ['pub', 'transport', 'stock', 'other'];
exports.MOVEMENT_TYPES = ['in', 'out'];
exports.SALE_STATUSES = ['paid', 'pending', 'cancelled'];
// ─── Zones de livraison ───────────────────────────────────────────────────────
exports.KINSHASA_COMMUNES = [
    'Bandalungwa', 'Barumbu', 'Bumbu', 'Gombe', 'Kalamu', 'Kasa-Vubu',
    'Kimbanseke', 'Kinshasa', 'Kisenso', 'Lemba', 'Limete', 'Lingwala',
    'Makala', 'Maluku', 'Masina', 'Matete', 'Mont-Ngafula', 'Ndjili',
    'Ngaba', 'Ngaliema', 'Ngiri-Ngiri', 'Nsele', 'Selembao', 'Kintambo',
];
exports.RDC_VILLES = [
    'Lubumbashi', 'Mbuji-Mayi', 'Kananga', 'Kisangani', 'Bukavu',
    'Goma', 'Kolwezi', 'Likasi', 'Boma', 'Matadi', 'Mbandaka',
    'Butembo', 'Uvira', 'Kalemie', 'Mwene-Ditu', 'Gandajika',
    'Kikwit', 'Tshikapa', 'Ilebo', 'Bandundu', 'Gemena',
    'Lisala', 'Bumba', 'Zongo',
];
exports.DELIVERY_ZONES = [
    ...exports.KINSHASA_COMMUNES.map(c => `Kinshasa — ${c}`),
    ...exports.RDC_VILLES,
    'Autre ville',
];
// ─── Product ─────────────────────────────────────────────────────────────────
exports.CreateProductSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    sku: zod_1.z.string().min(1),
    category: zod_1.z.string().default(''),
    quantity: zod_1.z.number().min(0),
    alertThreshold: zod_1.z.number().min(0),
    supplier: zod_1.z.string().default(''),
    acquisitionCost: zod_1.z.number().min(0),
    sellingPrice: zod_1.z.number().min(0).default(0),
    imageUrl: zod_1.z.string().optional(),
    entryDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
exports.UpdateProductSchema = exports.CreateProductSchema.partial();
exports.ProductSchema = exports.CreateProductSchema.extend({
    id: zod_1.z.string().uuid(),
    createdAt: zod_1.z.string(),
    updatedAt: zod_1.z.string(),
});
// ─── Stock Movement ───────────────────────────────────────────────────────────
exports.CreateMovementSchema = zod_1.z.object({
    productId: zod_1.z.string().uuid(),
    type: zod_1.z.enum(exports.MOVEMENT_TYPES),
    quantity: zod_1.z.number().min(0.1),
    reason: zod_1.z.string().default(''),
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
exports.MovementSchema = exports.CreateMovementSchema.extend({
    id: zod_1.z.string().uuid(),
    createdAt: zod_1.z.string(),
});
// ─── Sale ─────────────────────────────────────────────────────────────────────
exports.SaleItemSchema = zod_1.z.object({
    productId: zod_1.z.string().uuid(),
    quantity: zod_1.z.number().min(0.1),
    unitPrice: zod_1.z.number().min(0),
});
exports.CreateSaleSchema = zod_1.z.object({
    items: zod_1.z.array(exports.SaleItemSchema).min(1),
    channel: zod_1.z.enum(exports.SALE_CHANNELS),
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: zod_1.z.string().optional(),
    status: zod_1.z.enum(exports.SALE_STATUSES).default('paid'),
    deliveryZone: zod_1.z.string().optional(),
});
exports.SaleSchema = exports.CreateSaleSchema.extend({
    id: zod_1.z.string().uuid(),
    status: zod_1.z.enum(exports.SALE_STATUSES),
    deliveryZone: zod_1.z.string().optional(),
    createdAt: zod_1.z.string(),
});
// ─── Expense ──────────────────────────────────────────────────────────────────
exports.CreateExpenseSchema = zod_1.z.object({
    category: zod_1.z.enum(exports.EXPENSE_CATEGORIES),
    productId: zod_1.z.string().uuid().optional(),
    channel: zod_1.z.enum(exports.SALE_CHANNELS).optional(),
    amount: zod_1.z.number().min(0),
    description: zod_1.z.string().default(''),
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
exports.UpdateExpenseSchema = exports.CreateExpenseSchema.partial();
exports.ExpenseSchema = exports.CreateExpenseSchema.extend({
    id: zod_1.z.string().uuid(),
    createdAt: zod_1.z.string(),
});
// ─── Goal ─────────────────────────────────────────────────────────────────────
exports.CreateGoalSchema = zod_1.z.object({
    productId: zod_1.z.string().min(1), // 'all' ou UUID produit
    targetQty: zod_1.z.number().int().min(1),
});
exports.UpdateGoalSchema = exports.CreateGoalSchema.partial();
exports.GoalSchema = exports.CreateGoalSchema.extend({
    id: zod_1.z.string().uuid(),
    createdAt: zod_1.z.string(),
});
