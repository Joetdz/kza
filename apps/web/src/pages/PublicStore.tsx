import { useState, useEffect, useRef } from 'react';
import { ShoppingCart, Plus, Minus, Trash2, Loader2, ArrowLeft, Package, CheckCircle, Play, Pause, Film, LayoutGrid, ShoppingBag, Volume2, VolumeX, Share2, Flame, Clock, Heart, Eye, X, User, MapPin } from 'lucide-react';
import { cachedCustomer, customerApi, customerAuthHeader, customerToken, deviceVisitorId, LAST_STORE_KEY, saveSession, VISITOR_KEY, type CustomerAddress, type CustomerSession } from '../api/customer';
import { links, shareUrl } from '../lib/links';

// Meta Pixel helper — no-op if pixel not loaded
const fbq = (...args: any[]) => { (window as any).fbq?.(...args); };

// On Ikele one visit crosses many stores: each pixel is set up once, beside the others.
const pixelsInited = new Set<string>();

function injectMetaPixel(pixelId: string) {
  const f = window as any, b = document, e = 'script';
  if (!f.fbqLoaded && !f.fbq) {
    f.fbqLoaded = true;
    const n: any = f.fbq = function (...a: any[]) {
      n.callMethod ? n.callMethod.apply(n, a) : n.queue.push(a);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    const t = b.createElement(e) as HTMLScriptElement;
    t.async = true;
    t.src = 'https://connect.facebook.net/en_US/fbevents.js';
    b.head.appendChild(t);
  }
  if (pixelsInited.has(pixelId)) return;
  pixelsInited.add(pixelId);
  fbq('init', pixelId);
  fbq('trackSingle', pixelId, 'PageView');
}

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
const IMG_BASE = BASE.replace('/api', '');
const resolveImg = (url: string | null) => url ? (url.startsWith('http') ? url : `${IMG_BASE}${url}`) : null;

interface OrderForm {
  customerName: string;
  customerPhone: string;
  deliveryZone: string;
  commune: string;
  avenue: string;
  reference: string;
  notes: string;
  /** '' : as soon as possible. */
  deliveryDay: '' | 'today' | 'tomorrow' | 'after';
  /** « Ma position » : for this order only, never kept in the browser. */
  location: { lat: number; lng: number; accuracy: number } | null;
}

// ── CartItem ──────────────────────────────────────────────────────────────────
interface CartItem { product: Product; qty: number }

function calcLineTotal(product: Product, qty: number): number {
  const sp = Number(product.sellingPrice);
  if (product.bundleQty && product.bundlePrice) {
    const bp = Number(product.bundlePrice);
    const bundles = Math.floor(qty / product.bundleQty);
    const remainder = qty % product.bundleQty;
    return bundles * bp + remainder * sp;
  }
  return qty * sp;
}

const EMPTY_FORM: OrderForm = {
  customerName: '', customerPhone: '', deliveryZone: '', commune: '', avenue: '', reference: '', notes: '',
  deliveryDay: '', location: null,
};

/** Same rule as the server: at least a subscriber number once spaces and signs are gone. */
const phoneLooksValid = (phone: string) => phone.replace(/\D/g, '').length >= 9;

/** What the order still lacks, in the customer's words. */
function missingFields(form: OrderForm): string[] {
  const missing: string[] = [];
  if (form.customerName.trim().length < 2) missing.push('ton nom');
  if (!phoneLooksValid(form.customerPhone)) missing.push('un numéro WhatsApp valide');
  if (!form.deliveryZone) missing.push('la ville');
  if (!form.commune.trim()) missing.push('la commune');
  if (!form.avenue.trim()) missing.push("l'avenue");
  return missing;
}

const orderFormComplete = (form: OrderForm) => missingFields(form).length === 0;

/**
 * The order form of a store, kept in this browser between visits. A signed-in customer's
 * name, number and default address fill the fields still empty.
 */
function useOrderForm(slug: string) {
  const [form, setForm] = useState<OrderForm>(() => {
    try {
      return { ...EMPTY_FORM, ...JSON.parse(localStorage.getItem(`form_${slug}`) ?? '{}'), location: null };
    } catch {
      return EMPTY_FORM;
    }
  });

  const [customer, setCustomer] = useState(() => (customerToken() ? cachedCustomer() : null));
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  useEffect(() => {
    try { localStorage.setItem(LAST_STORE_KEY, slug); } catch { /* ignore */ }
    if (!customerToken()) return;
    Promise.all([customerApi.me(), customerApi.addresses().catch(() => [])])
      .then(([me, addresses]) => {
        setCustomer(me);
        setAddresses(addresses);
        const address = addresses.find(a => a.isDefault) ?? addresses[0];
        // Only empty fields: what the visitor already typed stays.
        setForm(f => ({
          ...f,
          customerName: f.customerName || me.name,
          customerPhone: f.customerPhone || me.phone,
          ...(address && !f.avenue ? {
            deliveryZone: f.deliveryZone || address.city,
            commune: f.commune || address.commune,
            avenue: address.avenue,
            reference: f.reference || address.reference,
          } : {}),
        }));
      })
      .catch(() => setCustomer(null));
  }, [slug]);

  useEffect(() => {
    const { location: _, ...kept } = form;
    localStorage.setItem(`form_${slug}`, JSON.stringify(kept));
  }, [form, slug]);

  // The account a first order opens: signed in on this device from now on.
  const signIn = (session: CustomerSession) => setCustomer(saveSession(session));

  return { form, setForm, customer, signIn, addresses };
}

/** UTM params of the link that brought the visitor (FB Ads link tracking). */
function readUtm(): Record<string, string> {
  const p = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(k => {
    const v = p.get(k); if (v) utm[k] = v;
  });
  return utm;
}

/**
 * Sends the order. Returns the WhatsApp link that tells the seller and, for a number seen
 * for the first time, the session of the account the order opened. Throws the message to show.
 */
async function submitStoreOrder(
  slug: string, form: OrderForm, cart: CartItem[], deliveryFee: number, utm: Record<string, string>,
  source?: 'ikele',
): Promise<{ waUrl: string; account: CustomerSession | null }> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/store/${slug}/order`, {
      method: 'POST',
      // Signed in: the order joins the customer's history.
      headers: { 'Content-Type': 'application/json', ...customerAuthHeader() },
      body: JSON.stringify({
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        deliveryZone: form.deliveryZone,
        commune: form.commune || undefined,
        avenue: form.avenue || undefined,
        reference: form.reference || undefined,
        deliveryFee,
        notes: form.notes || undefined,
        utmSource: utm.utm_source,
        utmMedium: utm.utm_medium,
        utmCampaign: utm.utm_campaign,
        utmContent: utm.utm_content,
        source,
        deviceVisitorId: deviceVisitorId(),
        deliveryDay: form.deliveryDay || undefined,
        location: form.location ? { lat: form.location.lat, lng: form.location.lng } : undefined,
        items: cart.map(i => ({
          productId: i.product.id,
          name: i.product.name,
          qty: i.qty,
          unitPrice: calcLineTotal(i.product, i.qty) / i.qty,
        })),
      }),
    });
  } catch {
    throw new Error("Connexion impossible : votre commande n'a pas été envoyée. Réessayez.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message ?? "Votre commande n'a pas pu être enregistrée. Réessayez.");
  return { waUrl: body.waUrl, account: body.account ?? null };
}

interface CartDrawerProps {
  /** Replaces « Mon panier (n articles) ». */
  title?: string;
  /** The signed-in customer's saved addresses: one tap fills the delivery fields. */
  addresses?: CustomerAddress[];
  cart: CartItem[];
  store: StoreData | null;
  color: string;
  form: OrderForm;
  ordering: boolean;
  total: number;
  totalItems: number;
  onClose: () => void;
  onUpdateQty: (productId: string, delta: number) => void;
  /** Puts another variant of the model in place of this line. */
  onSwapProduct: (productId: string, variant: Product) => void;
  onFormChange: <K extends keyof OrderForm>(field: K, value: OrderForm[K]) => void;
  onOrder: () => void;
}

const DELIVERY_DAYS: [OrderForm['deliveryDay'], string][] = [
  ['', 'Au plus vite'], ['today', "Aujourd'hui"], ['tomorrow', 'Demain'], ['after', 'Après-demain'],
];

/** The variants of this product's model that the store sells, this one included. */
function variantsOf(product: Product, products: Product[]): Product[] {
  if (!product.variantGroup) return [];
  return products.filter(p => p.variantGroup === product.variantGroup && p.variantLabel);
}

/** The cart with `variant` in place of `productId`, joined to its line if already there. */
function swapInCart(cart: CartItem[], productId: string, variant: Product): CartItem[] {
  const line = cart.find(i => i.product.id === productId);
  if (!line) return cart;
  const rest = cart.filter(i => i.product.id !== productId);
  const existing = rest.find(i => i.product.id === variant.id);
  if (existing) return rest.map(i => i.product.id === variant.id ? { ...i, qty: i.qty + line.qty } : i);
  return cart.map(i => i.product.id === productId ? { product: variant, qty: line.qty } : i);
}

// « Ma position » : the phone's GPS, joined to the order as a map link for the delivery
// person — addresses are often vague, a pin is not.
function PositionButton({ location, onChange }: { location: OrderForm['location']; onChange: (l: OrderForm['location']) => void }) {
  const [state, setState] = useState<'idle' | 'locating' | 'error'>('idle');
  const [error, setError] = useState('');

  const locate = () => {
    if (!navigator.geolocation) { setState('error'); setError("Ton téléphone ne donne pas sa position."); return; }
    setState('locating');
    navigator.geolocation.getCurrentPosition(
      pos => {
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) });
        setState('idle');
      },
      err => {
        setState('error');
        setError(err.code === err.PERMISSION_DENIED
          ? 'Position refusée : autorise-la dans ton navigateur pour l\'ajouter.'
          : 'Position introuvable pour le moment : réessaie dehors ou près d\'une fenêtre.');
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  };

  if (location) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-green-200 bg-green-50 text-xs">
        <MapPin size={16} className="text-green-600 shrink-0" />
        <span className="flex-1 text-green-800">
          <span className="font-semibold">Position ajoutée</span> (à {location.accuracy} m près) : le livreur la verra.
        </span>
        <button type="button" onClick={() => onChange(null)} className="text-gray-500 font-semibold">Retirer</button>
      </div>
    );
  }
  return (
    <div>
      <button type="button" onClick={locate} disabled={state === 'locating'}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-gray-300 text-sm font-semibold text-gray-700 disabled:opacity-60">
        {state === 'locating' ? <Loader2 size={16} className="animate-spin" /> : <MapPin size={16} />}
        {state === 'locating' ? 'Recherche de ta position…' : 'Ajouter ma position (aide le livreur)'}
      </button>
      {state === 'error' && <p className="text-[11px] text-red-500 mt-1 px-1">{error}</p>}
    </div>
  );
}

function CartDrawer({ title, addresses = [], cart, store, color, form, ordering, total, totalItems, onClose, onUpdateQty, onSwapProduct, onFormChange, onOrder }: CartDrawerProps) {
  const cur = store?.currency ?? 'CDF';
  const zones = store?.deliveryZones ?? [];
  const selectedZone = zones.find(z => z.city === form.deliveryZone);
  const deliveryFee = selectedZone?.fee ?? 0;

  const missing = missingFields(form);
  const canOrder = !ordering && missing.length === 0;
  // Only the addresses this store delivers to.
  const usable = addresses.filter(a => zones.some(z => z.city === a.city));
  const pickAddress = (a: CustomerAddress) => {
    onFormChange('deliveryZone', a.city);
    onFormChange('commune', a.commune);
    onFormChange('avenue', a.avenue);
    onFormChange('reference', a.reference);
  };
  const phoneWrong = form.customerPhone.trim() !== '' && !phoneLooksValid(form.customerPhone);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-md bg-white flex flex-col shadow-2xl">

        {/* Header fixe */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-bold text-gray-900">{title ?? `Mon panier (${totalItems} article${totalItems > 1 ? 's' : ''})`}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Zone scrollable : articles + récap + formulaire */}
        <div className="flex-1 overflow-y-auto">
          {/* Articles */}
          <div className="p-4 space-y-3">
            {cart.length === 0 && <p className="text-sm text-gray-400 text-center py-8">Votre panier est vide</p>}
            {cart.map(({ product, qty }) => (
              <div key={product.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-2xl">
                <div className="w-12 h-12 rounded-xl bg-white border border-gray-100 overflow-hidden shrink-0">
                  {product.imageUrl
                    ? <img src={resolveImg(product.imageUrl)!} alt={product.name} className="w-full h-full object-cover" />
                    : <Package size={18} className="text-gray-200 m-auto mt-3" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{product.variantLabel ? product.variantGroup : product.name}</p>
                  <p className="text-xs font-semibold" style={{ color }}>
                    {calcLineTotal(product, qty).toLocaleString('fr-FR')} {cur}
                  </p>
                  {/* Another size or colour of the same model, in one tap. */}
                  {(() => {
                    const variants = variantsOf(product, store?.products ?? []);
                    return variants.length > 1 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {variants.map(v => (
                          <button key={v.id} type="button" onClick={() => v.id !== product.id && onSwapProduct(product.id, v)}
                            aria-pressed={v.id === product.id}
                            className={`px-2 py-0.5 rounded-lg border text-[11px] font-semibold ${v.id === product.id ? 'text-white border-transparent' : 'border-gray-200 text-gray-600 bg-white'}`}
                            style={v.id === product.id ? { background: color } : undefined}>
                            {v.variantLabel}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
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
            <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-4">
              {/* Formulaire */}
              <p className="text-xs text-gray-500 font-medium pt-1">Vos coordonnées</p>
              <input value={form.customerName} onChange={e => onFormChange('customerName', e.target.value)}
                placeholder="Votre nom complet *" autoComplete="name" autoCapitalize="words"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400" />
              <input value={form.customerPhone} onChange={e => onFormChange('customerPhone', e.target.value)}
                placeholder="Votre numéro WhatsApp * (ex. 0812345678)" type="tel" inputMode="tel" autoComplete="tel"
                aria-invalid={phoneWrong}
                className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400 ${phoneWrong ? 'border-red-300' : 'border-gray-200'}`} />
              {phoneWrong && <p className="text-[11px] text-red-500 -mt-1.5 px-1">Ce numéro semble incomplet.</p>}
              {usable.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 font-medium mb-1.5">Mes adresses</p>
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
                    {usable.map(a => {
                      const chosen = form.deliveryZone === a.city && form.commune === a.commune && form.avenue === a.avenue;
                      return (
                        <button key={a.id} type="button" onClick={() => pickAddress(a)} aria-pressed={chosen}
                          className={`shrink-0 max-w-[200px] text-left px-3 py-2 rounded-xl border text-xs ${chosen ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}>
                          <span className="block font-semibold text-gray-800 truncate">{a.label || a.commune || a.city}</span>
                          <span className="block text-gray-500 truncate">{[a.avenue, a.commune, a.city].filter(Boolean).join(', ')}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <select value={form.deliveryZone} onChange={e => { onFormChange('deliveryZone', e.target.value); onFormChange('commune', ''); }}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400 bg-white">
                <option value="">Ville de livraison *</option>
                {zones.map(z => (
                  <option key={z.city} value={z.city}>{z.city} — {z.fee.toLocaleString('fr-FR')} FC</option>
                ))}
              </select>
              {form.deliveryZone && (() => {
                const communes = CITY_COMMUNES[form.deliveryZone];
                return (
                  <>
                    {communes ? (
                      <select value={form.commune} onChange={e => onFormChange('commune', e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400 bg-white">
                        <option value="">Commune *</option>
                        {communes.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <input value={form.commune} onChange={e => onFormChange('commune', e.target.value)}
                        placeholder="Commune / Quartier *"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400" />
                    )}
                    <input value={form.avenue} onChange={e => onFormChange('avenue', e.target.value)}
                      placeholder="Avenue / Rue *" autoComplete="address-line1"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400" />
                    <input value={form.reference} onChange={e => onFormChange('reference', e.target.value)}
                      placeholder="Référence (ex: près de l'église rouge)"
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400" />
                  </>
                );
              })()}
              {form.deliveryZone && <PositionButton location={form.location} onChange={l => onFormChange('location', l)} />}

              <div>
                <p className="text-xs text-gray-500 font-medium mb-1.5">Livraison souhaitée</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {DELIVERY_DAYS.map(([day, label]) => (
                    <button key={day} type="button" onClick={() => onFormChange('deliveryDay', day)} aria-pressed={form.deliveryDay === day}
                      className={`py-2 rounded-xl border text-xs font-semibold ${form.deliveryDay === day ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-600'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <textarea value={form.notes} onChange={e => onFormChange('notes', e.target.value)}
                placeholder="Instructions supplémentaires (optionnel)"
                rows={2}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-green-400 resize-none" />

              {/* Récapitulatif : une ligne par produit, puis la livraison, puis le total. */}
              <div className="bg-gray-50 rounded-2xl p-3 space-y-1.5">
                <p className="text-xs text-gray-500 font-medium">Récapitulatif</p>
                {cart.map(({ product, qty }) => (
                  <div key={product.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-gray-700 min-w-0">
                      <span className="font-semibold">{qty} ×</span> {product.name}
                    </span>
                    <span className="font-semibold text-gray-800 whitespace-nowrap">{calcLineTotal(product, qty).toLocaleString('fr-FR')} {cur}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Livraison{form.deliveryZone ? ` — ${form.deliveryZone}` : ''}</span>
                  <span className="font-semibold text-orange-600 whitespace-nowrap">
                    {form.deliveryZone ? `${deliveryFee.toLocaleString('fr-FR')} FC` : 'choisis la ville'}
                  </span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex items-baseline justify-between">
                  <span className="text-sm font-black text-gray-900">Total</span>
                  <span className="text-right">
                    <span className="text-xl font-black text-gray-900">{total.toLocaleString('fr-FR')} {cur}</span>
                    {form.deliveryZone && <span className="text-base font-black text-orange-600"> + {deliveryFee.toLocaleString('fr-FR')} FC</span>}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 text-right">Paiement à la livraison</p>
              </div>
            </div>
          )}
        </div>

        {/* Bouton commander fixe en bas */}
        {cart.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 shrink-0 bg-white">
            <button
              onClick={onOrder}
              disabled={!canOrder}
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
              {ordering ? 'Envoi en cours...' : form.deliveryZone
                ? `Commander — ${total.toLocaleString('fr-FR')} ${cur} + ${deliveryFee.toLocaleString('fr-FR')} FC`
                : `Commander — ${total.toLocaleString('fr-FR')} ${cur}`}
            </button>
            {!ordering && missing.length > 0 && (
              <p className="text-[11px] text-gray-500 text-center mt-2">À compléter : {missing.join(', ')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface ProductMedia { id: string; url: string; type: string }

export const CITY_COMMUNES: Record<string, string[]> = {
  'Kinshasa': [
    'Bandalungwa', 'Barumbu', 'Bumbu', 'Gombe', 'Kalamu', 'Kasa-Vubu',
    'Kimbanseke', 'Kinshasa', 'Kintambo', 'Kisenso', 'Lemba', 'Limete',
    'Lingwala', 'Makala', 'Maluku', 'Masina', 'Matete', 'Mont-Ngafula',
    'Ndjili', 'Ngaba', 'Ngaliema', 'Ngiri-Ngiri', 'Nsele', 'Selembao',
  ],
  'Lubumbashi': [
    'Annexe', 'Kampemba', 'Kamalondo', 'Katuba', 'Kenya', 'Lubumbashi', 'Ruashi', 'Rwashi',
  ],
  'Kolwezi': [
    'Dilala', 'Kanina', 'Manika', 'Musonoï', 'Ravin', 'Nguba',
  ],
  'Matadi': [
    'Matadi', 'Mvuzi', 'Nzanza',
  ],
  'Boma': [
    'Boma-Bungu', 'Kalamu', 'Nzadi',
  ],
  'Muanda': [
    'Muanda',
  ],
};

interface Product {
  id: string;
  name: string;
  category: string;
  sellingPrice: number;
  comparePrice: number | null;
  bundleQty: number | null;
  bundlePrice: number | null;
  quantity: number;
  imageUrl: string | null;
  description: string | null;
  media: ProductMedia[];
  /** Variants: the model's name, and this one's (« M », « Rouge »). */
  variantGroup?: string | null;
  variantLabel?: string | null;
}

interface DeliveryZone { city: string; fee: number }

export interface FeedItem {
  id: string;
  url: string;
  type: string;
  caption: string | null;
  audioUrl: string | null;
  thumbnailUrl?: string | null;
  viewCount: number;
  likeCount: number;
  liked: boolean;
  product: Product;
}

// No account needed: a random id kept in this browser stands for the visitor, so a like
// counts once. Signed in, it is the account's id. Without storage it lasts for this visit.
let visitIdFallback: string | null = null;
export function visitorId(): string {
  const fresh = () => typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    // randomUUID only exists on https: same format from random bytes.
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c =>
      (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16));
  try {
    // Signed in, this is the account's own id (set at login, see api/customer).
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) { id = fresh(); localStorage.setItem(VISITOR_KEY, id); }
    return id;
  } catch {
    return visitIdFallback ??= fresh();
  }
}

// A new random order on every visit, like TikTok, without two reels of the same
// product back to back when another one can come between them.
function shuffleFeed(items: FeedItem[]): FeedItem[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  for (let i = 1; i < out.length; i++) {
    if (out[i].product.id !== out[i - 1].product.id) continue;
    const k = out.findIndex((it, idx) => idx > i && it.product.id !== out[i - 1].product.id);
    if (k > 0) [out[i], out[k]] = [out[k], out[i]];
  }
  return out;
}

export interface StoreProfile {
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  followers: number;
  following: boolean;
  likes: number;
  products: number;
}

// Sound is on for every reel, as on TikTok. The speaker button turns it off (or back on)
// for all of them at once, for the rest of the visit.
let soundOff = false;
const soundListeners = new Set<(off: boolean) => void>();
function setSoundOff(off: boolean) {
  soundOff = off;
  soundListeners.forEach(listener => listener(off));
}
function useSoundOff() {
  const [off, setOff] = useState(soundOff);
  useEffect(() => {
    soundListeners.add(setOff);
    return () => { soundListeners.delete(setOff); };
  }, []);
  return off;
}

/** Two taps closer than this are a double tap (like), not two pauses. */
const DOUBLE_TAP_MS = 280;

export const compactCount = (n: number) => new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

/** Seconds a reel stays on screen before it counts as seen. */
const VIEW_AFTER_MS = 2000;

interface StoreData {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  primaryColor: string;
  currency: string;
  metaPixelId: string | null;
  deliveryZones: DeliveryZone[];
  products: Product[];
}

interface Props {
  slug: string;
  initialReelId?: string;
  /** Opens on the catalogue instead of the reels. */
  initialView?: 'shop' | 'feed';
  /** Put in the cart on opening, cart shown: "Commander" from Ikele's global feed. */
  addProductId?: string;
  /** Inside Ikele: a way back to the marketplace. */
  onExit?: () => void;
}

// ── FeedCard — one TikTok slide ────────────────────────────────────────────────

export function FeedCard({
  item,
  color,
  currency,
  slug,
  isActive,
  isNext,
  profile,
  onOrder,
  onLike,
  onOpenProfile,
  onFollow,
}: {
  item: Omit<FeedItem, 'product'> & { product: { name: string; sellingPrice: number } };
  color: string;
  currency: string;
  slug: string;
  isActive: boolean;
  /** The reel after the one on screen: its video loads ahead so the swipe starts at once. */
  isNext: boolean;
  profile: Pick<StoreProfile, 'name' | 'slug' | 'logoUrl' | 'following'> | null;
  onOrder: () => void;
  /** liked: the state wanted, so a double tap only ever likes. */
  onLike: (liked: boolean) => void;
  onOpenProfile: () => void;
  onFollow: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const muted = useSoundOff();
  // The browser refused sound before the visitor's first touch: the reel plays silent
  // until then, and the first touch turns the sound on.
  const [blocked, setBlocked] = useState(false);
  const unlockedAt = useRef(0);
  const videoMuted = muted || blocked;
  const audioMuted = muted;
  const [isPlaying, setIsPlaying] = useState(true);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const [copied, setCopied] = useState(false);

  // Manage video play/pause when slide becomes active
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isActive) {
      v.currentTime = 0;
      v.muted = soundOff;
      v.play().then(() => setBlocked(false)).catch(() => {
        v.muted = true;
        setBlocked(true);
        v.play().catch(() => {});
      });
      setIsPlaying(true);
    } else {
      v.pause();
    }
  }, [isActive]);

  // React does not keep the muted property in step with its attribute: set it here.
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = videoMuted;
    if (audioRef.current) audioRef.current.muted = audioMuted;
  }, [videoMuted, audioMuted]);

  // The first touch anywhere (a tap, the end of a swipe) lets the sound in.
  useEffect(() => {
    if (!blocked || !isActive) return;
    const unlock = () => {
      unlockedAt.current = Date.now();
      setBlocked(false);
      const v = videoRef.current;
      if (v) { v.muted = soundOff; v.play().catch(() => {}); }
    };
    window.addEventListener('touchend', unlock, { once: true, capture: true });
    window.addEventListener('click', unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener('touchend', unlock, { capture: true });
      window.removeEventListener('click', unlock, { capture: true });
    };
  }, [blocked, isActive]);

  // Manage audio play/pause when slide becomes active
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!isActive) {
      a.pause();
      return;
    }
    a.currentTime = 0;
    // The store now opens on this slide: browsers refuse sound until the visitor's first touch.
    const retry = () => { a.play().catch(() => {}); };
    a.play().catch(() => {
      window.addEventListener('touchend', retry, { once: true, capture: true });
      window.addEventListener('click', retry, { once: true, capture: true });
    });
    return () => {
      window.removeEventListener('touchend', retry, { capture: true });
      window.removeEventListener('click', retry, { capture: true });
    };
  }, [isActive]);

  // Whether any sound control is relevant
  const hasVideo = item.type === 'video';
  const hasAudio = !!item.audioUrl;
  const showSoundBtn = hasVideo || hasAudio;

  const toggleMute = () => {
    if (blocked) { setBlocked(false); return; }
    setSoundOff(!muted);
  };

  const isMuted = hasVideo ? videoMuted : audioMuted;

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = shareUrl(links.reel(slug, item.id));
    if (navigator.share) {
      navigator.share({ title: item.product.name, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setIsPlaying(true); }
    else          { v.pause(); setIsPlaying(false); }
    setShowPlayIcon(true);
    setTimeout(() => setShowPlayIcon(false), 700);
  };

  // TikTok: one tap pauses, a double tap likes with a heart where the finger is. The
  // pause waits a moment, so a double tap doesn't pause too.
  const lastTap = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout>>();
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  useEffect(() => () => clearTimeout(singleTapTimer.current), []);

  const handleTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const now = Date.now();
    // The touch that just turned the sound on is not a pause.
    if (now - unlockedAt.current < 400) return;
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      clearTimeout(singleTapTimer.current);
      lastTap.current = 0;
      const box = e.currentTarget.getBoundingClientRect();
      const heart = { id: now, x: e.clientX - box.left, y: e.clientY - box.top };
      setHearts(h => [...h, heart]);
      setTimeout(() => setHearts(h => h.filter(x => x.id !== heart.id)), 900);
      if (!item.liked) onLike(true);
      return;
    }
    lastTap.current = now;
    singleTapTimer.current = setTimeout(togglePlay, DOUBLE_TAP_MS);
  };

  return (
    <div className="relative h-full w-full snap-start overflow-hidden bg-black flex-shrink-0 select-none"
      onClick={handleTap}>
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
          // Only the reel on screen and the next one download; the others wait their turn.
          preload={isActive || isNext ? 'auto' : 'none'}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <img src={item.url} alt={item.caption ?? item.product.name} className="absolute inset-0 w-full h-full object-cover" />
      )}

      {/* Play/Pause flash overlay */}
      {showPlayIcon && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="bg-black/40 rounded-full p-5">
            {isPlaying
              ? <Pause size={44} className="text-white drop-shadow-lg" />
              : <Play  size={44} className="text-white drop-shadow-lg" />}
          </div>
        </div>
      )}

      {/* Sound refused until the first touch: say so, as TikTok does. */}
      {blocked && isActive && showSoundBtn && !muted && (
        <div className="absolute top-16 inset-x-0 z-20 flex justify-center pointer-events-none">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-xs font-semibold">
            <VolumeX size={14} /> Touche l'écran pour activer le son
          </span>
        </div>
      )}

      {/* Sound toggle (top right) */}
      {showSoundBtn && (
        <button
          onClick={e => { e.stopPropagation(); toggleMute(); }}
          className="absolute top-4 right-4 z-20 w-9 h-9 bg-black/40 rounded-full flex items-center justify-center backdrop-blur-sm">
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

      {/* Double-tap hearts */}
      {hearts.map(h => (
        <Heart key={h.id} size={96}
          className="absolute z-30 text-red-500 fill-red-500 pointer-events-none drop-shadow-xl"
          style={{ left: h.x - 48, top: h.y - 48, animation: 'kza-heart 900ms ease-out forwards' }} />
      ))}

      {/* Store, likes and views (right side, as on TikTok) */}
      <div className="absolute right-3 bottom-56 z-20 flex flex-col items-center gap-4">
        {profile && (
          <div className="relative mb-2">
            <button
              onClick={e => { e.stopPropagation(); onOpenProfile(); }}
              aria-label={`Profil de ${profile.name}`}
              className="w-12 h-12 rounded-full border-2 border-white overflow-hidden flex items-center justify-center text-white font-black text-lg"
              style={{ background: color }}>
              {profile.logoUrl
                ? <img src={profile.logoUrl} alt="" className="w-full h-full object-cover" />
                : profile.name.charAt(0).toUpperCase()}
            </button>
            {!profile.following && (
              <button
                onClick={e => { e.stopPropagation(); onFollow(); }}
                aria-label={`S'abonner à ${profile.name}`}
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center">
                <Plus size={13} strokeWidth={3} />
              </button>
            )}
          </div>
        )}
        <button
          onClick={e => { e.stopPropagation(); onLike(!item.liked); }}
          aria-pressed={item.liked}
          aria-label={item.liked ? 'Retirer le like' : 'Liker'}
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
          <span className="w-11 h-11 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
            <Heart size={24}
              className={`transition-transform duration-200 ${item.liked ? 'text-red-500 fill-red-500 scale-110' : 'text-white'}`} />
          </span>
          <span className="text-white text-xs font-semibold drop-shadow">{compactCount(item.likeCount)}</span>
        </button>
        <div className="flex flex-col items-center gap-1" aria-label={`${item.viewCount} vues`}>
          <span className="w-11 h-11 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
            <Eye size={22} className="text-white" />
          </span>
          <span className="text-white text-xs font-semibold drop-shadow">{compactCount(item.viewCount)}</span>
        </div>
      </div>

      {/* Bottom bar — gradient + product info + CTA */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-14 bg-gradient-to-t from-black/80 via-black/40 to-transparent z-10">
        {profile && (
          <button
            onClick={e => { e.stopPropagation(); onOpenProfile(); }}
            className="text-white/90 text-sm font-semibold mb-1 drop-shadow">
            @{profile.slug}
          </button>
        )}
        <p className="text-white font-black text-lg leading-tight mb-0.5 drop-shadow-lg line-clamp-1">
          {item.product.name}
        </p>
        {item.caption && (
          <p className="text-white/75 text-sm mb-1 leading-snug line-clamp-2">{item.caption}</p>
        )}
        <p className="text-white font-bold text-xl drop-shadow mb-3">
          {Number(item.product.sellingPrice).toLocaleString('fr-FR')} {currency}
        </p>
        <div className="flex gap-2">
          <button
            onClick={e => { e.stopPropagation(); onOrder(); }}
            className="flex-1 py-3.5 rounded-2xl font-bold text-white text-sm flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-transform"
            style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
            <ShoppingBag size={18} />
            Commander
          </button>
          <button
            onClick={handleShare}
            className="w-12 py-3.5 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center active:scale-95 transition-transform relative">
            <Share2 size={18} className="text-white" />
            {copied && (
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black/80 text-white text-[10px] px-2 py-1 rounded-lg">
                Lien copié
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── OrderConfirmed ─────────────────────────────────────────────────────────────

/**
 * The customer's account after the order: 'created' by this order, already 'signed-in', or
 * 'existing' for a number that has one this device is not signed in to.
 */
type OrderAccount = 'created' | 'signed-in' | 'existing';

function OrderConfirmed({ total, currency, color, account, accountLink, onContinue, continueLabel = 'Continuer mes achats' }: {
  total: number;
  currency: string;
  color: string;
  account: OrderAccount;
  accountLink: string;
  onContinue: () => void;
  continueLabel?: string;
}) {
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
        <p className="font-bold text-lg mt-1" style={{ color: '#25d366' }}>{total.toLocaleString('fr-FR')} {currency}</p>
      </div>
      {account === 'signed-in' && (
        <a href={accountLink} className="text-sm font-semibold text-gray-700 underline">
          Suivre ma commande dans mon compte
        </a>
      )}
      {account === 'created' && (
        <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-gray-100 max-w-xs w-full text-left">
          <p className="font-bold text-gray-900 text-sm mb-1">Ton espace client est prêt</p>
          <p className="text-xs text-gray-500 mb-3">
            On t'a créé un compte avec ton numéro : suis ta livraison, retrouve tes commandes et tes adresses.
          </p>
          <a href={accountLink}
            className="block text-center py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: color }}>
            Voir mon espace client
          </a>
        </div>
      )}
      {account === 'existing' && (
        <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-gray-100 max-w-xs w-full text-left">
          <p className="font-bold text-gray-900 text-sm mb-1">Suis ta livraison en direct</p>
          <p className="text-xs text-gray-500 mb-3">
            Ce numéro a déjà un compte : connecte-toi pour retrouver cette commande.
          </p>
          <a href={accountLink}
            className="block text-center py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: color }}>
            Me connecter
          </a>
        </div>
      )}
      <button onClick={onContinue}
        className="px-6 py-3 rounded-2xl text-sm font-semibold text-white transition-all shadow-md"
        style={{ background: color }}>
        {continueLabel}
      </button>
    </div>
  );
}

// ── QuickOrder ─────────────────────────────────────────────────────────────────

/**
 * « Commander » under a reel on Ikele: that product alone and the order form, over the
 * reel, then the confirmation. No catalogue on the way.
 */
export function QuickOrder({ slug, productId, onClose }: { slug: string; productId: string; onClose: () => void }) {
  const [store, setStore] = useState<StoreData | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [confirmed, setConfirmed] = useState<{ total: number; account: OrderAccount } | null>(null);
  const { form, setForm, customer, signIn, addresses } = useOrderForm(slug);

  useEffect(() => {
    fetch(`${BASE}/store/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: StoreData) => {
        const product = data.products.find(p => p.id === productId);
        if (!product) { setError("Ce produit n'est plus disponible."); return; }
        setStore(data);
        setCart([{ product, qty: 1 }]);
        if (data.metaPixelId) {
          injectMetaPixel(data.metaPixelId);
          fbq('trackSingle', data.metaPixelId, 'InitiateCheckout', {
            content_ids: [product.id], content_type: 'product', value: product.sellingPrice, currency: data.currency,
          });
        }
      })
      .catch(() => setError('Connexion impossible, réessayez.'));
  }, [slug, productId]);

  const color = store?.primaryColor ?? '#6366f1';
  const total = cart.reduce((sum, i) => sum + calcLineTotal(i.product, i.qty), 0);
  const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);
  const deliveryFee = store?.deliveryZones?.find(z => z.city === form.deliveryZone)?.fee ?? 0;

  // Removing the only product closes the form.
  const updateQty = (_productId: string, delta: number) => {
    const qty = (cart[0]?.qty ?? 0) + delta;
    if (qty <= 0) onClose();
    else setCart(c => c.map(i => ({ ...i, qty })));
  };

  const order = async () => {
    if (!store || !orderFormComplete(form) || cart.length === 0) return;
    setOrdering(true);
    try {
      const { waUrl, account } = await submitStoreOrder(slug, form, cart, deliveryFee, readUtm(), 'ikele');
      if (account) signIn(account);
      window.open(waUrl, '_blank');
      if (store.metaPixelId) {
        fbq('trackSingle', store.metaPixelId, 'Purchase', {
          value: total + deliveryFee, currency: store.currency, content_ids: cart.map(i => i.product.id),
          content_type: 'product', num_items: totalItems,
        });
      }
      setConfirmed({ total, account: account ? 'created' : customer ? 'signed-in' : 'existing' });
      localStorage.removeItem(`form_${slug}`);
      setForm(f => ({ ...f, deliveryDay: '', location: null }));
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setOrdering(false);
    }
  };

  if (confirmed !== null) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <OrderConfirmed total={confirmed.total} currency={store?.currency ?? 'CDF'} color={color} account={confirmed.account}
          accountLink={links.account(slug)} onContinue={onClose} continueLabel="Continuer" />
      </div>
    );
  }

  if (!store) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={onClose}>
        <div className="w-full max-w-md bg-white rounded-t-3xl px-6 pt-8 pb-10 flex flex-col items-center gap-4 text-center"
          onClick={e => e.stopPropagation()}>
          {error ? (
            <>
              <Package size={36} className="text-gray-300" />
              <p className="text-sm text-gray-600">{error}</p>
              <button onClick={onClose} className="px-6 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold">Fermer</button>
            </>
          ) : <Loader2 size={28} className="animate-spin text-gray-400" />}
        </div>
      </div>
    );
  }

  return (
    <CartDrawer
      title="Commander" addresses={addresses} cart={cart} store={store} color={color} form={form}
      ordering={ordering} total={total} totalItems={totalItems}
      onClose={onClose}
      onUpdateQty={updateQty}
      onSwapProduct={(id, variant) => setCart(c => swapInCart(c, id, variant))}
      onFormChange={(field, value) => setForm(f => ({ ...f, [field]: value }))}
      onOrder={order}
    />
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PublicStore({ slug, initialReelId, initialView, addProductId, onExit }: Props) {
  const [store, setStore] = useState<StoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved: any[] = JSON.parse(localStorage.getItem(`cart_${slug}`) ?? '[]');
      return saved.map(i => ({ product: i.product, qty: i.qty }));
    } catch { return []; }
  });
  const [showCart, setShowCart] = useState(false);
  const [ordering, setOrdering] = useState(false);
  /** The order just sent: the confirmation screen shows its total and the account. */
  const [confirmed, setConfirmed] = useState<{ total: number; account: OrderAccount } | null>(null);
  const accountLink = links.account(slug);

  // The store opens on its reels; a store without any opens on its catalogue instead.
  const [view, setView] = useState<'shop' | 'feed'>(initialView ?? (addProductId ? 'shop' : 'feed'));
  const openingFeed = useRef(true);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  const { form, setForm, customer, signIn, addresses } = useOrderForm(slug);

  // Persist cart to localStorage
  useEffect(() => {
    localStorage.setItem(`cart_${slug}`, JSON.stringify(cart));
  }, [cart, slug]);

  const utmRef = useRef(readUtm());

  useEffect(() => {
    fetch(`${BASE}/store/${slug}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: StoreData) => {
        setStore(data);
        if (data.metaPixelId) {
          injectMetaPixel(data.metaPixelId);
          fbq('track', 'ViewContent', {
            content_name: data.name,
            content_type: 'product_group',
          });
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (view === 'feed' && feed.length === 0 && !feedLoading) {
      setFeedLoading(true);
      fetch(`${BASE}/store/${slug}/feed?visitor=${visitorId()}`)
        .then(r => r.json())
        .then(data => Array.isArray(data) ? shuffleFeed(data) : [])
        .catch(() => [] as FeedItem[])
        .then(items => {
          setFeed(items);
          if (items.length === 0 && openingFeed.current) setView('shop');
          openingFeed.current = false;
        })
        .finally(() => setFeedLoading(false));
    }
  }, [view]);

  // Track active slide for video autoplay via scroll position
  useEffect(() => {
    const container = feedRef.current;
    if (!container) return;
    const onScroll = () => {
      const index = Math.round(container.scrollTop / container.clientHeight);
      setActiveIndex(index);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
    // The container only exists once the loading and confirmation screens are gone.
  }, [view, loading, confirmed]);

  // A reel counts as seen once per visit, after staying on screen for a moment.
  const seenReels = useRef(new Set<string>());
  const activeReelId = view === 'feed' ? feed[activeIndex]?.id : undefined;
  useEffect(() => {
    if (!activeReelId || seenReels.current.has(activeReelId)) return;
    const timer = setTimeout(() => {
      seenReels.current.add(activeReelId);
      setFeed(f => f.map(it => it.id === activeReelId ? { ...it, viewCount: it.viewCount + 1 } : it));
      fetch(`${BASE}/store/${slug}/feed/${activeReelId}/view`, { method: 'POST' }).catch(() => {});
    }, VIEW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [activeReelId, slug]);

  const setLike = (id: string, liked: boolean) => {
    const item = feed.find(it => it.id === id);
    if (!item || item.liked === liked) return;
    const delta = liked ? 1 : -1;
    const apply = (likedNow: boolean, likeCount: number) =>
      setFeed(f => f.map(it => it.id === id ? { ...it, liked: likedNow, likeCount } : it));
    const addToProfile = (d: number) => setProfile(p => p && { ...p, likes: Math.max(0, p.likes + d) });
    apply(liked, Math.max(0, item.likeCount + delta));
    addToProfile(delta);
    fetch(`${BASE}/store/${slug}/feed/${id}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: visitorId(), liked }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((res: { liked: boolean; likeCount: number }) => apply(res.liked, res.likeCount))
      .catch(() => { apply(item.liked, item.likeCount); addToProfile(-delta); });
  };

  // The store's profile in the feed: followers, likes, products.
  const [profile, setProfile] = useState<StoreProfile | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  useEffect(() => {
    fetch(`${BASE}/store/${slug}/profile?visitor=${visitorId()}`)
      .then(r => r.ok ? r.json() : null)
      .then(p => setProfile(p))
      .catch(() => {});
  }, [slug]);

  const toggleFollow = () => {
    if (!profile) return;
    const following = !profile.following;
    const before = profile;
    setProfile({ ...profile, following, followers: Math.max(0, profile.followers + (following ? 1 : -1)) });
    fetch(`${BASE}/store/${slug}/follow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId: visitorId(), following }),
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((res: { following: boolean; followers: number }) => setProfile(p => p && { ...p, ...res }))
      .catch(() => setProfile(before));
  };

  // Deep-link: when initialReelId is set, open feed and scroll to the reel
  useEffect(() => {
    if (!initialReelId || feed.length === 0 || loading) return;
    const idx = feed.findIndex(f => f.id === initialReelId);
    if (idx < 0) return;
    setView('feed');
    setActiveIndex(idx);
    setTimeout(() => {
      feedRef.current?.scrollTo({ top: idx * (feedRef.current?.clientHeight ?? window.innerHeight), behavior: 'instant' });
    }, 100);
  }, [initialReelId, feed, loading]);

  // "Commander" from Ikele's global feed: the product waits in the cart, ready to order.
  const addedOnOpen = useRef(false);
  useEffect(() => {
    if (!addProductId || !store || addedOnOpen.current) return;
    addedOnOpen.current = true;
    const product = store.products.find(p => p.id === addProductId);
    if (!product) return;
    if (!cart.some(i => i.product.id === product.id)) addToCart(product);
    setShowCart(true);
  }, [addProductId, store]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { product, qty: 1 }];
    });
    fbq('track', 'AddToCart', {
      content_name: product.name,
      content_ids: [product.id],
      content_type: 'product',
      value: product.sellingPrice,
      currency: store?.currency ?? 'CDF',
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart(prev => prev
      .map(i => i.product.id === productId ? { ...i, qty: i.qty + delta } : i)
      .filter(i => i.qty > 0)
    );
  };

  const total = cart.reduce((sum, i) => sum + calcLineTotal(i.product, i.qty), 0);
  const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);
  const selectedZone = store?.deliveryZones?.find(z => z.city === form.deliveryZone);
  const deliveryFee = selectedZone?.fee ?? 0;
  const grandTotal = total + deliveryFee;

  const handleOrder = async () => {
    if (!orderFormComplete(form) || cart.length === 0) return;
    setOrdering(true);
    try {
      const { waUrl, account } = await submitStoreOrder(slug, form, cart, deliveryFee, utmRef.current);
      if (account) signIn(account);
      // Client envoie depuis son propre numéro vers le business
      window.open(waUrl, '_blank');
      fbq('track', 'Purchase', {
        value: grandTotal,
        currency: store?.currency ?? 'CDF',
        content_ids: cart.map(i => i.product.id),
        content_type: 'product',
        num_items: totalItems,
      });
      setConfirmed({ total, account: account ? 'created' : customer ? 'signed-in' : 'existing' });
      setCart([]);
      localStorage.removeItem(`cart_${slug}`);
      localStorage.removeItem(`form_${slug}`);
      setForm(f => ({ ...f, deliveryDay: '', location: null }));
    } catch (e) {
      window.alert((e as Error).message);
    }
    finally { setOrdering(false); }
  };

  const color = store?.primaryColor ?? '#6366f1';
  const handleFormChange = <K extends keyof OrderForm>(field: K, value: OrderForm[K]) => setForm(f => ({ ...f, [field]: value }));

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

  if (confirmed !== null) {
    return (
      <OrderConfirmed total={confirmed.total} currency={store?.currency ?? 'CDF'} color={color} account={confirmed.account}
        accountLink={accountLink} onContinue={() => setConfirmed(null)} />
    );
  }

  // ── FEED VIEW ──────────────────────────────────────────────────────────────

  if (view === 'feed') {
    return (
      <div className="relative h-screen w-full bg-black overflow-hidden">
        {/* Back + cart buttons */}
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
          {onExit && (
            <button onClick={onExit} aria-label="Retour"
              className="w-9 h-9 rounded-xl bg-black/40 backdrop-blur-sm text-white flex items-center justify-center">
              <ArrowLeft size={16} />
            </button>
          )}
          <button
            onClick={() => setView('shop')}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/40 backdrop-blur-sm text-white text-sm font-medium">
            <LayoutGrid size={15} />
            Boutique
          </button>
          <a href={accountLink} aria-label={customer ? 'Mon compte' : 'Se connecter'}
            className="w-9 h-9 rounded-xl bg-black/40 backdrop-blur-sm text-white flex items-center justify-center">
            <User size={15} />
          </a>
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
              slug={slug}
              isActive={i === activeIndex}
              isNext={i === activeIndex + 1}
              profile={profile}
              onOrder={() => { addToCart(item.product); setShowCart(true); }}
              onLike={liked => setLike(item.id, liked)}
              onOpenProfile={() => setShowProfile(true)}
              onFollow={toggleFollow}
            />
          ))}
        </div>

        <style>{`@keyframes kza-heart {
          0% { transform: scale(0.4) rotate(-12deg); opacity: 0; }
          20% { transform: scale(1.15) rotate(-12deg); opacity: 1; }
          40% { transform: scale(1) rotate(-12deg); opacity: 1; }
          100% { transform: scale(1.1) translateY(-80px) rotate(-12deg); opacity: 0; }
        }`}</style>

        {showProfile && profile && (
          <div className="absolute inset-0 z-40 flex items-end" onClick={() => setShowProfile(false)}>
            <div className="absolute inset-0 bg-black/50" />
            <div className="relative w-full bg-white rounded-t-3xl px-5 pt-6 pb-8 text-center" onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowProfile(false)} aria-label="Fermer"
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <X size={16} className="text-gray-500" />
              </button>
              <div className="w-20 h-20 mx-auto rounded-full overflow-hidden flex items-center justify-center text-white font-black text-3xl"
                style={{ background: color }}>
                {profile.logoUrl
                  ? <img src={profile.logoUrl} alt="" className="w-full h-full object-cover" />
                  : profile.name.charAt(0).toUpperCase()}
              </div>
              <p className="mt-3 font-black text-lg text-gray-900">{profile.name}</p>
              <p className="text-sm text-gray-400">@{profile.slug}</p>
              <div className="grid grid-cols-3 gap-2 my-5">
                {([
                  [profile.followers, 'Abonnés'],
                  [profile.likes, "J'aime"],
                  [profile.products, 'Produits'],
                ] as const).map(([n, label]) => (
                  <div key={label}>
                    <p className="font-black text-lg text-gray-900">{compactCount(n)}</p>
                    <p className="text-xs text-gray-500">{label}</p>
                  </div>
                ))}
              </div>
              {profile.description && <p className="text-sm text-gray-600 mb-5 line-clamp-3">{profile.description}</p>}
              <div className="flex gap-2">
                <button onClick={toggleFollow}
                  className={`flex-1 py-3 rounded-2xl font-bold text-sm ${profile.following ? 'bg-gray-100 text-gray-700' : 'text-white'}`}
                  style={profile.following ? undefined : { background: '#ef4444' }}>
                  {profile.following ? 'Abonné ✓' : "S'abonner"}
                </button>
                <button onClick={() => { setShowProfile(false); setView('shop'); }}
                  className="flex-1 py-3 rounded-2xl font-bold text-sm text-white" style={{ background: color }}>
                  Voir les produits
                </button>
              </div>
            </div>
          </div>
        )}

        {showCart && (
          <CartDrawer
            addresses={addresses} cart={cart} store={store} color={color} form={form}
            ordering={ordering} total={total} totalItems={totalItems}
            onClose={() => setShowCart(false)}
            onUpdateQty={updateQty}
            onSwapProduct={(id, variant) => setCart(c => swapInCart(c, id, variant))}
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
            {onExit && (
              <button onClick={onExit} aria-label="Retour" className="-ml-1 p-1.5 rounded-lg hover:bg-gray-100 text-gray-600">
                <ArrowLeft size={18} />
              </button>
            )}
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
            <a href={accountLink} aria-label={customer ? 'Mon compte' : 'Se connecter'}
              className="w-9 h-9 rounded-xl border border-gray-200 hover:border-gray-300 flex items-center justify-center text-gray-600">
              <User size={16} />
            </a>
            {/* Feed toggle */}
            <button
              onClick={() => setView('feed')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-gray-200 hover:border-gray-300 text-gray-600 transition-colors">
              <Film size={16} />
              Voir les Reels
            </button>

            {/* Cart */}
            <button
              onClick={() => {
                setShowCart(true);
                if (totalItems > 0) {
                  fbq('track', 'InitiateCheckout', {
                    value: total,
                    currency: store?.currency ?? 'CDF',
                    num_items: totalItems,
                  });
                }
              }}
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
      <main className="max-w-4xl mx-auto px-4 py-6 pb-[25vh]">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {store!.products.map(p => {
            const inCart = cart.find(i => i.product.id === p.id);
            const imgUrl = resolveImg(p.imageUrl);
            return (
              <div key={p.id} className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 hover:shadow-md transition-all">
                <div className="aspect-square bg-gray-50 flex items-center justify-center overflow-hidden relative">
                  {imgUrl
                    ? <img src={imgUrl} alt={p.name} className="w-full h-full object-cover" />
                    : <Package size={32} className="text-gray-200" />}
                  {p.quantity > 0 && p.quantity <= 5 && (
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      <Flame size={9} />
                      Dernier{p.quantity > 1 ? 's' : ''} {p.quantity}
                    </div>
                  )}
                  {p.quantity > 5 && p.quantity <= 15 && (
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-orange-400 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      <Clock size={9} />
                      Stock limité
                    </div>
                  )}
                </div>
                <div className="p-3" onClick={() => setDetailProduct(p)} style={{ cursor: 'pointer' }}>
                  <p className="font-semibold text-gray-900 text-sm leading-tight mb-0.5 line-clamp-2">{p.name}</p>
                  {p.category && <p className="text-xs text-gray-400 mb-1">{p.category}</p>}
                  {p.description && <p className="text-xs text-gray-500 leading-relaxed mb-1.5 line-clamp-2">{p.description}</p>}
                  {/* Bundle badge */}
                  {p.bundleQty && p.bundlePrice && (
                    <div className="inline-flex items-center gap-1 bg-violet-50 text-violet-600 text-[10px] font-bold px-2 py-0.5 rounded-full mb-1.5 border border-violet-100">
                      🎁 {p.bundleQty} pcs → {p.bundlePrice.toLocaleString('fr-FR')} {store?.currency ?? 'CDF'}
                    </div>
                  )}
                  {/* Prix */}
                  <div className="flex items-baseline gap-1.5 mb-3">
                    <p className="font-black text-sm" style={{ color }}>{Number(p.sellingPrice).toLocaleString('fr-FR')} {store?.currency ?? 'CDF'}</p>
                    {p.comparePrice && Number(p.comparePrice) > Number(p.sellingPrice) && (
                      <p className="text-xs text-gray-400 line-through">{Number(p.comparePrice).toLocaleString('fr-FR')} {store?.currency ?? 'CDF'}</p>
                    )}
                  </div>
                  {inCart ? (
                    <div className="flex items-center justify-between" onClick={e => e.stopPropagation()}>
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
                    <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
                      <button onClick={() => { addToCart(p); setShowCart(true); }}
                        className="w-full py-2 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1"
                        style={{ background: color }}>
                        <ShoppingBag size={12} />
                        Commander
                      </button>
                      <button onClick={() => addToCart(p)}
                        className="w-full py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1"
                        style={{ borderColor: color, color }}>
                        <Plus size={12} />
                        Ajouter au panier
                      </button>
                    </div>
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
          addresses={addresses} cart={cart} store={store} color={color} form={form}
          ordering={ordering} total={total} totalItems={totalItems}
          onClose={() => setShowCart(false)}
          onUpdateQty={updateQty}
          onSwapProduct={(id, variant) => setCart(c => swapInCart(c, id, variant))}
          onFormChange={handleFormChange}
          onOrder={handleOrder}
        />
      )}

      {/* ── Product Detail Sheet ── */}
      {detailProduct && (() => {
        const p = detailProduct;
        const cur = store?.currency ?? 'CDF';
        const inCart = cart.find(i => i.product.id === p.id);
        const videoMedia = p.media?.find(m => m.type === 'video');
        const imgMedia = p.media?.filter(m => m.type !== 'video') ?? [];
        return (
          <div className="fixed inset-0 z-50 flex items-end">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDetailProduct(null)} />
            <div className="relative w-full bg-white rounded-t-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
              {/* Close bar */}
              <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
                <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-3" />
                <button onClick={() => setDetailProduct(null)} className="ml-auto p-1.5 rounded-xl hover:bg-gray-100 transition-colors">
                  <ArrowLeft size={18} className="text-gray-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Video reel */}
                {videoMedia && (
                  <div className="relative w-full bg-black" style={{ height: '42vw', maxHeight: 260 }}>
                    <video
                      src={resolveImg(videoMedia.url) ?? undefined}
                      autoPlay muted loop playsInline
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
                      <Film size={9} /> Vidéo produit
                    </div>
                  </div>
                )}
                {/* Image fallback if no video */}
                {!videoMedia && (p.imageUrl || imgMedia.length > 0) && (
                  <div className="w-full bg-gray-50" style={{ height: '42vw', maxHeight: 260 }}>
                    <img
                      src={resolveImg(imgMedia[0]?.url ?? p.imageUrl) ?? ''}
                      alt={p.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <div className="p-5 space-y-4">
                  {/* Header */}
                  <div>
                    {p.category && <p className="text-xs text-gray-400 mb-1 uppercase tracking-wide">{p.category}</p>}
                    <h2 className="text-xl font-black text-gray-900 leading-tight">{p.name}</h2>
                  </div>

                  {/* Prix */}
                  <div className="flex items-baseline gap-3">
                    <p className="text-2xl font-black" style={{ color }}>{Number(p.sellingPrice).toLocaleString('fr-FR')} {cur}</p>
                    {p.comparePrice && Number(p.comparePrice) > Number(p.sellingPrice) && (
                      <p className="text-base text-gray-400 line-through">{Number(p.comparePrice).toLocaleString('fr-FR')} {cur}</p>
                    )}
                    {p.comparePrice && Number(p.comparePrice) > Number(p.sellingPrice) && (
                      <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">
                        -{Math.round((1 - Number(p.sellingPrice) / Number(p.comparePrice)) * 100)}%
                      </span>
                    )}
                  </div>

                  {/* Bundle offer */}
                  {p.bundleQty && p.bundlePrice && (
                    <div className="bg-violet-50 border border-violet-100 rounded-2xl p-3">
                      <p className="text-xs text-violet-500 font-semibold uppercase tracking-wide mb-1">Offre groupée</p>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-700">1 pièce</p>
                          <p className="text-sm font-bold text-gray-900">{Number(p.sellingPrice).toLocaleString('fr-FR')} {cur}</p>
                        </div>
                        <div className="w-px h-8 bg-violet-100" />
                        <div className="text-right">
                          <p className="text-sm text-violet-700 font-semibold">{p.bundleQty} pièces 🎁</p>
                          <p className="text-sm font-black text-violet-700">{p.bundlePrice.toLocaleString('fr-FR')} {cur}</p>
                          <p className="text-[10px] text-violet-500">({(p.bundlePrice / p.bundleQty).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} {cur}/pcs)</p>
                        </div>
                      </div>
                      <button
                        className="w-full mt-3 py-2 rounded-xl text-xs font-bold text-white text-center"
                        style={{ background: color }}
                        onClick={() => {
                          setCart(prev => {
                            const existing = prev.find(i => i.product.id === p.id);
                            if (existing) return prev.map(i => i.product.id === p.id ? { ...i, qty: i.qty + p.bundleQty! } : i);
                            return [...prev, { product: p, qty: p.bundleQty! }];
                          });
                          setDetailProduct(null);
                          setShowCart(true);
                        }}>
                        🎁 Prendre {p.bundleQty} pièces — {p.bundlePrice.toLocaleString('fr-FR')} {cur}
                      </button>
                    </div>
                  )}

                  {/* Description */}
                  {p.description && (
                    <div>
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Description</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{p.description}</p>
                    </div>
                  )}

                  {/* Stock */}
                  {p.quantity > 0 && p.quantity <= 10 && (
                    <div className="flex items-center gap-1.5 text-orange-500 text-sm font-semibold">
                      <Flame size={14} />
                      Plus que {Math.floor(p.quantity)} en stock
                    </div>
                  )}

                  {/* Zones de livraison */}
                  {store?.deliveryZones && store.deliveryZones.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-2">Livraison disponible</p>
                      <div className="flex flex-wrap gap-2">
                        {store.deliveryZones.map(z => (
                          <div key={z.city} className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-1.5 text-center">
                            <p className="text-xs font-semibold text-gray-800">{z.city}</p>
                            <p className="text-[10px] text-gray-500">{z.fee.toLocaleString('fr-FR')} FC</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* CTA bas */}
              <div className="px-5 py-4 border-t border-gray-100 shrink-0 bg-white">
                {inCart ? (
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <button onClick={() => updateQty(p.id, -1)}
                        className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center hover:bg-gray-50">
                        {inCart.qty === 1 ? <Trash2 size={15} className="text-red-400" /> : <Minus size={15} />}
                      </button>
                      <span className="font-black text-lg flex-1 text-center">{inCart.qty}</span>
                      <button onClick={() => updateQty(p.id, 1)}
                        className="w-10 h-10 rounded-xl text-white flex items-center justify-center"
                        style={{ background: color }}>
                        <Plus size={15} />
                      </button>
                    </div>
                    <button onClick={() => { setDetailProduct(null); setShowCart(true); }}
                      className="flex-1 py-3 rounded-xl font-bold text-white"
                      style={{ background: color }}>
                      Voir panier ({inCart.qty})
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-3">
                    <button onClick={() => { addToCart(p); setDetailProduct(null); setShowCart(true); }}
                      className="flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2"
                      style={{ background: color }}>
                      <ShoppingBag size={16} />
                      Commander maintenant
                    </button>
                    <button onClick={() => { addToCart(p); setDetailProduct(null); }}
                      className="px-4 py-3 rounded-xl font-bold border flex items-center justify-center"
                      style={{ borderColor: color, color }}>
                      <Plus size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
