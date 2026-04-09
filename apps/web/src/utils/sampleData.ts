import { v4 as uuid } from 'uuid';
import type { Product, Sale, Expense, SalesGoal, StockMovement, SaleChannel } from '../types';
import { format, subDays } from 'date-fns';

const now = new Date();
const d = (daysAgo: number) => format(subDays(now, daysAgo), 'yyyy-MM-dd');

// Fixed IDs so references stay consistent
const p1 = 'prod-af1';
const p2 = 'prod-jd1';
const p3 = 'prod-sac';
const p4 = 'prod-ss';
const p5 = 'prod-cein';
const p6 = 'prod-lun';
const p7 = 'prod-gshk';
const p8 = 'prod-oud';

export const sampleProducts: Product[] = [
  { id: p1, name: 'Nike Air Force 1', sku: 'KZA-001', category: 'Chaussures',
    quantity: 45, alertThreshold: 10, supplier: 'Nike Maroc',
    acquisitionCost: 350, sellingPrice: 580, entryDate: d(90), createdAt: d(90), updatedAt: d(5) },
  { id: p2, name: 'Jordan 1 Retro High', sku: 'KZA-002', category: 'Chaussures',
    quantity: 12, alertThreshold: 5, supplier: 'Jordan Distribution',
    acquisitionCost: 650, sellingPrice: 1100, entryDate: d(80), createdAt: d(80), updatedAt: d(2) },
  { id: p3, name: 'Sac Cuir Argan', sku: 'KZA-003', category: 'Maroquinerie',
    quantity: 8, alertThreshold: 3, supplier: 'Artisan Fès',
    acquisitionCost: 280, sellingPrice: 550, entryDate: d(75), createdAt: d(75), updatedAt: d(7) },
  { id: p4, name: 'Adidas Stan Smith', sku: 'KZA-004', category: 'Chaussures',
    quantity: 3, alertThreshold: 5, supplier: 'Adidas Maroc',
    acquisitionCost: 290, sellingPrice: 480, entryDate: d(60), createdAt: d(60), updatedAt: d(1) },
  { id: p5, name: 'Ceinture Cuir Artisan', sku: 'KZA-005', category: 'Maroquinerie',
    quantity: 25, alertThreshold: 5, supplier: 'Artisan Marrakech',
    acquisitionCost: 80, sellingPrice: 150, entryDate: d(70), createdAt: d(70), updatedAt: d(10) },
  { id: p6, name: 'Lunettes Oversize', sku: 'KZA-006', category: 'Accessoires',
    quantity: 50, alertThreshold: 10, supplier: 'Import Dubai',
    acquisitionCost: 45, sellingPrice: 95, entryDate: d(55), createdAt: d(55), updatedAt: d(3) },
  { id: p7, name: 'Montre Casio G-Shock', sku: 'KZA-007', category: 'Accessoires',
    quantity: 15, alertThreshold: 3, supplier: 'Casio Distributeur',
    acquisitionCost: 450, sellingPrice: 750, entryDate: d(65), createdAt: d(65), updatedAt: d(4) },
  { id: p8, name: 'Parfum Oud Royal', sku: 'KZA-008', category: 'Beauté',
    quantity: 7, alertThreshold: 5, supplier: 'Oud Palace',
    acquisitionCost: 180, sellingPrice: 280, entryDate: d(50), createdAt: d(50), updatedAt: d(6) },
];

function sale(
  daysAgo: number,
  channel: SaleChannel,
  items: Array<{ pid: string; qty: number; price: number }>,
): Sale {
  return {
    id: uuid(), channel, date: d(daysAgo), createdAt: d(daysAgo), status: 'paid',
    items: items.map(i => ({ productId: i.pid, quantity: i.qty, unitPrice: i.price })),
  };
}

