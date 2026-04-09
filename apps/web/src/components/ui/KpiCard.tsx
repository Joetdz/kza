import type { LucideIcon } from 'lucide-react';

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
  up: 'text-emerald-600',
  down: 'text-red-500',
  neutral: 'text-gray-500',
};

export function KpiCard({ label, value, sub, icon: Icon, iconColor = 'text-indigo-500', trend, trendLabel }: Props) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <div className={`p-2 rounded-xl bg-gray-50 ${iconColor}`}>
          <Icon size={18} />
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        {sub && <div className="text-sm text-gray-500 mt-0.5">{sub}</div>}
      </div>
      {trend && trendLabel && (
        <div className={`text-xs font-medium ${trendColors[trend]}`}>
          {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'} {trendLabel}
        </div>
      )}
    </div>
  );
}
