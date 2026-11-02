import { z } from 'zod';
export declare const SALE_CHANNELS: readonly ["WhatsApp", "Meta Ads", "TikTok", "Instagram", "Boutique", "Autre"];
export declare const EXPENSE_CATEGORIES: readonly ["pub", "transport", "stock", "other"];
export declare const MOVEMENT_TYPES: readonly ["in", "out"];
export declare const SALE_STATUSES: readonly ["paid", "pending", "cancelled", "credit"];
export declare const KINSHASA_COMMUNES: readonly ["Bandalungwa", "Barumbu", "Bumbu", "Gombe", "Kalamu", "Kasa-Vubu", "Kimbanseke", "Kinshasa", "Kisenso", "Lemba", "Limete", "Lingwala", "Makala", "Maluku", "Masina", "Matete", "Mont-Ngafula", "Ndjili", "Ngaba", "Ngaliema", "Ngiri-Ngiri", "Nsele", "Selembao", "Kintambo"];
export declare const RDC_VILLES: readonly ["Lubumbashi", "Mbuji-Mayi", "Kananga", "Kisangani", "Bukavu", "Goma", "Kolwezi", "Likasi", "Boma", "Matadi", "Mbandaka", "Butembo", "Uvira", "Kalemie", "Mwene-Ditu", "Gandajika", "Kikwit", "Tshikapa", "Ilebo", "Bandundu", "Gemena", "Lisala", "Bumba", "Zongo"];
export declare const DELIVERY_ZONES: readonly [...string[], "Lubumbashi", "Mbuji-Mayi", "Kananga", "Kisangani", "Bukavu", "Goma", "Kolwezi", "Likasi", "Boma", "Matadi", "Mbandaka", "Butembo", "Uvira", "Kalemie", "Mwene-Ditu", "Gandajika", "Kikwit", "Tshikapa", "Ilebo", "Bandundu", "Gemena", "Lisala", "Bumba", "Zongo", "Autre ville"];
export type DeliveryZone = typeof DELIVERY_ZONES[number];
export declare const CreateProductSchema: z.ZodObject<{
    name: z.ZodString;
    sku: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    category: z.ZodDefault<z.ZodString>;
    quantity: z.ZodNumber;
    alertThreshold: z.ZodNumber;
    supplier: z.ZodDefault<z.ZodString>;
    acquisitionCost: z.ZodNumber;
    sellingPrice: z.ZodDefault<z.ZodNumber>;
    imageUrl: z.ZodOptional<z.ZodString>;
    entryDate: z.ZodString;
    trackStock: z.ZodDefault<z.ZodBoolean>;
    /** Model this product is a variant of ("T-shirt"); null for a plain product. */
    variantGroup: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    /** What distinguishes this variant ("M / Rouge"). */
    variantLabel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    /** Length of one booking of this service, in minutes (agenda module). */
    durationMinutes: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    /** Volume pricing: [{ minQty, unitPrice }] (invoices module). */
    priceTiers: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodObject<{
        minQty: z.ZodNumber;
        unitPrice: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        minQty: number;
        unitPrice: number;
    }, {
        minQty: number;
        unitPrice: number;
    }>, "many">>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    sku: string;
    category: string;
    quantity: number;
    alertThreshold: number;
    supplier: string;
    acquisitionCost: number;
    sellingPrice: number;
    entryDate: string;
    trackStock: boolean;
    imageUrl?: string | undefined;
    variantGroup?: string | null | undefined;
    variantLabel?: string | null | undefined;
    durationMinutes?: number | null | undefined;
    priceTiers?: {
        minQty: number;
        unitPrice: number;
    }[] | null | undefined;
}, {
    name: string;
    quantity: number;
    alertThreshold: number;
    acquisitionCost: number;
    entryDate: string;
    sku?: string | undefined;
    category?: string | undefined;
    supplier?: string | undefined;
    sellingPrice?: number | undefined;
    imageUrl?: string | undefined;
    trackStock?: boolean | undefined;
    variantGroup?: string | null | undefined;
    variantLabel?: string | null | undefined;
    durationMinutes?: number | null | undefined;
    priceTiers?: {
        minQty: number;
        unitPrice: number;
    }[] | null | undefined;
}>;
export declare const UpdateProductSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    sku: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodString>>>;
    category: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    quantity: z.ZodOptional<z.ZodNumber>;
    alertThreshold: z.ZodOptional<z.ZodNumber>;
    supplier: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    acquisitionCost: z.ZodOptional<z.ZodNumber>;
    sellingPrice: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    imageUrl: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    entryDate: z.ZodOptional<z.ZodString>;
    trackStock: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    variantGroup: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    variantLabel: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    durationMinutes: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    priceTiers: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodObject<{
        minQty: z.ZodNumber;
        unitPrice: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        minQty: number;
        unitPrice: number;
    }, {
        minQty: number;
        unitPrice: number;
    }>, "many">>>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    sku?: string | undefined;
    category?: string | undefined;
    quantity?: number | undefined;
    alertThreshold?: number | undefined;
    supplier?: string | undefined;
    acquisitionCost?: number | undefined;
    sellingPrice?: number | undefined;
    imageUrl?: string | undefined;
    entryDate?: string | undefined;
    trackStock?: boolean | undefined;
    variantGroup?: string | null | undefined;
    variantLabel?: string | null | undefined;
    durationMinutes?: number | null | undefined;
    priceTiers?: {
        minQty: number;
        unitPrice: number;
    }[] | null | undefined;
}, {
    name?: string | undefined;
    sku?: string | undefined;
    category?: string | undefined;
    quantity?: number | undefined;
    alertThreshold?: number | undefined;
    supplier?: string | undefined;
    acquisitionCost?: number | undefined;
    sellingPrice?: number | undefined;
    imageUrl?: string | undefined;
    entryDate?: string | undefined;
    trackStock?: boolean | undefined;
    variantGroup?: string | null | undefined;
    variantLabel?: string | null | undefined;
    durationMinutes?: number | null | undefined;
    priceTiers?: {
        minQty: number;
        unitPrice: number;
    }[] | null | undefined;
}>;
export declare const ProductSchema: z.ZodObject<{
    name: z.ZodString;
    sku: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    category: z.ZodDefault<z.ZodString>;
    quantity: z.ZodNumber;
    alertThreshold: z.ZodNumber;
    supplier: z.ZodDefault<z.ZodString>;
    acquisitionCost: z.ZodNumber;
    sellingPrice: z.ZodDefault<z.ZodNumber>;
    imageUrl: z.ZodOptional<z.ZodString>;
    entryDate: z.ZodString;
    trackStock: z.ZodDefault<z.ZodBoolean>;
    /** Model this product is a variant of ("T-shirt"); null for a plain product. */
    variantGroup: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    /** What distinguishes this variant ("M / Rouge"). */
    variantLabel: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    /** Length of one booking of this service, in minutes (agenda module). */
    durationMinutes: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    /** Volume pricing: [{ minQty, unitPrice }] (invoices module). */
    priceTiers: z.ZodOptional<z.ZodNullable<z.ZodArray<z.ZodObject<{
        minQty: z.ZodNumber;
        unitPrice: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        minQty: number;
        unitPrice: number;
    }, {
        minQty: number;
        unitPrice: number;
    }>, "many">>>;
} & {
    id: z.ZodString;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    sku: string;
    category: string;
    quantity: number;
    alertThreshold: number;
    supplier: string;
    acquisitionCost: number;
    sellingPrice: number;
    entryDate: string;
    trackStock: boolean;
    id: string;
    createdAt: string;
    updatedAt: string;
    imageUrl?: string | undefined;
    variantGroup?: string | null | undefined;
    variantLabel?: string | null | undefined;
    durationMinutes?: number | null | undefined;
    priceTiers?: {
        minQty: number;
        unitPrice: number;
    }[] | null | undefined;
}, {
    name: string;
    quantity: number;
    alertThreshold: number;
    acquisitionCost: number;
    entryDate: string;
    id: string;
    createdAt: string;
    updatedAt: string;
    sku?: string | undefined;
    category?: string | undefined;
    supplier?: string | undefined;
    sellingPrice?: number | undefined;
    imageUrl?: string | undefined;
    trackStock?: boolean | undefined;
    variantGroup?: string | null | undefined;
    variantLabel?: string | null | undefined;
    durationMinutes?: number | null | undefined;
    priceTiers?: {
        minQty: number;
        unitPrice: number;
    }[] | null | undefined;
}>;
export declare const CreateMovementSchema: z.ZodObject<{
    productId: z.ZodString;
    type: z.ZodEnum<["in", "out"]>;
    quantity: z.ZodNumber;
    kind: z.ZodOptional<z.ZodEnum<["purchase", "initial", "sale", "return", "loss", "inventory", "other"]>>;
    /** Stock-in: what one unit cost. Otherwise the cost it left or came back at; set by the server. */
    unitCost: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    reason: z.ZodDefault<z.ZodString>;
    date: z.ZodString;
}, "strip", z.ZodTypeAny, {
    quantity: number;
    type: "in" | "out";
    date: string;
    productId: string;
    reason: string;
    kind?: "purchase" | "initial" | "sale" | "return" | "loss" | "inventory" | "other" | undefined;
    unitCost?: number | null | undefined;
}, {
    quantity: number;
    type: "in" | "out";
    date: string;
    productId: string;
    kind?: "purchase" | "initial" | "sale" | "return" | "loss" | "inventory" | "other" | undefined;
    unitCost?: number | null | undefined;
    reason?: string | undefined;
}>;
export declare const MovementSchema: z.ZodObject<{
    productId: z.ZodString;
    type: z.ZodEnum<["in", "out"]>;
    quantity: z.ZodNumber;
    kind: z.ZodOptional<z.ZodEnum<["purchase", "initial", "sale", "return", "loss", "inventory", "other"]>>;
    /** Stock-in: what one unit cost. Otherwise the cost it left or came back at; set by the server. */
    unitCost: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    reason: z.ZodDefault<z.ZodString>;
    date: z.ZodString;
} & {
    id: z.ZodString;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    quantity: number;
    type: "in" | "out";
    date: string;
    id: string;
    createdAt: string;
    productId: string;
    reason: string;
    kind?: "purchase" | "initial" | "sale" | "return" | "loss" | "inventory" | "other" | undefined;
    unitCost?: number | null | undefined;
}, {
    quantity: number;
    type: "in" | "out";
    date: string;
    id: string;
    createdAt: string;
    productId: string;
    kind?: "purchase" | "initial" | "sale" | "return" | "loss" | "inventory" | "other" | undefined;
    unitCost?: number | null | undefined;
    reason?: string | undefined;
}>;
export declare const SaleItemSchema: z.ZodObject<{
    productId: z.ZodString;
    quantity: z.ZodNumber;
    unitPrice: z.ZodNumber;
    /** Purchase cost frozen when the sale was recorded; set by the server. */
    unitCost: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    quantity: number;
    unitPrice: number;
    productId: string;
    unitCost?: number | null | undefined;
}, {
    quantity: number;
    unitPrice: number;
    productId: string;
    unitCost?: number | null | undefined;
}>;
export declare const CreateSaleSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        productId: z.ZodString;
        quantity: z.ZodNumber;
        unitPrice: z.ZodNumber;
        /** Purchase cost frozen when the sale was recorded; set by the server. */
        unitCost: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        quantity: number;
        unitPrice: number;
        productId: string;
        unitCost?: number | null | undefined;
    }, {
        quantity: number;
        unitPrice: number;
        productId: string;
        unitCost?: number | null | undefined;
    }>, "many">;
    channel: z.ZodEnum<["WhatsApp", "Meta Ads", "TikTok", "Instagram", "Boutique", "Autre"]>;
    date: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<["paid", "pending", "cancelled", "credit"]>>;
    deliveryZone: z.ZodOptional<z.ZodString>;
    customerName: z.ZodOptional<z.ZodString>;
    customerPhone: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "paid" | "cancelled" | "pending" | "credit";
    date: string;
    items: {
        quantity: number;
        unitPrice: number;
        productId: string;
        unitCost?: number | null | undefined;
    }[];
    channel: "Autre" | "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique";
    note?: string | undefined;
    deliveryZone?: string | undefined;
    customerName?: string | undefined;
    customerPhone?: string | undefined;
}, {
    date: string;
    items: {
        quantity: number;
        unitPrice: number;
        productId: string;
        unitCost?: number | null | undefined;
    }[];
    channel: "Autre" | "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique";
    status?: "paid" | "cancelled" | "pending" | "credit" | undefined;
    note?: string | undefined;
    deliveryZone?: string | undefined;
    customerName?: string | undefined;
    customerPhone?: string | undefined;
}>;
export declare const SaleSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        productId: z.ZodString;
        quantity: z.ZodNumber;
        unitPrice: z.ZodNumber;
        /** Purchase cost frozen when the sale was recorded; set by the server. */
        unitCost: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        quantity: number;
        unitPrice: number;
        productId: string;
        unitCost?: number | null | undefined;
    }, {
        quantity: number;
        unitPrice: number;
        productId: string;
        unitCost?: number | null | undefined;
    }>, "many">;
    channel: z.ZodEnum<["WhatsApp", "Meta Ads", "TikTok", "Instagram", "Boutique", "Autre"]>;
    date: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
    customerName: z.ZodOptional<z.ZodString>;
    customerPhone: z.ZodOptional<z.ZodString>;
} & {
    id: z.ZodString;
    status: z.ZodEnum<["paid", "pending", "cancelled", "credit"]>;
    deliveryZone: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "paid" | "cancelled" | "pending" | "credit";
    date: string;
    id: string;
    createdAt: string;
    items: {
        quantity: number;
        unitPrice: number;
        productId: string;
        unitCost?: number | null | undefined;
    }[];
    channel: "Autre" | "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique";
    note?: string | undefined;
    deliveryZone?: string | undefined;
    customerName?: string | undefined;
    customerPhone?: string | undefined;
}, {
    status: "paid" | "cancelled" | "pending" | "credit";
    date: string;
    id: string;
    createdAt: string;
    items: {
        quantity: number;
        unitPrice: number;
        productId: string;
        unitCost?: number | null | undefined;
    }[];
    channel: "Autre" | "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique";
    note?: string | undefined;
    deliveryZone?: string | undefined;
    customerName?: string | undefined;
    customerPhone?: string | undefined;
}>;
export declare const CreateExpenseSchema: z.ZodObject<{
    category: z.ZodString;
    productId: z.ZodOptional<z.ZodString>;
    channel: z.ZodOptional<z.ZodEnum<["WhatsApp", "Meta Ads", "TikTok", "Instagram", "Boutique", "Autre"]>>;
    amount: z.ZodNumber;
    description: z.ZodDefault<z.ZodString>;
    date: z.ZodString;
}, "strip", z.ZodTypeAny, {
    category: string;
    date: string;
    amount: number;
    description: string;
    productId?: string | undefined;
    channel?: "Autre" | "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique" | undefined;
}, {
    category: string;
    date: string;
    amount: number;
    productId?: string | undefined;
    channel?: "Autre" | "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique" | undefined;
    description?: string | undefined;
}>;
export declare const UpdateExpenseSchema: z.ZodObject<{
    category: z.ZodOptional<z.ZodString>;
    productId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    channel: z.ZodOptional<z.ZodOptional<z.ZodEnum<["WhatsApp", "Meta Ads", "TikTok", "Instagram", "Boutique", "Autre"]>>>;
    amount: z.ZodOptional<z.ZodNumber>;
    description: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    date: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    category?: string | undefined;
    date?: string | undefined;
    productId?: string | undefined;
    channel?: "Autre" | "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique" | undefined;
    amount?: number | undefined;
    description?: string | undefined;
}, {
    category?: string | undefined;
    date?: string | undefined;
    productId?: string | undefined;
    channel?: "Autre" | "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique" | undefined;
    amount?: number | undefined;
    description?: string | undefined;
}>;
export declare const ExpenseSchema: z.ZodObject<{
    category: z.ZodString;
    productId: z.ZodOptional<z.ZodString>;
    channel: z.ZodOptional<z.ZodEnum<["WhatsApp", "Meta Ads", "TikTok", "Instagram", "Boutique", "Autre"]>>;
    amount: z.ZodNumber;
    description: z.ZodDefault<z.ZodString>;
    date: z.ZodString;
} & {
    id: z.ZodString;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    category: string;
    date: string;
    id: string;
    createdAt: string;
    amount: number;
    description: string;
    productId?: string | undefined;
    channel?: "Autre" | "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique" | undefined;
}, {
    category: string;
    date: string;
    id: string;
    createdAt: string;
    amount: number;
    productId?: string | undefined;
    channel?: "Autre" | "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique" | undefined;
    description?: string | undefined;
}>;
export declare const RECURRING_FREQUENCIES: readonly ["daily", "weekly", "monthly", "annual"];
export declare const CreateRecurringExpenseSchema: z.ZodObject<{
    category: z.ZodString;
    description: z.ZodDefault<z.ZodString>;
    amount: z.ZodNumber;
    frequency: z.ZodDefault<z.ZodEnum<["daily", "weekly", "monthly", "annual"]>>;
    dayOfWeek: z.ZodOptional<z.ZodNumber>;
    dayOfMonth: z.ZodOptional<z.ZodNumber>;
    month: z.ZodOptional<z.ZodNumber>;
    startDate: z.ZodString;
    endDate: z.ZodOptional<z.ZodString>;
    active: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    category: string;
    amount: number;
    description: string;
    frequency: "daily" | "weekly" | "monthly" | "annual";
    startDate: string;
    active: boolean;
    dayOfWeek?: number | undefined;
    dayOfMonth?: number | undefined;
    month?: number | undefined;
    endDate?: string | undefined;
}, {
    category: string;
    amount: number;
    startDate: string;
    description?: string | undefined;
    frequency?: "daily" | "weekly" | "monthly" | "annual" | undefined;
    dayOfWeek?: number | undefined;
    dayOfMonth?: number | undefined;
    month?: number | undefined;
    endDate?: string | undefined;
    active?: boolean | undefined;
}>;
export declare const UpdateRecurringExpenseSchema: z.ZodObject<{
    category: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    amount: z.ZodOptional<z.ZodNumber>;
    frequency: z.ZodOptional<z.ZodDefault<z.ZodEnum<["daily", "weekly", "monthly", "annual"]>>>;
    dayOfWeek: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    dayOfMonth: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    month: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    startDate: z.ZodOptional<z.ZodString>;
    endDate: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    active: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    category?: string | undefined;
    amount?: number | undefined;
    description?: string | undefined;
    frequency?: "daily" | "weekly" | "monthly" | "annual" | undefined;
    dayOfWeek?: number | undefined;
    dayOfMonth?: number | undefined;
    month?: number | undefined;
    startDate?: string | undefined;
    endDate?: string | undefined;
    active?: boolean | undefined;
}, {
    category?: string | undefined;
    amount?: number | undefined;
    description?: string | undefined;
    frequency?: "daily" | "weekly" | "monthly" | "annual" | undefined;
    dayOfWeek?: number | undefined;
    dayOfMonth?: number | undefined;
    month?: number | undefined;
    startDate?: string | undefined;
    endDate?: string | undefined;
    active?: boolean | undefined;
}>;
export declare const RecurringExpenseSchema: z.ZodObject<{
    category: z.ZodString;
    description: z.ZodDefault<z.ZodString>;
    amount: z.ZodNumber;
    frequency: z.ZodDefault<z.ZodEnum<["daily", "weekly", "monthly", "annual"]>>;
    dayOfWeek: z.ZodOptional<z.ZodNumber>;
    dayOfMonth: z.ZodOptional<z.ZodNumber>;
    month: z.ZodOptional<z.ZodNumber>;
    startDate: z.ZodString;
    endDate: z.ZodOptional<z.ZodString>;
    active: z.ZodDefault<z.ZodBoolean>;
} & {
    id: z.ZodString;
    lastGeneratedPeriod: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    category: string;
    id: string;
    createdAt: string;
    updatedAt: string;
    amount: number;
    description: string;
    frequency: "daily" | "weekly" | "monthly" | "annual";
    startDate: string;
    active: boolean;
    lastGeneratedPeriod: string | null;
    dayOfWeek?: number | undefined;
    dayOfMonth?: number | undefined;
    month?: number | undefined;
    endDate?: string | undefined;
}, {
    category: string;
    id: string;
    createdAt: string;
    updatedAt: string;
    amount: number;
    startDate: string;
    lastGeneratedPeriod: string | null;
    description?: string | undefined;
    frequency?: "daily" | "weekly" | "monthly" | "annual" | undefined;
    dayOfWeek?: number | undefined;
    dayOfMonth?: number | undefined;
    month?: number | undefined;
    endDate?: string | undefined;
    active?: boolean | undefined;
}>;
export declare const CreateGoalSchema: z.ZodObject<{
    productId: z.ZodString;
    targetQty: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    productId: string;
    targetQty: number;
}, {
    productId: string;
    targetQty: number;
}>;
export declare const UpdateGoalSchema: z.ZodObject<{
    productId: z.ZodOptional<z.ZodString>;
    targetQty: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    productId?: string | undefined;
    targetQty?: number | undefined;
}, {
    productId?: string | undefined;
    targetQty?: number | undefined;
}>;
export declare const GoalSchema: z.ZodObject<{
    productId: z.ZodString;
    targetQty: z.ZodNumber;
} & {
    id: z.ZodString;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    productId: string;
    targetQty: number;
}, {
    id: string;
    createdAt: string;
    productId: string;
    targetQty: number;
}>;
export declare const SUPPORTED_CURRENCIES: readonly ["USD", "CDF", "EUR", "XAF", "XOF", "RWF", "UGX", "GNF", "MAD"];
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];
export declare const CreateBusinessSchema: z.ZodObject<{
    name: z.ZodString;
    sector: z.ZodOptional<z.ZodString>;
    country: z.ZodDefault<z.ZodString>;
    currency: z.ZodDefault<z.ZodEnum<["USD", "CDF", "EUR", "XAF", "XOF", "RWF", "UGX", "GNF", "MAD"]>>;
    whatsappPhone: z.ZodString;
    logoUrl: z.ZodOptional<z.ZodString>;
    isDefault: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    country: string;
    currency: "USD" | "CDF" | "EUR" | "XAF" | "XOF" | "RWF" | "UGX" | "GNF" | "MAD";
    whatsappPhone: string;
    isDefault: boolean;
    sector?: string | undefined;
    logoUrl?: string | undefined;
}, {
    name: string;
    whatsappPhone: string;
    sector?: string | undefined;
    country?: string | undefined;
    currency?: "USD" | "CDF" | "EUR" | "XAF" | "XOF" | "RWF" | "UGX" | "GNF" | "MAD" | undefined;
    logoUrl?: string | undefined;
    isDefault?: boolean | undefined;
}>;
export declare const UpdateBusinessSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    sector: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    country: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodEnum<["USD", "CDF", "EUR", "XAF", "XOF", "RWF", "UGX", "GNF", "MAD"]>>>;
    whatsappPhone: z.ZodOptional<z.ZodString>;
    logoUrl: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    isDefault: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    sector?: string | undefined;
    country?: string | undefined;
    currency?: "USD" | "CDF" | "EUR" | "XAF" | "XOF" | "RWF" | "UGX" | "GNF" | "MAD" | undefined;
    whatsappPhone?: string | undefined;
    logoUrl?: string | undefined;
    isDefault?: boolean | undefined;
}, {
    name?: string | undefined;
    sector?: string | undefined;
    country?: string | undefined;
    currency?: "USD" | "CDF" | "EUR" | "XAF" | "XOF" | "RWF" | "UGX" | "GNF" | "MAD" | undefined;
    whatsappPhone?: string | undefined;
    logoUrl?: string | undefined;
    isDefault?: boolean | undefined;
}>;
export declare const BusinessSchema: z.ZodObject<{
    name: z.ZodString;
    sector: z.ZodOptional<z.ZodString>;
    country: z.ZodDefault<z.ZodString>;
    currency: z.ZodDefault<z.ZodEnum<["USD", "CDF", "EUR", "XAF", "XOF", "RWF", "UGX", "GNF", "MAD"]>>;
    whatsappPhone: z.ZodString;
    logoUrl: z.ZodOptional<z.ZodString>;
    isDefault: z.ZodDefault<z.ZodBoolean>;
} & {
    id: z.ZodString;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    id: string;
    createdAt: string;
    updatedAt: string;
    country: string;
    currency: "USD" | "CDF" | "EUR" | "XAF" | "XOF" | "RWF" | "UGX" | "GNF" | "MAD";
    whatsappPhone: string;
    isDefault: boolean;
    sector?: string | undefined;
    logoUrl?: string | undefined;
}, {
    name: string;
    id: string;
    createdAt: string;
    updatedAt: string;
    whatsappPhone: string;
    sector?: string | undefined;
    country?: string | undefined;
    currency?: "USD" | "CDF" | "EUR" | "XAF" | "XOF" | "RWF" | "UGX" | "GNF" | "MAD" | undefined;
    logoUrl?: string | undefined;
    isDefault?: boolean | undefined;
}>;
export declare const BudgetForecastProductSchema: z.ZodObject<{
    id: z.ZodString;
    forecastId: z.ZodString;
    productId: z.ZodString;
    quantity: z.ZodNumber;
    adBudgetOverride: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    quantity: number;
    id: string;
    productId: string;
    forecastId: string;
    adBudgetOverride?: number | null | undefined;
}, {
    quantity: number;
    id: string;
    productId: string;
    forecastId: string;
    adBudgetOverride?: number | null | undefined;
}>;
export declare const BudgetForecastExpenseSchema: z.ZodObject<{
    id: z.ZodString;
    forecastId: z.ZodString;
    category: z.ZodString;
    description: z.ZodString;
    amount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    category: string;
    id: string;
    amount: number;
    description: string;
    forecastId: string;
}, {
    category: string;
    id: string;
    amount: number;
    description: string;
    forecastId: string;
}>;
export declare const BudgetForecastSchema: z.ZodObject<{
    id: z.ZodString;
    startMonth: z.ZodString;
    monthlyGrowthPct: z.ZodNumber;
    horizonMonths: z.ZodNumber;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    products: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        forecastId: z.ZodString;
        productId: z.ZodString;
        quantity: z.ZodNumber;
        adBudgetOverride: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        quantity: number;
        id: string;
        productId: string;
        forecastId: string;
        adBudgetOverride?: number | null | undefined;
    }, {
        quantity: number;
        id: string;
        productId: string;
        forecastId: string;
        adBudgetOverride?: number | null | undefined;
    }>, "many">;
    expenses: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        forecastId: z.ZodString;
        category: z.ZodString;
        description: z.ZodString;
        amount: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        category: string;
        id: string;
        amount: number;
        description: string;
        forecastId: string;
    }, {
        category: string;
        id: string;
        amount: number;
        description: string;
        forecastId: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: string;
    updatedAt: string;
    startMonth: string;
    monthlyGrowthPct: number;
    horizonMonths: number;
    products: {
        quantity: number;
        id: string;
        productId: string;
        forecastId: string;
        adBudgetOverride?: number | null | undefined;
    }[];
    expenses: {
        category: string;
        id: string;
        amount: number;
        description: string;
        forecastId: string;
    }[];
}, {
    id: string;
    createdAt: string;
    updatedAt: string;
    startMonth: string;
    monthlyGrowthPct: number;
    horizonMonths: number;
    products: {
        quantity: number;
        id: string;
        productId: string;
        forecastId: string;
        adBudgetOverride?: number | null | undefined;
    }[];
    expenses: {
        category: string;
        id: string;
        amount: number;
        description: string;
        forecastId: string;
    }[];
}>;
