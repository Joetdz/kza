export type AppCurrency = 'USD' | 'CDF';

const CURRENCY_CONFIG: Record<AppCurrency, { locale: string; currency: string }> = {
  USD: { locale: 'en-US', currency: 'USD' },
  CDF: { locale: 'fr-CD', currency: 'CDF' },
};

export const formatCurrency = (amount: number, curr: AppCurrency = 'USD'): string => {
  const { locale, currency } = CURRENCY_CONFIG[curr];
  const isWhole = Number.isInteger(amount);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

// Alias rétrocompatible
export const MAD = (amount: number): string => formatCurrency(amount, 'USD');

export const pct = (value: number, decimals = 1): string =>
  `${value >= 0 ? '' : ''}${value.toFixed(decimals)}%`;

export const fmt = (n: number): string =>
  new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(n);

export const formatDate = (dateStr: string): string => {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
};

export const formatDateShort = (dateStr: string): string => {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
};

export const CHANNEL_COLORS: Record<string, string> = {
  WhatsApp: '#25D366',
  'Meta Ads': '#1877F2',
  TikTok: '#69C9D0',
  Instagram: '#E1306C',
  Boutique: '#F59E0B',
  Autre: '#6B7280',
};

export const EXPENSE_LABELS: Record<string, string> = {
  pub: 'Publicité',
  transport: 'Transport',
  stock: 'Stock',
  other: 'Autres',
};

export const EXPENSE_COLORS: Record<string, string> = {
  pub: '#6366f1',
  transport: '#f59e0b',
  stock: '#10b981',
  other: '#6b7280',
};

export const CHART_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
];

export const CLASS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  scale:      { label: '🚀 À scaler',    color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  profitable: { label: '✅ Rentable',    color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200' },
  monitor:    { label: '👁 À surveiller', color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' },
  stop:       { label: '🛑 À arrêter',   color: 'text-red-700',     bg: 'bg-red-50 border-red-200' },
};

export const SALE_CHANNELS: SaleChannel[] = ['WhatsApp', 'Meta Ads', 'TikTok', 'Instagram', 'Boutique', 'Autre'];
import type { SaleChannel } from '../types';
