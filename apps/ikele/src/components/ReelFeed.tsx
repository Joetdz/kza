import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { Loader2 } from 'lucide-react';
import { FeedCard, QuickOrder } from '@web/pages/PublicStore';
import { LAST_STORE_KEY } from '@web/api/customer';
import { ikeleApi, recordVisit, type GlobalReel } from '../api';

/** A reel on screen this long counts as seen, as in each store's own feed. */
const VIEW_AFTER_MS = 2000;

// The reels one under the other, TikTok style: likes, follows, views, and « Commander »
// opening the order form over the reel.
export function ReelFeed({ items, setItems, height, initialIndex = 0, hasMore = false, paused = false, onActiveChange, children }: {
  items: GlobalReel[];
  setItems: Dispatch<SetStateAction<GlobalReel[]>>;
  height: string;
  /** The reel shown first. */
  initialIndex?: number;
  /** More reels are coming: a spinner closes the list. */
  hasMore?: boolean;
  /** Off screen (another tab is open): nothing plays, nothing counts as seen. */
  paused?: boolean;
  onActiveChange?: (index: number) => void;
  /** Drawn over the reels (title, back button). */
  children?: ReactNode;
}) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [ordering, setOrdering] = useState<GlobalReel | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    if (initialIndex > 0) el.scrollTo({ top: initialIndex * el.clientHeight, behavior: 'instant' });
    const onScroll = () => setActiveIndex(Math.round(el.scrollTop / el.clientHeight));
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { onActiveChange?.(activeIndex); }, [activeIndex]);

  // A hidden list loses its scroll position: back on screen, it is put back on the same reel.
  useLayoutEffect(() => {
    const el = feedRef.current;
    if (!paused && el && el.scrollTop !== activeIndex * el.clientHeight) {
      el.scrollTo({ top: activeIndex * el.clientHeight, behavior: 'instant' });
    }
  }, [paused]);

  const active = paused ? undefined : items[activeIndex];
  useEffect(() => {
    if (!active) return;
    // Signing up sends its code from a store's WhatsApp: the one being watched.
    try { localStorage.setItem(LAST_STORE_KEY, active.store.slug); } catch { /* ignore */ }
    if (seen.current.has(active.id)) return;
    const timer = setTimeout(() => {
      seen.current.add(active.id);
      setItems(list => list.map(i => i.id === active.id ? { ...i, viewCount: i.viewCount + 1 } : i));
      ikeleApi.view(active.store.slug, active.id).catch(() => {});
      // A reel watched counts as a visit of its store.
      recordVisit(active.store.slug);
    }, VIEW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [active?.id]);

  const setLike = (item: GlobalReel, liked: boolean) => {
    if (item.liked === liked) return;
    const apply = (likedNow: boolean, likeCount: number) =>
      setItems(list => list.map(i => i.id === item.id ? { ...i, liked: likedNow, likeCount } : i));
    apply(liked, Math.max(0, item.likeCount + (liked ? 1 : -1)));
    ikeleApi.like(item.store.slug, item.id, liked)
      .then(res => apply(res.liked, res.likeCount))
      .catch(() => apply(item.liked, item.likeCount));
  };

  // Every reel of that store shows the change.
  const follow = (item: GlobalReel) => {
    const following = !item.store.following;
    const apply = (value: boolean) =>
      setItems(list => list.map(i => i.store.slug === item.store.slug ? { ...i, store: { ...i.store, following: value } } : i));
    apply(following);
    ikeleApi.follow(item.store.slug, following).catch(() => apply(!following));
  };

  return (
    <div className="relative bg-black overflow-hidden" style={{ height }}>
      {children}

      <div ref={feedRef} className="h-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide">
        {items.map((item, i) => (
          <FeedCard
            key={item.id}
            item={item}
            color={item.store.primaryColor}
            currency={item.store.currency}
            slug={item.store.slug}
            isActive={i === activeIndex && !ordering && !paused}
            isNext={i === activeIndex + 1}
            profile={item.store}
            onOrder={() => setOrdering(item)}
            onLike={liked => setLike(item, liked)}
            onOpenProfile={() => { window.location.hash = `#/@${item.store.slug}`; }}
            onFollow={() => follow(item)}
          />
        ))}
        {hasMore && (
          <div className="h-24 flex items-center justify-center snap-start">
            <Loader2 size={24} className="animate-spin text-white/60" />
          </div>
        )}
      </div>

      {ordering && (
        <QuickOrder slug={ordering.store.slug} productId={ordering.product.id} onClose={() => setOrdering(null)} />
      )}

      <style>{`@keyframes kza-heart {
        0% { transform: scale(0.4) rotate(-12deg); opacity: 0; }
        20% { transform: scale(1.15) rotate(-12deg); opacity: 1; }
        40% { transform: scale(1) rotate(-12deg); opacity: 1; }
        100% { transform: scale(1.1) translateY(-80px) rotate(-12deg); opacity: 0; }
      }`}</style>
    </div>
  );
}
