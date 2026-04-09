import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ProductAnalytics, GlobalKpis } from '../types';
import { MAD, pct, formatDate } from './formatters';

export function exportAnalyticsPdf(
  analytics: ProductAnalytics[],
  kpis: GlobalKpis,
) {
  const doc = new jsPDF({ orientation: 'landscape' });
  const today = formatDate(new Date().toISOString());

  doc.setFontSize(20);
  doc.setTextColor(99, 102, 241);
  doc.text('KZA — Rapport Analytique', 14, 18);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Généré le : ${today}`, 14, 26);

  // Global KPIs summary
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text(`CA Total: ${MAD(kpis.totalRevenue)}   |   Profit Net: ${MAD(kpis.netProfit)}   |   Dépenses: ${MAD(kpis.totalExpenses)}   |   Marge: ${pct(kpis.grossMarginPct)}`, 14, 34);

  autoTable(doc, {
    startY: 42,
    head: [[
      'Produit', 'Unités', 'CA', 'Marge Brute', 'Pub', 'Profit Net', 'Marge %', 'ROI', 'CPA', 'Rotation', 'Classement',
    ]],
    body: analytics.map(a => [
      a.productName,
      a.totalUnitsSold,
      MAD(a.totalRevenue),
      MAD(a.grossProfit),
      MAD(a.totalAdSpend),
      MAD(a.netProfit),
      pct(a.netMarginPct),
      pct(a.roi),
      MAD(a.cpa),
      a.stockRotationDays === 9999 ? '∞' : `${a.stockRotationDays}j`,
      a.classification.toUpperCase(),
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [99, 102, 241], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 245, 255] },
    columnStyles: {
      6: { halign: 'right' },
      7: { halign: 'right' },
    },
  });

  doc.save(`kza-analytics-${new Date().toISOString().split('T')[0]}.pdf`);
}
