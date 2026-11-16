import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, Check, Plus, Truck } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, subDays } from 'date-fns';
import { logisticsApi, type PartnerBalance, type PartnerPayment, type Remittance } from '../api/logistics';
import { RemittancesList } from './RemittancesList';
import { treasuryApi, fmtMoney, accountLabel, type TreasuryAccount } from '../api/treasury';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { NumberInput } from './ui/NumberInput';
import { toast } from '../hooks/useToast';

const input = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300';
/** A partner payment's « FC » is an account's « CDF ». */
const accountCurrency = (c: string | null | undefined) => ((c ?? '').toUpperCase() === 'USD' ? 'USD' : 'CDF');
const fmtPayment = (amount: number, currency: string) => fmtMoney(amount, accountCurrency(currency));

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const shortDate = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

/** The period the payments and remittances below are looked at over; '' = no bound. */
const PERIODS: { key: string; label: string; range: () => [string, string] }[] = [
  { key: 'all', label: 'Tout', range: () => ['', ''] },
  { key: 'today', label: "Aujourd'hui", range: () => [ymd(new Date()), ymd(new Date())] },
  { key: '7d', label: '7 jours', range: () => [ymd(subDays(new Date(), 6)), ymd(new Date())] },
  { key: 'month', label: 'Ce mois', range: () => [ymd(startOfMonth(new Date())), ymd(new Date())] },
  { key: 'last-month', label: 'Mois dernier', range: () => {
    const last = subMonths(new Date(), 1);
    return [ymd(startOfMonth(last)), ymd(endOfMonth(last))];
  } },
];

/** The day a payment counts on: when it was confirmed, else when it was declared. */
const paymentDay = (p: PartnerPayment) => (p.confirmedAt ?? p.createdAt).slice(0, 10);

/** « Doit 120 $ », « Avance de 5 000 FC », « À jour ». */
function BalanceLine({ amount, currency }: { amount: number; currency: 'USD' | 'CDF' }) {
  if (Math.abs(amount) < 0.01) return <span className="text-gray-400">0 {currency === 'USD' ? '$' : 'FC'}</span>;
  return amount > 0
    ? <span className="text-red-600 font-black">{fmtMoney(amount, currency)}</span>
    : <span className="text-green-700 font-black">− {fmtMoney(-amount, currency)}</span>;
}

