import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { compactCount } from '@web/pages/PublicStore';
import { ikeleApi, type StoreCard } from '../api';
import { MediaThumb, StoreAvatar } from '../components/MediaThumb';

/** Typing pauses this long before the list is asked again. */
const SEARCH_DELAY_MS = 350;

// Every store on Ikele: a few of its reels as a cover, its numbers, a follow button.
export function Stores() {
  const [stores, setStores] = useState<StoreCard[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { ikeleApi.categories().then(setCategories).catch(() => {}); }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      ikeleApi.stores(q.trim(), category)
        .then(list => { setStores(list); setError(null); })
        .catch(e => setError((e as Error).message));
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [q, category]);

  const follow = (store: StoreCard) => {
    const following = !store.following;
    const apply = (value: boolean, followers: number) =>
      setStores(list => list?.map(s => s.slug === store.slug ? { ...s, following: value, followers } : s) ?? null);
    apply(following, Math.max(0, store.followers + (following ? 1 : -1)));
    ikeleApi.follow(store.slug, following)
      .then(res => apply(res.following, res.followers))
      .catch(() => apply(store.following, store.followers));
  };

  return (
    <div className="min-h-screen bg-white pb-tabbar">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100">
        <div className="max-w-md mx-auto px-4 pt-4 pb-3 space-y-3">
          <h1 className="text-xl font-black text-gray-900">Boutiques</h1>
          <label className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5">
            <Search size={16} className="text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher une boutique"
              className="flex-1 bg-transparent text-sm outline-none" />
          </label>
          {categories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4">
              {['', ...categories].map(c => (
                <button key={c || 'all'} onClick={() => setCategory(c)} aria-pressed={category === c}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold ${category === c ? 'bg-black text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {c || 'Toutes'}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-4 space-y-4">
        {error && <p className="text-sm text-red-600 text-center py-6">{error}</p>}
        {!stores && !error && <Loader2 size={26} className="animate-spin text-gray-300 mx-auto my-16" />}
        {stores?.length === 0 && <p className="text-sm text-gray-400 text-center py-12">Aucune boutique trouvée.</p>}
        {stores?.map(s => (
          <article key={s.slug} className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <a href={`#/@${s.slug}`} className="grid grid-cols-3 gap-0.5 bg-neutral-900">
              {[0, 1, 2].map(i => (
                <span key={i} className="aspect-[3/4] overflow-hidden">
                  <MediaThumb media={s.covers[i] ?? null} />
                </span>
              ))}
            </a>
            <div className="p-3 flex items-center gap-3">
              <a href={`#/@${s.slug}`} className="flex items-center gap-3 flex-1 min-w-0">
                <StoreAvatar store={s} size={44} />
                <span className="min-w-0">
                  <span className="block font-bold text-gray-900 text-sm truncate">{s.name}</span>
                  <span className="block text-xs text-gray-500 truncate">
                    {[s.category, `${compactCount(s.followers)} abonnés`, `${compactCount(s.likes)} j'aime`, `${s.products} produits`].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </a>
              <button onClick={() => follow(s)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold ${s.following ? 'bg-gray-100 text-gray-700' : 'bg-red-500 text-white'}`}>
                {s.following ? 'Abonné' : "S'abonner"}
              </button>
            </div>
          </article>
        ))}
      </main>
    </div>
  );
}
