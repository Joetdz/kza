import { useStore } from '../store/useStore';
import { formatCurrency } from '../utils/formatters';

export function useCurrency() {
  const currency = useStore(s => s.currency);
  return {
    currency,
    fmt: (amount: number) => formatCurrency(amount, currency),
    symbol: currency === 'USD' ? '$' : 'FC',
  };
}
