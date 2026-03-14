import { memo, type ReactNode } from 'react';

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  color?: 'blue' | 'green' | 'amber' | 'red' | 'purple';
}

const colorMap: Record<string, { bg: string; iconText: string; border: string; accent: string }> = {
  blue: {
    bg: 'bg-gradient-to-br from-blue-50 to-indigo-50',
    iconText: 'text-blue-600',
    border: 'border-blue-200',
    accent: 'bg-gradient-to-r from-blue-500 to-indigo-500',
  },
  green: {
    bg: 'bg-gradient-to-br from-emerald-50 to-green-50',
    iconText: 'text-emerald-600',
    border: 'border-emerald-200',
    accent: 'bg-gradient-to-r from-emerald-500 to-green-500',
  },
  amber: {
    bg: 'bg-gradient-to-br from-amber-50 to-orange-50',
    iconText: 'text-amber-600',
    border: 'border-amber-200',
    accent: 'bg-gradient-to-r from-amber-500 to-orange-500',
  },
  red: {
    bg: 'bg-gradient-to-br from-red-50 to-rose-50',
    iconText: 'text-red-600',
    border: 'border-red-200',
    accent: 'bg-gradient-to-r from-red-500 to-rose-500',
  },
  purple: {
    bg: 'bg-gradient-to-br from-violet-50 to-purple-50',
    iconText: 'text-violet-600',
    border: 'border-violet-200',
    accent: 'bg-gradient-to-r from-violet-500 to-purple-500',
  },
};

function KPICardInner({ title, value, subtitle, icon, color = 'blue' }: Props) {
  const c = colorMap[color];

  return (
    <div className={`bg-white rounded-xl p-5 border ${c.border} shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5 relative overflow-hidden`}>
      {/* Top accent bar */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${c.accent}`} />
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2 rounded-lg ${c.bg}`}>
          <span className={c.iconText}>{icon}</span>
        </div>
      </div>
      <p className="text-2xl font-bold font-mono text-foreground tracking-tight">
        {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
      </p>
      <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider font-medium">{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

export const KPICard = memo(KPICardInner);
