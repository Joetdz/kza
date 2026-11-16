import type { LucideIcon } from 'lucide-react';
import { useCountUp } from '../../hooks/useCountUp';

interface Props {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  iconColor?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
}

const trendColors = {
  up: 'text-emerald-600 bg-emerald-50',
  down: 'text-red-600 bg-red-50',
  neutral: 'text-fg-3 bg-surface-2',
};

/** A headline figure. Its number counts up when it appears or changes. */
export function KpiCard({ label, value, sub, icon: Icon, iconColor = 'text-indigo-500', trend, trendLabel }: Props) {
  const shown = useCountUp(value);
  return (
    <div className="card card-hover p-5 flex flex-col gap-3 relative overflow-hidden">
      {/* A faint tint of the icon's colour in the corner. */}
      <div className={`absolute -right-6 -top-6 w-24 h-24 rounded-full opacity-[0.07] bg-current ${iconColor}`} aria-hidden />
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-fg-3">{label}</span>
        <div className={`p-2 rounded-xl bg-surface-2 ${iconColor}`}>
          <Icon size={18} />
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold text-fg tracking-tight">{shown}</div>
        {sub && <div className="text-sm text-fg-3 mt-0.5">{sub}</div>}
      </div>
      {trend && trendLabel && (
        <div className={`self-start text-xs font-semibold px-2 py-0.5 rounded-full ${trendColors[trend]}`}>
          {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendLabel}
        </div>
      )}
    </div>
  );
}
