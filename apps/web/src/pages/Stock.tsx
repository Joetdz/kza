import { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Edit2, Trash2, TrendingUp, TrendingDown, History, Search, ImagePlus, X, RefreshCw, MapPin, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { NumberInput } from '../components/ui/NumberInput';
import { CardsSkeleton } from '../components/ui/Skeleton';
import { useCurrency } from '../hooks/useCurrency';
import { formatDate } from '../utils/formatters';
import { uploadApi, categoriesApi, resolveImageUrl, productsApi } from '../api';
import { toast } from '../hooks/useToast';
import type { Product, StockMovement } from '../types';
import { logisticsApi, type StockLocation, type LocationStock } from '../api/logistics';
import { useModules } from '../hooks/useModules';
import { useSegment } from '../hooks/useSegment';
import { averageUnitCost, firstItem } from '@kza/shared';

const generateSku = () => 'PRD-' + Math.random().toString(36).slice(2, 8).toUpperCase();

// Without the stock module, new catalogue items are services (no quantity to track).
const emptyProduct = (trackStock = true): Omit<Product, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: '', sku: generateSku(), category: '', quantity: 0, alertThreshold: 5,
  supplier: '', acquisitionCost: 0, sellingPrice: 0, imageUrl: undefined,
  entryDate: new Date().toISOString().split('T')[0], trackStock,
  variantGroup: null, variantLabel: null,
});

// Every combination of the axis values: [[S, M], [Rouge, Bleu]] → S / Rouge, S / Bleu, M / Rouge, M / Bleu.
const combineAxes = (axes: { values: string }[]): string[] => {
  const lists = axes
    .map(a => [...new Set(a.values.split(',').map(v => v.trim()).filter(Boolean))])
    .filter(l => l.length > 0);
  if (lists.length === 0) return [];
  return lists.reduce<string[]>((acc, list) => acc.flatMap(prefix => list.map(v => prefix ? `${prefix} / ${v}` : v)), ['']);
};

type ListItem =
  | { kind: 'product'; product: Product }
  | { kind: 'group'; name: string; variants: Product[] };


