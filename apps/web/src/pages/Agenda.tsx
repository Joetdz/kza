import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Settings, Phone, Bot, Check, X, UserX, RotateCcw, Trash2, Clock,
} from 'lucide-react';
import { addDays, utcToLocal } from '@kza/shared';
import { agendaApi, type AgendaSettings, type Appointment, type AppointmentStatus, type OpeningRange } from '../api/agenda';
import { useStore } from '../store/useStore';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { toast } from '../hooks/useToast';

const DAY_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const DAY_LONG = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
// Settings list Monday first, as people read a week.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const STATUS: Record<AppointmentStatus, { label: string; color: 'green' | 'blue' | 'red' | 'gray' }> = {
  confirmed: { label: 'Confirmé', color: 'blue' },
  done:      { label: 'Terminé',  color: 'green' },
  no_show:   { label: 'Absent',   color: 'red' },
  cancelled: { label: 'Annulé',   color: 'gray' },
};

const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const mondayOf = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7));

export function Agenda() {
  const products = useStore(s => s.products);
  const [settings, setSettings] = useState<AgendaSettings | null>(null);
  const tz = settings?.timeZone ?? 'Africa/Kinshasa';
  const today = utcToLocal(new Date(), tz).date;

  const [selected, setSelected] = useState(today);
  const weekStart = mondayOf(selected);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    agendaApi.getSettings().then(s => {
      setSettings(s);
      setSelected(utcToLocal(new Date(), s.timeZone).date);
    }).catch(() => toast.error("Impossible de charger l'agenda"));
  }, []);

  const loadWeek = useCallback(async () => {
    setLoading(true);
    try {
      setAppointments(await agendaApi.list(weekStart, addDays(weekStart, 6)));
    } catch {
      toast.error('Erreur lors du chargement des rendez-vous');
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => { if (settings) loadWeek(); }, [settings, loadWeek]);

  const local = (iso: string) => utcToLocal(new Date(iso), tz);
  const dayAppointments = appointments
    .filter(a => local(a.startAt).date === selected)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const countFor = (date: string) => appointments.filter(a => a.status !== 'cancelled' && local(a.startAt).date === date).length;

  const setStatus = async (a: Appointment, status: AppointmentStatus) => {
    try {
      const updated = await agendaApi.update(a.id, { status });
      setAppointments(list => list.map(x => x.id === a.id ? updated : x));
    } catch (e: any) {
      toast.error(e?.message ?? 'Erreur');
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    try {
      await agendaApi.remove(deleteId);
      setAppointments(list => list.filter(a => a.id !== deleteId));
    } catch { toast.error('Erreur lors de la suppression'); }
    setDeleteId(null);
  };

  const services = products.filter(p => !(p.trackStock ?? true));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Agenda</h1>
          <p className="text-xs sm:text-sm text-gray-500 capitalize">
            {new Date(`${selected}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => setShowSettings(true)} title="Réglages de l'agenda"
            className="flex items-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors">
            <Settings size={15} /><span className="hidden sm:inline">Réglages</span>
          </button>
          <button onClick={() => setShowNew(true)} disabled={!settings}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 sm:px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
            <Plus size={16} /><span className="hidden sm:inline">Rendez-vous</span>
          </button>
        </div>
      </div>

      {settings && settings.configured === false && (
        <button onClick={() => setShowSettings(true)}
          className="w-full text-left bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 hover:bg-amber-100 transition-colors">
          <div className="text-sm font-semibold text-amber-800">Configurez vos horaires d'ouverture</div>
          <div className="text-xs text-amber-700">Tant qu'ils ne sont pas enregistrés, l'IA WhatsApp ne propose pas de créneaux à vos clients.</div>
        </button>
      )}

      {/* Week strip */}
      <div className="bg-white rounded-2xl border border-gray-100 p-3 flex items-center gap-2">
        <button onClick={() => setSelected(addDays(selected, -7))} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Semaine précédente">
          <ChevronLeft size={16} />
        </button>
        <div className="flex-1 grid grid-cols-7 gap-1">
          {weekDays.map(d => {
            const n = countFor(d);
            const isSel = d === selected;
            return (
              <button key={d} onClick={() => setSelected(d)}
                className={`flex flex-col items-center py-2 rounded-xl text-xs transition-colors ${isSel ? 'bg-indigo-600 text-white' : d === today ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50 text-gray-600'}`}>
                <span className="font-medium">{DAY_SHORT[weekdayOf(d)]}</span>
                <span className="text-base font-bold">{Number(d.slice(8))}</span>
                <span className={`text-[10px] ${isSel ? 'text-indigo-100' : 'text-gray-400'}`}>{n > 0 ? `${n} rdv` : '·'}</span>
              </button>
            );
          })}
        </div>
        <button onClick={() => setSelected(addDays(selected, 7))} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Semaine suivante">
          <ChevronRight size={16} />
        </button>
      </div>
      {selected !== today && (
        <button onClick={() => setSelected(today)} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
          Revenir à aujourd'hui
        </button>
      )}

      {/* Day */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Chargement…</div>
        ) : dayAppointments.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-white rounded-2xl border border-gray-100">
            <CalendarDays size={28} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Aucun rendez-vous ce jour-là</p>
          </div>
        ) : dayAppointments.map(a => {
          const start = local(a.startAt).time;
          const end = local(a.endAt).time;
          const st = STATUS[a.status];
          const phone = a.customerPhone?.replace(/@.*$/, '');
          return (
            <div key={a.id} className={`bg-white rounded-2xl border border-gray-100 px-4 py-3 flex items-start gap-3 ${a.status === 'cancelled' ? 'opacity-50' : ''}`}>
              <div className="w-16 shrink-0 text-center">
                <div className="text-sm font-bold text-gray-900">{start}</div>
                <div className="text-[11px] text-gray-400">{end}</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900 truncate">{a.customerName}</span>
                  <Badge color={st.color} size="sm">{st.label}</Badge>
                  {a.source === 'whatsapp_ai' && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full">
                      <Bot size={10} /> IA WhatsApp
                    </span>
                  )}
                </div>
                <div className="text-xs text-gray-500 truncate">
                  {[a.serviceName, a.resource].filter(Boolean).join(' · ') || 'Rendez-vous'}
                </div>
                {phone && (
                  <a href={`tel:+${phone}`} className="inline-flex items-center gap-1 text-xs text-indigo-600 mt-0.5">
                    <Phone size={11} /> +{phone}
                  </a>
                )}
                {a.notes && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{a.notes}</p>}
              </div>
              <div className="flex items-center shrink-0">
                {a.status === 'confirmed' ? (
                  <>
                    <button title="Terminé" onClick={() => setStatus(a, 'done')} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50"><Check size={15} /></button>
                    <button title="Absent" onClick={() => setStatus(a, 'no_show')} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"><UserX size={15} /></button>
                    <button title="Annuler" onClick={() => setStatus(a, 'cancelled')} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"><X size={15} /></button>
                  </>
                ) : (
                  <button title="Remettre en confirmé" onClick={() => setStatus(a, 'confirmed')} className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50"><RotateCcw size={15} /></button>
                )}
                <button title="Supprimer" onClick={() => setDeleteId(a.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50"><Trash2 size={15} /></button>
              </div>
            </div>
          );
        })}
      </div>

      {showNew && settings && (
        <NewAppointmentModal
          settings={settings}
          initialDate={selected < today ? today : selected}
          today={today}
          services={services}
          onClose={() => setShowNew(false)}
          onCreated={a => {
            setShowNew(false);
            const date = local(a.startAt).date;
            if (mondayOf(date) === weekStart) setAppointments(list => [...list, a]);
            setSelected(date);
          }}
        />
      )}

      {showSettings && settings && (
        <SettingsModal
          settings={settings}
          onClose={() => setShowSettings(false)}
          onSaved={s => { setSettings(s); setShowSettings(false); toast.success('Réglages enregistrés'); }}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Supprimer le rendez-vous"
        message="Le rendez-vous sera définitivement supprimé. Pour garder une trace, annulez-le plutôt."
        onConfirm={remove}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

// ── New appointment ────────────────────────────────────────────────────────────

function NewAppointmentModal({ settings, initialDate, today, services, onClose, onCreated }: {
  settings: AgendaSettings;
  initialDate: string;
  today: string;
  services: Array<{ id: string; name: string; durationMinutes?: number | null }>;
  onClose: () => void;
  onCreated: (a: Appointment) => void;
}) {
  const [form, setForm] = useState({ customerName: '', customerPhone: '', productId: '', resource: '', date: initialDate, time: '', notes: '' });
  const [slots, setSlots] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSlots(null);
    setForm(f => ({ ...f, time: '' }));
    agendaApi.availability(form.date, form.productId || undefined, form.resource || undefined)
      .then(setSlots)
      .catch(() => setSlots([]));
  }, [form.date, form.productId, form.resource]);

  const save = async () => {
    if (!form.customerName.trim() || !form.time) return;
    setSaving(true);
    try {
      const created = await agendaApi.create({
        customerName: form.customerName,
        customerPhone: form.customerPhone || undefined,
        productId: form.productId || undefined,
        resource: form.resource || undefined,
        date: form.date,
        time: form.time,
        notes: form.notes || undefined,
      });
      toast.success('Rendez-vous enregistré');
      onCreated(created);
    } catch (e: any) {
      toast.error(e?.message ?? 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300';

  return (
    <Modal open onClose={() => !saving && onClose()} title="Nouveau rendez-vous" size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Client *</label>
            <input value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} className={input} placeholder="Nom du client" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Téléphone</label>
            <input type="tel" value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} className={input} placeholder="Pour le rappel WhatsApp" />
          </div>
          {services.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Service</label>
              <select value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value }))} className={`${input} bg-white`}>
                <option value="">— Aucun —</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.durationMinutes ?? settings.defaultDurationMinutes} min)</option>
                ))}
              </select>
            </div>
          )}
          {settings.resources.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Avec</label>
              <select value={form.resource} onChange={e => setForm(f => ({ ...f, resource: e.target.value }))} className={`${input} bg-white`}>
                <option value="">Peu importe</option>
                {settings.resources.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Date</label>
            <input type="date" min={today} value={form.date} onChange={e => e.target.value && setForm(f => ({ ...f, date: e.target.value }))} className={input} />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1.5 block flex items-center gap-1"><Clock size={12} /> Heure</label>
          {slots === null ? (
            <p className="text-xs text-gray-400">Recherche des créneaux libres…</p>
          ) : slots.length === 0 ? (
            <p className="text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-2.5">Aucun créneau libre ce jour-là (fermé ou complet).</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-40 overflow-y-auto">
              {slots.map(t => (
                <button key={t} type="button" onClick={() => setForm(f => ({ ...f, time: t }))}
                  className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${form.time === t ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-200 text-gray-700 hover:border-indigo-300'}`}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Notes</label>
          <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className={input} />
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={saving}>Annuler</Button>
          <Button onClick={save} loading={saving} disabled={!form.customerName.trim() || !form.time} className="flex-1">Enregistrer</Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Settings ───────────────────────────────────────────────────────────────────

function SettingsModal({ settings, onClose, onSaved }: {
  settings: AgendaSettings;
  onClose: () => void;
  onSaved: (s: AgendaSettings) => void;
}) {
  // One opening range per day in this screen (the API accepts several).
  const initialDays = Object.fromEntries(WEEK_ORDER.map(day => {
    const r = settings.openingHours.find(h => h.day === day);
    return [day, { open: !!r, from: r?.from ?? '09:00', to: r?.to ?? '18:00' }];
  })) as Record<number, { open: boolean; from: string; to: string }>;

  const [days, setDays] = useState(initialDays);
  const [slotMinutes, setSlotMinutes] = useState(settings.slotMinutes);
  const [duration, setDuration] = useState(settings.defaultDurationMinutes);
  const [resources, setResources] = useState(settings.resources.join(', '));
  const [capacity, setCapacity] = useState(settings.capacity);
  const [reminderHours, setReminderHours] = useState(settings.reminderHours);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const openingHours: OpeningRange[] = WEEK_ORDER
        .filter(d => days[d].open && days[d].from < days[d].to)
        .map(d => ({ day: d, from: days[d].from, to: days[d].to }));
      const saved = await agendaApi.saveSettings({
        openingHours,
        slotMinutes,
        defaultDurationMinutes: duration,
        resources: resources.split(',').map(r => r.trim()).filter(Boolean),
        capacity,
        reminderHours,
      });
      onSaved(saved);
    } catch (e: any) {
      toast.error(e?.message ?? 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const input = 'border border-gray-200 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-300';
  const hasResources = resources.split(',').some(r => r.trim());

  return (
    <Modal open onClose={() => !saving && onClose()} title="Réglages de l'agenda" size="md">
      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-gray-900 mb-2">Horaires d'ouverture</p>
          <div className="space-y-1.5">
            {WEEK_ORDER.map(d => (
              <div key={d} className="flex items-center gap-2">
                <label className="flex items-center gap-2 w-28 text-sm text-gray-700">
                  <input type="checkbox" checked={days[d].open}
                    onChange={e => setDays(s => ({ ...s, [d]: { ...s[d], open: e.target.checked } }))} />
                  {DAY_LONG[d]}
                </label>
                {days[d].open ? (
                  <>
                    <input type="time" value={days[d].from} onChange={e => setDays(s => ({ ...s, [d]: { ...s[d], from: e.target.value } }))} className={input} />
                    <span className="text-gray-400 text-xs">→</span>
                    <input type="time" value={days[d].to} onChange={e => setDays(s => ({ ...s, [d]: { ...s[d], to: e.target.value } }))} className={input} />
                  </>
                ) : (
                  <span className="text-xs text-gray-400">Fermé</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-1.5">Fuseau : {settings.timeZone}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Créneaux toutes les</label>
            <select value={slotMinutes} onChange={e => setSlotMinutes(Number(e.target.value))} className={`${input} w-full bg-white`}>
              {[10, 15, 20, 30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Durée par défaut</label>
            <select value={duration} onChange={e => setDuration(Number(e.target.value))} className={`${input} w-full bg-white`}>
              {[15, 20, 30, 45, 60, 90, 120, 180, 240].map(m => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Personnel, postes ou salles (optionnel)</label>
          <input value={resources} onChange={e => setResources(e.target.value)} placeholder="Ex : Awa, Junior, Fauteuil 3" className={`${input} w-full`} />
          <p className="text-[11px] text-gray-400 mt-1">Séparés par des virgules. Chacun prend un rendez-vous à la fois.</p>
        </div>

        {!hasResources && (
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Rendez-vous en même temps</label>
            <input type="number" min={1} max={100} value={capacity} onChange={e => setCapacity(Math.max(1, Number(e.target.value) || 1))} className={`${input} w-24`} />
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">Rappel WhatsApp au client</label>
          <select value={reminderHours} onChange={e => setReminderHours(Number(e.target.value))} className={`${input} bg-white`}>
            <option value={0}>Pas de rappel</option>
            <option value={2}>2 h avant</option>
            <option value={3}>3 h avant</option>
            <option value={12}>12 h avant</option>
            <option value={24}>24 h avant</option>
            <option value={48}>48 h avant</option>
          </select>
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={saving}>Annuler</Button>
          <Button onClick={save} loading={saving} className="flex-1">Enregistrer</Button>
        </div>
      </div>
    </Modal>
  );
}
