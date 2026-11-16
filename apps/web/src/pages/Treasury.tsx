import { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Archive, Edit2, Landmark, Plus, Smartphone, Trash2, Truck, Wallet } from 'lucide-react';
import { format, startOfMonth, subMonths, endOfMonth, startOfYear } from 'date-fns';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { PageHeader } from '../components/ui/Page';
import { NumberInput } from '../components/ui/NumberInput';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import {
  treasuryApi, fmtMoney, accountLabel, ACCOUNT_KIND_LABELS, MOVEMENT_KIND_LABELS,
  ACCOUNT_NUMBER_FIELD, type AccountCurrency, type AccountKind, type TreasuryAccount, type TreasuryMovement,
} from '../api/treasury';
import { logisticsApi, type PartnerBalance } from '../api/logistics';

const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
const today = () => ymd(new Date());

const PERIODS: { key: string; label: string; range: () => [string, string] }[] = [
  { key: 'month', label: 'Ce mois', range: () => [ymd(startOfMonth(new Date())), today()] },
  { key: 'last-month', label: 'Mois dernier', range: () => {
    const last = subMonths(new Date(), 1);
    return [ymd(startOfMonth(last)), ymd(endOfMonth(last))];
  } },
  { key: 'year', label: 'Cette année', range: () => [ymd(startOfYear(new Date())), today()] },
  { key: 'all', label: 'Tout', range: () => ['2000-01-01', today()] },
];

const KIND_ICONS: Record<AccountKind, typeof Wallet> = { bank: Landmark, mobile_money: Smartphone, cash: Wallet };
const input = 'input';
const CURRENCIES: AccountCurrency[] = ['USD', 'CDF'];

/** Sums by currency: never added across dollars and francs. */
function byCurrency<T>(list: T[], currency: (x: T) => string, amount: (x: T) => number) {
  const out: Record<string, number> = {};
  list.forEach(x => { out[currency(x)] = (out[currency(x)] ?? 0) + amount(x); });
  return out;
}

const MoneyByCurrency = ({ sums, className = '' }: { sums: Record<string, number>; className?: string }) => (
  <span className={className}>
    {CURRENCIES.filter(c => sums[c] !== undefined).map(c => fmtMoney(sums[c], c)).join(' · ') || fmtMoney(0, 'USD')}
  </span>
);

