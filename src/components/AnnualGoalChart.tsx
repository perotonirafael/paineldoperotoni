import React from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { AnnualGoalResult } from '@/hooks/useAnnualGoalMetrics';

interface AnnualGoalChartProps {
  data: AnnualGoalResult | null;
  year?: string;
}

const formatCurrency = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

const formatK = (v: number) => `R$ ${(v / 1000).toFixed(0)}k`;

const getColor = (percentage: number): string => {
  if (percentage >= 100) return '#10b981';
  if (percentage >= 75) return '#f59e0b';
  if (percentage >= 50) return '#f97316';
  return '#ef4444';
};

const getColorClass = (percentage: number): string => {
  if (percentage >= 100) return 'bg-green-600';
  if (percentage >= 75) return 'bg-amber-600';
  if (percentage >= 50) return 'bg-orange-600';
  return 'bg-red-600';
};

export const AnnualGoalChart: React.FC<AnnualGoalChartProps> = ({ data, year }) => {
  if (!data) {
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

  const pctLS = data.metaLicencasServicos > 0 ? (data.realLicencasServicos / data.metaLicencasServicos) * 100 : 0;
  const pctR = data.metaRecorrente > 0 ? (data.realRecorrente / data.metaRecorrente) * 100 : 0;

  return (
    <div className="w-full space-y-6">
      {/* KPI Cards - same layout as GoalChart */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
          <p className="text-xs font-medium text-blue-700 mb-1">Licenças + Serviços (50%)</p>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-lg font-bold text-blue-900">{formatCurrency(data.realLicencasServicos)}</p>
              <p className="text-xs text-blue-600">Meta: {formatCurrency(data.metaLicencasServicos)}</p>
              <p className="text-[10px] text-blue-500 mt-0.5">
                Licença: {formatCurrency(data.realLicenca)} · Serviço: {formatCurrency(data.realServico)}
              </p>
            </div>
            <span className={`px-2 py-1 rounded-full text-white text-xs font-bold ${getColorClass(pctLS)}`}>
              {data.metaLicencasServicos > 0 ? `${pctLS.toFixed(1)}%` : 'N/A'}
            </span>
          </div>
          {data.metaLicencasServicos > 0 && (
            <div className="mt-2 h-2 bg-blue-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(pctLS, 100)}%`,
                  backgroundColor: getColor(pctLS),
                }}
              />
            </div>
          )}
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-4 border border-purple-200">
          <p className="text-xs font-medium text-purple-700 mb-1">Manutenção / Recorrente (50%)</p>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-lg font-bold text-purple-900">{formatCurrency(data.realRecorrente)}</p>
              <p className="text-xs text-purple-600">Meta: {formatCurrency(data.metaRecorrente)}</p>
            </div>
            <span className={`px-2 py-1 rounded-full text-white text-xs font-bold ${getColorClass(pctR)}`}>
              {data.metaRecorrente > 0 ? `${pctR.toFixed(1)}%` : 'N/A'}
            </span>
          </div>
          {data.metaRecorrente > 0 && (
            <div className="mt-2 h-2 bg-purple-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(pctR, 100)}%`,
                  backgroundColor: getColor(pctR),
                }}
              />
            </div>
          )}
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-4 border border-emerald-200">
          <p className="text-xs font-medium text-emerald-700 mb-1">Atingimento Ponderado</p>
          <div className="flex items-end justify-between">
            <p className="text-3xl font-bold" style={{ color: getColor(data.percentualAtingimento) }}>
              {data.percentualAtingimento.toFixed(1)}%
            </p>
            <span className={`px-3 py-1.5 rounded-full text-white text-sm font-bold ${getColorClass(data.percentualAtingimento)}`}>
              {data.percentualAtingimento >= 100 ? 'Atingida' : 'Em andamento'}
            </span>
          </div>
          <div className="mt-2 h-2 bg-emerald-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(data.percentualAtingimento, 100)}%`,
                backgroundColor: getColor(data.percentualAtingimento),
              }}
            />
          </div>
        </div>
      </div>

      {/* Cumulative monthly chart */}
      <div>
        <h4 className="text-sm font-semibold text-foreground mb-3">Evolução Acumulada Mensal</h4>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data.monthlyData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
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
    </div>
  );
};