// « Versements » : what each delivery partner still owes (same rule as its portal), the
// payments it declared waiting for confirmation, and the money received in hand. A
// payment confirmed on a treasury account enters that account.
export function PartnerPaymentsPanel({ payments, onPaymentsChange }: {
  payments: PartnerPayment[];
  onPaymentsChange: (update: (list: PartnerPayment[]) => PartnerPayment[]) => void;
}) {
  const [balances, setBalances] = useState<PartnerBalance[] | null>(null);
  const [remittances, setRemittances] = useState<Remittance[] | null>(null);
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [confirming, setConfirming] = useState<PartnerPayment | null>(null);
  const [recordingFor, setRecordingFor] = useState<PartnerBalance | null>(null);
  const [[from, to], setRange] = useState<[string, string]>(['', '']);
  const [startDate, setStartDate] = useState(ymd(new Date()));
  const [starting, setStarting] = useState(false);

  // A confirmed payment changes both: the balances and which orders it covers.
  const loadBalances = () => {
    logisticsApi.getPartnerBalances().then(setBalances).catch(() => setBalances([]));
    logisticsApi.getRemittances().then(setRemittances).catch(() => setRemittances([]));
  };
  useEffect(() => {
    loadBalances();
    treasuryApi.accounts().then(list => setAccounts(list.filter(a => !a.archived))).catch(() => {});
  }, []);

  const reject = async (pay: PartnerPayment) => {
    try {
      const updated = await logisticsApi.rejectPayment(pay.id);
      onPaymentsChange(list => list.map(p => p.id === pay.id ? updated : p));
      loadBalances();
    } catch { toast.error('Le versement n\'a pas pu être rejeté'); }
  };

  // Before the tracking start, everything is settled: payments from then on only.
  const trackingStart = balances?.find(b => b.trackingStart)?.trackingStart ?? null;
  const untracked = !!balances?.length && balances.some(b => !b.trackingStart);
  const startTracking = async (day: string) => {
    setStarting(true);
    try {
      const res = await logisticsApi.startTracking(day);
      toast.success(`Suivi des versements à partir du ${shortDate(res.trackingStart)}`);
      loadBalances();
    } catch (e) { toast.error((e as Error).message); } finally { setStarting(false); }
  };

  const inRange = (day: string) => (!from || day >= from) && (!to || day <= to);
  const tracked = (p: PartnerPayment) => !trackingStart || paymentDay(p) >= trackingStart;
  const periodPayments = useMemo(
    () => payments.filter(p => tracked(p) && inRange(paymentDay(p))),
    [payments, from, to, trackingStart],
  );
  const received = (currency: 'USD' | 'CDF') => periodPayments
    .filter(p => p.status === 'confirmed' && accountCurrency(p.currency) === currency)
    .reduce((s, p) => s + Number(p.amount), 0);
  const periodLines = (remittances ?? []).filter(l => inRange(l.deliveredOn));
  const dueIn = (c: 'Usd' | 'Cdf') => periodLines.reduce((s, l) => s + Math.max(0, l[`due${c}`]), 0);
  const restIn = (c: 'Usd' | 'Cdf') => periodLines.reduce((s, l) => s + l[`rest${c}`], 0);
  const activePeriod = PERIODS.find(p => { const [f, t] = p.range(); return f === from && t === to; })?.key;

  const pending = payments.filter(p => p.status === 'pending');
  const owedUsd = (balances ?? []).reduce((s, b) => s + Math.max(0, b.balanceUsd), 0);
  const owedCdf = (balances ?? []).reduce((s, b) => s + Math.max(0, b.balanceCdf), 0);

  return (
    <div className="space-y-5">
      {/* What the partners owe */}
      <div className="bg-ink text-white rounded-2xl p-4">
        <p className="text-xs text-white/60">Les partenaires te doivent encore</p>
        <p className="text-2xl font-black mt-1">{fmtMoney(owedUsd, 'USD')} · {fmtMoney(owedCdf, 'CDF')}</p>
        <p className="text-[11px] text-white/50 mt-1">
          Commandes livrées encaissées (frais de livraison déduits en FC), moins les versements confirmés
          {trackingStart ? `, depuis le ${shortDate(trackingStart)}.` : '.'}
        </p>
      </div>

      {/* Where the tracking starts: before it, everything is settled. */}
      <div className={`rounded-2xl p-4 border ${untracked ? 'bg-amber-50 border-amber-200' : 'bg-surface border-gray-100 shadow-sm'}`}>
        <div className="flex items-start gap-3">
          <CalendarClock size={18} className={untracked ? 'text-amber-600 mt-0.5' : 'text-gray-400 mt-0.5'} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">
              {untracked ? "Le suivi compte tout l'historique" : `Suivi depuis le ${shortDate(trackingStart!)}`}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {untracked
                ? "Démarre le suivi à une date : tout ce qui a été livré avant est considéré comme versé, pour tous tes partenaires (aussi sur leur portail)."
                : 'Les commandes livrées et les versements d\'avant cette date sont considérés comme réglés.'}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <input type="date" value={startDate} max={ymd(new Date())} onChange={e => setStartDate(e.target.value)}
                className="border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs bg-surface" />
              <button onClick={() => {
                if (window.confirm(`Tout ce qui a été livré avant le ${shortDate(startDate)} sera considéré comme versé. Continuer ?`)) startTracking(startDate);
              }} disabled={starting || !startDate}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-50 ${untracked ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                {untracked ? 'Démarrer le suivi' : 'Changer la date'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-2">Solde par partenaire</h3>
        {!balances ? (
          <p className="text-sm text-gray-400 py-4">Chargement…</p>
        ) : balances.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">Aucun partenaire de livraison.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {balances.map(b => (
              <div key={b.partner.id} className="bg-surface rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate flex items-center gap-1.5"><Truck size={14} className="text-gray-400" /> {b.partner.name}</p>
                    <p className="text-xs text-gray-500">
                      {b.deliveredCount} livrée{b.deliveredCount > 1 ? 's' : ''}
                      {b.lastPaymentAt && ` · dernier versement le ${new Date(b.lastPaymentAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`}
                    </p>
                  </div>
                  <button onClick={() => setRecordingFor(b)}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold">
                    <Plus size={12} /> Versement reçu
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                  <div><p className="text-gray-400">Encaissé</p><p className="font-semibold text-gray-800">{fmtMoney(b.owedUsd, 'USD')}</p><p className="font-semibold text-gray-800">{fmtMoney(b.owedCdf, 'CDF')}</p></div>
                  <div><p className="text-gray-400">Versé</p><p className="font-semibold text-gray-800">{fmtMoney(b.paidUsd, 'USD')}</p><p className="font-semibold text-gray-800">{fmtMoney(b.paidCdf, 'CDF')}</p></div>
                  <div><p className="text-gray-400">Reste dû</p><p><BalanceLine amount={b.balanceUsd} currency="USD" /></p><p><BalanceLine amount={b.balanceCdf} currency="CDF" /></p></div>
                </div>
                {(b.pendingUsd > 0 || b.pendingCdf > 0) && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mt-2">
                    En attente de ta confirmation : {[b.pendingUsd > 0 && fmtMoney(b.pendingUsd, 'USD'), b.pendingCdf > 0 && fmtMoney(b.pendingCdf, 'CDF')].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-2">Un montant en vert précédé de « − » : le partenaire a versé plus que ce qu'il a encaissé (avance).</p>
      </div>

      {/* The period: what was delivered, what was received, what is left */}
      <div className="space-y-2">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {PERIODS.map(p => (
            <button key={p.key} onClick={() => setRange(p.range())} aria-pressed={activePeriod === p.key}
              className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold ${activePeriod === p.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
              {p.label}
            </button>
          ))}
          <input type="date" value={from} max={to || undefined} onChange={e => setRange([e.target.value, to])}
            className="shrink-0 border border-gray-200 rounded-xl px-2 py-1 text-xs" aria-label="Du" />
          <input type="date" value={to} min={from || undefined} onChange={e => setRange([from, e.target.value])}
            className="shrink-0 border border-gray-200 rounded-xl px-2 py-1 text-xs" aria-label="Au" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-surface rounded-2xl border border-gray-100 shadow-sm p-3">
            <p className="text-[11px] text-gray-500">Attendu (livré)</p>
            <p className="text-sm font-black text-gray-900">{fmtMoney(dueIn('Usd'), 'USD')}</p>
            <p className="text-sm font-black text-gray-900">{fmtMoney(dueIn('Cdf'), 'CDF')}</p>
          </div>
          <div className="bg-surface rounded-2xl border border-gray-100 shadow-sm p-3">
            <p className="text-[11px] text-gray-500">Versé (confirmé)</p>
            <p className="text-sm font-black text-green-700">{fmtMoney(received('USD'), 'USD')}</p>
            <p className="text-sm font-black text-green-700">{fmtMoney(received('CDF'), 'CDF')}</p>
          </div>
          <div className="bg-surface rounded-2xl border border-gray-100 shadow-sm p-3">
            <p className="text-[11px] text-gray-500">Reste de ces livraisons</p>
            <p className="text-sm font-black text-red-600">{fmtMoney(restIn('Usd'), 'USD')}</p>
            <p className="text-sm font-black text-red-600">{fmtMoney(restIn('Cdf'), 'CDF')}</p>
          </div>
        </div>
      </div>

      <RemittancesList lines={remittances ? periodLines : null} />

      {/* Declared payments */}
      <div>
        <h3 className="text-sm font-bold text-gray-900 mb-2">
          Versements <span className="text-gray-400 font-normal">· {pending.length} en attente · {periodPayments.length} sur la période</span>
        </h3>
        {periodPayments.length === 0 ? (
          <p className="text-center py-8 text-gray-400 text-sm">Aucun versement sur cette période.</p>
        ) : (
          <div className="space-y-3">
            {periodPayments.map(pay => {
              const badgeClass = pay.status === 'confirmed' ? 'bg-green-100 text-green-700'
                : pay.status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700';
              const badgeLabel = pay.status === 'confirmed' ? 'Confirmé' : pay.status === 'rejected' ? 'Rejeté' : 'En attente';
              return (
                <div key={pay.id} className="bg-surface rounded-2xl p-4 border border-gray-100 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass}`}>{badgeLabel}</span>
                        <span className="font-black text-gray-900 text-sm">{fmtPayment(Number(pay.amount), pay.currency)}</span>
                      </div>
                      {pay.partner && <p className="text-sm text-gray-600 font-medium">{pay.partner.name}{pay.partner.city ? ` · ${pay.partner.city}` : ''}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(pay.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                      {pay.notes && <p className="text-xs text-gray-500 mt-1">{pay.notes}</p>}
                      {pay.proofUrl && (
                        <a href={pay.proofUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline mt-1 inline-block">Voir la preuve</a>
                      )}
                    </div>
                    {pay.status === 'pending' && (
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <button onClick={() => setConfirming(pay)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-semibold hover:bg-green-100">
                          <Check size={12} /> Confirmer
                        </button>
                        <button onClick={() => reject(pay)} className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100">
                          Rejeter
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {confirming && (
        <ConfirmPaymentModal payment={confirming} accounts={accounts}
          onClose={() => setConfirming(null)}
          onDone={updated => {
            setConfirming(null);
            onPaymentsChange(list => list.map(p => p.id === updated.id ? updated : p));
            loadBalances();
          }} />
      )}
      {recordingFor && (
        <RecordPaymentModal balance={recordingFor} accounts={accounts}
          onClose={() => setRecordingFor(null)}
          onDone={created => {
            setRecordingFor(null);
            onPaymentsChange(list => [{ ...created, partner: { id: recordingFor.partner.id, name: recordingFor.partner.name, city: recordingFor.partner.city } }, ...list]);
            loadBalances();
          }} />
      )}
    </div>
  );
}

/** The treasury account the money came on, among those of its currency; or none. */
function AccountChoice({ currency, accounts, value, onChange }: {
  currency: 'USD' | 'CDF'; accounts: TreasuryAccount[]; value: string; onChange: (id: string) => void;
}) {
  const usable = accounts.filter(a => a.currency === currency);
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 mb-1 block">Reçu sur quel compte ?</label>
      <select value={value} onChange={e => onChange(e.target.value)} className={input}>
        <option value="">Ne pas l'ajouter à la trésorerie</option>
        {usable.map(a => <option key={a.id} value={a.id}>{accountLabel(a)} — {fmtMoney(a.balance, a.currency)}</option>)}
      </select>
      {usable.length === 0 && (
        <p className="text-[11px] text-gray-400 mt-1">
          Aucun compte en {currency === 'USD' ? 'dollars' : 'francs'} : crée-le dans <a href="#/tresorerie" className="text-indigo-600 font-semibold">Trésorerie</a>.
        </p>
      )}
    </div>
  );
}

function ConfirmPaymentModal({ payment, accounts, onClose, onDone }: {
  payment: PartnerPayment; accounts: TreasuryAccount[]; onClose: () => void; onDone: (p: PartnerPayment) => void;
}) {
  const currency = accountCurrency(payment.currency);
  const [accountId, setAccountId] = useState(() => accounts.find(a => a.currency === currency)?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true); setError(null);
    try { onDone(await logisticsApi.confirmPayment(payment.id, undefined, accountId || undefined)); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Confirmer le versement" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          <strong>{fmtPayment(Number(payment.amount), payment.currency)}</strong> de {payment.partner?.name ?? 'ce partenaire'} — tu as bien reçu cet argent ?
        </p>
        <AccountChoice currency={currency} accounts={accounts} value={accountId} onChange={setAccountId} />
        {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={busy}>Annuler</Button>
          <Button onClick={confirm} loading={busy} className="flex-1">Confirmer</Button>
        </div>
      </div>
    </Modal>
  );
}

function RecordPaymentModal({ balance, accounts, onClose, onDone }: {
  balance: PartnerBalance; accounts: TreasuryAccount[]; onClose: () => void; onDone: (p: PartnerPayment) => void;
}) {
  const [currency, setCurrency] = useState<'USD' | 'FC'>(balance.balanceUsd > 0 || balance.balanceCdf <= 0 ? 'USD' : 'FC');
  const [amount, setAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const accCurrency = currency === 'USD' ? 'USD' : 'CDF';
  const [accountId, setAccountId] = useState('');
  useEffect(() => { setAccountId(accounts.find(a => a.currency === accCurrency)?.id ?? ''); }, [accCurrency]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const due = currency === 'USD' ? balance.balanceUsd : balance.balanceCdf;

  const save = async () => {
    setBusy(true); setError(null);
    try { onDone(await logisticsApi.recordPartnerPayment(balance.partner.id, { amount, currency, notes, accountId: accountId || undefined })); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Versement reçu — ${balance.partner.name}`} size="sm">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Devise</label>
            <select value={currency} onChange={e => setCurrency(e.target.value as 'USD' | 'FC')} className={input}>
              <option value="USD">Dollars ($)</option>
              <option value="FC">Francs (FC)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Montant *</label>
            <NumberInput value={amount} onChange={setAmount} className={input} />
          </div>
        </div>
        {due > 0 && (
          <button type="button" onClick={() => setAmount(Math.round(due * 100) / 100)} className="text-xs text-indigo-600 font-semibold">
            Reste dû : {fmtMoney(due, accCurrency)} — tout reçu
          </button>
        )}
        <AccountChoice currency={accCurrency} accounts={accounts} value={accountId} onChange={setAccountId} />
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Note</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex. Remis en main propre au bureau" className={input} />
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={busy}>Annuler</Button>
          <Button onClick={save} loading={busy} className="flex-1" disabled={!amount}>Enregistrer</Button>
        </div>
      </div>
    </Modal>
  );
}
