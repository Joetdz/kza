// ─── Devis & factures ────────────────────────────────────────────────────────
// Shared by the API, the editor and the PDF so the three always agree on amounts.

export interface PriceTier { minQty: number; unitPrice: number }

export interface DocumentLine {
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
}

export const DOCUMENT_TYPES = ['quote', 'invoice'] as const;
export type DocumentType = typeof DOCUMENT_TYPES[number];

export const QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'refused'] as const;
export const INVOICE_STATUSES = ['unpaid', 'paid', 'cancelled'] as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Unit price for a quantity: best volume tier reached, else the base price. */
export function tierPrice(basePrice: number, tiers: PriceTier[] | null | undefined, quantity: number): number {
  const reached = (tiers ?? [])
    .filter(t => t.minQty > 0 && t.unitPrice > 0 && quantity >= t.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0];
  return reached ? reached.unitPrice : basePrice;
}

export function documentTotals(doc: { items: DocumentLine[]; discount?: number; taxRate?: number }) {
  const subtotal = round2(doc.items.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
  const discount = Math.min(subtotal, Math.max(0, doc.discount ?? 0));
  const taxable = round2(subtotal - discount);
  const tax = round2(taxable * Math.max(0, doc.taxRate ?? 0) / 100);
  return { subtotal, discount, taxable, tax, total: round2(taxable + tax) };
}