export function Stock() {
  const { products, movements, loading, addProduct, updateProduct, deleteProduct, addMovement } = useStore();
  const { fmt: MAD, currency } = useCurrency();
  const { has: hasModule } = useModules();
  const tracksStock = hasModule('stock');
  const { terms, words } = useSegment();
  const variantsEnabled = hasModule('variants');
  const agendaEnabled = hasModule('agenda');
  const invoicesEnabled = hasModule('invoices');

  // Variant creation: one model name + axes (Taille: S, M, L / Couleur: Rouge, Bleu).
  const [variantMode, setVariantMode] = useState(false);
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [axes, setAxes] = useState([{ name: 'Taille', values: '' }, { name: 'Couleur', values: '' }]);
  const [variantQty, setVariantQty] = useState<Record<string, number>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const variantLabels = useMemo(() => combineAxes(axes), [axes]);

  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    categoriesApi.getAll().then(cats => setCategories(cats.map(c => c.name))).catch(() => {});
  }, []);

  const [submitting, setSubmitting] = useState(false);
  const [submittingMov, setSubmittingMov] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(emptyProduct());
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [movementProduct, setMovementProduct] = useState<Product | null>(null);
  const [movForm, setMovForm] = useState({
    type: 'in' as 'in' | 'out',
    quantity: 1,
    reason: '',
    date: new Date().toISOString().split('T')[0],
    purchaseCost: 0,
    freightCost: 0,
  });
  const [histProduct, setHistProduct] = useState<Product | null>(null);
  const [allocProduct, setAllocProduct] = useState<Product | null>(null);
  const [allocLocations, setAllocLocations] = useState<StockLocation[]>([]);
  const [allocMap, setAllocMap] = useState<Record<string, string>>({});
  const [allocLoading, setAllocLoading] = useState(false);
  const [allocSubmitting, setAllocSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() =>
    products.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase())
    ),
    [products, search]
  );

  // Variants of the same model share one card, placed where the first one appears.
  const listItems = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    const groups = new Map<string, Product[]>();
    for (const p of filtered) {
      if (!p.variantGroup) { items.push({ kind: 'product', product: p }); continue; }
      let g = groups.get(p.variantGroup);
      if (!g) { g = []; groups.set(p.variantGroup, g); items.push({ kind: 'group', name: p.variantGroup, variants: g }); }
      g.push(p);
    }
    for (const g of groups.values()) g.sort((x, y) => (x.variantLabel ?? '').localeCompare(y.variantLabel ?? '', 'fr', { numeric: true }));
    return items;
  }, [filtered]);

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const result = await productsApi.reconcile();
      useStore.setState(s => ({
        products: s.products.map(p => {
          const found = result.products.find(u => u.id === p.id);
          return found ?? p;
        }),
      }));
      toast.success(
        result.fixedCount > 0
          ? `Stock recalculé — ${result.fixedCount} élément(s) corrigé(s)`
          : 'Stock déjà à jour — aucune correction nécessaire',
      );
    } catch {
      toast.error('Erreur lors du recalcul du stock');
    } finally {
      setReconciling(false);
    }
  };

  const resetVariantForm = () => {
    setAxes([{ name: 'Taille', values: '' }, { name: 'Couleur', values: '' }]);
    setVariantQty({});
  };
  const openAdd = () => {
    setEditing(null); setForm(emptyProduct(tracksStock));
    setVariantMode(false); setAddingToGroup(null); resetVariantForm();
    setModalOpen(true);
  };
  // New variants for an existing model: same form, model name fixed, settings copied from a sibling.
  const openAddVariants = (group: string, sibling: Product) => {
    setEditing(null);
    setForm({
      ...emptyProduct(sibling.trackStock ?? true), name: group, category: sibling.category, supplier: sibling.supplier,
      alertThreshold: sibling.alertThreshold, acquisitionCost: sibling.acquisitionCost, sellingPrice: sibling.sellingPrice, imageUrl: sibling.imageUrl,
    });
    setVariantMode(true); setAddingToGroup(group);
    setAxes([{ name: 'Variante', values: '' }]); setVariantQty({});
    setModalOpen(true);
  };
  const renameGroup = async (group: string) => {
    const to = prompt('Nouveau nom du modèle', group)?.trim();
    if (!to || to === group) return;
    try {
      const updated = await productsApi.renameVariantGroup(group, to);
      useStore.setState(st => ({ products: st.products.map(p => updated.find(u => u.id === p.id) ?? p) }));
      toast.success('Modèle renommé');
    } catch { toast.error('Erreur lors du renommage'); }
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    // acquisitionCost stored as unit cost → show as total in form
    setForm({ name: p.name, sku: p.sku, category: p.category, quantity: p.quantity, alertThreshold: p.alertThreshold, supplier: p.supplier, acquisitionCost: p.acquisitionCost * p.quantity, sellingPrice: p.sellingPrice ?? 0, imageUrl: p.imageUrl, entryDate: p.entryDate, trackStock: p.trackStock ?? true, variantGroup: p.variantGroup ?? null, variantLabel: p.variantLabel ?? null, durationMinutes: p.durationMinutes ?? null, priceTiers: p.priceTiers ?? null });
    setVariantMode(false); setAddingToGroup(null);
    setModalOpen(true);
  };

  const openAlloc = async (p: Product) => {
    setAllocProduct(p);
    setAllocLoading(true);
    try {
      const [locs, existing] = await Promise.all([
        logisticsApi.getLocations(),
        logisticsApi.getProductAllocations(p.id),
      ]);
      setAllocLocations(locs);
      const map: Record<string, string> = {};
      for (const e of existing) map[e.locationId] = String(e.quantity);
      setAllocMap(map);
    } catch { /* ignore */ }
    finally { setAllocLoading(false); }
  };

  const handleSaveAlloc = async () => {
    if (!allocProduct) return;
    setAllocSubmitting(true);
    try {
      const defaultLocIds = new Set(allocLocations.filter(l => l.isDefault).map(l => l.id));
      const entries = Object.entries(allocMap).filter(([locId, q]) => q !== '' && Number(q) >= 0 && !defaultLocIds.has(locId));
      // Sequential, not Promise.all: the backend validates each location's quantity
      // against "what's already affected elsewhere" by reading the other locations'
      // current rows. Firing all of them in parallel lets several requests read the
      // same stale snapshot before any of them writes, so each one sees stock as still
      // free and passes — letting the same units get over-affected across locations.
      // One at a time, each write lands before the next request reads.
      for (const [locationId, quantity] of entries) {
        await logisticsApi.setLocationStock(locationId, { productId: allocProduct.id, quantity: Number(quantity) });
      }
      toast.success('Affectations enregistrées');
      setAllocProduct(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'Erreur lors de la sauvegarde');
    }
    finally { setAllocSubmitting(false); }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadApi.uploadImage(file);
      setForm(f => ({ ...f, imageUrl: url }));
    } catch (err: any) {
      setUploadError(err?.message ?? 'Erreur upload');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Once a product tracks stock, its quantity, cost and entry date are read-only here.
  const stockLocked = !!editing && (editing.trackStock ?? true) && !!form.trackStock;
  const viaMovements = 'Modifiable uniquement par une entrée ou une sortie de stock';

  const handleSave = async () => {
    if (!form.name) return;
    if (variantMode && !editing) return handleSaveVariants();
    setSubmitting(true);
    // Services (trackStock=false): acquisitionCost is already a unit cost, no division needed
    const unitCost = (form.trackStock && form.quantity > 0)
      ? form.acquisitionCost / form.quantity
      : form.acquisitionCost;
    try {
      if (editing) {
        // When editing, only send quantity if the user explicitly changed it — avoids
        // overwriting DB quantity that was modified by movements/sales since modal opened
        const { quantity, acquisitionCost, entryDate, ...rest } = form;
        const patch: Partial<typeof form> = stockLocked ? rest : { ...rest, entryDate, acquisitionCost: unitCost };
        if (!stockLocked && quantity !== editing.quantity) patch.quantity = quantity;
        await updateProduct(editing.id, patch);
      } else {
        await addProduct({ ...form, acquisitionCost: unitCost });
      }
      setModalOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveVariants = async () => {
    if (variantLabels.length === 0) { toast.error('Ajoutez au moins une valeur de variante'); return; }
    if (variantLabels.length > 100) { toast.error('100 variantes maximum à la fois'); return; }
    setSubmitting(true);
    try {
      const created = await productsApi.createVariants({
        group: form.name, labels: variantLabels,
        quantities: form.trackStock ? variantQty : undefined,
        category: form.category, alertThreshold: form.alertThreshold, supplier: form.supplier,
        acquisitionCost: form.acquisitionCost, sellingPrice: form.sellingPrice,
        imageUrl: form.imageUrl, entryDate: form.entryDate, trackStock: form.trackStock ?? true,
      });
      useStore.setState(st => ({ products: [...created, ...st.products] }));
      setExpandedGroups(g => ({ ...g, [form.name.trim()]: true }));
      toast.success(`${created.length} variante${created.length > 1 ? 's' : ''} ajoutée${created.length > 1 ? 's' : ''}`);
      setModalOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Erreur lors de la création des variantes');
    } finally {
      setSubmitting(false);
    }
  };

  const unitAcquisitionCost = movForm.quantity > 0
    ? (movForm.purchaseCost + movForm.freightCost) / movForm.quantity
    : 0;

  const handleMovement = async () => {
    if (!movementProduct || movForm.quantity <= 0) return;
    setSubmittingMov(true);
    try {
      const { purchaseCost, freightCost, ...movData } = movForm;
      await addMovement({
        productId: movementProduct.id, ...movData,
        ...(movForm.type === 'in' && unitAcquisitionCost > 0 ? { unitCost: unitAcquisitionCost } : {}),
      });
      setMovementProduct(null);
    } finally {
      setSubmittingMov(false);
    }
  };

  const productMovements = (productId: string): StockMovement[] =>
    movements.filter(m => m.productId === productId).sort((a, b) => b.date.localeCompare(a.date));

  const field = (key: keyof typeof form, label: string, type = 'text', opts?: string[], hint?: string, locked = false) => (
    <div>
      <label className="text-xs font-medium text-gray-600 mb-1 block">{label}</label>
      {locked ? (
        <input
          type={type}
          disabled
          value={type === 'date' ? String(form[key] ?? '').slice(0, 10) : String(form[key] ?? '')}
          className="w-full border border-gray-100 bg-gray-100 text-gray-500 rounded-xl px-3 py-2.5 text-sm cursor-not-allowed"
        />
      ) : opts ? (
        <select
          value={form[key] as string}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
        >
          <option value="">Choisir...</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === 'number' ? (
        <NumberInput
          value={form[key] as number}
          onChange={val => setForm(f => ({ ...f, [key]: val }))}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
        />
      ) : (
        <input
          type={type}
          value={form[key] as string}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
        />
      )}
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );

  const renderProductCard = (p: Product) => {
            const isLow = (p.trackStock ?? true) && p.quantity <= p.alertThreshold;
            return (
              <div
                key={p.id}
                className={`bg-white rounded-2xl p-4 shadow-sm border transition-all ${isLow ? 'border-red-200 bg-red-50/30' : 'border-gray-100'}`}
              >
                {/* Header : image + nom + badge */}
                <div className="flex items-center gap-3 mb-3">
                  {p.imageUrl ? (
                    <img src={resolveImageUrl(p.imageUrl)!} alt={p.name} className="w-11 h-11 rounded-xl object-cover shrink-0 border border-gray-100" />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                      <ImagePlus size={16} className="text-gray-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 truncate text-sm">{p.name}</div>
                    <div className="text-xs text-gray-400 truncate">{p.sku}{p.category ? ` · ${p.category}` : ''}</div>
                  </div>
                  {isLow && <Badge color="red" size="sm">Bas</Badge>}
                  {!(p.trackStock ?? true) && <Badge color="gray" size="sm">Service</Badge>}
                </div>

                {/* Stats : 3 colonnes */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {(p.trackStock ?? true) ? (
                    <div className={`rounded-xl p-2.5 text-center ${isLow ? 'bg-red-50' : 'bg-gray-50'}`}>
                      <div className="text-xs text-gray-500 mb-0.5">Stock</div>
                      <div className={`text-xl font-black ${isLow ? 'text-red-600' : 'text-gray-900'}`}>{p.quantity}</div>
                      <div className="text-[10px] text-gray-400">/{p.alertThreshold}</div>
                    </div>
                  ) : (
                    <div className="rounded-xl p-2.5 text-center bg-gray-50">
                      <div className="text-xs text-gray-500 mb-0.5">Type</div>
                      <div className="text-sm font-bold text-gray-400">Service</div>
                      <div className="text-[10px] text-gray-400">sans stock</div>
                    </div>
                  )}
                  <div className="bg-gray-50 rounded-xl p-2.5 text-center">
                    <div className="text-xs text-gray-500 mb-0.5">Achat</div>
                    <div className="text-xs font-bold text-gray-900 truncate">{MAD(p.acquisitionCost)}</div>
                    <div className="text-[10px] text-gray-400">/unité</div>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
                    <div className="text-xs text-emerald-600 mb-0.5">Valeur</div>
                    <div className="text-xs font-bold text-emerald-700 truncate">
                      {p.sellingPrice > 0 ? MAD(p.sellingPrice * p.quantity) : '—'}
                    </div>
                    <div className="text-[10px] text-gray-400 truncate">
                      {p.sellingPrice > 0 ? `${MAD(p.sellingPrice)}/u` : '—'}
                    </div>
                  </div>
                </div>

                {/* Fournisseur */}
                {p.supplier && (
                  <div className="text-xs text-gray-400 mb-3 truncate">
                    <span className="font-medium text-gray-500">Fournisseur:</span> {p.supplier}
                  </div>
                )}

                {/* Actions */}
                <div className="grid grid-cols-2 gap-1.5">
                  {(p.trackStock ?? true) && (
                    <>
                      <button
                        onClick={() => { setMovementProduct(p); setMovForm({ type: 'in', quantity: 1, reason: '', date: new Date().toISOString().split('T')[0], purchaseCost: 0, freightCost: 0 }); }}
                        className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors"
                      >
                        <TrendingUp size={13} /> Entrée
                      </button>
                      <button
                        onClick={() => { setMovementProduct(p); setMovForm({ type: 'out', quantity: 1, reason: '', date: new Date().toISOString().split('T')[0], purchaseCost: 0, freightCost: 0 }); }}
                        className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100 transition-colors"
                      >
                        <TrendingDown size={13} /> Sortie
                      </button>
                    </>
                  )}
                  <button onClick={() => setHistProduct(p)}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100 transition-colors">
                    <History size={13} /> Historique
                  </button>
                  {(p.trackStock ?? true) && (
                    <button onClick={() => openAlloc(p)}
                      className="flex items-center justify-center gap-1.5 py-2 rounded-xl bg-purple-50 text-purple-600 text-xs font-medium hover:bg-purple-100 transition-colors">
                      <MapPin size={13} /> Affecter
                    </button>
                  )}
                  <div className="flex gap-1.5">
                    <button onClick={() => openEdit(p)}
                      className="flex-1 flex items-center justify-center py-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => setDeleteId(p.id)}
                      className="flex-1 flex items-center justify-center py-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
  };

  // One card per model; its variants are listed inside, each with the same actions as a product.
  const renderGroupCard = (name: string, variants: Product[]) => {
    const tracked = variants.filter(v => v.trackStock ?? true);
    const total = tracked.reduce((n, v) => n + v.quantity, 0);
    const lowCount = tracked.filter(v => v.quantity <= v.alertThreshold).length;
    const prices = variants.map(v => v.sellingPrice).filter(price => price > 0);
    const minPrice = prices.length ? Math.min(...prices) : 0;
    const maxPrice = prices.length ? Math.max(...prices) : 0;
    const image = variants.find(v => v.imageUrl)?.imageUrl;
    const open = expandedGroups[name] ?? false;
    const iconBtn = 'p-1.5 rounded-lg transition-colors';
    return (
      <div key={`group:${name}`}
        className={`bg-white rounded-2xl p-4 shadow-sm border transition-all ${lowCount ? 'border-red-200' : 'border-gray-100'} ${open ? 'sm:col-span-2 xl:col-span-3' : ''}`}>
        <div className="flex items-center gap-3 mb-3">
          {image ? (
            <img src={resolveImageUrl(image)!} alt={name} className="w-11 h-11 rounded-xl object-cover shrink-0 border border-gray-100" />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
              <Layers size={16} className="text-indigo-400" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 truncate text-sm">{name}</div>
            <div className="text-xs text-gray-400 truncate">
              {variants.length} variante{variants.length > 1 ? 's' : ''}{variants[0]?.category ? ` · ${variants[0].category}` : ''}
            </div>
          </div>
          {lowCount > 0 && <Badge color="red" size="sm">{lowCount} bas</Badge>}
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className={`rounded-xl p-2.5 text-center ${lowCount ? 'bg-red-50' : 'bg-gray-50'}`}>
            <div className="text-xs text-gray-500 mb-0.5">Stock total</div>
            <div className="text-xl font-black text-gray-900">{tracked.length ? total : '—'}</div>
          </div>
          <div className="bg-emerald-50 rounded-xl p-2.5 text-center">
            <div className="text-xs text-emerald-600 mb-0.5">Prix</div>
            <div className="text-xs font-bold text-emerald-700 truncate">
              {prices.length === 0 ? '—' : minPrice === maxPrice ? MAD(minPrice) : `${MAD(minPrice)} – ${MAD(maxPrice)}`}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button onClick={() => setExpandedGroups(g => ({ ...g, [name]: !open }))}
            className="flex items-center justify-center gap-1 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-medium hover:bg-indigo-100 transition-colors">
            {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {open ? 'Masquer' : 'Variantes'}
          </button>
          <button onClick={() => openAddVariants(name, variants[0])}
            className="flex items-center justify-center gap-1 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors">
            <Plus size={13} /> Variante
          </button>
          <button onClick={() => renameGroup(name)} title="Renommer le modèle"
            className="flex items-center justify-center py-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
            <Edit2 size={13} />
          </button>
        </div>

        {open && (
          <div className="mt-3 border-t border-gray-100 pt-2 divide-y divide-gray-50">
            {variants.map(v => {
              const tracks = v.trackStock ?? true;
              const isLow = tracks && v.quantity <= v.alertThreshold;
              return (
                <div key={v.id} className="flex items-center gap-2 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{v.variantLabel}</div>
                    <div className="text-[11px] text-gray-400 truncate">{v.sku}</div>
                  </div>
                  <div className={`text-sm font-bold w-12 text-right ${isLow ? 'text-red-600' : 'text-gray-900'}`}>
                    {tracks ? v.quantity : '—'}
                  </div>
                  <div className="text-xs text-gray-500 w-20 text-right truncate hidden sm:block">
                    {v.sellingPrice > 0 ? MAD(v.sellingPrice) : '—'}
                  </div>
                  <div className="flex items-center shrink-0">
                    {tracks && (
                      <>
                        <button title="Entrée" className={`${iconBtn} text-emerald-600 hover:bg-emerald-50`}
                          onClick={() => { setMovementProduct(v); setMovForm({ type: 'in', quantity: 1, reason: '', date: new Date().toISOString().split('T')[0], purchaseCost: 0, freightCost: 0 }); }}>
                          <TrendingUp size={14} />
                        </button>
                        <button title="Sortie" className={`${iconBtn} text-amber-600 hover:bg-amber-50`}
                          onClick={() => { setMovementProduct(v); setMovForm({ type: 'out', quantity: 1, reason: '', date: new Date().toISOString().split('T')[0], purchaseCost: 0, freightCost: 0 }); }}>
                          <TrendingDown size={14} />
                        </button>
                        <button title="Affecter" className={`${iconBtn} text-purple-600 hover:bg-purple-50 hidden sm:inline-flex`} onClick={() => openAlloc(v)}>
                          <MapPin size={14} />
                        </button>
                      </>
                    )}
                    <button title="Historique" className={`${iconBtn} text-blue-600 hover:bg-blue-50 hidden sm:inline-flex`} onClick={() => setHistProduct(v)}>
                      <History size={14} />
                    </button>
                    <button title="Modifier" className={`${iconBtn} text-gray-500 hover:bg-gray-100`} onClick={() => openEdit(v)}>
                      <Edit2 size={14} />
                    </button>
                    <button title="Supprimer" className={`${iconBtn} text-red-500 hover:bg-red-50`} onClick={() => setDeleteId(v.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5 overflow-x-hidden">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">{terms.catalogue}</h1>
          <p className="text-xs sm:text-sm text-gray-500">{products.length} {terms.items}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleReconcile}
            disabled={reconciling}
            title="Recalculer le stock depuis l'historique"
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={reconciling ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Recalculer</span>
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={16} /><span className="hidden sm:inline">Ajouter</span>
          </button>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Rechercher par nom, SKU, catégorie..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
        />
      </div>

      {loading ? (
        <CardsSkeleton count={6} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {listItems.map(item => item.kind === 'group'
            ? renderGroupCard(item.name, item.variants)
            : renderProductCard(item.product))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-400">
              <p className="text-lg">Rien à afficher</p>
              <p className="text-sm mt-1">Ajoutez votre {firstItem(terms)} avec le bouton ci-dessus</p>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => !submitting && setModalOpen(false)} title={editing ? (editing.variantGroup ? 'Modifier la variante' : `Modifier ${words.theItem}`) : variantMode ? (addingToGroup ? `Nouvelles variantes — ${addingToGroup}` : `${words.newItem} à variantes`) : words.newItem} size="md">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Photo {words.ofItem}</label>
            <div className="flex items-center gap-4">
              {form.imageUrl ? (
                <div className="relative">
                  <img src={resolveImageUrl(form.imageUrl)!} alt="Aperçu" className="w-20 h-20 rounded-xl object-cover border border-gray-200" />
                  <button
                    onClick={() => setForm(f => ({ ...f, imageUrl: undefined }))}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600"
                  >
                    <X size={10} />
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                >
                  <ImagePlus size={20} className="text-gray-300 mb-1" />
                  <span className="text-xs text-gray-400">Ajouter</span>
                </div>
              )}
              <div className="flex-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="text-sm text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50 flex items-center gap-2"
                >
                  {uploading && <span className="spinner spinner-dark" />}
                  {uploading ? 'Envoi en cours…' : form.imageUrl ? 'Changer la photo' : 'Choisir une image'}
                </button>
                <p className="text-xs text-gray-400 mt-0.5">JPG, PNG — max 5 Mo</p>
                {uploadError && <p className="text-xs text-red-500 mt-1">{uploadError}</p>}
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </div>

          {/* Toggle variantes — only when creating a brand-new product */}
          {variantsEnabled && !editing && !addingToGroup && (
            <div className="flex items-center justify-between p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100">
              <div>
                <p className="text-sm font-semibold text-gray-900">Plusieurs variantes</p>
                <p className="text-xs text-gray-500">Tailles, couleurs, contenances… chacune avec son propre stock</p>
              </div>
              <button
                type="button"
                onClick={() => setVariantMode(v => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${variantMode ? 'bg-indigo-600' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${variantMode ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          )}

          {/* Toggle suivi du stock */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <div>
              <p className="text-sm font-semibold text-gray-900">Suivi du stock</p>
              <p className="text-xs text-gray-400">Désactiver pour les services ou prestations sans stock physique</p>
            </div>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, trackStock: !f.trackStock }))}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${form.trackStock ? 'bg-indigo-600' : 'bg-gray-300'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${form.trackStock ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {editing?.variantGroup ? (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Modèle</label>
                  <div className="w-full border border-gray-100 bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-gray-500 truncate">{editing.variantGroup}</div>
                  <p className="text-[11px] text-gray-400 mt-1">Renommez le modèle depuis sa carte</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Variante *</label>
                  <input
                    type="text"
                    value={form.variantLabel ?? ''}
                    onChange={e => setForm(f => ({ ...f, variantLabel: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Ex : M / Rouge</p>
                </div>
              </>
            ) : variantMode ? (
              !addingToGroup && field('name', 'Nom du modèle *', 'text', undefined, 'Ex : T-shirt col rond — sans la taille ni la couleur')
            ) : (
              field('name', `Nom ${words.ofItem} *`, 'text', undefined, `Nom complet tel qu'il apparaîtra dans : ${terms.catalogue}`)
            )}
            {!variantMode && field('sku', 'Référence (SKU)', 'text', undefined, `Code unique ${words.ofItem} — auto-généré si vide`)}
            {field('category', 'Catégorie', 'text', categories, `Famille de ${terms.items} pour filtrer et regrouper`)}
            {field('supplier', 'Fournisseur', 'text', undefined, 'Nom du fournisseur ou grossiste')}
            {form.trackStock && !variantMode && field('quantity', 'Quantité en stock', 'number', undefined, stockLocked ? viaMovements : 'Nombre d\'unités actuellement disponibles', stockLocked)}
            {form.trackStock && field('alertThreshold', "Seuil d'alerte", 'number', undefined, 'Alerte stock bas déclenchée en dessous de ce seuil')}
            {field('entryDate', "Date d'entrée", 'date', undefined, stockLocked ? 'Date de la dernière entrée de stock' : form.trackStock ? 'Date à laquelle ce stock est entré' : 'Date de création ou de début de la prestation', stockLocked)}
            <div>
              {variantMode
                ? field('acquisitionCost', `Coût d'achat unitaire (${currency})`, 'number', undefined, 'Ce que vous coûte une unité de chaque variante')
                : form.trackStock
                ? field('acquisitionCost', `Coût d'achat total (${currency})`, 'number', undefined, stockLocked ? viaMovements : 'Montant total payé pour tout le lot (transport inclus)', stockLocked)
                : field('acquisitionCost', `Coût de revient unitaire (${currency})`, 'number', undefined, 'Coût pour fournir une unité de ce service')}
              {form.trackStock && form.quantity > 0 && form.acquisitionCost > 0 && (
                <p className="text-[11px] text-indigo-500 mt-1 font-medium">
                  → {MAD(form.acquisitionCost / form.quantity)} / unité
                </p>
              )}
            </div>
            {agendaEnabled && !form.trackStock && (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Durée d'une séance</label>
                <select
                  value={form.durationMinutes ?? ''}
                  onChange={e => setForm(f => ({ ...f, durationMinutes: e.target.value ? Number(e.target.value) : null }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                >
                  <option value="">Durée par défaut de l'agenda</option>
                  {[10, 15, 20, 30, 45, 60, 75, 90, 120, 150, 180, 240].map(m => <option key={m} value={m}>{m} min</option>)}
                </select>
                <p className="text-[11px] text-gray-400 mt-1">Bloque ce temps dans l'agenda à chaque réservation</p>
              </div>
            )}
            {field('sellingPrice', `Prix de vente unitaire (${currency})`, 'number', undefined, variantMode ? 'Même prix pour toutes les variantes — modifiable ensuite pour chacune' : 'Prix auquel vous vendez une unité à votre client')}
          </div>

          {/* Volume pricing: from N units, a lower unit price (quotes apply it automatically) */}
          {invoicesEnabled && !variantMode && (
            <div className="space-y-2 p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <p className="text-sm font-semibold text-gray-900">Prix dégressifs</p>
              {(form.priceTiers ?? []).map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 text-xs">À partir de</span>
                  <NumberInput
                    value={t.minQty}
                    onChange={v => setForm(f => ({ ...f, priceTiers: (f.priceTiers ?? []).map((x, j) => j === i ? { ...x, minQty: v } : x) }))}
                    className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                  />
                  <span className="text-gray-500 text-xs">unités :</span>
                  <NumberInput
                    value={t.unitPrice}
                    onChange={v => setForm(f => ({ ...f, priceTiers: (f.priceTiers ?? []).map((x, j) => j === i ? { ...x, unitPrice: v } : x) }))}
                    className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                  />
                  <span className="text-gray-400 text-xs">{currency}/u</span>
                  <button type="button" onClick={() => setForm(f => ({ ...f, priceTiers: (f.priceTiers ?? []).filter((_, j) => j !== i) }))}
                    className="p-1 text-gray-400 hover:text-red-500"><X size={14} /></button>
                </div>
              ))}
              <button type="button"
                onClick={() => setForm(f => ({ ...f, priceTiers: [...(f.priceTiers ?? []), { minQty: (f.priceTiers?.at(-1)?.minQty ?? 0) + 10, unitPrice: f.sellingPrice }] }))}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-700">+ Ajouter un palier</button>
              <p className="text-[11px] text-gray-400">Appliqués automatiquement dans les devis et factures selon la quantité.</p>
            </div>
          )}

          {/* Variant axes: each line is one characteristic, its values comma-separated */}
          {variantMode && !editing && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
              <p className="text-sm font-semibold text-gray-900">Variantes</p>
              {axes.map((axis, i) => (
                <div key={i} className="grid grid-cols-[110px_1fr_auto] gap-2 items-center">
                  <input
                    value={axis.name}
                    onChange={e => setAxes(list => list.map((a, j) => j === i ? { ...a, name: e.target.value } : a))}
                    placeholder="Taille"
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                  />
                  <input
                    value={axis.values}
                    onChange={e => setAxes(list => list.map((a, j) => j === i ? { ...a, values: e.target.value } : a))}
                    placeholder="S, M, L, XL"
                    className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
                  />
                  <button type="button" onClick={() => setAxes(list => list.filter((_, j) => j !== i))}
                    className="p-2 text-gray-400 hover:text-red-500" title="Retirer">
                    <X size={14} />
                  </button>
                </div>
              ))}
              {axes.length < 3 && (
                <button type="button" onClick={() => setAxes(list => [...list, { name: '', values: '' }])}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
                  + Ajouter une caractéristique
                </button>
              )}
              <p className="text-[11px] text-gray-400">Séparez les valeurs par des virgules. Toutes les combinaisons sont créées.</p>

              {variantLabels.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-gray-600">
                    {variantLabels.length} variante{variantLabels.length > 1 ? 's' : ''}{form.trackStock ? ' — stock initial' : ''}
                  </p>
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                    {variantLabels.map(label => (
                      <div key={label} className="flex items-center gap-2 bg-white rounded-lg px-3 py-1.5 border border-gray-100">
                        <span className="flex-1 text-sm text-gray-700 truncate">{label}</span>
                        {form.trackStock && (
                          <NumberInput
                            value={variantQty[label] ?? 0}
                            onChange={val => setVariantQty(q => ({ ...q, [label]: val }))}
                            className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right outline-none focus:ring-2 focus:ring-indigo-300"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} className="flex-1" disabled={submitting}>Annuler</Button>
            <Button onClick={handleSave} loading={submitting} className="flex-1">
              {editing ? 'Enregistrer' : variantMode ? `Créer ${variantLabels.length || ''} variante${variantLabels.length > 1 ? 's' : ''}` : 'Ajouter'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Movement Modal */}
      <Modal open={!!movementProduct} onClose={() => !submittingMov && setMovementProduct(null)} title={`Mouvement — ${movementProduct?.name}`} size="sm">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Type</label>
            <div className="flex gap-3">
              {(['in', 'out'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setMovForm(f => ({ ...f, type: t }))}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                    movForm.type === t
                      ? t === 'in' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-amber-500 text-white border-amber-500'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {t === 'in' ? '↑ Entrée' : '↓ Sortie'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Quantité</label>
            <NumberInput value={movForm.quantity} min={0.1} onChange={val => setMovForm(f => ({ ...f, quantity: val }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>

          {movForm.type === 'in' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Coût d'achat total ({currency})</label>
                  <NumberInput value={movForm.purchaseCost} onChange={val => setMovForm(f => ({ ...f, purchaseCost: val }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Coût de fret ({currency})</label>
                  <NumberInput value={movForm.freightCost} onChange={val => setMovForm(f => ({ ...f, freightCost: val }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
                </div>
              </div>
              {unitAcquisitionCost > 0 && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-sm text-indigo-700 font-medium">
                    Nouveau coût moyen
                    <span className="block text-[11px] font-normal text-indigo-500">
                      {movementProduct?.quantity ?? 0} en stock à {MAD(movementProduct?.acquisitionCost ?? 0)} + {movForm.quantity} à {MAD(unitAcquisitionCost)}
                    </span>
                  </span>
                  <span className="text-lg font-bold text-indigo-700">
                    {MAD(averageUnitCost(movementProduct?.quantity ?? 0, movementProduct?.acquisitionCost ?? 0, movForm.quantity, unitAcquisitionCost))}
                  </span>
                </div>
              )}
            </>
          )}

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Motif</label>
            <input type="text" value={movForm.reason} onChange={e => setMovForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="Réapprovisionnement, vente, retour..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Date</label>
            <input type="date" value={movForm.date} onChange={e => setMovForm(f => ({ ...f, date: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300" />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setMovementProduct(null)} className="flex-1" disabled={submittingMov}>Annuler</Button>
            <Button onClick={handleMovement} loading={submittingMov} className="flex-1">Confirmer</Button>
          </div>
        </div>
      </Modal>

      {/* History Modal */}
      <Modal open={!!histProduct} onClose={() => setHistProduct(null)} title={`Historique — ${histProduct?.name}`} size="md">
        <div className="space-y-2">
          {productMovements(histProduct?.id ?? '').length === 0 ? (
            <p className="text-center text-gray-400 py-8">Aucun mouvement enregistré</p>
          ) : (
            productMovements(histProduct?.id ?? '').map(m => (
              <div key={m.id} className={`flex items-center gap-3 p-3 rounded-xl border ${m.type === 'in' ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
                <div className={`text-lg font-bold ${m.type === 'in' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {m.type === 'in' ? '+' : '-'}{m.quantity}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-gray-900">{m.reason || '—'}</div>
                  <div className="text-xs text-gray-500">{formatDate(m.date)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title={`Supprimer ${words.theItem}`}
        message="Cette action est irréversible. Toutes les ventes et dépenses liées seront également supprimées."
        onConfirm={() => { if (deleteId) deleteProduct(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />

      {/* Allocation modal */}
      <Modal open={!!allocProduct} onClose={() => setAllocProduct(null)} title={`Affecter — ${allocProduct?.name}`} size="md">
        {allocLoading ? (
          <p className="text-sm text-gray-400 text-center py-4">Chargement des emplacements...</p>
        ) : allocLocations.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Aucun emplacement. Créez-en un dans la page Logistique.</p>
        ) : (
          <div className="space-y-2">
            {allocLocations.map(loc => (
              <div key={loc.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{loc.name}</p>
                  <p className="text-xs text-gray-400">{loc.isDefault ? 'Calculé automatiquement' : loc.city}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number" min="0"
                    value={allocMap[loc.id] ?? ''}
                    onChange={e => setAllocMap(m => ({ ...m, [loc.id]: e.target.value }))}
                    disabled={loc.isDefault}
                    placeholder="0"
                    title={loc.isDefault ? 'Quantité restante après affectation — non modifiable ici' : undefined}
                    className="w-20 border border-gray-200 rounded-xl px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400 text-right disabled:bg-gray-50 disabled:text-gray-400"
                  />
                  <span className="text-xs text-gray-400">unités</span>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <Button variant="secondary" onClick={() => setAllocProduct(null)} className="flex-1">Annuler</Button>
          <Button onClick={handleSaveAlloc} loading={allocSubmitting} className="flex-1">Enregistrer</Button>
        </div>
      </Modal>
    </div>
  );
}
