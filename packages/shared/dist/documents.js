"use strict";
// ─── Devis & factures ────────────────────────────────────────────────────────
// Shared by the API, the editor and the PDF so the three always agree on amounts.
Object.defineProperty(exports, "__esModule", { value: true });
exports.INVOICE_STATUSES = exports.QUOTE_STATUSES = exports.DOCUMENT_TYPES = void 0;
exports.tierPrice = tierPrice;
exports.documentTotals = documentTotals;
exports.DOCUMENT_TYPES = ['quote', 'invoice'];
exports.QUOTE_STATUSES = ['draft', 'sent', 'accepted', 'refused'];
exports.INVOICE_STATUSES = ['unpaid', 'paid', 'cancelled'];
const round2 = (n) => Math.round(n * 100) / 100;
/** Unit price for a quantity: best volume tier reached, else the base price. */
function tierPrice(basePrice, tiers, quantity) {
    const reached = (tiers ?? [])
        .filter(t => t.minQty > 0 && t.unitPrice > 0 && quantity >= t.minQty)
        .sort((a, b) => b.minQty - a.minQty)[0];
    return reached ? reached.unitPrice : basePrice;
}
function documentTotals(doc) {
    const subtotal = round2(doc.items.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
    const discount = Math.min(subtotal, Math.max(0, doc.discount ?? 0));
    const taxable = round2(subtotal - discount);
    const tax = round2(taxable * Math.max(0, doc.taxRate ?? 0) / 100);
    return { subtotal, discount, taxable, tax, total: round2(taxable + tax) };
}
