import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { documentTotals } from '@kza/shared';
import type { CommercialDocument } from '../api/documents';
import { formatMoney, loadImageBase64, type InvoiceBusiness } from './invoicePdf';

const fmtDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// Same look as the sale invoice (utils/invoicePdf.ts): indigo band, client block,
// lines table — plus discount, tax, due/validity date and notes.
async function buildDoc(d: CommercialDocument, business?: InvoiceBusiness): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const indigo: [number, number, number] = [99, 102, 241];
  const currency = business?.currency ?? 'USD';
  const money = (n: number) => formatMoney(n, currency);
  const isQuote = d.type === 'quote';

  doc.setFillColor(...indigo);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setTextColor(255, 255, 255);

  let logoLoaded = false;
  if (business?.logoUrl) {
    const b64 = await loadImageBase64(business.logoUrl);
    if (b64) {
      try {
        const fmt = business.logoUrl.toLowerCase().endsWith('.png') ? 'PNG' : 'JPEG';
        doc.addImage(b64, fmt, 14, 5, 22, 22);
        logoLoaded = true;
      } catch { /* logo invalide */ }
    }
  }
  const textX = logoLoaded ? 40 : 14;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(business?.name ?? 'Mon Business', textX, 13);
  if (business?.city || business?.phone) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text([business?.city, business?.phone].filter(Boolean).join('  ·  '), textX, 20);
  }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(isQuote ? 'DEVIS' : 'FACTURE', 196, 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`N° : ${d.number}`, 196, 16, { align: 'right' });
  doc.text(`Date : ${fmtDate(d.issueDate)}`, 196, 21, { align: 'right' });
  if (d.dueDate) doc.text(`${isQuote ? 'Valable jusqu\'au' : 'À payer avant le'} : ${fmtDate(d.dueDate)}`, 196, 26, { align: 'right' });

  doc.setTextColor(30, 30, 30);
  let y = 42;

  // Client
  const clientLines = [d.customerPhone, d.customerAddress].filter(Boolean) as string[];
  const blockH = 12 + clientLines.length * 5;
  doc.setFillColor(245, 245, 255);
  doc.roundedRect(14, y, 182, blockH, 3, 3, 'F');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 120);
  doc.text('CLIENT', 18, y + 5);
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(d.customerName, 18, y + 11);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  clientLines.forEach((line, i) => doc.text(line, 18, y + 16 + i * 5));
  y += blockH + 6;

  autoTable(doc, {
    startY: y,
    head: [['Désignation', 'Qté', 'Prix unitaire', 'Total']],
    body: d.items.map(l => [l.description, String(l.quantity), money(l.unitPrice), money(l.quantity * l.unitPrice)]),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: indigo, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 255] },
    columnStyles: {
      0: { cellWidth: 80 },
      1: { halign: 'center', cellWidth: 20 },
      2: { halign: 'right', cellWidth: 45 },
      3: { halign: 'right', cellWidth: 45 },
    },
  });

  // Totals
  const t = documentTotals(d);
  let ty = (doc as any).lastAutoTable.finalY + 8;
  const line = (label: string, value: string) => {
    doc.setFontSize(9);
    doc.text(label, 124, ty);
    doc.text(value, 192, ty, { align: 'right' });
    ty += 6;
  };
  if (t.discount > 0 || t.tax > 0) line('Sous-total', money(t.subtotal));
  if (t.discount > 0) line('Remise', `- ${money(t.discount)}`);
  if (t.tax > 0) line(`TVA (${d.taxRate} %)`, money(t.tax));
  doc.setFillColor(...indigo);
  doc.rect(120, ty - 2, 76, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(isQuote ? 'TOTAL' : 'TOTAL À PAYER', 124, ty + 5);
  doc.text(money(t.total), 192, ty + 5, { align: 'right' });

  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal');
  if (d.notes) {
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(d.notes, 100), 14, (doc as any).lastAutoTable.finalY + 8);
  }

  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('Généré par KZA Manager · kzamanager.com', 105, 285, { align: 'center' });
  return doc;
}

export async function downloadDocument(d: CommercialDocument, business?: InvoiceBusiness) {
  (await buildDoc(d, business)).save(`${d.number}.pdf`);
}

export async function getDocumentBase64(d: CommercialDocument, business?: InvoiceBusiness): Promise<string> {
  const out = (await buildDoc(d, business)).output('datauristring') as string;
  return out.split(',')[1];
}
