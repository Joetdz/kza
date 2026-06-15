import { useStore } from '../store/useStore';
import { useExchangeRates } from './useExchangeRates';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', EUR: '€', CDF: 'FC', XAF: 'FCFA', XOF: 'FCFA',
  RWF: 'RF', UGX: 'UGX', GNF: 'GF', MAD: 'MAD',
};

function fmtAmount(amount: number, currency: string): string {
  try {
    const isWhole = Number.isInteger(amount);
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
      minimumFractionDigits: isWhole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback if ISO code not recognized
    const sym = CURRENCY_SYMBOLS[currency] ?? currency;
    return `${sym} ${amount.toFixed(2)}`;
  }
}

export function useCurrency() {
  const { businesses, currentBusinessId, showInUsd } = useStore();
  const { convert } = useExchangeRates();

  const business = businesses.find(b => b.id === currentBusinessId);
  const bizCurrency = business?.currency ?? 'USD';

  const displayCurrency = showInUsd && bizCurrency !== 'USD' ? 'USD' : bizCurrency;

  return {
    currency: displayCurrency,
    bizCurrency,
    showInUsd,
    fmt: (amount: number) => {
      const converted = displayCurrency !== bizCurrency
        ? convert(amount, bizCurrency, 'USD')
        : amount;
      return fmtAmount(converted, displayCurrency);
    },
    convert: (amount: number) => displayCurrency !== bizCurrency
      ? convert(amount, bizCurrency, 'USD')
      : amount,
    symbol: CURRENCY_SYMBOLS[displayCurrency] ?? displayCurrency,
  };
}
