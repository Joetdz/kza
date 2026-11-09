import { useEffect, useRef, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { ikeleApi, type GlobalReel } from '../api';
import { ReelFeed } from '../components/ReelFeed';

/** Next page when this few reels are left below the one on screen. */
const PREFETCH_AT = 4;

export const FEED_HEIGHT = 'calc(100dvh - 56px - env(safe-area-inset-bottom))';

// « Pour toi » : the reels of every store on Ikele, page after page, as the API ranks them.
export function ForYou({ active }: { active: boolean }) {
  const [items, setItems] = useState<GlobalReel[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const fetching = useRef(false);

  const loadMore = async (current: GlobalReel[]) => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const page = await ikeleApi.feed(current.map(i => i.id));
      setItems(prev => [...prev, ...page.items.filter(n => !prev.some(p => p.id === n.id))]);
      setHasMore(page.hasMore && page.items.length > 0);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      fetching.current = false;
      setLoading(false);
    }
  };

  useEffect(() => { loadMore([]); }, []);

  useEffect(() => {
    if (hasMore && items.length > 0 && activeIndex >= items.length - PREFETCH_AT) loadMore(items);
  }, [activeIndex, items.length, hasMore]);

  if (loading) {
    return (
      <div className="flex items-center justify-center bg-black" style={{ height: FEED_HEIGHT }}>
        <Loader2 size={32} className="animate-spin text-white" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 bg-black text-center p-6" style={{ height: FEED_HEIGHT }}>
        <Play size={48} className="text-white/30" />
        <p className="text-white/60 text-sm">{error ?? 'Aucune vidéo pour le moment. Reviens bientôt !'}</p>
        <button onClick={() => { setLoading(true); loadMore([]); }}
          className="mt-2 px-5 py-2.5 rounded-xl bg-white text-black text-sm font-semibold">Réessayer</button>
      </div>
    );
  }

  return (
    <ReelFeed items={items} setItems={setItems} height={FEED_HEIGHT} hasMore={hasMore} paused={!active} onActiveChange={setActiveIndex}>
      <div className="absolute top-0 inset-x-0 z-20 flex justify-center pt-4 pointer-events-none">
        <span className="text-white font-bold text-base drop-shadow">Pour toi</span>
      </div>
    </ReelFeed>
  );
}
