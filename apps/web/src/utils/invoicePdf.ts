import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Sale, Product } from '../types';

export interface InvoiceBusiness {
  name: string;
  city?: string;
  phone?: string;
  currency: string;
  logoUrl?: string;
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString('fr-FR')} ${currency}`;
  }
}

async function loadImageBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function buildDoc(sale: Sale, products: Product[], business?: InvoiceBusiness): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const shortId = sale.id.slice(0, 8).toUpperCase();
  const indigo: [number, number, number] = [99, 102, 241];
  const currency = business?.currency ?? 'USD';

  // En-tête colorée
  doc.setFillColor(...indigo);
  doc.rect(0, 0, 210, 32, 'F');
  doc.setTextColor(255, 255, 255);

  // Logo (si disponible)
  let logoLoaded = false;
  if (business?.logoUrl) {
    const b64 = await loadImageBase64(business.logoUrl);
    if (b64) {
      try {
        const ext = business.logoUrl.split('.').pop()?.toUpperCase() ?? 'JPEG';
        const fmt = (ext === 'PNG' ? 'PNG' : 'JPEG') as 'PNG' | 'JPEG';
        doc.addImage(b64, fmt, 14, 5, 22, 22);
        logoLoaded = true;
      } catch { /* logo invalide */ }
    }
  }

  const textX = logoLoaded ? 40 : 14;

  // Nom du business
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(business?.name ?? 'Mon Business', textX, 13);

  // Ville + téléphone
  if (business?.city || business?.phone) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const sub = [business?.city, business?.phone].filter(Boolean).join('  ·  ');
    doc.text(sub, textX, 20);
  }

  // FACTURE label + infos droite
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('FACTURE', 196, 10, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`N° : ${shortId}`, 196, 16, { align: 'right' });
  doc.text(`Date : ${String(sale.date).slice(0, 10)}`, 196, 21, { align: 'right' });
  doc.text(`Canal : ${sale.channel}`, 196, 26, { align: 'right' });

  doc.setTextColor(30, 30, 30);

  let y = 42;

  // Bloc client
  if (sale.customerName || sale.customerPhone) {
    const hasPhone = !!(sale.customerName && sale.customerPhone);
    doc.setFillColor(245, 245, 255);
    doc.roundedRect(14, y, 182, hasPhone ? 18 : 12, 3, 3, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 120);
    doc.text('CLIENT', 18, y + 5);
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    if (sale.customerName) {
      doc.text(sale.customerName, 18, y + 11);
      if (sale.customerPhone) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(sale.customerPhone, 18, y + 17);
        y += 24;
      } else {
        y += 18;
      }
    } else if (sale.customerPhone) {
      doc.text(sale.customerPhone, 18, y + 11);
      y += 18;
    }
    doc.setFont('helvetica', 'normal');
  }

  y += 4;

  // Tableau articles
  const rows = sale.items.map(item => {
    const prod = products.find(p => p.id === item.productId);
    const lineTotal = item.quantity * item.unitPrice;
    return [
      prod?.name ?? 'Produit inconnu',
      String(item.quantity),
      formatMoney(item.unitPrice, currency),
      formatMoney(lineTotal, currency),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [['Produit', 'Qté', 'Prix unitaire', 'Total']],
    body: rows,
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

  const finalY = (doc as any).lastAutoTable.finalY + 8;
  const total = sale.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  // Total
  doc.setFillColor(...indigo);
  doc.rect(120, finalY - 2, 76, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('TOTAL', 124, finalY + 5);
  doc.text(formatMoney(total, currency), 192, finalY + 5, { align: 'right' });

  // Statut + zone livraison
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const statusLabel = sale.status === 'paid' ? 'Payé' : sale.status === 'pending' ? 'En attente' : 'Annulé';
  doc.text(`Statut : ${statusLabel}`, 14, finalY + 5);
  if (sale.deliveryZone) {
    doc.text(`Zone de livraison : ${sale.deliveryZone}`, 14, finalY + 11);
  }

  // Pied de page
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('Généré par KZA Manager · kzamanager.com', 105, 285, { align: 'center' });

  return doc;
}

export async function downloadInvoice(sale: Sale, products: Product[], business?: InvoiceBusiness) {
  const shortId = sale.id.slice(0, 8).toUpperCase();
  const doc = await buildDoc(sale, products, business);
  doc.save(`Facture-${shortId}.pdf`);
}

export async function getInvoiceBase64(sale: Sale, products: Product[], business?: InvoiceBusiness): Promise<string> {
  const doc = await buildDoc(sale, products, business);
  const output = doc.output('datauristring') as string;
  return output.split(',')[1];
}
