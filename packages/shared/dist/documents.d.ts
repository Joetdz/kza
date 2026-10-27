export interface PriceTier {
    minQty: number;
    unitPrice: number;
}
export interface DocumentLine {
    productId?: string | null;
    description: string;
    quantity: number;
    unitPrice: number;
}
export declare const DOCUMENT_TYPES: readonly ["quote", "invoice"];
export type DocumentType = typeof DOCUMENT_TYPES[number];
export declare const QUOTE_STATUSES: readonly ["draft", "sent", "accepted", "refused"];
export declare const INVOICE_STATUSES: readonly ["unpaid", "paid", "cancelled"];
/** Unit price for a quantity: best volume tier reached, else the base price. */
export declare function tierPrice(basePrice: number, tiers: PriceTier[] | null | undefined, quantity: number): number;
export declare function documentTotals(doc: {
    items: DocumentLine[];
    discount?: number;
    taxRate?: number;
}): {
    subtotal: number;
    discount: number;
    taxable: number;
    tax: number;
    total: number;
};
