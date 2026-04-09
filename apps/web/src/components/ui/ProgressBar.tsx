interface Props {
  value: number; // 0–100
  color?: string;
  height?: number;
  label?: string;
}

export function ProgressBar({ value, color = '#6366f1', height = 8, label }: Props) {
  const clamped = Math.min(100, Math.max(0, value));
  const barColor = clamped >= 100 ? '#10b981' : clamped >= 60 ? color : clamped >= 30 ? '#f59e0b' : '#ef4444';

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{label}</span>
          <span className="font-medium">{Math.round(clamped)}%</span>
        </div>
      )}
      <div className="w-full bg-gray-100 rounded-full overflow-hidden" style={{ height }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${clamped}%`, backgroundColor: barColor }}
        />
      </div>
    </div>
  );
}
