import { useEffect, useState } from 'react';
import { Plus, Trash2, Edit2, X, Check, BookOpen, Search } from 'lucide-react';
import { waApi } from '../../api/whatsapp';

const CATEGORIES = [
  { value: 'faq',     label: 'FAQ',       color: 'bg-blue-100 text-blue-700' },
  { value: 'product', label: 'Produit',   color: 'bg-purple-100 text-purple-700' },
  { value: 'policy',  label: 'Politique', color: 'bg-orange-100 text-orange-700' },
  { value: 'script',  label: 'Script',    color: 'bg-green-100 text-green-700' },
  { value: 'snippet', label: 'Snippet',   color: 'bg-pink-100 text-pink-700' },
];

const BLANK = { title: '', category: 'faq', content: '', tags: [] as string[], enabled: true };

export function KnowledgeBase() {
  const [entries, setEntries] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  useEffect(() => {
    waApi.getKb().then(setEntries).catch(() => {});
  }, []);

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
    setForm({ title: e.title, category: e.category, content: e.content, tags: e.tags ?? [], enabled: e.enabled });
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
      if (editId) {
        const updated = await waApi.updateKb(editId, form);
        setEntries(prev => prev.map(e => e.id === editId ? updated : e));
      } else {
        const created = await waApi.createKb(form);
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
            <p className="text-xs text-gray-500">Alimentez l'IA avec vos infos produits, FAQ et scripts</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Nouvelle entrée
        </button>
      </div>

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
        <div className="flex gap-1.5">
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
            {editId ? 'Modifier l\'entrée' : 'Nouvelle entrée'}
          </h3>

          <div className="grid grid-cols-2 gap-3">
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
              rows={5}
              value={form.content}
              onChange={e => setForm({ ...form, content: e.target.value })}
              placeholder="Décrivez l'information en détail. L'IA utilisera ce contenu pour répondre..."
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
              <button
                onClick={addTag}
                className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2 rounded-xl text-sm transition-colors"
              >
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
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">{e.content}</p>
                  {e.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {e.tags.map((t: string, i: number) => (
                        <span key={i} className="bg-indigo-50 text-indigo-600 text-xs px-1.5 py-0.5 rounded-full">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Toggle */}
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
    </div>
  );
}
