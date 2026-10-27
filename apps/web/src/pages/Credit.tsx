import { useEffect, useMemo, useState } from 'react';
import { Wallet, AlertTriangle, Users, Plus, CalendarClock, Send, Phone, ChevronDown, ChevronUp, Trash2, X } from 'lucide-react';
import { addDays } from '@kza/shared';
import { creditApi, type PaymentMethod, type Receivable } from '../api/credit';
import { useCurrency } from '../hooks/useCurrency';
import { useStore } from '../store/useStore';
import { salesApi } from '../api';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { NumberInput } from '../components/ui/NumberInput';
import { toast } from '../hooks/useToast';

const METHODS: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  mobile_money: 'Mobile money',
  bank: 'Banque',
  other: 'Autre',
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const frDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function Credit() {
  const { fmt, bizCurrency } = useCurrency();
  const [items, setItems] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [paying, setPaying] = useState<Receivable | null>(null);
  const [scheduling, setScheduling] = useState<Receivable | null>(null);
  const [reminding, setReminding] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setItems(await creditApi.receivables()); }
    catch { toast.error('Erreur lors du chargement des créances'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // A settled sale leaves the list; anything else is updated in place.
  const replace = (r: Receivable) => {
    setItems(list => r.status === 'paid' ? list.filter(x => x.id !== r.id) : list.map(x => x.id === r.id ? r : x));
    if (r.status === 'paid') {
      toast.success('Vente soldée 🎉');
      // The sale is now "paid" — refresh the sales list so other pages agree.
      salesApi.getAll().then(sales => useStore.setState({ sales })).catch(() => {});
    }
  };

  const stats = useMemo(() => {
    const total = items.reduce((s, r) => s + r.remaining, 0);
    const late = items.filter(r => r.overdueDays > 0);
    const customers = new Set(items.map(r => r.customerPhone || r.customerName || r.id)).size;
    return { total, lateTotal: late.reduce((s, r) => s + r.remaining, 0), lateCount: late.length, customers };
  }, [items]);

  const remind = async (r: Receivable) => {
    setReminding(r.id);
    try {
      replace(await creditApi.remind(r.id));
      toast.success('Relance envoyée sur WhatsApp');
    } catch (e: any) {
      toast.error(e?.message ?? 'Relance impossible');
    } finally {
      setReminding(null);
    }
  };

  const removePayment = async (paymentId: string) => {
    if (!confirm('Supprimer ce paiement ?')) return;
    try {
      const r = await creditApi.removePayment(paymentId);
      setItems(list => list.some(x => x.id === r.id) ? list.map(x => x.id === r.id ? r : x) : [r, ...list]);
    } catch (e: any) { toast.error(e?.message ?? 'Erreur'); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Créances</h1>
        <p className="text-xs sm:text-sm text-gray-500">Ventes à crédit et argent encore dû par vos clients</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500"><Wallet size={14} /> Reste à encaisser</div>
          <div className="text-xl font-black text-gray-900 mt-1">{fmt(stats.total)}</div>
        </div>
        <div className={`rounded-2xl border p-4 ${stats.lateCount ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100'}`}>
          <div className="flex items-center gap-2 text-xs text-gray-500"><AlertTriangle size={14} /> En retard</div>
          <div className={`text-xl font-black mt-1 ${stats.lateCount ? 'text-red-600' : 'text-gray-900'}`}>{fmt(stats.lateTotal)}</div>
          <div className="text-[11px] text-gray-400">{stats.lateCount} vente{stats.lateCount > 1 ? 's' : ''}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500"><Users size={14} /> Clients concernés</div>
          <div className="text-xl font-black text-gray-900 mt-1">{stats.customers}</div>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Pour vendre à crédit, enregistrez la vente avec le statut « À crédit ». Le stock sort tout de suite ; la vente passe en « Payé » dès qu'elle est soldée.
        Les clients reçoivent un rappel WhatsApp la veille de chaque échéance et en cas de retard (au plus tous les 3 jours).
      </p>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">
          <Wallet size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">Aucune créance en cours</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(r => {
            const pct = r.total > 0 ? Math.min(100, (r.paid / r.total) * 100) : 0;
            const phone = r.customerPhone?.replace(/@.*$/, '');
            const isOpen = open[r.id] ?? false;
            return (
              <div key={r.id} className={`bg-white rounded-2xl border px-4 py-3 ${r.overdueDays > 0 ? 'border-red-200' : 'border-gray-100'}`}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 truncate">{r.customerName || 'Client sans nom'}</span>
                      {r.overdueDays > 0 && (
                        <span className="text-[10px] font-semibold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                          En retard de {r.overdueDays} j
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">Vente du {frDate(r.date)}</div>
                    {phone && (
                      <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-xs text-indigo-600"><Phone size={11} /> {phone}</a>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-black text-gray-900">{fmt(r.remaining)}</div>
                    <div className="text-[11px] text-gray-400">sur {fmt(r.total)}</div>
                  </div>
                </div>

                <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between text-[11px] text-gray-500 mt-1">
                  <span>Payé : {fmt(r.paid)}</span>
                  <span className={r.overdueDays > 0 ? 'text-red-600 font-medium' : ''}>
                    {r.nextDue ? `Prochaine échéance : ${fmt(r.nextAmount)} le ${frDate(r.nextDue)}` : "Pas d'échéance fixée"}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-1.5 mt-3">
                  <button onClick={() => setPaying(r)}
                    className="flex items-center justify-center gap-1 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100">
                    <Plus size={13} /> Paiement
                  </button>
                  <button onClick={() => setScheduling(r)}
                    className="flex items-center justify-center gap-1 py-2 rounded-xl bg-indigo-50 text-indigo-700 text-xs font-medium hover:bg-indigo-100">
                    <CalendarClock size={13} /> Échéances
                  </button>
                  <button onClick={() => remind(r)} disabled={!phone || reminding === r.id}
                    title={phone ? 'Envoyer un rappel WhatsApp maintenant' : 'Pas de numéro pour ce client'}
                    className="flex items-center justify-center gap-1 py-2 rounded-xl bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100 disabled:opacity-40">
                    <Send size={13} /> {reminding === r.id ? '…' : 'Relancer'}
                  </button>
                  <button onClick={() => setOpen(o => ({ ...o, [r.id]: !isOpen }))}
                    className="flex items-center justify-center gap-1 py-2 rounded-xl bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200">
                    {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Détail
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-3 border-t border-gray-100 pt-2 space-y-3 text-xs">
                    {r.installments.length > 0 && (
                      <div>
                        <p className="font-semibold text-gray-700 mb-1">Échéancier</p>
                        {r.installments.map(i => (
                          <div key={i.id} className="flex justify-between py-0.5">
                            <span className={i.settled ? 'text-gray-400 line-through' : 'text-gray-700'}>{frDate(i.dueDate)}</span>
                            <span className={i.settled ? 'text-emerald-600' : 'text-gray-700'}>
                              {fmt(i.amount)}{!i.settled && i.covered > 0 ? ` (dont ${fmt(i.covered)} payé)` : i.settled ? ' ✓' : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-gray-700 mb-1">Paiements reçus</p>
                      {r.payments.length === 0 ? (
                        <p className="text-gray-400">Aucun paiement pour l'instant</p>
                      ) : r.payments.map(p => (
                        <div key={p.id} className="flex items-center justify-between py-0.5">
                          <span className="text-gray-600">{frDate(p.date)} · {METHODS[p.method] ?? p.method}{p.note ? ` · ${p.note}` : ''}</span>
                          <span className="flex items-center gap-1">
                            <span className="font-medium text-gray-900">{fmt(p.amount)}</span>
                            <button onClick={() => removePayment(p.id)} className="p-1 text-gray-300 hover:text-red-500" title="Supprimer"><Trash2 size={12} /></button>
                          </span>
                        </div>
                      ))}
                    </div>
                    {r.lastReminderAt && <p className="text-gray-400">Dernière relance : {frDate(r.lastReminderAt)}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {paying && (
        <PaymentModal receivable={paying} currency={bizCurrency} onClose={() => setPaying(null)}
          onSaved={r => { replace(r); setPaying(null); }} />
      )}
      {scheduling && (
        <ScheduleModal receivable={scheduling} currency={bizCurrency} onClose={() => setScheduling(null)}
          onSaved={r => { replace(r); setScheduling(null); toast.success('Échéancier enregistré'); }} />
      )}
    </div>
  );
}

function PaymentModal({ receivable: r, currency, onClose, onSaved }: {
  receivable: Receivable; currency: string; onClose: () => void; onSaved: (r: Receivable) => void;
}) {
  const [amount, setAmount] = useState(r.nextAmount > 0 ? r.nextAmount : r.remaining);
  const [date, setDate] = useState(todayIso());
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const input = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300';

  const save = async () => {
    setSaving(true);
    try { onSaved(await creditApi.addPayment(r.id, { amount, date, method, note: note || undefined })); toast.success('Paiement enregistré'); }
    catch (e: any) { toast.error(e?.message ?? 'Erreur'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={() => !saving && onClose()} title={`Paiement — ${r.customerName || 'Client'}`} size="sm">
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Montant reçu ({currency})</label>
          <NumberInput value={amount} onChange={setAmount} className={input} />
          <div className="flex gap-2 mt-1.5">
            <button type="button" onClick={() => setAmount(r.remaining)} className="text-[11px] text-indigo-600 font-medium">Tout le reste ({r.remaining})</button>
            {r.nextAmount > 0 && r.nextAmount !== r.remaining && (
              <button type="button" onClick={() => setAmount(r.nextAmount)} className="text-[11px] text-indigo-600 font-medium">Échéance ({r.nextAmount})</button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={input} />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Moyen</label>
            <select value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} className={`${input} bg-white`}>
              {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Note</label>
          <input value={note} onChange={e => setNote(e.target.value)} className={input} placeholder="Ex : réf. M-Pesa" />
        </div>
        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={saving}>Annuler</Button>
          <Button onClick={save} loading={saving} disabled={amount <= 0 || amount > r.remaining + 0.005} className="flex-1">Enregistrer</Button>
        </div>
      </div>
    </Modal>
  );
}

function ScheduleModal({ receivable: r, currency, onClose, onSaved }: {
  receivable: Receivable; currency: string; onClose: () => void; onSaved: (r: Receivable) => void;
}) {
  const [dueDate, setDueDate] = useState(r.dueDate?.slice(0, 10) ?? '');
  const [rows, setRows] = useState(r.installments.map(i => ({ dueDate: i.dueDate.slice(0, 10), amount: i.amount })));
  const [parts, setParts] = useState(3);
  const [saving, setSaving] = useState(false);
  const planned = Math.round(rows.reduce((s, i) => s + i.amount, 0) * 100) / 100;
  const input = 'border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300';

  // Equal monthly parts of the whole sale, starting a month after it — the usual
  // "payable in 3 times" arrangement. Rounding is absorbed by the last part.
  const split = () => {
    const each = Math.floor((r.total / parts) * 100) / 100;
    const start = r.date.slice(0, 10);
    setRows(Array.from({ length: parts }, (_, i) => ({
      dueDate: addDays(start, 30 * (i + 1)),
      amount: i === parts - 1 ? Math.round((r.total - each * (parts - 1)) * 100) / 100 : each,
    })));
  };

  const save = async () => {
    setSaving(true);
    try {
      onSaved(await creditApi.setSchedule(r.id, {
        dueDate: rows.length ? null : (dueDate || null),
        installments: rows.filter(i => i.dueDate && i.amount > 0),
      }));
    } catch (e: any) { toast.error(e?.message ?? 'Erreur'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={() => !saving && onClose()} title={`Échéances — ${r.customerName || 'Client'}`} size="md">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">Total de la vente : <b>{r.total} {currency}</b> · déjà payé : {r.paid} {currency}</p>

        {rows.length === 0 && (
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Date limite pour solder</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={`${input} w-full`} />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-semibold text-gray-700">Paiement en plusieurs fois</p>
            <div className="flex items-center gap-1.5 text-xs">
              <select value={parts} onChange={e => setParts(Number(e.target.value))} className={`${input} bg-white py-1`}>
                {[2, 3, 4, 5, 6, 9, 10, 12].map(n => <option key={n} value={n}>{n} fois</option>)}
              </select>
              <button type="button" onClick={split} className="text-indigo-600 font-medium">Répartir</button>
            </div>
          </div>
          <div className="space-y-1.5">
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="date" value={row.dueDate} onChange={e => setRows(list => list.map((x, j) => j === i ? { ...x, dueDate: e.target.value } : x))} className={input} />
                <NumberInput value={row.amount} onChange={v => setRows(list => list.map((x, j) => j === i ? { ...x, amount: v } : x))} className={`${input} w-28`} />
                <span className="text-xs text-gray-400">{currency}</span>
                <button type="button" onClick={() => setRows(list => list.filter((_, j) => j !== i))} className="p-1 text-gray-400 hover:text-red-500"><X size={14} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setRows(list => [...list, { dueDate: addDays(list[list.length - 1]?.dueDate ?? todayIso(), 30), amount: 0 }])}
            className="text-xs font-medium text-indigo-600 mt-1.5">+ Ajouter une échéance</button>
          {rows.length > 0 && (
            <p className={`text-[11px] mt-1 ${planned > r.total + 0.005 ? 'text-red-600' : 'text-gray-400'}`}>
              Total des échéances : {planned} {currency} {planned > r.total + 0.005 ? '— dépasse le total de la vente' : planned < r.total - 0.005 ? `(reste ${Math.round((r.total - planned) * 100) / 100} sans échéance)` : '✓'}
            </p>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={saving}>Annuler</Button>
          <Button onClick={save} loading={saving} disabled={planned > r.total + 0.005} className="flex-1">Enregistrer</Button>
        </div>
      </div>
    </Modal>
  );
}
