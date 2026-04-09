import { useState, useMemo, useRef } from 'react';
import { Plus, Edit2, Trash2, TrendingUp, TrendingDown, History, Search, ImagePlus, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { NumberInput } from '../components/ui/NumberInput';
import { CardsSkeleton } from '../components/ui/Skeleton';
import { useCurrency } from '../hooks/useCurrency';
import { formatDate } from '../utils/formatters';
import { uploadApi, STATIC_BASE } from '../api';
import type { Product, StockMovement } from '../types';

const emptyProduct = (): Omit<Product, 'id' | 'createdAt' | 'updatedAt'> => ({
  name: '', sku: '', category: '', quantity: 0, alertThreshold: 5,
  supplier: '', acquisitionCost: 0, sellingPrice: 0, imageUrl: undefined,
  entryDate: new Date().toISOString().split('T')[0],
});

const categories = ['Chaussures', 'Maroquinerie', 'Accessoires', 'Beauté', 'Vêtements', 'Électronique', 'Autre'];

export function Stock() {
  const { products, movements, loading, addProduct, updateProduct, deleteProduct, addMovement } = useStore();
  const { fmt: MAD, currency } = useCurrency();

  const [submitting, setSubmitting] = useState(false);
  const [submittingMov, setSubmittingMov] = useState(false);
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
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() =>
    products.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase())
    ),
    [products, search]
  );

  const openAdd = () => { setEditing(null); setForm(emptyProduct()); setModalOpen(true); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ name: p.name, sku: p.sku, category: p.category, quantity: p.quantity, alertThreshold: p.alertThreshold, supplier: p.supplier, acquisitionCost: p.acquisitionCost, sellingPrice: p.sellingPrice ?? 0, imageUrl: p.imageUrl, entryDate: p.entryDate });
    setModalOpen(true);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadApi.uploadImage(file);
      setForm(f => ({ ...f, imageUrl: url }));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.sku) return;
    setSubmitting(true);
    try {
      if (editing) await updateProduct(editing.id, form);
      else await addProduct(form);
      setModalOpen(false);
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
      await addMovement({ productId: movementProduct.id, ...movData });
      if (movForm.type === 'in' && unitAcquisitionCost > 0) {
        await updateProduct(movementProduct.id, { acquisitionCost: unitAcquisitionCost });
      }
      setMovementProduct(null);
    } finally {
      setSubmittingMov(false);
    }
  };

  const productMovements = (productId: string): StockMovement[] =>
    movements.filter(m => m.productId === productId).sort((a, b) => b.date.localeCompare(a.date));

  const field = (key: keyof typeof form, label: string, type = 'text', opts?: string[]) => (
    <div>
      <label className="text-xs font-medium text-gray-600 mb-1 block">{label}</label>
      {opts ? (
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
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion du Stock</h1>
          <p className="text-sm text-gray-500">{products.length} produits enregistrés</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Ajouter
        </button>
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
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(p => {
            const isLow = p.quantity <= p.alertThreshold;
            return (
              <div
                key={p.id}
                className={`bg-white rounded-2xl p-4 shadow-sm border transition-all ${isLow ? 'border-red-200 bg-red-50/30' : 'border-gray-100'}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {p.imageUrl ? (
                      <img src={`${STATIC_BASE}${p.imageUrl}`} alt={p.name} className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-gray-100" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <ImagePlus size={18} className="text-gray-300" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 truncate">{p.name}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{p.sku} · {p.category}</div>
                    </div>
                  </div>
                  {isLow && <Badge color="red" size="sm">Stock bas</Badge>}
                </div>

                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="bg-gray-50 rounded-xl p-2.5">
                    <div className="text-xs text-gray-500">Stock</div>
                    <div className={`text-xl font-bold ${isLow ? 'text-red-600' : 'text-gray-900'}`}>{p.quantity}</div>
                    <div className="text-xs text-gray-400">Seuil: {p.alertThreshold}</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-2.5">
                    <div className="text-xs text-gray-500">Achat</div>
                    <div className="text-sm font-bold text-gray-900">{MAD(p.acquisitionCost)}</div>
                    <div className="text-xs text-gray-400">par unité</div>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-2.5">
                    <div className="text-xs text-emerald-600">Valeur stock</div>
                    <div className="text-sm font-bold text-emerald-700">
                      {p.sellingPrice > 0 ? MAD(p.sellingPrice * p.quantity) : '—'}
                    </div>
                    <div className="text-xs text-gray-400">{p.sellingPrice > 0 ? `${MAD(p.sellingPrice)}/u` : 'Prix non défini'}</div>
                  </div>
                </div>

                <div className="text-xs text-gray-500 mb-3">
                  <span className="font-medium">Fournisseur:</span> {p.supplier}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => { setMovementProduct(p); setMovForm({ type: 'in', quantity: 1, reason: '', date: new Date().toISOString().split('T')[0], purchaseCost: 0, freightCost: 0 }); }}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100 transition-colors"
                  >
                    <TrendingUp size={14} /> Entrée
                  </button>
                  <button
                    onClick={() => { setMovementProduct(p); setMovForm({ type: 'out', quantity: 1, reason: '', date: new Date().toISOString().split('T')[0], purchaseCost: 0, freightCost: 0 }); }}
                    className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100 transition-colors"
                  >
                    <TrendingDown size={14} /> Sortie
                  </button>
                  <button onClick={() => setHistProduct(p)} className="p-2 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors">
                    <History size={14} />
                  </button>
                  <button onClick={() => openEdit(p)} className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => setDeleteId(p.id)} className="p-2 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-16 text-gray-400">
              <p className="text-lg">Aucun produit trouvé</p>
              <p className="text-sm mt-1">Ajoutez votre premier produit avec le bouton ci-dessus</p>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => !submitting && setModalOpen(false)} title={editing ? 'Modifier le produit' : 'Nouveau produit'} size="md">
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-2 block">Photo du produit</label>
            <div className="flex items-center gap-4">
              {form.imageUrl ? (
                <div className="relative">
                  <img src={`${STATIC_BASE}${form.imageUrl}`} alt="Aperçu" className="w-20 h-20 rounded-xl object-cover border border-gray-200" />
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
              </div>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {field('name', 'Nom du produit *')}
            {field('sku', 'SKU *')}
            {field('category', 'Catégorie', 'text', categories)}
            {field('supplier', 'Fournisseur')}
            {field('acquisitionCost', `Coût achat (${currency})`, 'number')}
            {field('sellingPrice', `Prix de vente (${currency})`, 'number')}
            {field('quantity', 'Quantité en stock', 'number')}
            {field('alertThreshold', "Seuil d'alerte", 'number')}
            {field('entryDate', "Date d'entrée", 'date')}
          </div>
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} className="flex-1" disabled={submitting}>Annuler</Button>
            <Button onClick={handleSave} loading={submitting} className="flex-1">
              {editing ? 'Enregistrer' : 'Ajouter'}
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
              <div className="grid grid-cols-2 gap-3">
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
                  <span className="text-sm text-indigo-700 font-medium">Coût acquisition unitaire</span>
                  <span className="text-lg font-bold text-indigo-700">{MAD(unitAcquisitionCost)}</span>
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
        title="Supprimer le produit"
        message="Cette action est irréversible. Toutes les ventes et dépenses liées seront également supprimées."
        onConfirm={() => { if (deleteId) deleteProduct(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
