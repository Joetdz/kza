import { useState } from 'react';

/** One day of Ikele's visitor counter (see the API's IkeleStatsService). */
export interface VisitDay { day: string; visitors: number; newVisitors: number; orders: number }

const dayLabel = (day: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', opts);

/**
 * Visitors per day, one bar a day, a single series (so no legend: the title names it).
 * Hover or tap a day for its figures: visitors, new ones, orders. Orders are not drawn
 * on the same axis: they are a different scale, read in the tooltip and the totals.
 */
export function VisitorsChart({ days, title = 'Visiteurs par jour' }: { days: VisitDay[]; title?: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...days.map(d => d.visitors));
  const shown = active !== null ? days[active] : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-baseline justify-between mb-3 gap-2">
        <p className="text-sm font-bold text-gray-900">{title}</p>
        {/* The figures of the day pointed at; the scale's top otherwise. */}
        <p className="text-xs text-gray-500 text-right" aria-live="polite">
          {shown
            ? <>
                <span className="font-semibold text-gray-800">{dayLabel(shown.day, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                {' · '}{shown.visitors} visiteur{shown.visitors > 1 ? 's' : ''}
                {' · '}{shown.newVisitors} nouveau{shown.newVisitors > 1 ? 'x' : ''}
                {' · '}{shown.orders} commande{shown.orders > 1 ? 's' : ''}
              </>
            : <>max {max.toLocaleString('fr-FR')} / jour</>}
        </p>
      </div>

      <div className="relative h-32" onMouseLeave={() => setActive(null)}>
        {/* Recessive guides: the top and the middle of the scale. */}
        <div className="absolute inset-x-0 top-0 border-t border-dashed border-gray-100" />
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-gray-100" />
        <div className="absolute inset-0 flex items-end gap-[2px]">
          {days.map((d, i) => (
            // The hit target is the whole column, wider and taller than the bar.
            <button key={d.day} type="button"
              onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)}
              aria-label={`${dayLabel(d.day, { day: 'numeric', month: 'long' })} : ${d.visitors} visiteurs, ${d.newVisitors} nouveaux, ${d.orders} commandes`}
              className="flex-1 h-full flex items-end outline-none">
              <span
                className={`w-full rounded-t-[4px] transition-colors ${active === i ? 'bg-indigo-700' : 'bg-indigo-500'}`}
                style={{ height: d.visitors ? `${Math.max(3, (d.visitors / max) * 100)}%` : '2px', opacity: d.visitors ? 1 : 0.25 }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-gray-400">
        <span>{days[0] && dayLabel(days[0].day, { day: 'numeric', month: 'short' })}</span>
        <span>Aujourd'hui</span>
      </div>
    </div>
  );
}

/** A headline number with its label, for the totals above the chart. */
export function StatTile({ value, label, hint }: { value: number | string; label: string; hint?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
      <p className="text-2xl font-black text-gray-900 leading-tight">{typeof value === 'number' ? value.toLocaleString('fr-FR') : value}</p>
      <p className="text-xs text-gray-500">{label}</p>
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}