export const sampleSales: Sale[] = [
  // Nike AF1 — popular, good margin
  sale(1,  'WhatsApp', [{ pid: p1, qty: 2, price: 580 }]),
  sale(2,  'Meta Ads', [{ pid: p1, qty: 1, price: 580 }]),
  sale(3,  'TikTok',   [{ pid: p1, qty: 3, price: 580 }]),
  sale(4,  'Instagram',[{ pid: p1, qty: 1, price: 580 }]),
  sale(5,  'WhatsApp', [{ pid: p1, qty: 2, price: 580 }]),
  sale(7,  'Meta Ads', [{ pid: p1, qty: 2, price: 580 }]),
  sale(10, 'TikTok',   [{ pid: p1, qty: 1, price: 580 }]),
  sale(12, 'WhatsApp', [{ pid: p1, qty: 2, price: 580 }]),
  sale(14, 'Boutique', [{ pid: p1, qty: 3, price: 560 }]),
  sale(16, 'Meta Ads', [{ pid: p1, qty: 1, price: 580 }]),
  sale(18, 'WhatsApp', [{ pid: p1, qty: 2, price: 580 }]),
  sale(20, 'TikTok',   [{ pid: p1, qty: 2, price: 580 }]),
  sale(22, 'Instagram',[{ pid: p1, qty: 1, price: 580 }]),
  sale(25, 'WhatsApp', [{ pid: p1, qty: 3, price: 560 }]),
  sale(28, 'Meta Ads', [{ pid: p1, qty: 2, price: 580 }]),
  sale(30, 'Boutique', [{ pid: p1, qty: 4, price: 560 }]),
  // Jordan 1 — premium
  sale(2,  'Meta Ads', [{ pid: p2, qty: 1, price: 1100 }]),
  sale(6,  'Instagram',[{ pid: p2, qty: 1, price: 1100 }]),
  sale(10, 'WhatsApp', [{ pid: p2, qty: 1, price: 1100 }]),
  sale(15, 'TikTok',   [{ pid: p2, qty: 2, price: 1100 }]),
  sale(20, 'Meta Ads', [{ pid: p2, qty: 1, price: 1100 }]),
  sale(25, 'Instagram',[{ pid: p2, qty: 1, price: 1100 }]),
  sale(30, 'WhatsApp', [{ pid: p2, qty: 1, price: 1100 }]),
  // Sac Cuir
  sale(3,  'TikTok',   [{ pid: p3, qty: 1, price: 550 }]),
  sale(8,  'WhatsApp', [{ pid: p3, qty: 2, price: 550 }]),
  sale(14, 'Meta Ads', [{ pid: p3, qty: 1, price: 550 }]),
  sale(20, 'Instagram',[{ pid: p3, qty: 1, price: 540 }]),
  sale(27, 'WhatsApp', [{ pid: p3, qty: 2, price: 550 }]),
  // Stan Smith — slow
  sale(5,  'Boutique', [{ pid: p4, qty: 1, price: 480 }]),
  sale(15, 'WhatsApp', [{ pid: p4, qty: 1, price: 480 }]),
  sale(28, 'Meta Ads', [{ pid: p4, qty: 1, price: 480 }]),
  // Ceinture — high volume
  sale(1,  'TikTok',   [{ pid: p5, qty: 5, price: 150 }]),
  sale(3,  'WhatsApp', [{ pid: p5, qty: 3, price: 150 }]),
  sale(5,  'Meta Ads', [{ pid: p5, qty: 4, price: 150 }]),
  sale(8,  'TikTok',   [{ pid: p5, qty: 6, price: 150 }]),
  sale(11, 'Instagram',[{ pid: p5, qty: 3, price: 150 }]),
  sale(14, 'WhatsApp', [{ pid: p5, qty: 5, price: 150 }]),
  sale(18, 'TikTok',   [{ pid: p5, qty: 4, price: 150 }]),
  sale(22, 'Meta Ads', [{ pid: p5, qty: 3, price: 150 }]),
  sale(26, 'WhatsApp', [{ pid: p5, qty: 5, price: 150 }]),
  // Lunettes — high volume TikTok
  sale(1,  'TikTok',   [{ pid: p6, qty: 8,  price: 95 }]),
  sale(2,  'Meta Ads', [{ pid: p6, qty: 5,  price: 95 }]),
  sale(4,  'TikTok',   [{ pid: p6, qty: 10, price: 95 }]),
  sale(6,  'Instagram',[{ pid: p6, qty: 6,  price: 95 }]),
  sale(8,  'TikTok',   [{ pid: p6, qty: 12, price: 95 }]),
  sale(10, 'Meta Ads', [{ pid: p6, qty: 7,  price: 95 }]),
  sale(13, 'TikTok',   [{ pid: p6, qty: 9,  price: 95 }]),
  sale(16, 'Instagram',[{ pid: p6, qty: 5,  price: 95 }]),
  sale(20, 'TikTok',   [{ pid: p6, qty: 8,  price: 95 }]),
  sale(25, 'Meta Ads', [{ pid: p6, qty: 6,  price: 95 }]),
  // G-Shock
  sale(4,  'WhatsApp', [{ pid: p7, qty: 1, price: 750 }]),
  sale(9,  'Meta Ads', [{ pid: p7, qty: 2, price: 750 }]),
  sale(14, 'Boutique', [{ pid: p7, qty: 1, price: 750 }]),
  sale(19, 'WhatsApp', [{ pid: p7, qty: 1, price: 750 }]),
  sale(24, 'Instagram',[{ pid: p7, qty: 1, price: 750 }]),
  // Parfum Oud — bad ROI
  sale(2,  'TikTok',   [{ pid: p8, qty: 2, price: 280 }]),
  sale(8,  'Meta Ads', [{ pid: p8, qty: 1, price: 280 }]),
  sale(15, 'TikTok',   [{ pid: p8, qty: 3, price: 280 }]),
  sale(22, 'Instagram',[{ pid: p8, qty: 1, price: 280 }]),
  sale(29, 'WhatsApp', [{ pid: p8, qty: 2, price: 280 }]),
  // Multi-product orders
  sale(1, 'WhatsApp',  [{ pid: p1, qty: 1, price: 580 }, { pid: p5, qty: 2, price: 150 }]),
  sale(3, 'Meta Ads',  [{ pid: p6, qty: 4, price: 95 },  { pid: p5, qty: 3, price: 150 }]),
  sale(7, 'Instagram', [{ pid: p2, qty: 1, price: 1100 },{ pid: p7, qty: 1, price: 750 }]),
];

