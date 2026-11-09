import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Grid3x3, Loader2, Play, Share2, ShoppingBag } from 'lucide-react';
import { compactCount, QuickOrder } from '@web/pages/PublicStore';
import { links, shareUrl } from '@web/lib/links';
import { cachedStorePages, ikeleApi, loadStorePages, updateCachedProfile, type StoreCatalog, type StoreProfileData, type StoreReel } from '../api';
import { MediaThumb, StoreAvatar } from '../components/MediaThumb';

type Tab = 'reels' | 'products';

// A store's page, laid out like a TikTok profile: who it is, its numbers, then its reels
// and its products as a grid of vertical thumbnails with their stats.
export function StoreProfile({ slug, orderProductId }: {
  slug: string;
  /** Opens with the order form of this product (links of the old catalogue). */
  orderProductId?: string;
}) {
  const cached = cachedStorePages(slug);
  const [profile, setProfile] = useState<StoreProfileData | null>(cached?.profile ?? null);
  const [reels, setReels] = useState<StoreReel[]>(cached?.reels ?? []);
  const [catalog, setCatalog] = useState<StoreCatalog | null>(cached?.catalog ?? null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('reels');
  const [copied, setCopied] = useState(false);
  const [ordering, setOrdering] = useState<string | null>(orderProductId ?? null);

  const closeOrder = () => {
    setOrdering(null);
    // A reload must not open the form again.
    if (orderProductId) window.history.replaceState(null, '', `#/@${slug}`);
  };

  useEffect(() => {
    loadStorePages(slug)
      .then(({ profile: p, reels: r, catalog: c }) => { setProfile(p); setReels(r); setCatalog(c); })
      // Already on screen from the cache: an outdated page beats an error.
      .catch(e => { if (!cached) setError((e as Error).message); });
  }, [slug]);

  useEffect(() => { if (profile) updateCachedProfile(slug, profile); }, [profile]);

  // Views of each product: those of its reels.
  const productViews = useMemo(() => {
    const views = new Map<string, number>();
    reels.forEach(r => views.set(r.product.id, (views.get(r.product.id) ?? 0) + r.viewCount));
    return views;
  }, [reels]);

  const toggleFollow = () => {
    if (!profile) return;
    const following = !profile.following;
    const before = profile;
    setProfile({ ...profile, following, followers: Math.max(0, profile.followers + (following ? 1 : -1)) });
    ikeleApi.follow(slug, following)
      .then(res => setProfile(p => p && { ...p, ...res }))
      .catch(() => setProfile(before));
  };

  const share = () => {
    const url = shareUrl(links.store(slug));
    if (navigator.share) navigator.share({ title: profile?.name, url }).catch(() => {});
    else navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const back = () => (window.history.length > 1 ? window.history.back() : (window.location.hash = '#/boutiques'));

  if (error) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="font-bold text-gray-800">Boutique introuvable</p>
        <p className="text-sm text-gray-500">{error}</p>
        <a href="#/boutiques" className="mt-2 px-5 py-2.5 rounded-xl bg-black text-white text-sm font-semibold">Voir les boutiques</a>
      </div>
    );
  }
  if (!profile || !catalog) {
    return <div className="min-h-screen bg-white flex items-center justify-center"><Loader2 size={28} className="animate-spin text-gray-300" /></div>;
  }

  const currency = catalog.currency;
  const stats: [number, string][] = [[profile.followers, 'Abonnés'], [profile.likes, "J'aime"], [profile.products, 'Produits']];

  return (
    <div className="min-h-screen bg-white pb-tabbar">
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-md mx-auto px-3 h-12 flex items-center justify-between">
          <button onClick={back} aria-label="Retour" className="p-2 -ml-1 text-gray-800"><ArrowLeft size={20} /></button>
          <span className="font-bold text-gray-900 text-sm truncate">{profile.name}</span>
          <button onClick={share} aria-label="Partager la boutique" className="p-2 -mr-1 text-gray-800 relative">
            <Share2 size={19} />
            {copied && <span className="absolute top-9 right-0 whitespace-nowrap bg-black text-white text-[10px] px-2 py-1 rounded-lg">Lien copié</span>}
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto">
        <section className="px-4 pt-5 pb-4 flex flex-col items-center text-center">
          <StoreAvatar store={profile} size={92} />
          <p className="mt-3 font-bold text-gray-900">@{profile.slug}</p>
          <div className="mt-4 grid grid-cols-3 gap-6">
            {stats.map(([n, label]) => (
              <div key={label}>
                <p className="font-black text-gray-900 text-lg leading-tight">{compactCount(n)}</p>
                <p className="text-xs text-gray-500">{label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2 w-full max-w-xs">
            <button onClick={toggleFollow}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold ${profile.following ? 'bg-gray-100 text-gray-800' : 'bg-red-500 text-white'}`}>
              {profile.following ? 'Abonné ✓' : "S'abonner"}
            </button>
          </div>
          {profile.description && <p className="mt-3 text-sm text-gray-600 whitespace-pre-line">{profile.description}</p>}
        </section>

        <nav className="grid grid-cols-2 border-b border-gray-200 sticky top-12 bg-white z-10">
          {([['reels', Grid3x3, 'Reels'], ['products', ShoppingBag, 'Produits']] as const).map(([key, Icon, label]) => (
            <button key={key} onClick={() => setTab(key)} aria-label={label} aria-pressed={tab === key}
              className={`py-3 flex justify-center border-b-2 ${tab === key ? 'border-black text-black' : 'border-transparent text-gray-400'}`}>
              <Icon size={20} />
            </button>
          ))}
        </nav>

        {tab === 'reels' && (
          reels.length === 0
            ? <p className="text-sm text-gray-400 text-center py-12">Pas encore de vidéos.</p>
            : (
              <div className="grid grid-cols-3 gap-0.5">
                {reels.map(r => (
                  <a key={r.id} href={`#/@${slug}/reels/${r.id}`} className="relative aspect-[9/16] bg-neutral-900 overflow-hidden">
                    <MediaThumb media={r} alt={r.product.name} />
                    <span className="absolute bottom-1 left-1.5 flex items-center gap-0.5 text-white text-xs font-semibold drop-shadow">
                      <Play size={12} className="fill-white" /> {compactCount(r.viewCount)}
                    </span>
                  </a>
                ))}
              </div>
            )
        )}

        {tab === 'products' && (
          catalog.products.length === 0
            ? <p className="text-sm text-gray-400 text-center py-12">Aucun produit disponible.</p>
            : (
              <div className="grid grid-cols-3 gap-0.5">
                {catalog.products.map(p => {
                  const reel = reels.find(r => r.product.id === p.id);
                  const media = reel ?? p.media[0] ?? (p.imageUrl ? { url: p.imageUrl, type: 'image' } : null);
                  // A product with a reel opens on it; the others straight on the order form.
                  const open = () => (reel ? (window.location.hash = `#/@${slug}/reels/${reel.id}`) : setOrdering(p.id));
                  return (
                    <button key={p.id} onClick={open} className="relative aspect-[9/16] bg-neutral-900 overflow-hidden">
                      <MediaThumb media={media} alt={p.name} />
                      <span className="absolute inset-x-0 bottom-0 px-1.5 pb-1 pt-6 bg-gradient-to-t from-black/80 to-transparent text-left">
                        <span className="block text-white text-[11px] font-semibold leading-tight line-clamp-1">{p.name}</span>
                        <span className="flex items-center justify-between text-white text-[11px] font-black">
                          {Number(p.sellingPrice).toLocaleString('fr-FR')} {currency}
                          {productViews.has(p.id) && (
                            <span className="flex items-center gap-0.5 font-semibold"><Play size={10} className="fill-white" />{compactCount(productViews.get(p.id)!)}</span>
                          )}
                        </span>
                      </span>
                      {p.quantity > 0 && p.quantity <= 5 && (
                        <span className="absolute top-1 left-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                          Dernier{p.quantity > 1 ? 's' : ''} {p.quantity}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )
        )}
        <div className="h-6" />
      </main>

      {ordering && <QuickOrder slug={slug} productId={ordering} onClose={closeOrder} />}
    </div>
  );
}
