import { useEffect, useState } from 'react';
import { Plus, Trash2, Edit2, X, Check, BookOpen, Search, Package, ChevronDown, ChevronUp } from 'lucide-react';
import { waApi } from '../../api/whatsapp';
import { productsApi, STATIC_BASE } from '../../api';

const CATEGORIES = [
  { value: 'faq',     label: 'FAQ',       color: 'bg-blue-100 text-blue-700' },
  { value: 'product', label: 'Produit',   color: 'bg-purple-100 text-purple-700' },
  { value: 'policy',  label: 'Politique', color: 'bg-orange-100 text-orange-700' },
  { value: 'script',  label: 'Script',    color: 'bg-green-100 text-green-700' },
  { value: 'snippet', label: 'Snippet',   color: 'bg-pink-100 text-pink-700' },
];

const BLANK = {
  title: '', category: 'faq', content: '', closingScript: '', productId: '',
  tags: [] as string[], enabled: true,
};

type Tab = 'manual' | 'products';

export function KnowledgeBase() {
  const [activeTab, setActiveTab] = useState<Tab>('manual');
  const [entries, setEntries] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  // product scripts expanded state
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [scriptDraft, setScriptDraft] = useState<Record<string, string>>({});
  const [savingScript, setSavingScript] = useState<Record<string, boolean>>({});

  useEffect(() => {
    waApi.getKb().then(setEntries).catch(() => {});
    productsApi.getAll().then(setProducts).catch(() => {});
  }, []);

  // ── Manual entries ───────────────────────────────────────────────────────────

  const filtered = entries.filter(e => {
    const matchCat = !filterCat || e.category === filterCat;
    const q = search.toLowerCase();
    const matchSearch = !q || e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  const openCreate = () => {
    setEditId(null);
    setForm({ ...BLANK });
    setTagInput('');
    setShowForm(true);
  };

  const openEdit = (e: any) => {
    setEditId(e.id);
    setForm({
      title: e.title, category: e.category, content: e.content,
      closingScript: e.closingScript ?? '', productId: e.productId ?? '',
      tags: e.tags ?? [], enabled: e.enabled,
    });
    setTagInput('');
    setShowForm(true);
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) setForm({ ...form, tags: [...form.tags, t] });
    setTagInput('');
  };
  const removeTag = (i: number) => setForm({ ...form, tags: form.tags.filter((_, j) => j !== i) });

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        closingScript: form.closingScript || undefined,
        productId: form.productId || undefined,
      };
      if (editId) {
        const updated = await waApi.updateKb(editId, payload);
        setEntries(prev => prev.map(e => e.id === editId ? updated : e));
      } else {
        const created = await waApi.createKb(payload);
        setEntries(prev => [created, ...prev]);
      }
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    const updated = await waApi.updateKb(id, { enabled });
    setEntries(prev => prev.map(e => e.id === id ? updated : e));
  };

  const deleteEntry = async (id: string) => {
    await waApi.deleteKb(id);
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const catInfo = (cat: string) => CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[0];

  // ── Product scripts ──────────────────────────────────────────────────────────

  // KB entry linked to a product
  const kbForProduct = (productId: string) =>
    entries.find(e => e.productId === productId && e.category === 'product');

  const toggleProduct = (productId: string, product: any) => {
    setExpanded(prev => ({ ...prev, [productId]: !prev[productId] }));
    const existing = kbForProduct(productId);
    if (existing && scriptDraft[productId] === undefined) {
      setScriptDraft(prev => ({ ...prev, [productId]: existing.closingScript ?? '' }));
    } else if (!existing && scriptDraft[productId] === undefined) {
      setScriptDraft(prev => ({ ...prev, [productId]: '' }));
    }
  };

  const saveProductScript = async (product: any) => {
    setSavingScript(prev => ({ ...prev, [product.id]: true }));
    try {
      const existing = kbForProduct(product.id);
      const script = scriptDraft[product.id] ?? '';
      const stockInfo = `Stock actuel: ${product.quantity} unité${product.quantity !== 1 ? 's' : ''}\nPrix de vente: ${product.sellingPrice ?? product.price ?? '—'}\nCatégorie: ${product.category ?? '—'}`;

      if (existing) {
        const updated = await waApi.updateKb(existing.id, {
          closingScript: script || undefined,
          content: stockInfo,
        });
        setEntries(prev => prev.map(e => e.id === existing.id ? updated : e));
      } else {
        const created = await waApi.createKb({
          category: 'product',
          title: product.name,
          content: stockInfo,
          closingScript: script || undefined,
          productId: product.id,
          tags: [product.category ?? 'produit'],
          enabled: true,
        });
        setEntries(prev => [created, ...prev]);
      }
    } finally {
      setSavingScript(prev => ({ ...prev, [product.id]: false }));
    }
  };

  const removeProductKb = async (productId: string) => {
    const existing = kbForProduct(productId);
    if (!existing) return;
    await waApi.deleteKb(existing.id);
    setEntries(prev => prev.filter(e => e.id !== existing.id));
    setScriptDraft(prev => { const n = { ...prev }; delete n[productId]; return n; });
    setExpanded(prev => ({ ...prev, [productId]: false }));
  };

  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
            <BookOpen size={20} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900">Base de connaissance</h2>
            <p className="text-xs text-gray-500">Alimentez l'IA avec vos infos produits, FAQ et scripts de closing</p>
          </div>
        </div>
        {activeTab === 'manual' && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            <Plus size={16} /> Nouvelle entrée
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('manual')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === 'manual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <BookOpen size={14} /> Entrées manuelles
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${activeTab === 'products' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Package size={14} /> Produits en stock
          <span className="bg-indigo-100 text-indigo-600 text-xs px-1.5 py-0.5 rounded-full">{products.length}</span>
        </button>
      </div>

      {/* ── PRODUCTS TAB ── */}
      {activeTab === 'products' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Ajoutez un script de closing pour chaque produit. L'IA l'utilisera automatiquement quand un client s'y intéresse.
          </p>
          {products.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
              Aucun produit en stock trouvé.
            </div>
          )}
          {products.map(product => {
            const kb = kbForProduct(product.id);
            const isExpanded = expanded[product.id] ?? false;
            const hasScript = kb?.closingScript;
            return (
              <div key={product.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {/* Product row */}
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => toggleProduct(product.id, product)}
                >
                  {product.imageUrl ? (
                    <img
                      src={`${STATIC_BASE}${product.imageUrl}`}
                      alt={product.name}
                      className="w-9 h-9 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                      <Package size={16} className="text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 truncate">{product.name}</span>
                      {hasScript && (
                        <span className="bg-green-100 text-green-700 text-xs px-1.5 py-0.5 rounded-full shrink-0">Script ✓</span>
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-gray-400 mt-0.5">
                      <span>Stock: <strong className="text-gray-600">{product.quantity}</strong></span>
                      {product.sellingPrice && <span>Prix: <strong className="text-gray-600">{product.sellingPrice}</strong></span>}
                      {product.category && <span>{product.category}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {kb && (
                      <button
                        onClick={e => { e.stopPropagation(); removeProductKb(product.id); }}
                        className="text-gray-300 hover:text-red-500 transition-colors p-1"
                        title="Supprimer de la base"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                  </div>
                </div>

                {/* Expanded script editor */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-50 pt-3 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        Script de closing
                        <span className="ml-1 font-normal text-gray-400">(utilisé par l'IA pour closer la vente)</span>
                      </label>
                      <textarea
                        rows={4}
                        value={scriptDraft[product.id] ?? kb?.closingScript ?? ''}
                        onChange={e => setScriptDraft(prev => ({ ...prev, [product.id]: e.target.value }))}
                        placeholder={`Ex: "Super choix ! Le ${product.name} est disponible maintenant. Je vous réserve un exemplaire ?\nPour confirmer, j'ai juste besoin de votre adresse de livraison 📦"`}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                      />
                    </div>
                    <button
                      onClick={() => saveProductScript(product)}
                      disabled={savingScript[product.id]}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                    >
                      <Check size={14} />
                      {savingScript[product.id] ? 'Sauvegarde...' : kb ? 'Mettre à jour' : 'Enregistrer'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── MANUAL ENTRIES TAB ── */}
      {activeTab === 'manual' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => setFilterCat(null)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${!filterCat ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Tout
              </button>
              {CATEGORIES.map(c => (
                <button
                  key={c.value}
                  onClick={() => setFilterCat(filterCat === c.value ? null : c.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${filterCat === c.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Form */}
          {showForm && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
              <h3 className="font-semibold text-gray-900 text-sm">
                {editId ? "Modifier l'entrée" : 'Nouvelle entrée'}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Titre</label>
                  <input
                    value={form.title}
                    onChange={e => setForm({ ...form, title: e.target.value })}
                    placeholder="Ex: Prix iPhone 15 Pro"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Catégorie</label>
                  <select
                    value={form.category}
                    onChange={e => setForm({ ...form, category: e.target.value })}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                  >
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Contenu</label>
                <textarea
                  rows={4}
                  value={form.content}
                  onChange={e => setForm({ ...form, content: e.target.value })}
                  placeholder="Décrivez l'information en détail. L'IA utilisera ce contenu pour répondre..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Script de closing
                  <span className="ml-1 font-normal text-gray-400">(optionnel — utilisé pour closer la vente)</span>
                </label>
                <textarea
                  rows={3}
                  value={form.closingScript}
                  onChange={e => setForm({ ...form, closingScript: e.target.value })}
                  placeholder={`Ex: "Ce produit est parfait pour votre besoin ! On peut vous le préparer aujourd'hui. Vous préférez livraison ou retrait ?"`}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Tags</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {form.tags.map((t, i) => (
                    <span key={i} className="flex items-center gap-1 bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">
                      {t}
                      <button onClick={() => removeTag(i)}><X size={10} /></button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); }}}
                    placeholder="Ajouter un tag..."
                    className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button onClick={addTag} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-xl text-sm transition-colors">
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div
                  onClick={() => setForm({ ...form, enabled: !form.enabled })}
                  className={`w-9 h-5 rounded-full cursor-pointer transition-colors ${form.enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform mt-0.5 ${form.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
                <span className="text-xs text-gray-500">Activée (utilisée par l'IA)</span>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSave}
                  disabled={saving || !form.title.trim() || !form.content.trim()}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white py-2 rounded-xl text-sm font-medium transition-colors"
                >
                  <Check size={14} />
                  {saving ? 'Sauvegarde...' : editId ? 'Mettre à jour' : 'Créer'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 py-2 rounded-xl text-sm transition-colors"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Stats */}
          <div className="flex gap-3">
            {CATEGORIES.map(c => {
              const count = entries.filter(e => e.category === c.value).length;
              return (
                <div key={c.value} className="flex-1 bg-white rounded-xl border border-gray-100 px-3 py-2 text-center">
                  <div className="text-lg font-bold text-gray-900">{count}</div>
                  <div className={`text-xs font-medium px-1.5 py-0.5 rounded-full inline-block ${c.color}`}>{c.label}</div>
                </div>
              );
            })}
          </div>

          {/* List */}
          <div className="space-y-3">
            {filtered.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
                {entries.length === 0
                  ? 'Aucune entrée. Clique sur "Nouvelle entrée" pour commencer.'
                  : 'Aucun résultat pour cette recherche.'}
              </div>
            )}
            {filtered.map(e => {
              const cat = catInfo(e.category);
              return (
                <div key={e.id} className={`bg-white rounded-2xl border border-gray-100 px-4 py-3 ${!e.enabled ? 'opacity-50' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cat.color}`}>{cat.label}</span>
                        <span className="text-sm font-semibold text-gray-900 truncate">{e.title}</span>
                        {e.closingScript && (
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full shrink-0">Script ✓</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2">{e.content}</p>
                      {e.closingScript && (
                        <p className="text-xs text-emerald-600 mt-1 line-clamp-1 italic">📌 {e.closingScript}</p>
                      )}
                      {e.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {e.tags.map((t: string, i: number) => (
                            <span key={i} className="bg-indigo-50 text-indigo-600 text-xs px-1.5 py-0.5 rounded-full">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div
                        onClick={() => toggleEnabled(e.id, !e.enabled)}
                        className={`w-8 h-4 rounded-full cursor-pointer transition-colors ${e.enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
                      >
                        <div className={`w-3 h-3 bg-white rounded-full shadow transition-transform mt-0.5 ${e.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </div>
                      <button onClick={() => openEdit(e)} className="text-gray-400 hover:text-indigo-500 transition-colors p-1">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => deleteEntry(e.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
