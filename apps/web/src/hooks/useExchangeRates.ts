import { useState, useEffect } from 'react';

const CACHE_KEY = 'kza_rates';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

interface RatesCache {
  ts: number;
  rates: Record<string, number>;
}

let promise: Promise<Record<string, number>> | null = null;
let cachedRates: Record<string, number> = (() => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached: RatesCache = JSON.parse(raw);
      if (Date.now() - cached.ts < CACHE_TTL) return cached.rates;
    }
  } catch { /* ignore */ }
  return {};
})();

const listeners = new Set<(rates: Record<string, number>) => void>();

async function fetchRates(): Promise<Record<string, number>> {
  const raw = localStorage.getItem(CACHE_KEY);
  if (raw) {
    try {
      const cached: RatesCache = JSON.parse(raw);
      if (Date.now() - cached.ts < CACHE_TTL) {
        cachedRates = cached.rates;
        return cached.rates;
      }
    } catch { /* stale */ }
  }

  if (!promise) {
    promise = fetch('https://open.er-api.com/v6/latest/USD')
      .then(r => r.json())
      .then((data: { rates: Record<string, number> }) => {
        const rates = data.rates ?? {};
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), rates }));
        promise = null;
        cachedRates = rates;
        listeners.forEach(cb => cb(rates));
        return rates;
      })
      .catch(() => {
        promise = null;
        return cachedRates;
      });
  }
  return promise;
}

// Preload on module init if not already cached
if (Object.keys(cachedRates).length === 0) {
  fetchRates();
}

export function useExchangeRates() {
  const [rates, setRates] = useState<Record<string, number>>(cachedRates);

  useEffect(() => {
    listeners.add(setRates);
    // If rates not loaded yet, trigger fetch
    if (Object.keys(cachedRates).length === 0) {
      fetchRates().then(r => setRates(r));
    }
    return () => { listeners.delete(setRates); };
  }, []);

  return {
    convert(amount: number, from: string, to: string): number {
      if (from === to) return amount;
      const fromRate = from === 'USD' ? 1 : (rates[from] ?? 1);
      const toRate = to === 'USD' ? 1 : (rates[to] ?? 1);
      return (amount / fromRate) * toRate;
    },
    rates,
  };
}
