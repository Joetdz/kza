import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { compactCount, QuickOrder } from '@web/pages/PublicStore';
import { ikeleApi, type SearchResults } from '../api';
import { MediaThumb, StoreAvatar } from '../components/MediaThumb';

const SEARCH_DELAY_MS = 350;

// Products and stores across the whole of Ikele.
export function SearchPage() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ordering, setOrdering] = useState<{ slug: string; productId: string } | null>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) { setResults(null); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      ikeleApi.search(query)
        .then(r => { setResults(r); setError(null); })
        .catch(e => setError((e as Error).message))
        .finally(() => setSearching(false));
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [q]);

  const empty = results && results.products.length === 0 && results.stores.length === 0;

  return (
    <div className="min-h-screen bg-white pb-tabbar">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-md mx-auto px-4 py-3">
          <label className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5">
            <Search size={16} className="text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Un produit, une boutique…" autoFocus
              className="flex-1 bg-transparent text-sm outline-none" />
            {searching && <Loader2 size={15} className="animate-spin text-gray-400" />}
          </label>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-4 space-y-6">
        {!results && !error && <p className="text-sm text-gray-400 text-center py-12">Cherche parmi toutes les boutiques d'Ikele.</p>}
        {error && <p className="text-sm text-red-600 text-center py-6">{error}</p>}
        {empty && <p className="text-sm text-gray-400 text-center py-12">Aucun résultat pour « {q.trim()} ».</p>}

        {results && results.stores.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-gray-900 mb-2">Boutiques</h2>
            <div className="space-y-2">
              {results.stores.map(s => (
                <a key={s.slug} href={`#/@${s.slug}`} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50">
                  <StoreAvatar store={s} size={44} />
                  <span className="min-w-0">
                    <span className="block font-semibold text-gray-900 text-sm truncate">{s.name}</span>
                    <span className="block text-xs text-gray-500">{compactCount(s.followers)} abonnés · {s.products} produits</span>
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        {results && results.products.length > 0 && (
          <section>
            <h2 className="text-sm font-bold text-gray-900 mb-2">Produits</h2>
            <div className="grid grid-cols-2 gap-3">
              {results.products.map(p => (
                <button key={`${p.store.slug}-${p.id}`} onClick={() => setOrdering({ slug: p.store.slug, productId: p.id })}
                  className="rounded-xl overflow-hidden border border-gray-100 text-left">
                  <span className="block aspect-square bg-neutral-100">
                    <MediaThumb media={p.media ?? (p.imageUrl ? { url: p.imageUrl, type: 'image' } : null)} alt={p.name} />
                  </span>
                  <span className="block p-2">
                    <span className="block text-sm font-semibold text-gray-900 line-clamp-1">{p.name}</span>
                    <span className="block text-sm font-black" style={{ color: p.store.primaryColor }}>
                      {p.price.toLocaleString('fr-FR')} {p.store.currency}
                    </span>
                    <span className="block text-[11px] text-gray-400 truncate">{p.store.name}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </main>

      {ordering && <QuickOrder slug={ordering.slug} productId={ordering.productId} onClose={() => setOrdering(null)} />}
    </div>
  );
}