export const sampleExpenses: Expense[] = [
  // Pub Nike AF1
  { id: uuid(), category: 'pub', productId: p1, channel: 'Meta Ads', amount: 800,  description: 'Campagne Nike AF1 Meta',  date: d(30), createdAt: d(30) },
  { id: uuid(), category: 'pub', productId: p1, channel: 'Meta Ads', amount: 650,  description: 'Retargeting Nike AF1',     date: d(15), createdAt: d(15) },
  { id: uuid(), category: 'pub', productId: p1, channel: 'TikTok',   amount: 500,  description: 'TikTok Ads Nike AF1',      date: d(20), createdAt: d(20) },
  // Pub Jordan 1
  { id: uuid(), category: 'pub', productId: p2, channel: 'Meta Ads', amount: 1200, description: 'Campagne Jordan 1 Meta',   date: d(25), createdAt: d(25) },
  { id: uuid(), category: 'pub', productId: p2, channel: 'Instagram', amount: 800, description: 'Instagram Ads Jordan',      date: d(10), createdAt: d(10) },
  // Pub Lunettes — heavy spend
  { id: uuid(), category: 'pub', productId: p6, channel: 'TikTok',   amount: 900,  description: 'TikTok Lunettes vague 1',  date: d(28), createdAt: d(28) },
  { id: uuid(), category: 'pub', productId: p6, channel: 'TikTok',   amount: 1100, description: 'TikTok Lunettes vague 2',  date: d(14), createdAt: d(14) },
  { id: uuid(), category: 'pub', productId: p6, channel: 'Meta Ads', amount: 600,  description: 'Meta Ads Lunettes',         date: d(7),  createdAt: d(7)  },
  // Pub Parfum Oud — trop élevé
  { id: uuid(), category: 'pub', productId: p8, channel: 'TikTok',   amount: 1500, description: 'TikTok Parfum Oud',         date: d(25), createdAt: d(25) },
  { id: uuid(), category: 'pub', productId: p8, channel: 'Meta Ads', amount: 900,  description: 'Meta Ads Parfum',           date: d(12), createdAt: d(12) },
  // Pub Ceinture
  { id: uuid(), category: 'pub', productId: p5, channel: 'TikTok',   amount: 400,  description: 'TikTok Ceintures',          date: d(20), createdAt: d(20) },
  // Transport
  { id: uuid(), category: 'transport', amount: 350, description: 'Livraisons Casablanca',        date: d(15), createdAt: d(15) },
  { id: uuid(), category: 'transport', amount: 280, description: 'Livraisons Marrakech',         date: d(8),  createdAt: d(8)  },
  { id: uuid(), category: 'transport', amount: 420, description: 'Transport marchandise entrepôt', date: d(25), createdAt: d(25) },
  // Stock
  { id: uuid(), category: 'stock', productId: p4, amount: 1200, description: 'Réapprovisionnement Stan Smith', date: d(60), createdAt: d(60) },
  { id: uuid(), category: 'stock', productId: p3, amount: 840,  description: 'Achat sacs cuir artisan Fès',   date: d(70), createdAt: d(70) },
  // Autres
  { id: uuid(), category: 'other', amount: 500, description: 'Matériel packaging',  date: d(30), createdAt: d(30) },
  { id: uuid(), category: 'other', amount: 200, description: 'Abonnement logiciel', date: d(30), createdAt: d(30) },
  { id: uuid(), category: 'other', amount: 300, description: 'Frais bancaires',     date: d(15), createdAt: d(15) },
];

