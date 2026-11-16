import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, CheckCircle2, Edit2, ExternalLink, Eye, Heart, Image as ImageIcon, Play, Search, ShieldCheck, Store, Trash2, Users, Video } from 'lucide-react';
import { adminApi, type AdminBusiness, type AdminMedia, type AdminStore } from '../../api/admin';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { toast } from '../../hooks/useToast';

const IKELE_URL = (import.meta.env.VITE_IKELE_URL as string | undefined)?.replace(/\/$/, '');
const storeLink = (slug: string) => IKELE_URL ? `${IKELE_URL}/#/@${slug}` : `${window.location.origin}/#/boutique/${slug}`;

// ── Businesses: edit, suspend, reactivate ───────────────────────────────────

/** The admin's actions on one business row. */
export function BusinessActions({ business, onChange }: { business: AdminBusiness; onChange: (b: AdminBusiness) => void }) {
  const [editing, setEditing] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const suspended = !!business.suspendedAt;

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => setEditing(true)} className="icon-btn" title="Modifier" aria-label={`Modifier ${business.name}`}><Edit2 size={15} /></button>
      {suspended ? (
        <button onClick={() => setReactivating(true)} className="icon-btn text-emerald-600 hover:bg-emerald-50" title="Réactiver" aria-label={`Réactiver ${business.name}`}>
          <ShieldCheck size={15} />
        </button>
      ) : (
        <button onClick={() => setSuspending(true)} className="icon-btn hover:text-red-600 hover:bg-red-50" title="Suspendre" aria-label={`Suspendre ${business.name}`}>
          <Ban size={15} />
        </button>
      )}

      {editing && <EditBusinessModal business={business} onClose={() => setEditing(false)} onSaved={b => { setEditing(false); onChange(b); }} />}
      {suspending && <SuspendModal business={business} onClose={() => setSuspending(false)} onDone={b => { setSuspending(false); onChange(b); }} />}
      <ConfirmDialog
        open={reactivating}
        title="Réactiver le business"
        message={`${business.name} pourra de nouveau être utilisé par ses membres. Sa boutique reste hors ligne : remets-la en ligne depuis l'onglet Boutiques Ikele.`}
        confirmLabel="Réactiver"
        onCancel={() => setReactivating(false)}
        onConfirm={async () => {
          setReactivating(false);
          try {
            await adminApi.reactivateBusiness(business.id);
            onChange({ ...business, suspendedAt: null, suspendedReason: null });
            toast.success(`${business.name} réactivé`);
          } catch (e) { toast.error((e as Error).message); }
        }}
      />
    </div>
  );
}

