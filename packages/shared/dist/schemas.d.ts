import { z } from 'zod';
export declare const SALE_CHANNELS: readonly ["WhatsApp", "Meta Ads", "TikTok", "Instagram", "Boutique", "Autre"];
export declare const EXPENSE_CATEGORIES: readonly ["pub", "transport", "stock", "other"];
export declare const MOVEMENT_TYPES: readonly ["in", "out"];
export declare const SALE_STATUSES: readonly ["paid", "pending", "cancelled"];
export declare const KINSHASA_COMMUNES: readonly ["Bandalungwa", "Barumbu", "Bumbu", "Gombe", "Kalamu", "Kasa-Vubu", "Kimbanseke", "Kinshasa", "Kisenso", "Lemba", "Limete", "Lingwala", "Makala", "Maluku", "Masina", "Matete", "Mont-Ngafula", "Ndjili", "Ngaba", "Ngaliema", "Ngiri-Ngiri", "Nsele", "Selembao", "Kintambo"];
export declare const RDC_VILLES: readonly ["Lubumbashi", "Mbuji-Mayi", "Kananga", "Kisangani", "Bukavu", "Goma", "Kolwezi", "Likasi", "Boma", "Matadi", "Mbandaka", "Butembo", "Uvira", "Kalemie", "Mwene-Ditu", "Gandajika", "Kikwit", "Tshikapa", "Ilebo", "Bandundu", "Gemena", "Lisala", "Bumba", "Zongo"];
export declare const DELIVERY_ZONES: readonly [...string[], "Lubumbashi", "Mbuji-Mayi", "Kananga", "Kisangani", "Bukavu", "Goma", "Kolwezi", "Likasi", "Boma", "Matadi", "Mbandaka", "Butembo", "Uvira", "Kalemie", "Mwene-Ditu", "Gandajika", "Kikwit", "Tshikapa", "Ilebo", "Bandundu", "Gemena", "Lisala", "Bumba", "Zongo", "Autre ville"];
export type DeliveryZone = typeof DELIVERY_ZONES[number];
export declare const CreateProductSchema: z.ZodObject<{
    name: z.ZodString;
    sku: z.ZodString;
    category: z.ZodDefault<z.ZodString>;
    quantity: z.ZodNumber;
    alertThreshold: z.ZodNumber;
    supplier: z.ZodDefault<z.ZodString>;
    acquisitionCost: z.ZodNumber;
    sellingPrice: z.ZodDefault<z.ZodNumber>;
    imageUrl: z.ZodOptional<z.ZodString>;
    entryDate: z.ZodString;
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
    imageUrl?: string | undefined;
}, {
    name: string;
    sku: string;
    quantity: number;
    alertThreshold: number;
    acquisitionCost: number;
    entryDate: string;
    category?: string | undefined;
    supplier?: string | undefined;
    sellingPrice?: number | undefined;
    imageUrl?: string | undefined;
}>;
export declare const UpdateProductSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    sku: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    quantity: z.ZodOptional<z.ZodNumber>;
    alertThreshold: z.ZodOptional<z.ZodNumber>;
    supplier: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    acquisitionCost: z.ZodOptional<z.ZodNumber>;
    sellingPrice: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    imageUrl: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    entryDate: z.ZodOptional<z.ZodString>;
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
}>;
export declare const ProductSchema: z.ZodObject<{
    name: z.ZodString;
    sku: z.ZodString;
    category: z.ZodDefault<z.ZodString>;
    quantity: z.ZodNumber;
    alertThreshold: z.ZodNumber;
    supplier: z.ZodDefault<z.ZodString>;
    acquisitionCost: z.ZodNumber;
    sellingPrice: z.ZodDefault<z.ZodNumber>;
    imageUrl: z.ZodOptional<z.ZodString>;
    entryDate: z.ZodString;
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
    id: string;
    createdAt: string;
    updatedAt: string;
    imageUrl?: string | undefined;
}, {
    name: string;
    sku: string;
    quantity: number;
    alertThreshold: number;
    acquisitionCost: number;
    entryDate: string;
    id: string;
    createdAt: string;
    updatedAt: string;
    category?: string | undefined;
    supplier?: string | undefined;
    sellingPrice?: number | undefined;
    imageUrl?: string | undefined;
}>;
export declare const CreateMovementSchema: z.ZodObject<{
    productId: z.ZodString;
    type: z.ZodEnum<["in", "out"]>;
    quantity: z.ZodNumber;
    reason: z.ZodDefault<z.ZodString>;
    date: z.ZodString;
}, "strip", z.ZodTypeAny, {
    quantity: number;
    type: "in" | "out";
    productId: string;
    date: string;
    reason: string;
}, {
    quantity: number;
    type: "in" | "out";
    productId: string;
    date: string;
    reason?: string | undefined;
}>;
export declare const MovementSchema: z.ZodObject<{
    productId: z.ZodString;
    type: z.ZodEnum<["in", "out"]>;
    quantity: z.ZodNumber;
    reason: z.ZodDefault<z.ZodString>;
    date: z.ZodString;
} & {
    id: z.ZodString;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    quantity: number;
    type: "in" | "out";
    id: string;
    createdAt: string;
    productId: string;
    date: string;
    reason: string;
}, {
    quantity: number;
    type: "in" | "out";
    id: string;
    createdAt: string;
    productId: string;
    date: string;
    reason?: string | undefined;
}>;
export declare const SaleItemSchema: z.ZodObject<{
    productId: z.ZodString;
    quantity: z.ZodNumber;
    unitPrice: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    quantity: number;
    productId: string;
    unitPrice: number;
}, {
    quantity: number;
    productId: string;
    unitPrice: number;
}>;
export declare const CreateSaleSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        productId: z.ZodString;
        quantity: z.ZodNumber;
        unitPrice: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        quantity: number;
        productId: string;
        unitPrice: number;
    }, {
        quantity: number;
        productId: string;
        unitPrice: number;
    }>, "many">;
    channel: z.ZodEnum<["WhatsApp", "Meta Ads", "TikTok", "Instagram", "Boutique", "Autre"]>;
    date: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<["paid", "pending", "cancelled"]>>;
    deliveryZone: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "paid" | "pending" | "cancelled";
    date: string;
    items: {
        quantity: number;
        productId: string;
        unitPrice: number;
    }[];
    channel: "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique" | "Autre";
    note?: string | undefined;
    deliveryZone?: string | undefined;
}, {
    date: string;
    items: {
        quantity: number;
        productId: string;
        unitPrice: number;
    }[];
    channel: "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique" | "Autre";
    status?: "paid" | "pending" | "cancelled" | undefined;
    note?: string | undefined;
    deliveryZone?: string | undefined;
}>;
export declare const SaleSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        productId: z.ZodString;
        quantity: z.ZodNumber;
        unitPrice: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        quantity: number;
        productId: string;
        unitPrice: number;
    }, {
        quantity: number;
        productId: string;
        unitPrice: number;
    }>, "many">;
    channel: z.ZodEnum<["WhatsApp", "Meta Ads", "TikTok", "Instagram", "Boutique", "Autre"]>;
    date: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
} & {
    id: z.ZodString;
    status: z.ZodEnum<["paid", "pending", "cancelled"]>;
    deliveryZone: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "paid" | "pending" | "cancelled";
    id: string;
    createdAt: string;
    date: string;
    items: {
        quantity: number;
        productId: string;
        unitPrice: number;
    }[];
    channel: "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique" | "Autre";
    note?: string | undefined;
    deliveryZone?: string | undefined;
}, {
    status: "paid" | "pending" | "cancelled";
    id: string;
    createdAt: string;
    date: string;
    items: {
        quantity: number;
        productId: string;
        unitPrice: number;
    }[];
    channel: "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique" | "Autre";
    note?: string | undefined;
    deliveryZone?: string | undefined;
}>;
export declare const CreateExpenseSchema: z.ZodObject<{
    category: z.ZodEnum<["pub", "transport", "stock", "other"]>;
    productId: z.ZodOptional<z.ZodString>;
    channel: z.ZodOptional<z.ZodEnum<["WhatsApp", "Meta Ads", "TikTok", "Instagram", "Boutique", "Autre"]>>;
    amount: z.ZodNumber;
    description: z.ZodDefault<z.ZodString>;
    date: z.ZodString;
}, "strip", z.ZodTypeAny, {
    category: "pub" | "transport" | "stock" | "other";
    date: string;
    amount: number;
    description: string;
    productId?: string | undefined;
    channel?: "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique" | "Autre" | undefined;
}, {
    category: "pub" | "transport" | "stock" | "other";
    date: string;
    amount: number;
    productId?: string | undefined;
    channel?: "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique" | "Autre" | undefined;
    description?: string | undefined;
}>;
export declare const UpdateExpenseSchema: z.ZodObject<{
    category: z.ZodOptional<z.ZodEnum<["pub", "transport", "stock", "other"]>>;
    productId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    channel: z.ZodOptional<z.ZodOptional<z.ZodEnum<["WhatsApp", "Meta Ads", "TikTok", "Instagram", "Boutique", "Autre"]>>>;
    amount: z.ZodOptional<z.ZodNumber>;
    description: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    date: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    category?: "pub" | "transport" | "stock" | "other" | undefined;
    productId?: string | undefined;
    date?: string | undefined;
    channel?: "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique" | "Autre" | undefined;
    amount?: number | undefined;
    description?: string | undefined;
}, {
    category?: "pub" | "transport" | "stock" | "other" | undefined;
    productId?: string | undefined;
    date?: string | undefined;
    channel?: "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique" | "Autre" | undefined;
    amount?: number | undefined;
    description?: string | undefined;
}>;
export declare const ExpenseSchema: z.ZodObject<{
    category: z.ZodEnum<["pub", "transport", "stock", "other"]>;
    productId: z.ZodOptional<z.ZodString>;
    channel: z.ZodOptional<z.ZodEnum<["WhatsApp", "Meta Ads", "TikTok", "Instagram", "Boutique", "Autre"]>>;
    amount: z.ZodNumber;
    description: z.ZodDefault<z.ZodString>;
    date: z.ZodString;
} & {
    id: z.ZodString;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    category: "pub" | "transport" | "stock" | "other";
    id: string;
    createdAt: string;
    date: string;
    amount: number;
    description: string;
    productId?: string | undefined;
    channel?: "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique" | "Autre" | undefined;
}, {
    category: "pub" | "transport" | "stock" | "other";
    id: string;
    createdAt: string;
    date: string;
    amount: number;
    productId?: string | undefined;
    channel?: "WhatsApp" | "Meta Ads" | "TikTok" | "Instagram" | "Boutique" | "Autre" | undefined;
    description?: string | undefined;
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
