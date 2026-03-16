import React from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { AnnualMonthData } from '@/hooks/useAnnualGoalMetrics';

interface AnnualGoalChartProps {
  data: AnnualMonthData[];
  year?: string;
}

const formatCurrency = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

const formatK = (v: number) => `R$ ${(v / 1000).toFixed(0)}k`;

export const AnnualGoalChart: React.FC<AnnualGoalChartProps> = ({ data, year }) => {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center bg-muted/20 rounded-lg border border-dashed border-border">
        <TrendingUp size={32} className="text-muted-foreground/50 mb-3" />
        <p className="text-muted-foreground text-sm font-medium">Nenhum dado de evolução anual disponível</p>
        <p className="text-muted-foreground/70 text-xs mt-1">
          Carregue os arquivos de Metas e Pedidos para visualizar
        </p>
      </div>
    );
  }

  // Find current month index (0-based) to highlight
  const now = new Date();
  const currentMonthIdx = now.getMonth(); // 0 = Jan

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Summary KPIs from latest month with data */}
        {(() => {
          const latest = [...data].reverse().find(d => d.realLicServAcum > 0 || d.realRecorrenteAcum > 0) || data[data.length - 1];
          const pctLS = latest.metaLicServAcum > 0 ? (latest.realLicServAcum / latest.metaLicServAcum) * 100 : 0;
          const pctR = latest.metaRecorrenteAcum > 0 ? (latest.realRecorrenteAcum / latest.metaRecorrenteAcum) * 100 : 0;
          return (
            <>
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <p className="text-[10px] font-medium text-blue-600">Meta Anual Lic+Serv</p>
                <p className="text-sm font-bold text-blue-900">{formatCurrency(data[11]?.metaLicServAcum || 0)}</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                <p className="text-[10px] font-medium text-blue-600">Realizado Acum. Lic+Serv</p>
                <p className="text-sm font-bold text-blue-900">{formatCurrency(latest.realLicServAcum)}</p>
                <p className="text-[10px] text-blue-500">{pctLS.toFixed(1)}%</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                <p className="text-[10px] font-medium text-purple-600">Meta Anual Recorrente</p>
                <p className="text-sm font-bold text-purple-900">{formatCurrency(data[11]?.metaRecorrenteAcum || 0)}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                <p className="text-[10px] font-medium text-purple-600">Realizado Acum. Recorrente</p>
                <p className="text-sm font-bold text-purple-900">{formatCurrency(latest.realRecorrenteAcum)}</p>
                <p className="text-[10px] text-purple-500">{pctR.toFixed(1)}%</p>
              </div>
            </>
          );
        })()}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#6b7280' }} />
          <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickFormatter={formatK} />
          <Tooltip
            contentStyle={{
              background: 'rgba(255,255,255,0.97)',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              fontSize: '12px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
            }}
            formatter={(value: number, name: string) => [formatCurrency(value), name]}
          />
          <Legend />
          <Bar dataKey="realLicServAcum" name="Real Lic+Serv" fill="#3b82f6" opacity={0.7} radius={[2, 2, 0, 0]} />
          <Bar dataKey="realRecorrenteAcum" name="Real Recorrente" fill="#a855f7" opacity={0.7} radius={[2, 2, 0, 0]} />
          <Line type="monotone" dataKey="metaLicServAcum" name="Meta Lic+Serv" stroke="#1d4ed8" strokeWidth={2} strokeDasharray="6 3" dot={false} />
          <Line type="monotone" dataKey="metaRecorrenteAcum" name="Meta Recorrente" stroke="#7c3aed" strokeWidth={2} strokeDasharray="6 3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
