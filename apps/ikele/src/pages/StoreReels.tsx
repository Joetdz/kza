import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { cachedStorePages, loadStorePages, type GlobalReel, type StorePages } from '../api';
import { ReelFeed } from '../components/ReelFeed';
import { FEED_HEIGHT } from './ForYou';

// A store's reels full screen, opened on the one tapped in its profile, in the profile's order.
function toReels(slug: string, { profile, reels, catalog }: StorePages): GlobalReel[] {
  const store = {
    id: slug, slug, name: profile.name, logoUrl: profile.logoUrl,
    primaryColor: profile.primaryColor, currency: catalog.currency, following: profile.following,
  };
  return reels.map(r => ({
    ...r,
    store,
    product: { id: r.product.id, name: r.product.name, category: null, imageUrl: null, quantity: 0, sellingPrice: r.product.sellingPrice },
  }));
}

export function StoreReels({ slug, reelId }: { slug: string; reelId: string }) {
  // Opened from the profile, the store is already known: the reels show at once.
  const cached = cachedStorePages(slug);
  const [items, setItems] = useState<GlobalReel[]>(() => (cached ? toReels(slug, cached) : []));
  const [loaded, setLoaded] = useState(!!cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cached) return;
    loadStorePages(slug)
      .then(pages => { setItems(toReels(slug, pages)); setLoaded(true); })
      .catch(e => setError((e as Error).message));
  }, [slug]);

  const back = () => (window.history.length > 1 ? window.history.back() : (window.location.hash = `#/@${slug}`));

  if (!loaded) {
    return (
      <div style={{ height: FEED_HEIGHT }} className="bg-black flex flex-col items-center justify-center gap-3 p-6 text-center">
        {error ? (
          <>
            <p className="text-white/70 text-sm">{error}</p>
            <a href={`#/@${slug}`} className="px-5 py-2.5 rounded-xl bg-white text-black text-sm font-semibold">Voir la boutique</a>
          </>
        ) : <Loader2 size={32} className="animate-spin text-white" />}
      </div>
    );
  }

  return (
    <ReelFeed items={items} setItems={setItems} height={FEED_HEIGHT}
      initialIndex={Math.max(0, items.findIndex(r => r.id === reelId))}>
      <button onClick={back} aria-label="Retour"
        className="absolute top-4 left-4 z-20 w-9 h-9 rounded-xl bg-black/40 backdrop-blur-sm text-white flex items-center justify-center">
        <ArrowLeft size={16} />
      </button>
    </ReelFeed>
  );
}
