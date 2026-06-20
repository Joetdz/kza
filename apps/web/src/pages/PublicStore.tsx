import { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, Loader2, ArrowLeft, Package, CheckCircle, Play, LayoutGrid, ShoppingBag, Volume2, VolumeX } from 'lucide-react';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
const IMG_BASE = BASE.replace('/api', '');
const resolveImg = (url: string | null) => url ? (url.startsWith('http') ? url : `${IMG_BASE}${url}`) : null;

interface OrderForm {
  customerName: string;
  customerPhone: string;
  deliveryZone: string;
  notes: string;
}

interface CartDrawerProps {
  cart: CartItem[];
  store: StoreData | null;
  color: string;
  form: OrderForm;
  ordering: boolean;
  total: number;
  totalItems: number;
  onClose: () => void;
  onUpdateQty: (productId: string, delta: number) => void;
  onFormChange: (field: keyof OrderForm, value: string) => void;
  onOrder: () => void;
}

function CartDrawer({ cart, store, color, form, ordering, total, totalItems, onClose, onUpdateQty, onFormChange, onOrder }: CartDrawerProps) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-md bg-white flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">Mon panier ({totalItems} article{totalItems > 1 ? 's' : ''})</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft size={18} className="text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {cart.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Votre panier est vide</p>}
          {cart.map(({ product, qty }) => (
            <div key={product.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl">
              <div className="w-12 h-12 rounded-xl bg-white border border-gray-100 overflow-hidden shrink-0">
                {product.imageUrl
                  ? <img src={resolveImg(product.imageUrl)!} alt={product.name} className="w-full h-full object-cover" />
                  : <Package size={18} className="text-gray-200 m-auto mt-3" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                <p className="text-xs text-gray-400">{product.sellingPrice.toLocaleString('fr-FR')} {store?.currency ?? 'CDF'} / unité</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => onUpdateQty(product.id, -1)}
                  className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors">
                  {qty === 1 ? <Trash2 size={12} className="text-red-400" /> : <Minus size={12} />}
                </button>
                <span className="w-6 text-center font-bold text-sm">{qty}</span>
                <button onClick={() => onUpdateQty(product.id, 1)}
                  className="w-7 h-7 rounded-lg text-white flex items-center justify-center transition-colors"
                  style={{ background: color }}>
                  <Plus size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {cart.length > 0 && (
          <div className="border-t border-gray-100 p-4 space-y-3">
            <div className="bg-gray-50 rounded-2xl p-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">Total à payer</p>
                <p className="text-xl font-black text-gray-900">{total.toLocaleString('fr-FR')} {store?.currency ?? 'CDF'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-400">Paiement</p>
                <p className="text-sm font-semibold text-gray-600">A la livraison</p>
              </div>
            </div>

            <p className="text-xs text-gray-500 font-medium pt-1">Vos coordonnées</p>
            <input value={form.customerName} onChange={e => onFormChange('customerName', e.target.value)}
              placeholder="Votre nom complet *"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400" />
            <input value={form.customerPhone} onChange={e => onFormChange('customerPhone', e.target.value)}
              placeholder="Votre numéro de téléphone *"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400" />
            <select value={form.deliveryZone} onChange={e => onFormChange('deliveryZone', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400 bg-white">
              <option value="">Zone de livraison *</option>
              {DELIVERY_ZONES.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
            <textarea value={form.notes} onChange={e => onFormChange('notes', e.target.value)}
              placeholder="Adresse précise, instructions..."
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400 resize-none" />

            <button
              onClick={onOrder}
              disabled={ordering || !form.customerName.trim() || !form.customerPhone.trim() || !form.deliveryZone}
              className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold text-white transition-all shadow-lg disabled:opacity-40 disabled:shadow-none"
              style={{
                background: ordering ? '#25d366' : 'linear-gradient(135deg, #25d366, #128c54)',
                fontSize: '1rem',
                letterSpacing: '-0.01em',
              }}>
              {ordering ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
              )}
              {ordering ? 'Envoi en cours...' : `Commander — ${total.toLocaleString('fr-FR')} ${store?.currency ?? 'CDF'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CartItem type (used by CartDrawer above) ───────────────────────────────────
interface CartItem { product: Product; qty: number }

const DELIVERY_ZONES = [
  'Kinshasa — Bandalungwa', 'Kinshasa — Barumbu', 'Kinshasa — Bumbu',
  'Kinshasa — Gombe', 'Kinshasa — Kalamu', 'Kinshasa — Kasa-Vubu',
  'Kinshasa — Kimbanseke', 'Kinshasa — Kinshasa', 'Kinshasa — Kisenso',
  'Kinshasa — Lemba', 'Kinshasa — Limete', 'Kinshasa — Lingwala',
  'Kinshasa — Makala', 'Kinshasa — Maluku', 'Kinshasa — Masina',
  'Kinshasa — Matete', 'Kinshasa — Mont-Ngafula', 'Kinshasa — Ndjili',
  'Kinshasa — Ngaba', 'Kinshasa — Ngaliema', 'Kinshasa — Ngiri-Ngiri',
  'Kinshasa — Nsele', 'Kinshasa — Selembao', 'Kinshasa — Kintambo',
  'Lubumbashi', 'Mbuji-Mayi', 'Kananga', 'Kisangani', 'Bukavu',
  'Goma', 'Kolwezi', 'Likasi', 'Boma', 'Matadi', 'Mbandaka',
  'Butembo', 'Uvira', 'Kalemie', 'Mwene-Ditu', 'Gandajika',
  'Kikwit', 'Tshikapa', 'Ilebo', 'Bandundu', 'Gemena',
  'Lisala', 'Bumba', 'Zongo', 'Autre ville',
];

interface Product {
  id: string;
  name: string;
  category: string;
  sellingPrice: number;
  quantity: number;
  imageUrl: string | null;
}

interface FeedItem {
  id: string;
  url: string;
  type: string;
  caption: string | null;
  audioUrl: string | null;
  product: Product;
}

interface StoreData {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  primaryColor: string;
  currency: string;
  products: Product[];
}

interface Props { slug: string }

// ── FeedCard — one TikTok slide ────────────────────────────────────────────────

function FeedCard({
  item,
  color,
  currency,
  isActive,
  onOrder,
}: {
  item: FeedItem;
  color: string;
  currency: string;
  isActive: boolean;
  onOrder: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [videoMuted, setVideoMuted] = useState(true);
  const [audioMuted, setAudioMuted] = useState(false);

  // Manage video play/pause when slide becomes active
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isActive) {
      v.currentTime = 0;
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [isActive]);

  // Manage audio play/pause when slide becomes active
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (isActive) {
      a.currentTime = 0;
      a.play().catch(() => {});
    } else {
      a.pause();
    }
  }, [isActive]);

  // Whether any sound control is relevant
  const hasVideo = item.type === 'video';
  const hasAudio = !!item.audioUrl;
  const showSoundBtn = hasVideo || hasAudio;

  const toggleMute = () => {
    if (hasVideo) setVideoMuted(m => !m);
    if (hasAudio && audioRef.current) {
      audioRef.current.muted = !audioMuted;
      setAudioMuted(m => !m);
    }
  };

  const isMuted = hasVideo ? videoMuted : audioMuted;

  return (
    <div className="relative h-screen w-full snap-start overflow-hidden bg-black flex-shrink-0">
      {/* Hidden audio track — auto-plays when slide is active */}
      {hasAudio && (
        <audio
          ref={audioRef}
          src={item.audioUrl!}
          loop
          muted={audioMuted}
          playsInline
        />
      )}

      {/* Visual */}
      {hasVideo ? (
        <video
          ref={videoRef}
          src={item.url}
          loop
          muted={videoMuted}
          playsInline
          className="w-full h-full object-cover"
        />
      ) : (
        <img src={item.url} alt={item.caption ?? item.product.name} className="absolute inset-0 w-full h-full object-cover" />
      )}

      {/* Sound toggle (top right) */}
      {showSoundBtn && (
        <button
          onClick={toggleMute}
          className="absolute top-4 right-4 z-10 w-9 h-9 bg-black/40 rounded-full flex items-center justify-center backdrop-blur-sm">
          {isMuted ? <VolumeX size={16} color="white" /> : <Volume2 size={16} color="white" />}
        </button>
      )}

      {/* Audio indicator badge (top left, when there's audio but no video sound) */}
      {hasAudio && !hasVideo && (
        <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 px-2.5 py-1.5 bg-black/40 backdrop-blur-sm rounded-full">
          <div className={`flex gap-0.5 items-end h-4 ${!audioMuted ? 'opacity-100' : 'opacity-40'}`}>
            {[2, 4, 3, 5, 2].map((h, i) => (
              <div key={i}
                className={`w-0.5 rounded-full bg-white ${!audioMuted ? 'animate-pulse' : ''}`}
                style={{ height: `${h * 3}px`, animationDelay: `${i * 100}ms` }} />
            ))}
          </div>
          <span className="text-white text-[10px] font-medium">Voix</span>
        </div>
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-0 px-5 pb-8 pt-16 pointer-events-none">
        <p className="text-white font-black text-xl leading-tight mb-1 drop-shadow-lg">{item.product.name}</p>
        {item.caption && (
          <p className="text-white/80 text-sm mb-2 leading-snug">{item.caption}</p>
        )}
        {item.product.category && (
          <p className="text-white/60 text-xs mb-3">{item.product.category}</p>
        )}
        <div className="flex items-center justify-between pointer-events-auto">
          <p className="text-white font-black text-2xl drop-shadow-lg">
            {item.product.sellingPrice.toLocaleString('fr-FR')} {currency}
          </p>
          <button
            onClick={onOrder}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-white shadow-2xl transition-transform active:scale-95"
            style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
            <ShoppingBag size={18} />
            Commander
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PublicStore({ slug }: Props) {
  const [store, setStore] = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const [view, setView] = useState<'shop' | 'feed'>('shop');
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    deliveryZone: '',
    notes: '',
  });

  useEffect(() => {
    fetch(`${BASE}/store/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setStore(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (view === 'feed' && feed.length === 0 && !feedLoading) {
      setFeedLoading(true);
      fetch(`${BASE}/store/${slug}/feed`)
        .then(r => r.json())
        .then(data => setFeed(Array.isArray(data) ? data : []))
        .catch(() => setFeed([]))
        .finally(() => setFeedLoading(false));
    }
  }, [view]);

  // Track active slide for video autoplay via scroll position
  useEffect(() => {
    const container = feedRef.current;
    if (!container) return;
    const onScroll = () => {
      const index = Math.round(container.scrollTop / window.innerHeight);
      setActiveIndex(index);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [view]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { product, qty: 1 }];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart(prev => prev
      .map(i => i.product.id === productId ? { ...i, qty: i.qty + delta } : i)
      .filter(i => i.qty > 0)
    );
  };

  const total = cart.reduce((sum, i) => sum + i.qty * i.product.sellingPrice, 0);
  const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);

  const handleOrder = async () => {
    if (!form.customerName.trim() || !form.customerPhone.trim() || !form.deliveryZone || cart.length === 0) return;
    setOrdering(true);
    try {
      const res = await fetch(`${BASE}/store/${slug}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: form.customerName,
          customerPhone: form.customerPhone,
          deliveryZone: form.deliveryZone,
          notes: form.notes,
          items: cart.map(i => ({
            productId: i.product.id,
            name: i.product.name,
            qty: i.qty,
            unitPrice: i.product.sellingPrice,
          })),
        }),
      });
      const { waUrl, directSent } = await res.json();
      if (!directSent) window.open(waUrl, '_blank');
      setConfirmed(true);
      setCart([]);
    } catch { /* ignore */ }
    finally { setOrdering(false); }
  };

  const color = store?.primaryColor ?? '#6366f1';
  const handleFormChange = (field: keyof OrderForm, value: string) => setForm(f => ({ ...f, [field]: value }));

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin" style={{ color }} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Package size={40} className="text-gray-300" />
        <p className="text-lg font-bold text-gray-700">Boutique introuvable</p>
        <p className="text-sm text-gray-400">Cette boutique n'existe pas ou n'est plus active.</p>
      </div>
    );
  }

  if (confirmed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 p-6 text-center"
        style={{ background: 'linear-gradient(135deg, #f0fdf4, #dcfce7)' }}>
        <div className="w-24 h-24 rounded-full flex items-center justify-center shadow-xl"
          style={{ background: '#25d366' }}>
          <CheckCircle size={44} color="white" strokeWidth={2.5} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">Commande reçue !</h2>
          <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
            Votre commande a été transmise au vendeur. Il vous contactera sous peu pour confirmer la livraison.
          </p>
        </div>
        <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-green-100 text-sm text-gray-600 max-w-xs w-full">
          <p className="font-semibold text-gray-900 mb-1">Paiement à la livraison</p>
          <p className="font-bold text-lg mt-1" style={{ color: '#25d366' }}>{total.toLocaleString('fr-FR')} {store?.currency ?? 'CDF'}</p>
        </div>
        <button onClick={() => setConfirmed(false)}
          className="px-6 py-3 rounded-2xl text-sm font-semibold text-white transition-all shadow-md"
          style={{ background: color }}>
          Continuer mes achats
        </button>
      </div>
    );
  }

  // ── FEED VIEW ──────────────────────────────────────────────────────────────

  if (view === 'feed') {
    return (
      <div className="relative h-screen w-full bg-black overflow-hidden">
        {/* Back + cart buttons */}
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
          <button
            onClick={() => setView('shop')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/40 backdrop-blur-sm text-white text-sm font-medium">
            <LayoutGrid size={15} />
            Boutique
          </button>
          {totalItems > 0 && (
            <button
              onClick={() => setShowCart(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-sm font-semibold"
              style={{ background: color }}>
              <ShoppingCart size={15} />
              {totalItems}
            </button>
          )}
        </div>

        {feedLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 size={32} className="animate-spin text-white" />
          </div>
        )}

        {!feedLoading && feed.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-6">
            <Play size={48} className="text-white/30" />
            <p className="text-white/60 text-sm">Aucune création disponible pour l'instant</p>
            <button onClick={() => setView('shop')}
              className="mt-2 px-5 py-2.5 rounded-xl text-white text-sm font-semibold"
              style={{ background: color }}>
              Voir la boutique
            </button>
          </div>
        )}

        {/* Snap scroll container */}
        <div
          ref={feedRef}
          className="h-full overflow-y-scroll snap-y snap-mandatory"
          style={{ scrollSnapType: 'y mandatory' }}>
          {feed.map((item, i) => (
            <FeedCard
              key={item.id}
              item={item}
              color={color}
              currency={store?.currency ?? 'CDF'}
              isActive={i === activeIndex}
              onOrder={() => { addToCart(item.product); setShowCart(true); }}
            />
          ))}
        </div>

        {showCart && (
          <CartDrawer
            cart={cart} store={store} color={color} form={form}
            ordering={ordering} total={total} totalItems={totalItems}
            onClose={() => setShowCart(false)}
            onUpdateQty={updateQty}
            onFormChange={handleFormChange}
            onOrder={handleOrder}
          />
        )}
      </div>
    );
  }

  // ── SHOP VIEW ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-sm"
              style={{ background: color }}>
              {store!.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-gray-900 text-sm leading-tight">{store!.name}</p>
              {store!.description && <p className="text-xs text-gray-400 truncate max-w-[180px]">{store!.description}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Feed toggle */}
            <button
              onClick={() => setView('feed')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-gray-200 hover:border-gray-300 text-gray-600 transition-colors">
              <Play size={14} />
              Feed
            </button>

            {/* Cart */}
            <button
              onClick={() => setShowCart(true)}
              className="relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{ background: totalItems > 0 ? color : '#e5e7eb', color: totalItems > 0 ? 'white' : '#9ca3af' }}>
              <ShoppingCart size={16} />
              {totalItems > 0 && <span>{totalItems}</span>}
              {totalItems > 0 && <span className="hidden sm:inline">— {total.toLocaleString('fr-FR')} {store?.currency ?? 'CDF'}</span>}
            </button>
          </div>
        </div>
      </header>

      {/* Products grid */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {store!.products.map(p => {
            const inCart = cart.find(i => i.product.id === p.id);
            const imgUrl = resolveImg(p.imageUrl);
            return (
              <div key={p.id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md transition-all">
                <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden">
                  {imgUrl
                    ? <img src={imgUrl} alt={p.name} className="w-full h-full object-cover" />
                    : <Package size={32} className="text-gray-200" />}
                </div>
                <div className="p-3">
                  <p className="font-semibold text-gray-900 text-sm leading-tight mb-0.5 line-clamp-2">{p.name}</p>
                  {p.category && <p className="text-xs text-gray-400 mb-2">{p.category}</p>}
                  <p className="font-black text-sm mb-3" style={{ color }}>{p.sellingPrice.toLocaleString('fr-FR')} {store?.currency ?? 'CDF'}</p>
                  {inCart ? (
                    <div className="flex items-center justify-between">
                      <button onClick={() => updateQty(p.id, -1)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center border border-gray-200 hover:bg-gray-50 transition-colors">
                        <Minus size={13} />
                      </button>
                      <span className="font-bold text-sm">{inCart.qty}</span>
                      <button onClick={() => updateQty(p.id, 1)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white transition-colors"
                        style={{ background: color }}>
                        <Plus size={13} />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => addToCart(p)}
                      className="w-full py-2 rounded-xl text-xs font-semibold text-white transition-all flex items-center justify-center gap-1"
                      style={{ background: color }}>
                      <Plus size={13} />
                      Ajouter
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {store!.products.length === 0 && (
          <div className="text-center py-16">
            <Package size={40} className="text-gray-200 mx-auto mb-2" />
            <p className="text-gray-400 text-sm">Aucun produit disponible pour l'instant</p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-gray-400 border-t border-gray-100 bg-white">
        Boutique propulsée par <span className="font-bold text-gray-600">KZA Manager</span>
      </footer>

      {showCart && (
        <CartDrawer
          cart={cart} store={store} color={color} form={form}
          ordering={ordering} total={total} totalItems={totalItems}
          onClose={() => setShowCart(false)}
          onUpdateQty={updateQty}
          onFormChange={handleFormChange}
          onOrder={handleOrder}
        />
      )}
    </div>
  );
}
