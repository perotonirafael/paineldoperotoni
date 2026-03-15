import { useMemo, useState } from 'react';
import type { ProcessedRecord, Action } from '@/hooks/useDataProcessor';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, LineChart, Line, CartesianGrid, Legend, Funnel, FunnelChart,
} from 'recharts';
import { TrendingUp, BarChart3 } from 'lucide-react';
import { isEligibleCommitmentCategory, isDemoCommitmentCategory } from '@/lib/commitmentCategories';

const COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
];

const FUNNEL_COLORS = [
  '#10b981', '#22c55e', '#84cc16', '#eab308', '#f59e0b',
  '#f97316', '#ef4444', '#dc2626', '#b91c1c', '#991b1b',
];

const formatCurrency = (v: number) => {
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}K`;
  return `R$ ${v.toFixed(0)}`;
};

const tooltipStyle = {
  contentStyle: {
    background: 'rgba(255, 255, 255, 0.97)',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    fontSize: '12px',
    color: '#1f2937',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
  },
};

const MATRIX_PAGE_SIZE = 15;

function DateRangeFooter({ data }: { data: ProcessedRecord[] }) {
  const range = useMemo(() => {
    let minYM = Infinity, maxYM = 0;
    let minLabel = '', maxLabel = '';
    const mNames = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    for (const r of data) {
      if (!r.anoPrevisao || !r.mesPrevisaoNum) continue;
      const y = parseInt(r.anoPrevisao);
      const m = r.mesPrevisaoNum;
      const ym = y * 100 + m;
      if (ym < minYM) { minYM = ym; minLabel = `${mNames[m]}/${y}`; }
      if (ym > maxYM) { maxYM = ym; maxLabel = `${mNames[m]}/${y}`; }
    }
    if (minYM === Infinity) return 'Sem dados de período';
    return `${minLabel} — ${maxLabel}`;
  }, [data]);

  return (
    <p className="text-[10px] text-gray-400 text-center mt-2 pt-1 border-t border-gray-100">
      Período dos filtros aplicados: {range}
    </p>
  );
}

interface Props {
  data: ProcessedRecord[];
  actions: Action[];
}

export function ETNComparativeAnalysis({ data, actions }: Props) {
  const [matrixPage, setMatrixPage] = useState(0);

  // Build set of oppIds with eligible categories (for ganhas/perdidas)
  const eligibleOppIds = useMemo(() => {
    const set = new Set<string>();
    for (const a of actions) {
      const categoria = (a['Categoria'] || '').toString().trim();
      if (!isEligibleCommitmentCategory(categoria)) continue;
      const oppId = (a['Oportunidade ID'] || '').toString().trim();
      if (oppId) set.add(oppId);
    }
    // Fallback: use processedData categories
    if (set.size === 0) {
      for (const r of data) {
        if (r.categoriaCompromisso && isEligibleCommitmentCategory(r.categoriaCompromisso)) {
          set.add(r.oppId);
        }
      }
    }
    return set;
  }, [data, actions]);

  // Build set of oppIds with demo categories (for conversion rate)
  const demoOppIds = useMemo(() => {
    const set = new Set<string>();
    for (const a of actions) {
      const categoria = (a['Categoria'] || '').toString().trim();
      if (!isDemoCommitmentCategory(categoria)) continue;
      const oppId = (a['Oportunidade ID'] || '').toString().trim();
      if (oppId) set.add(oppId);
    }
    if (set.size === 0) {
      for (const r of data) {
        if (r.categoriaCompromisso && isDemoCommitmentCategory(r.categoriaCompromisso)) {
          set.add(r.oppId);
        }
      }
    }
    return set;
  }, [data, actions]);

  const shouldGateByCategory = eligibleOppIds.size > 0;

  // 1. Matriz de Performance ETN
  const performanceMatrix = useMemo(() => {
    const etnMap = new Map<string, {
      total: number;
      won: number;
      wonValue: number;
      lostValue: number;
      totalValue: number;
      agendas: number;
      // Demo-only for conversion rate
      demoWon: number;
      demoLost: number;
    }>();

    const seen = new Set<string>();

    for (const r of data) {
      if (!etnMap.has(r.etn)) {
        etnMap.set(r.etn, { total: 0, won: 0, wonValue: 0, lostValue: 0, totalValue: 0, agendas: 0, demoWon: 0, demoLost: 0 });
      }
      const stats = etnMap.get(r.etn)!;

      const key = `${r.etn}||${r.oppId}`;
      if (!seen.has(key)) {
        seen.add(key);
        const isGanha = r.etapa === 'Fechada e Ganha' || r.etapa === 'Fechada e Ganha TR';
        const isPerdida = r.etapa === 'Fechada e Perdida';
        const hasEligible = eligibleOppIds.has(r.oppId);
        const hasDemo = demoOppIds.has(r.oppId);

        if (isGanha && (!shouldGateByCategory || hasEligible)) {
          stats.won++;
          stats.wonValue += (r.valorUnificado ?? r.valorFechado);
          stats.total++;
          if (hasDemo) stats.demoWon++;
        } else if (isPerdida && (!shouldGateByCategory || hasEligible)) {
          stats.lostValue += (r.valorUnificado ?? r.valorPrevisto);
          stats.total++;
          if (hasDemo) stats.demoLost++;
        }
        stats.totalValue += (r.valorUnificado ?? r.valorPrevisto);
      }
      stats.agendas += r.agenda;
    }

    // Count agendas from actions per ETN
    const agendasByETN = new Map<string, number>();
    for (const a of actions) {
      const etn = (a['Usuário'] || a['Usuario'] || '').trim();
      agendasByETN.set(etn, (agendasByETN.get(etn) || 0) + 1);
    }

    return Array.from(etnMap.entries())
      .map(([etn, stats]) => {
        // Conversion rate: only demo presencial/remota
        const demoTotal = stats.demoWon + stats.demoLost;
        const winRate = demoTotal > 0
          ? ((stats.demoWon / demoTotal) * 100).toFixed(1)
          : stats.total > 0 ? ((stats.won / stats.total) * 100).toFixed(1) : '0';
        const totalAgendas = agendasByETN.get(etn) || 0;
        return {
          etn,
          total: stats.total,
          won: stats.won,
          winRate,
          wonValue: stats.wonValue,
          lostValue: stats.lostValue,
          avgValue: stats.total > 0 ? (stats.totalValue / stats.total).toFixed(0) : '0',
          agendas: totalAgendas,
          agendaPerOp: stats.total > 0 ? (totalAgendas / stats.total).toFixed(2) : '0',
          valuePerAgenda: totalAgendas > 0
            ? (stats.wonValue / totalAgendas).toFixed(0)
            : '0',
        };
      })
      .sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate));
  }, [data, actions, eligibleOppIds, demoOppIds, shouldGateByCategory]);

  const matrixTotalPages = Math.ceil(performanceMatrix.length / MATRIX_PAGE_SIZE);
  const matrixPaged = performanceMatrix.slice(matrixPage * MATRIX_PAGE_SIZE, (matrixPage + 1) * MATRIX_PAGE_SIZE);

  // 2. Evolução de Compromissos por ETN (filtered by ETNs in data, using eligible categories)
  const commitmentEvolution = useMemo(() => {
    // Get ETNs present in filtered data
    const etnsInData = new Set<string>();
    for (const r of data) {
      if (r.etn && r.etn !== 'Sem Agenda') etnsInData.add(r.etn);
    }

    const etnMonthlyMap = new Map<string, Map<string, number>>();

    for (const a of actions) {
      const etn = (a['Usuário'] || a['Usuario'] || '').trim();
      if (!etnsInData.has(etn)) continue;

      // Only count eligible commitment categories
      const categoria = (a['Categoria'] || '').toString().trim();
      if (!isEligibleCommitmentCategory(categoria)) continue;

      const date = (a['Data'] || '').trim();
      if (!date) continue;

      const parts = date.split('/');
      if (parts.length < 3) continue;
      const month = parts[1];
      const year = parts[2];
      const key = `${month}/${year}`;

      if (!etnMonthlyMap.has(etn)) {
        etnMonthlyMap.set(etn, new Map());
      }
      const monthMap = etnMonthlyMap.get(etn)!;
      monthMap.set(key, (monthMap.get(key) || 0) + 1);
    }

    const allMonths = new Set<string>();
    etnMonthlyMap.forEach((monthMap) => {
      monthMap.forEach((_, month) => allMonths.add(month));
    });

    const sortedMonths = Array.from(allMonths).sort((a, b) => {
      const [mA, yA] = a.split('/').map(Number);
      const [mB, yB] = b.split('/').map(Number);
      return yA === yB ? mA - mB : yA - yB;
    });

    // Build chart data: each month is a data point, each ETN is a line
    const chartData: any[] = sortedMonths.map(month => {
      const point: any = { month };
      etnMonthlyMap.forEach((monthMap, etn) => {
        point[etn] = monthMap.get(month) || 0;
      });
      return point;
    });

    const etnList = Array.from(etnMonthlyMap.keys());

    return { chartData, etnList };
  }, [data, actions]);

  // 3. Funil de Valor por Etapa
  const valueByStage = useMemo(() => {
    const stageMap = new Map<string, { value: number; count: number }>();
    const seen = new Set<string>();

    for (const r of data) {
      if (seen.has(r.oppId)) continue;
      seen.add(r.oppId);
      const stage = r.etapa || 'Desconhecido';
      const s = stageMap.get(stage) || { value: 0, count: 0 };
      s.value += (r.valorUnificado ?? (r.etapa === 'Fechada e Ganha' || r.etapa === 'Fechada e Ganha TR' ? r.valorFechado : r.valorPrevisto));
      s.count++;
      stageMap.set(stage, s);
    }

    return Array.from(stageMap.entries())
      .map(([stage, { value, count }], i) => ({
        name: stage,
        value,
        count,
        fill: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Seção 1: Matriz de Performance */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          Matriz de Performance - ETNs
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">ETN</th>
                <th className="px-4 py-2 text-right font-semibold">Total Oport.</th>
                <th className="px-4 py-2 text-right font-semibold">Ganhas</th>
                <th className="px-4 py-2 text-right font-semibold">Taxa de Conversão</th>
                <th className="px-4 py-2 text-right font-semibold">Valor Ganho</th>
                <th className="px-4 py-2 text-right font-semibold">Valor Perdido</th>
                <th className="px-4 py-2 text-right font-semibold">Valor Médio/Op</th>
                <th className="px-4 py-2 text-right font-semibold">Total Agendas</th>
                <th className="px-4 py-2 text-right font-semibold">Agenda/Op</th>
                <th className="px-4 py-2 text-right font-semibold">Valor/Agenda</th>
              </tr>
            </thead>
            <tbody>
              {matrixPaged.map((row) => (
                <tr key={row.etn} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{row.etn}</td>
                  <td className="px-4 py-2 text-right">{row.total}</td>
                  <td className="px-4 py-2 text-right text-green-600 font-semibold">{row.won}</td>
                  <td className="px-4 py-2 text-right">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      parseFloat(row.winRate) >= 50 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {row.winRate}%
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-green-600">{formatCurrency(row.wonValue)}</td>
                  <td className="px-4 py-2 text-right text-red-600">{formatCurrency(row.lostValue)}</td>
                  <td className="px-4 py-2 text-right">{formatCurrency(parseFloat(row.avgValue))}</td>
                  <td className="px-4 py-2 text-right">{row.agendas}</td>
                  <td className="px-4 py-2 text-right">{row.agendaPerOp}</td>
                  <td className="px-4 py-2 text-right font-semibold">{formatCurrency(parseFloat(row.valuePerAgenda))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {matrixTotalPages > 1 && (
          <div className="p-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50 mt-2">
            <p className="text-xs text-gray-500">
              Página {matrixPage + 1} de {matrixTotalPages} · {performanceMatrix.length} registros
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setMatrixPage(p => Math.max(0, p - 1))}
                disabled={matrixPage === 0}
                className="px-3 py-1 text-xs rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 transition-colors font-medium"
              >
                Anterior
              </button>
              <button
                onClick={() => setMatrixPage(p => Math.min(matrixTotalPages - 1, p + 1))}
                disabled={matrixPage >= matrixTotalPages - 1}
                className="px-3 py-1 text-xs rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 transition-colors font-medium"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
        <DateRangeFooter data={data} />
      </div>

      {/* Seção 2: Evolução de Compromissos por ETN */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          Evolução de Compromissos Realizados por ETN
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Apenas categorias elegíveis: Demonstração, Análise de Aderência, ETN Apoio, RFP/RFI, Termo de Referência, Edital
        </p>
        {commitmentEvolution.chartData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={commitmentEvolution.chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#6b7280' }} />
                <YAxis allowDecimals={false} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                {commitmentEvolution.etnList.map((etn, idx) => (
                  <Line
                    key={etn}
                    type="monotone"
                    dataKey={etn}
                    stroke={COLORS[idx % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    name={etn.length > 25 ? etn.slice(0, 25) + '...' : etn}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <DateRangeFooter data={data} />
          </>
        ) : (
          <p className="text-gray-500 text-center py-8">Sem dados de compromissos elegíveis para os filtros aplicados</p>
        )}
      </div>

      {/* Seção 3: Funil de Valor por Etapa */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Funil de Valor por Etapa</h3>
        <ResponsiveContainer width="100%" height={350}>
          <FunnelChart>
            <Tooltip {...tooltipStyle} formatter={(v: any) => formatCurrency(typeof v === 'number' ? v : 0)} />
            <Funnel
              data={valueByStage}
              dataKey="value"
              stroke="none"
              fill="#8884d8"
            >
              {valueByStage.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Funnel>
          </FunnelChart>
        </ResponsiveContainer>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
          {valueByStage.map((stage) => (
            <div key={stage.name} className="text-center p-2 bg-gray-50 rounded">
              <p className="text-xs font-semibold text-gray-600">{stage.name}</p>
              <p className="text-sm font-bold">{stage.count} ops</p>
              <p className="text-xs text-gray-500">{formatCurrency(stage.value)}</p>
            </div>
          ))}
        </div>
        <DateRangeFooter data={data} />
      </div>
    </div>
  );
}