function EditBusinessModal({ business, onClose, onSaved }: { business: AdminBusiness; onClose: () => void; onSaved: (b: AdminBusiness) => void }) {
  const [form, setForm] = useState({
    name: business.name, sector: business.sector ?? '', city: business.city ?? '',
    phone: business.phone ?? '', whatsappPhone: business.whatsappPhone, logoUrl: business.logoUrl ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setBusy(true); setError(null);
    try {
      await adminApi.updateBusiness(business.id, {
        name: form.name, sector: form.sector || null, city: form.city || null,
        phone: form.phone || null, whatsappPhone: form.whatsappPhone, logoUrl: form.logoUrl || null,
      });
      onSaved({ ...business, ...form, sector: form.sector || null, city: form.city || null, phone: form.phone || null, logoUrl: form.logoUrl || null });
      toast.success('Business mis à jour');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Modifier — ${business.name}`} size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2"><label className="label">Nom *</label><input value={form.name} onChange={set('name')} className="input" /></div>
          <div><label className="label">Secteur</label><input value={form.sector} onChange={set('sector')} className="input" /></div>
          <div><label className="label">Ville</label><input value={form.city} onChange={set('city')} className="input" /></div>
          <div><label className="label">WhatsApp *</label><input value={form.whatsappPhone} onChange={set('whatsappPhone')} inputMode="tel" className="input" /></div>
          <div><label className="label">Téléphone</label><input value={form.phone} onChange={set('phone')} inputMode="tel" className="input" /></div>
          <div className="sm:col-span-2"><label className="label">Logo (URL)</label><input value={form.logoUrl} onChange={set('logoUrl')} className="input" placeholder="https://…" /></div>
        </div>
        <p className="text-xs text-fg-3">Propriétaire : {business.ownerEmail ?? '—'} · devise {business.currency} (non modifiable : les montants existants y sont exprimés).</p>
        {error && <p className="text-xs text-red-700 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={busy}>Annuler</Button>
          <Button onClick={save} loading={busy} className="flex-1" disabled={!form.name.trim() || !form.whatsappPhone.trim()}>Enregistrer</Button>
        </div>
      </div>
    </Modal>
  );
}

function SuspendModal({ business, onClose, onDone }: { business: AdminBusiness; onClose: () => void; onDone: (b: AdminBusiness) => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suspend = async () => {
    setBusy(true); setError(null);
    try {
      await adminApi.suspendBusiness(business.id, reason);
      onDone({ ...business, suspendedAt: new Date().toISOString(), suspendedReason: reason || null });
      toast.success(`${business.name} suspendu`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Suspendre — ${business.name}`} size="sm">
      <div className="space-y-4">
        <ul className="text-sm text-fg-2 space-y-1.5">
          <li>• Ses membres ne pourront plus travailler dessus.</li>
          <li>• Sa boutique passe hors ligne (Ikele et lien direct).</li>
          <li>• <strong className="text-fg">Rien n'est supprimé</strong> : tu peux le réactiver à tout moment.</li>
        </ul>
        <div>
          <label className="label">Motif (montré au business)</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} className="input resize-none"
            placeholder="Ex. Contenu contraire aux conditions d'utilisation" />
        </div>
        {error && <p className="text-xs text-red-700 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={busy}>Annuler</Button>
          <Button variant="danger" onClick={suspend} loading={busy} className="flex-1"><Ban size={15} /> Suspendre</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Ikele stores: listing, online status, editing, their videos ──────────────

type StoreFilter = 'all' | 'listed' | 'hidden' | 'offline';

export function TabStores() {
  const [stores, setStores] = useState<AdminStore[] | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StoreFilter>('all');
  const [editing, setEditing] = useState<AdminStore | null>(null);
  const [mediaOf, setMediaOf] = useState<AdminStore | null>(null);

  useEffect(() => { adminApi.getStores().then(setStores).catch(e => { toast.error((e as Error).message); setStores([]); }); }, []);

  const patch = async (store: AdminStore, data: Partial<Pick<AdminStore, 'active' | 'ikeleListed'>>) => {
    const before = store;
    setStores(list => list?.map(s => s.id === store.id ? { ...s, ...data } : s) ?? null);
    try { await adminApi.updateStore(store.id, data); }
    catch (e) {
      setStores(list => list?.map(s => s.id === store.id ? before : s) ?? null);
      toast.error((e as Error).message);
    }
  };

  const visible = useMemo(() => (stores ?? []).filter(s => {
    const q = search.trim().toLowerCase();
    if (q && !`${s.name} ${s.slug} ${s.business?.name ?? ''} ${s.ownerEmail ?? ''}`.toLowerCase().includes(q)) return false;
    if (filter === 'listed') return s.active && s.ikeleListed;
    if (filter === 'hidden') return s.active && !s.ikeleListed;
    if (filter === 'offline') return !s.active;
    return true;
  }), [stores, search, filter]);

  const count = (f: StoreFilter) => (stores ?? []).filter(s =>
    f === 'all' ? true : f === 'listed' ? s.active && s.ikeleListed : f === 'hidden' ? s.active && !s.ikeleListed : !s.active).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-4 pointer-events-none" />
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Boutique, @slug, business, e-mail…" className="input pl-10" />
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {([['all', 'Toutes'], ['listed', 'Sur Ikele'], ['hidden', 'Retirées d’Ikele'], ['offline', 'Hors ligne']] as const).map(([f, label]) => (
            <button key={f} onClick={() => setFilter(f)} aria-pressed={filter === f} className="chip !py-1.5 !text-xs">
              {label} <span className="opacity-70 tabular-nums">{count(f)}</span>
            </button>
          ))}
        </div>
      </div>

      {!stores ? (
        <div className="flex justify-center py-14"><span className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" /></div>
      ) : visible.length === 0 ? (
        <div className="card border-dashed py-14 text-center text-fg-3 text-sm">Aucune boutique ne correspond.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 stagger">
          {visible.map(s => (
            <article key={s.id} className={`card p-4 ${!s.active ? 'opacity-75' : ''}`}>
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center text-white font-black shrink-0" style={{ background: s.primaryColor }}>
                  {s.logoUrl ? <img src={s.logoUrl} alt="" className="w-full h-full object-cover" /> : s.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-fg truncate">{s.name}</p>
                    {!s.active
                      ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-2 text-fg-3">Hors ligne</span>
                      : s.ikeleListed
                        ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Sur Ikele</span>
                        : <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">Retirée d'Ikele</span>}
                    {s.business?.suspendedAt && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700">Business suspendu</span>}
                  </div>
                  <p className="text-xs text-fg-3 truncate">@{s.slug} · {s.business?.name ?? '—'} · {s.ownerEmail ?? '—'}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-fg-3">
                    <span className="flex items-center gap-1"><Video size={12} /> {s.media}</span>
                    <span className="flex items-center gap-1"><Store size={12} /> {s.products} produits</span>
                    <span className="flex items-center gap-1"><Users size={12} /> {s.followers}</span>
                  </div>
                </div>
              </div>
              {s.description && <p className="text-xs text-fg-3 mt-2 line-clamp-2">{s.description}</p>}

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="secondary" onClick={() => setMediaOf(s)}><Video size={13} /> Vidéos ({s.media})</Button>
                <Button size="sm" variant="secondary" onClick={() => patch(s, { ikeleListed: !s.ikeleListed })} disabled={!s.active}>
                  {s.ikeleListed ? 'Retirer d’Ikele' : 'Remettre sur Ikele'}
                </Button>
                <Button size="sm" variant={s.active ? 'secondary' : 'primary'} onClick={() => patch(s, { active: !s.active })}
                  className={s.active ? 'hover:!text-red-700 hover:!border-red-200' : ''}>
                  {s.active ? <><Ban size={13} /> Mettre hors ligne</> : <><CheckCircle2 size={13} /> Remettre en ligne</>}
                </Button>
                <div className="ml-auto flex items-center gap-1">
                  <a href={storeLink(s.slug)} target="_blank" rel="noreferrer" className="icon-btn" title="Voir la boutique" aria-label="Voir la boutique"><ExternalLink size={15} /></a>
                  <button onClick={() => setEditing(s)} className="icon-btn" title="Modifier" aria-label="Modifier la boutique"><Edit2 size={15} /></button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <EditStoreModal store={editing} onClose={() => setEditing(null)}
          onSaved={updated => { setEditing(null); setStores(list => list?.map(s => s.id === updated.id ? { ...s, ...updated } : s) ?? null); }} />
      )}
      {mediaOf && (
        <StoreMediaModal store={mediaOf} onClose={() => setMediaOf(null)}
          onCountChange={n => setStores(list => list?.map(s => s.id === mediaOf.id ? { ...s, media: n } : s) ?? null)} />
      )}
    </div>
  );
}

function EditStoreModal({ store, onClose, onSaved }: { store: AdminStore; onClose: () => void; onSaved: (s: AdminStore) => void }) {
  const [name, setName] = useState(store.name);
  const [description, setDescription] = useState(store.description ?? '');
  const [logoUrl, setLogoUrl] = useState(store.logoUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      await adminApi.updateStore(store.id, { name, description: description || null, logoUrl: logoUrl || null });
      onSaved({ ...store, name, description: description || null, logoUrl: logoUrl || null });
      toast.success('Boutique mise à jour');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Modifier — @${store.slug}`} size="md">
      <div className="space-y-4">
        <div><label className="label">Nom *</label><input value={name} onChange={e => setName(e.target.value)} className="input" /></div>
        <div><label className="label">Description</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} className="input resize-none" /></div>
        <div><label className="label">Logo (URL)</label><input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} className="input" placeholder="https://…" /></div>
        {error && <p className="text-xs text-red-700 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={busy}>Annuler</Button>
          <Button onClick={save} loading={busy} className="flex-1" disabled={!name.trim()}>Enregistrer</Button>
        </div>
      </div>
    </Modal>
  );
}

function StoreMediaModal({ store, onClose, onCountChange }: { store: AdminStore; onClose: () => void; onCountChange: (n: number) => void }) {
  const [media, setMedia] = useState<AdminMedia[] | null>(null);
  const [preview, setPreview] = useState<AdminMedia | null>(null);
  const [deleting, setDeleting] = useState<AdminMedia | null>(null);

  useEffect(() => { adminApi.getStoreMedia(store.id).then(setMedia).catch(e => { toast.error((e as Error).message); setMedia([]); }); }, [store.id]);

  const remove = async (m: AdminMedia) => {
    try {
      await adminApi.deleteMedia(m.id);
      setMedia(list => {
        const next = list?.filter(x => x.id !== m.id) ?? [];
        onCountChange(next.length);
        return next;
      });
      setPreview(null);
      toast.success('Contenu supprimé');
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Modal open onClose={onClose} title={`Vidéos et photos — ${store.name}`} size="lg">
      {!media ? (
        <div className="flex justify-center py-12"><span className="w-6 h-6 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" /></div>
      ) : media.length === 0 ? (
        <p className="text-sm text-fg-3 text-center py-12">Aucune vidéo ni photo.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {media.map(m => (
            <div key={m.id} className="relative aspect-[9/16] rounded-xl overflow-hidden bg-ink group">
              <button onClick={() => setPreview(m)} className="absolute inset-0" aria-label={`Voir ${m.product.name}`}>
                {m.type === 'video'
                  ? (m.thumbnailUrl ? <img src={m.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover" /> : <video src={`${m.url}#t=0.5`} preload="metadata" muted className="w-full h-full object-cover" />)
                  : <img src={m.url} alt="" loading="lazy" className="w-full h-full object-cover" />}
              </button>
              <span className="absolute top-1.5 left-1.5 p-1 rounded-md bg-black/50 text-white pointer-events-none">
                {m.type === 'video' ? <Play size={10} /> : <ImageIcon size={10} />}
              </span>
              <div className="absolute inset-x-0 bottom-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent text-white pointer-events-none">
                <p className="text-[10px] font-semibold truncate">{m.product.name}</p>
                <p className="text-[10px] opacity-80 flex items-center gap-2"><span className="flex items-center gap-0.5"><Eye size={9} />{m.viewCount}</span><span className="flex items-center gap-0.5"><Heart size={9} />{m.likeCount}</span></p>
              </div>
              <button onClick={() => setDeleting(m)} aria-label="Supprimer ce contenu"
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-lg bg-black/55 text-white flex items-center justify-center hover:bg-red-600 transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {preview && createPortal(
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4 animate-fade-in" onClick={() => setPreview(null)}>
          <div className="relative max-h-full max-w-sm w-full" onClick={e => e.stopPropagation()}>
            {preview.type === 'video'
              ? <video src={preview.url} controls autoPlay playsInline className="w-full max-h-[80dvh] rounded-2xl bg-black" />
              : <img src={preview.url} alt="" className="w-full max-h-[80dvh] object-contain rounded-2xl" />}
            <div className="mt-3 flex items-center justify-between gap-3 text-white">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{preview.product.name}</p>
                {preview.caption && <p className="text-xs opacity-75 truncate">{preview.caption}</p>}
              </div>
              <Button variant="danger" size="sm" onClick={() => setDeleting(preview)}><Trash2 size={13} /> Supprimer</Button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <ConfirmDialog
        open={!!deleting}
        title="Supprimer ce contenu"
        message={`« ${deleting?.product.name ?? ''} » disparaîtra d'Ikele et de la boutique, avec ses vues et ses likes. Irréversible.`}
        onCancel={() => setDeleting(null)}
        onConfirm={() => { const m = deleting; setDeleting(null); if (m) remove(m); }}
      />
    </Modal>
  );
}
