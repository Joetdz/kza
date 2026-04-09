import * as XLSX from 'xlsx';
import type { Product, Sale, Expense, ProductAnalytics } from '../types';
import { formatDate, EXPENSE_LABELS } from './formatters';

export function exportToExcel(
  products: Product[],
  sales: Sale[],
  expenses: Expense[],
  analytics: ProductAnalytics[],
) {
  const wb = XLSX.utils.book_new();

  // Sheet: Produits
  const wsProducts = XLSX.utils.json_to_sheet(products.map(p => ({
    'Nom': p.name,
    'SKU': p.sku,
    'Catégorie': p.category,
    'Stock actuel': p.quantity,
    'Seuil alerte': p.alertThreshold,
    'Fournisseur': p.supplier,
    'Coût achat (MAD)': p.acquisitionCost,
    'Date entrée': formatDate(p.entryDate),
  })));
  XLSX.utils.book_append_sheet(wb, wsProducts, 'Produits');

  // Sheet: Ventes
  const salesRows = sales.flatMap(s =>
    s.items.map(item => {
      const product = products.find(p => p.id === item.productId);
      return {
        'Date': formatDate(s.date),
        'Canal': s.channel,
        'Produit': product?.name ?? item.productId,
        'Quantité': item.quantity,
        'Prix unitaire (MAD)': item.unitPrice,
        'Total (MAD)': item.quantity * item.unitPrice,
      };
    })
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesRows), 'Ventes');

  // Sheet: Dépenses
  const expRows = expenses.map(e => {
    const product = products.find(p => p.id === e.productId);
    return {
      'Date': formatDate(e.date),
      'Catégorie': EXPENSE_LABELS[e.category] ?? e.category,
      'Produit lié': product?.name ?? '-',
      'Canal': e.channel ?? '-',
      'Montant (MAD)': e.amount,
      'Description': e.description,
    };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expRows), 'Dépenses');

  // Sheet: Analytique
  const anaRows = analytics.map(a => ({
    'Produit': a.productName,
    'Unités vendues': a.totalUnitsSold,
    'CA (MAD)': Math.round(a.totalRevenue),
    'Prix moy. vente': Math.round(a.avgSalePrice),
    'COGS (MAD)': Math.round(a.totalCOGS),
    'Marge brute (MAD)': Math.round(a.grossProfit),
    'Marge brute %': `${a.grossMarginPct.toFixed(1)}%`,
    'Dép. pub (MAD)': Math.round(a.totalAdSpend),
    'Profit net (MAD)': Math.round(a.netProfit),
    'Marge nette %': `${a.netMarginPct.toFixed(1)}%`,
    'CPA (MAD)': Math.round(a.cpa),
    'ROI %': `${a.roi.toFixed(1)}%`,
    'Stock actuel': a.currentStock,
    'Rotation (jours)': a.stockRotationDays === 9999 ? 'Stock mort' : a.stockRotationDays,
    'Classement': a.classification,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(anaRows), 'Analytique');

  XLSX.writeFile(wb, `kza-export-${new Date().toISOString().split('T')[0]}.xlsx`);
}