export const sampleGoals: SalesGoal[] = [
  { id: uuid(), productId: 'all', targetQty: 200, createdAt: d(30) },
  { id: uuid(), productId: p1,   targetQty: 60,  createdAt: d(30) },
  { id: uuid(), productId: p2,   targetQty: 20,  createdAt: d(30) },
  { id: uuid(), productId: p5,   targetQty: 120, createdAt: d(30) },
  { id: uuid(), productId: p6,   targetQty: 150, createdAt: d(30) },
  { id: uuid(), productId: p7,   targetQty: 25,  createdAt: d(30) },
];

export const sampleMovements: StockMovement[] = [
  { id: uuid(), productId: p1, type: 'in', quantity: 80,  reason: 'Stock initial', date: d(90), createdAt: d(90) },
  { id: uuid(), productId: p2, type: 'in', quantity: 25,  reason: 'Stock initial', date: d(80), createdAt: d(80) },
  { id: uuid(), productId: p3, type: 'in', quantity: 20,  reason: 'Stock initial', date: d(75), createdAt: d(75) },
  { id: uuid(), productId: p4, type: 'in', quantity: 15,  reason: 'Stock initial', date: d(60), createdAt: d(60) },
  { id: uuid(), productId: p5, type: 'in', quantity: 100, reason: 'Stock initial', date: d(70), createdAt: d(70) },
  { id: uuid(), productId: p6, type: 'in', quantity: 150, reason: 'Stock initial', date: d(55), createdAt: d(55) },
  { id: uuid(), productId: p7, type: 'in', quantity: 30,  reason: 'Stock initial', date: d(65), createdAt: d(65) },
  { id: uuid(), productId: p8, type: 'in', quantity: 25,  reason: 'Stock initial', date: d(50), createdAt: d(50) },
];