// The business's money: what sits in each account (till, mobile money, bank), what
// came in and went out over a period, and what the delivery partners still hold.
export function Treasury() {
  const [accounts, setAccounts] = useState<TreasuryAccount[] | null>(null);
  const [movements, setMovements] = useState<TreasuryMovement[]>([]);
  const [partners, setPartners] = useState<PartnerBalance[]>([]);
  const [accountFilter, setAccountFilter] = useState('');
  const [[from, to], setRange] = useState<[string, string]>(PERIODS[0].range());
  const [error, setError] = useState<string | null>(null);

  const [accountModal, setAccountModal] = useState<TreasuryAccount | 'new' | null>(null);
  const [movementModal, setMovementModal] = useState<'in' | 'out' | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleting, setDeleting] = useState<TreasuryMovement | null>(null);

  const loadAccounts = () => treasuryApi.accounts().then(setAccounts).catch(e => setError(e.message));
  const loadMovements = () =>
    treasuryApi.movements({ accountId: accountFilter || undefined, from, to }).then(setMovements).catch(e => setError(e.message));
  const reload = () => { loadAccounts(); loadMovements(); };

  useEffect(() => {
    loadAccounts();
    logisticsApi.getPartnerBalances().then(setPartners).catch(() => {});
  }, []);
  useEffect(() => { loadMovements(); }, [accountFilter, from, to]);

  const active = (accounts ?? []).filter(a => !a.archived);
  const totals = byCurrency(active, a => a.currency, a => a.balance);
  const atPartners = {
    USD: partners.reduce((s, p) => s + Math.max(0, p.balanceUsd), 0),
    CDF: partners.reduce((s, p) => s + Math.max(0, p.balanceCdf), 0),
  };
  const inflow = byCurrency(movements.filter(m => m.amount > 0 && m.kind !== 'transfer'), m => m.account.currency, m => m.amount);
  const outflow = byCurrency(movements.filter(m => m.amount < 0 && m.kind !== 'transfer'), m => m.account.currency, m => -m.amount);
  const activePeriod = PERIODS.find(p => { const [f, t] = p.range(); return f === from && t === to; })?.key;

  if (error && !accounts) return <p className="text-sm text-red-600">{error}</p>;
  if (!accounts) {
    return <div className="flex justify-center py-16"><span className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-5 overflow-x-hidden">
      <PageHeader
        title="Trésorerie"
        subtitle="Ton argent, compte par compte"
        actions={<Button onClick={() => setAccountModal('new')}><Plus size={16} /><span className="hidden sm:inline">Nouveau compte</span></Button>}
      />

      {/* Where the money is */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-ink text-white rounded-2xl p-4">
          <p className="text-xs text-white/60">Disponible dans tes comptes</p>
          <MoneyByCurrency sums={totals} className="block text-2xl font-black mt-1" />
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1.5"><Truck size={13} /> Encore chez les partenaires de livraison</p>
          <p className="text-2xl font-black text-gray-900 mt-1">
            {fmtMoney(atPartners.USD, 'USD')} · {fmtMoney(atPartners.CDF, 'CDF')}
          </p>
          <a href="#/logistique" className="text-xs text-indigo-600 font-semibold">Voir le détail par partenaire →</a>
        </div>
      </div>

      {/* Accounts */}
      {accounts.length === 0 ? (
        <div className="card border-dashed p-8 text-center">
          <Wallet size={32} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-600 font-medium">Crée tes comptes pour suivre ton argent</p>
          <p className="text-xs text-gray-400 mt-1">Une banque, un compte mobile money (M-Pesa, Orange Money, Airtel Money) ou une caisse physique, en $ ou en FC, avec son solde d'aujourd'hui.</p>
          <button onClick={() => setAccountModal('new')} className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold">Créer un compte</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {accounts.map(a => {
            const Icon = KIND_ICONS[a.kind] ?? Wallet;
            const selected = accountFilter === a.id;
            return (
              <div key={a.id} className={`relative text-left p-4 rounded-2xl border bg-surface transition-all ${selected ? 'ring-2 ring-indigo-400 border-indigo-300' : 'border-gray-100 shadow-sm'} ${a.archived ? 'opacity-50' : ''}`}>
                <button onClick={() => setAccountFilter(selected ? '' : a.id)} className="block w-full text-left">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1 pr-6">
                    <Icon size={13} /> <span className="truncate">{ACCOUNT_KIND_LABELS[a.kind]}{a.archived ? ' · archivé' : ''}</span>
                  </div>
                  <div className="text-sm font-semibold text-gray-900 truncate">{a.name}</div>
                  {a.accountNumber && <div className="text-[11px] text-gray-400 truncate font-mono">{a.accountNumber}</div>}
                  <div className={`text-xl font-black mt-1 ${a.balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>{fmtMoney(a.balance, a.currency)}</div>
                </button>
                <button onClick={() => setAccountModal(a)} aria-label={`Modifier ${a.name}`}
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                  <Edit2 size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {accounts.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => setMovementModal('in')} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-green-50 text-green-700 text-sm font-semibold">
            <ArrowDownLeft size={16} /> Entrée
          </button>
          <button onClick={() => setMovementModal('out')} className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-50 text-red-600 text-sm font-semibold">
            <ArrowUpRight size={16} /> Sortie
          </button>
          <button onClick={() => setTransferOpen(true)} disabled={active.length < 2}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-semibold disabled:opacity-50">
            <ArrowLeftRight size={16} /> Virement
          </button>
        </div>
      )}

      {/* Movements of the period */}
      {accounts.length > 0 && (
        <div className="space-y-3">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {PERIODS.map(p => (
              <button key={p.key} onClick={() => setRange(p.range())} aria-pressed={activePeriod === p.key}
                className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-semibold ${activePeriod === p.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {p.label}
              </button>
            ))}
            <input type="date" value={from} max={to} onChange={e => e.target.value && setRange([e.target.value, to])}
              className="shrink-0 border border-gray-200 rounded-xl px-2 py-1 text-xs" />
            <input type="date" value={to} min={from} onChange={e => e.target.value && setRange([from, e.target.value])}
              className="shrink-0 border border-gray-200 rounded-xl px-2 py-1 text-xs" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="card p-3">
              <p className="text-xs text-gray-500">Entrées{accountFilter ? ' (ce compte)' : ''}</p>
              <MoneyByCurrency sums={inflow} className="block text-base font-black text-green-700" />
            </div>
            <div className="card p-3">
              <p className="text-xs text-gray-500">Sorties{accountFilter ? ' (ce compte)' : ''}</p>
              <MoneyByCurrency sums={outflow} className="block text-base font-black text-red-600" />
            </div>
          </div>

          <div className="card divide-y divide-gray-50">
            {movements.length === 0 && <p className="text-sm text-gray-400 text-center py-10">Aucun mouvement sur cette période.</p>}
            {movements.map(m => (
              <div key={m.id} className="flex items-center gap-3 p-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${m.amount > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                  {m.kind === 'transfer' ? <ArrowLeftRight size={14} /> : m.amount > 0 ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.label || MOVEMENT_KIND_LABELS[m.kind]}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(`${m.date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {' · '}{m.account.name}{' · '}{MOVEMENT_KIND_LABELS[m.kind]}
                  </p>
                </div>
                <span className={`text-sm font-bold whitespace-nowrap ${m.amount > 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {m.amount > 0 ? '+' : '−'}{fmtMoney(Math.abs(m.amount), m.account.currency)}
                </span>
                {(m.kind === 'manual' || m.kind === 'transfer') && (
                  <button onClick={() => setDeleting(m)} aria-label="Supprimer" className="p-1.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 shrink-0">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 px-1">
            Les versements partenaires confirmés sur un compte et les dépenses payées depuis un compte s'ajoutent tout seuls.
            Le reste (ventes payées en main propre, apports, retraits) se saisit avec Entrée / Sortie.
          </p>
        </div>
      )}

      {accountModal && (
        <AccountModal account={accountModal === 'new' ? null : accountModal}
          onClose={() => setAccountModal(null)} onSaved={() => { setAccountModal(null); reload(); }} />
      )}
      {movementModal && (
        <MovementModal direction={movementModal} accounts={active} defaultAccountId={accountFilter}
          onClose={() => setMovementModal(null)} onSaved={() => { setMovementModal(null); reload(); }} />
      )}
      {transferOpen && (
        <TransferModal accounts={active} onClose={() => setTransferOpen(false)} onSaved={() => { setTransferOpen(false); reload(); }} />
      )}
      <ConfirmDialog
        open={!!deleting}
        title={deleting?.kind === 'transfer' ? 'Supprimer le virement' : 'Supprimer le mouvement'}
        message={deleting?.kind === 'transfer' ? 'Les deux côtés du virement seront supprimés.' : 'Ce mouvement sera supprimé et le solde recalculé.'}
        onConfirm={async () => {
          const m = deleting; setDeleting(null);
          if (m) await treasuryApi.removeMovement(m.id).catch(e => alert(e.message));
          reload();
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function AccountModal({ account, onClose, onSaved }: { account: TreasuryAccount | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(account?.name ?? '');
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'bank');
  const [accountNumber, setAccountNumber] = useState(account?.accountNumber ?? '');
  const numberField = ACCOUNT_NUMBER_FIELD[kind];
  const [currency, setCurrency] = useState<AccountCurrency>(account?.currency ?? 'USD');
  const [opening, setOpening] = useState(account?.openingBalance ?? 0);
  const [openingDate, setOpeningDate] = useState(account?.openingDate?.slice(0, 10) ?? today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await action(); onSaved(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const save = () => run(() => account
    ? treasuryApi.updateAccount(account.id, { name, kind, accountNumber, openingBalance: opening, openingDate })
    : treasuryApi.createAccount({ name, kind, accountNumber, currency, openingBalance: opening, openingDate }));

  return (
    <Modal open onClose={onClose} title={account ? 'Modifier le compte' : 'Nouveau compte'} size="md">
      <div className="space-y-4">
        {/* The type first: it decides what the number is. */}
        <div>
          <label className="label">Type de compte *</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(ACCOUNT_KIND_LABELS) as AccountKind[]).map(k => {
              const Icon = KIND_ICONS[k];
              return (
                <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold ${kind === k ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600'}`}>
                  <Icon size={18} /> {ACCOUNT_KIND_LABELS[k]}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="label">Nom *</label>
          <input value={name} onChange={e => setName(e.target.value)} className={input}
            placeholder={kind === 'bank' ? 'Ex. Rawbank, Equity BCDC' : kind === 'mobile_money' ? 'Ex. M-Pesa, Orange Money, Airtel Money' : 'Ex. Caisse boutique'} />
        </div>
        <div>
          <label className="label">{numberField.label}{numberField.required ? ' *' : ''}</label>
          <input value={accountNumber} onChange={e => setAccountNumber(e.target.value)} placeholder={numberField.placeholder}
            inputMode={kind === 'mobile_money' ? 'tel' : 'text'} className={`${input} font-mono`} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Devise</label>
            <select value={currency} onChange={e => setCurrency(e.target.value as AccountCurrency)} disabled={!!account} className={input}>
              <option value="USD">Dollars ($)</option>
              <option value="CDF">Francs (FC)</option>
            </select>
          </div>
          <div>
            <label className="label">Solde de départ</label>
            <NumberInput value={opening} onChange={setOpening} className={input} />
          </div>
          <div>
            <label className="label">À la date du</label>
            <input type="date" value={openingDate} onChange={e => setOpeningDate(e.target.value)} className={input} />
          </div>
        </div>
        <p className="text-xs text-gray-400">Le solde de départ, c'est l'argent présent sur ce compte au moment où tu commences à le suivre ici.</p>
        {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex gap-3 pt-1">
          {account && (
            <Button variant="secondary" disabled={busy}
              onClick={() => run(() => treasuryApi.updateAccount(account.id, { archived: !account.archived }))}>
              <Archive size={14} /> {account.archived ? 'Réactiver' : 'Archiver'}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={busy}>Annuler</Button>
          <Button onClick={save} loading={busy} className="flex-1" disabled={!name.trim() || (numberField.required && !accountNumber.trim())}>{account ? 'Enregistrer' : 'Créer'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function MovementModal({ direction, accounts, defaultAccountId, onClose, onSaved }: {
  direction: 'in' | 'out'; accounts: TreasuryAccount[]; defaultAccountId: string; onClose: () => void; onSaved: () => void;
}) {
  const [accountId, setAccountId] = useState(accounts.some(a => a.id === defaultAccountId) ? defaultAccountId : accounts[0]?.id ?? '');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(today());
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const account = accounts.find(a => a.id === accountId);

  const save = async () => {
    setBusy(true); setError(null);
    try { await treasuryApi.addMovement({ accountId, direction, amount, date, label }); onSaved(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={direction === 'in' ? "Entrée d'argent" : "Sortie d'argent"} size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="label">Compte</label>
            <select value={accountId} onChange={e => setAccountId(e.target.value)} className={input}>
              {accounts.map(a => <option key={a.id} value={a.id}>{accountLabel(a)} — {fmtMoney(a.balance, a.currency)}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Montant ({account?.currency === 'CDF' ? 'FC' : '$'}) *</label>
            <NumberInput value={amount} onChange={setAmount} className={input} />
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={input} />
          </div>
        </div>
        <div>
          <label className="label">Libellé</label>
          <input value={label} onChange={e => setLabel(e.target.value)} className={input}
            placeholder={direction === 'in' ? 'Ex. Vente comptoir, apport du gérant' : 'Ex. Retrait du gérant, achat comptant'} />
        </div>
        <p className="text-xs text-gray-400">
          {direction === 'out'
            ? 'Une dépense déjà saisie dans Dépenses ? Indique-y « Payé depuis » ce compte plutôt que de la saisir deux fois.'
            : "Un versement de partenaire ? Confirme-le dans Logistique → Versements en choisissant ce compte."}
        </p>
        {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={busy}>Annuler</Button>
          <Button onClick={save} loading={busy} className="flex-1" disabled={!amount || !accountId}>Enregistrer</Button>
        </div>
      </div>
    </Modal>
  );
}

function TransferModal({ accounts, onClose, onSaved }: { accounts: TreasuryAccount[]; onClose: () => void; onSaved: () => void }) {
  const [fromId, setFromId] = useState(accounts[0]?.id ?? '');
  const [toId, setToId] = useState(accounts[1]?.id ?? '');
  const [amount, setAmount] = useState(0);
  const [amountTo, setAmountTo] = useState(0);
  const [date, setDate] = useState(today());
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const source = accounts.find(a => a.id === fromId);
  const target = accounts.find(a => a.id === toId);
  // Dollars changed into francs, or the reverse: the amount received is asked too.
  const exchange = !!source && !!target && source.currency !== target.currency;
  const rate = useMemo(() => (exchange && amount && amountTo ? amountTo / amount : null), [exchange, amount, amountTo]);

  const save = async () => {
    setBusy(true); setError(null);
    try {
      await treasuryApi.transfer({ fromId, toId, amount, amountTo: exchange ? amountTo : undefined, date, label });
      onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Virement entre comptes" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">De</label>
            <select value={fromId} onChange={e => setFromId(e.target.value)} className={input}>
              {accounts.map(a => <option key={a.id} value={a.id}>{accountLabel(a)} ({a.currency === 'CDF' ? 'FC' : '$'})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Vers</label>
            <select value={toId} onChange={e => setToId(e.target.value)} className={input}>
              {accounts.map(a => <option key={a.id} value={a.id}>{accountLabel(a)} ({a.currency === 'CDF' ? 'FC' : '$'})</option>)}
            </select>
          </div>
          <div>
            <label className="label">Montant envoyé ({source?.currency === 'CDF' ? 'FC' : '$'})</label>
            <NumberInput value={amount} onChange={setAmount} className={input} />
          </div>
          {exchange ? (
            <div>
              <label className="label">Montant reçu ({target?.currency === 'CDF' ? 'FC' : '$'})</label>
              <NumberInput value={amountTo} onChange={setAmountTo} className={input} />
            </div>
          ) : (
            <div>
              <label className="label">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={input} />
            </div>
          )}
        </div>
        {exchange && (
          <>
            <p className="text-xs text-gray-500">
              Change de devises{rate ? ` — taux : 1 ${source!.currency === 'USD' ? '$' : 'FC'} = ${rate.toLocaleString('fr-FR', { maximumFractionDigits: 4 })} ${target!.currency === 'USD' ? '$' : 'FC'}` : ''}
            </p>
            <div>
              <label className="label">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={input} />
            </div>
          </>
        )}
        <div>
          <label className="label">Libellé (facultatif)</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Ex. Dépôt à la banque" className={input} />
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={busy}>Annuler</Button>
          <Button onClick={save} loading={busy} className="flex-1" disabled={!amount || fromId === toId || (exchange && !amountTo)}>Virer</Button>
        </div>
      </div>
    </Modal>
  );
}
