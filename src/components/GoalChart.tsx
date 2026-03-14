import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts';
import { Target } from 'lucide-react';
import type { GoalMetrics } from '@/types/goals';

interface GoalChartProps {
  metricas: GoalMetrics[];
  title?: string;
}

const formatCurrency = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

const getColor = (percentage: number): string => {
  if (percentage >= 100) return '#10b981';
  if (percentage >= 75) return '#f59e0b';
  if (percentage >= 50) return '#f97316';
  return '#ef4444';
};

export const GoalChart: React.FC<GoalChartProps> = ({ metricas, title }) => {
  // Estado vazio
  if (!metricas || metricas.length === 0) {
    return (
      <div className="w-full">
        {title && <h3 className="text-lg font-bold text-foreground mb-4">{title}</h3>}
        <div className="h-64 flex flex-col items-center justify-center bg-muted/20 rounded-lg border border-dashed border-border">
          <Target size={32} className="text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground text-sm font-medium">Nenhum dado de meta disponível</p>
          <p className="text-muted-foreground/70 text-xs mt-1">
            Carregue os arquivos de Metas (.xlsx) e Pedidos CRM (.csv) junto com Oportunidades e Ações
          </p>
        </div>
      </div>
    );
  }

  // Separar TOTAL e ETNs individuais
  const totalMetrica = metricas.find(m => m.etn === 'TOTAL');
  const etnMetricas = metricas.filter(m => m.etn !== 'TOTAL');

  // Dados para gráfico de barras por ETN (top 15 por realização)
  const topEtns = [...etnMetricas]
    .sort((a, b) => (b.realLicencasServicos + b.realRecorrente) - (a.realLicencasServicos + a.realRecorrente))
    .slice(0, 15);

  const chartData = topEtns.map(m => ({
    name: m.etn.length > 18 ? m.etn.substring(0, 18) + '...' : m.etn,
    fullName: m.etn,
    'Licenças+Serviços': m.realLicencasServicos,
    'Recorrente': m.realRecorrente,
    total: m.realLicencasServicos + m.realRecorrente,
  }));

  return (
    <div className="w-full space-y-6">
      {title && <h3 className="text-lg font-bold text-foreground">{title}</h3>}

      {/* Resumo TOTAL */}
      {totalMetrica && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Card Licenças + Serviços */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
            <p className="text-xs font-medium text-blue-700 mb-1">Licenças + Serviços (50%)</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-lg font-bold text-blue-900">{formatCurrency(totalMetrica.realLicencasServicos)}</p>
                <p className="text-xs text-blue-600">Meta: {formatCurrency(totalMetrica.metaLicencasServicos)}</p>
              </div>
              <span className={`px-2 py-1 rounded-full text-white text-xs font-bold ${
                totalMetrica.metaLicencasServicos > 0
                  ? getColor((totalMetrica.realLicencasServicos / totalMetrica.metaLicencasServicos) * 100) === '#10b981' ? 'bg-green-600'
                    : getColor((totalMetrica.realLicencasServicos / totalMetrica.metaLicencasServicos) * 100) === '#f59e0b' ? 'bg-amber-600'
                    : getColor((totalMetrica.realLicencasServicos / totalMetrica.metaLicencasServicos) * 100) === '#f97316' ? 'bg-orange-600'
                    : 'bg-red-600'
                  : 'bg-gray-400'
              }`}>
                {totalMetrica.metaLicencasServicos > 0
                  ? `${((totalMetrica.realLicencasServicos / totalMetrica.metaLicencasServicos) * 100).toFixed(1)}%`
                  : 'N/A'}
              </span>
            </div>
            {totalMetrica.metaLicencasServicos > 0 && (
              <div className="mt-2 h-2 bg-blue-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min((totalMetrica.realLicencasServicos / totalMetrica.metaLicencasServicos) * 100, 100)}%`,
                    backgroundColor: getColor((totalMetrica.realLicencasServicos / totalMetrica.metaLicencasServicos) * 100),
                  }}
                />
              </div>
            )}
          </div>

          {/* Card Recorrente */}
          <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-4 border border-purple-200">
            <p className="text-xs font-medium text-purple-700 mb-1">Recorrente (50%)</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-lg font-bold text-purple-900">{formatCurrency(totalMetrica.realRecorrente)}</p>
                <p className="text-xs text-purple-600">Meta: {formatCurrency(totalMetrica.metaRecorrente)}</p>
              </div>
              <span className={`px-2 py-1 rounded-full text-white text-xs font-bold ${
                totalMetrica.metaRecorrente > 0
                  ? getColor((totalMetrica.realRecorrente / totalMetrica.metaRecorrente) * 100) === '#10b981' ? 'bg-green-600'
                    : getColor((totalMetrica.realRecorrente / totalMetrica.metaRecorrente) * 100) === '#f59e0b' ? 'bg-amber-600'
                    : getColor((totalMetrica.realRecorrente / totalMetrica.metaRecorrente) * 100) === '#f97316' ? 'bg-orange-600'
                    : 'bg-red-600'
                  : 'bg-gray-400'
              }`}>
                {totalMetrica.metaRecorrente > 0
                  ? `${((totalMetrica.realRecorrente / totalMetrica.metaRecorrente) * 100).toFixed(1)}%`
                  : 'N/A'}
              </span>
            </div>
            {totalMetrica.metaRecorrente > 0 && (
              <div className="mt-2 h-2 bg-purple-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min((totalMetrica.realRecorrente / totalMetrica.metaRecorrente) * 100, 100)}%`,
                    backgroundColor: getColor((totalMetrica.realRecorrente / totalMetrica.metaRecorrente) * 100),
                  }}
                />
              </div>
            )}
          </div>

          {/* Card Atingimento Total */}
          <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-4 border border-emerald-200">
            <p className="text-xs font-medium text-emerald-700 mb-1">Atingimento Ponderado</p>
            <div className="flex items-end justify-between">
              <p className="text-3xl font-bold" style={{ color: getColor(totalMetrica.percentualAtingimento) }}>
                {totalMetrica.percentualAtingimento.toFixed(1)}%
              </p>
              <span className={`px-3 py-1.5 rounded-full text-white text-sm font-bold ${
                totalMetrica.percentualAtingimento >= 100 ? 'bg-green-600'
                : totalMetrica.percentualAtingimento >= 75 ? 'bg-amber-600'
                : totalMetrica.percentualAtingimento >= 50 ? 'bg-orange-600'
                : 'bg-red-600'
              }`}>
                {totalMetrica.percentualAtingimento >= 100 ? 'Atingida' : 'Em andamento'}
              </span>
            </div>
            <div className="mt-2 h-2 bg-emerald-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(totalMetrica.percentualAtingimento, 100)}%`,
                  backgroundColor: getColor(totalMetrica.percentualAtingimento),
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Gráfico de barras por ETN */}
      {chartData.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">Realização por ETN (Top 15)</h4>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="name"
                angle={-45}
                textAnchor="end"
                height={100}
                tick={{ fontSize: 11, fill: '#6b7280' }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6b7280' }}
                tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  background: 'rgba(255,255,255,0.97)',
                  border: '1px solid #e5e7eb',
                  borderRadius: '10px',
                  fontSize: '12px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                }}
                formatter={(value: number) => formatCurrency(value)}
                labelFormatter={(label: string) => {
                  const item = chartData.find(d => d.name === label);
                  return item?.fullName || label;
                }}
              />
              <Legend />
              <Bar dataKey="Licenças+Serviços" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Recorrente" stackId="a" fill="#a855f7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tabela de detalhes - apenas ETNs com realização */}
      {etnMetricas.filter(m => m.realLicencasServicos > 0 || m.realRecorrente > 0).length > 0 && (
        <div className="overflow-x-auto">
          <h4 className="text-sm font-semibold text-foreground mb-3">Detalhamento por ETN</h4>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">ETN</th>
                <th className="px-4 py-2 text-right font-semibold">Licenças+Serviços</th>
                <th className="px-4 py-2 text-right font-semibold">Recorrente</th>
                <th className="px-4 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {etnMetricas
                .filter(m => m.realLicencasServicos > 0 || m.realRecorrente > 0)
                .sort((a, b) => (b.realLicencasServicos + b.realRecorrente) - (a.realLicencasServicos + a.realRecorrente))
                .map((m) => (
                  <tr key={`${m.etn}-${m.periodo}`} className="border-b border-border hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium">{m.etn}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(m.realLicencasServicos)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(m.realRecorrente)}</td>
                    <td className="px-4 py-2 text-right font-bold">
                      {formatCurrency(m.realLicencasServicos + m.realRecorrente)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
