import { useMemo } from 'react';
import type { ProcessedRecord, Action } from '@/hooks/useDataProcessor';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, LineChart, Line, CartesianGrid, Legend, Funnel, FunnelChart,
} from 'recharts';
import { TrendingUp, DollarSign, AlertCircle, Zap, BarChart3 } from 'lucide-react';

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
  // 1. Matriz de Performance ETN (Taxa de Conversão, Valor Médio, Ciclo, Agendas/Op)
  const performanceMatrix = useMemo(() => {
    const etnMap = new Map<string, {
      total: number;
      won: number;
      wonValue: number;
      lostValue: number;
      totalValue: number;
      agendas: number;
      daysInStage: number[];
    }>();

    // Processar oportunidades
    for (const r of data) {
      if (!etnMap.has(r.etn)) {
        etnMap.set(r.etn, { total: 0, won: 0, wonValue: 0, lostValue: 0, totalValue: 0, agendas: 0, daysInStage: [] });
      }
      const stats = etnMap.get(r.etn)!;
      stats.total++;
      stats.totalValue += (r.valorUnificado ?? r.valorPrevisto);
      if (r.etapa === 'Fechada e Ganha' || r.etapa === 'Fechada e Ganha TR') {
        stats.won++;
        stats.wonValue += (r.valorUnificado ?? r.valorFechado);
      } else if (r.etapa === 'Fechada e Perdida') {
        stats.lostValue += (r.valorUnificado ?? r.valorPrevisto);
      }
      stats.agendas += r.agenda;
    }

    // Processar ações para contar agendas por ETN
    const agendasByETN = new Map<string, number>();
    for (const a of actions) {
      const etn = (a['Usuário'] || a['Usuario'] || '').trim();
      agendasByETN.set(etn, (agendasByETN.get(etn) || 0) + 1);
    }

    return Array.from(etnMap.entries())
      .map(([etn, stats]) => ({
        etn,
        total: stats.total,
        won: stats.won,
        winRate: stats.total > 0 ? ((stats.won / stats.total) * 100).toFixed(1) : '0',
        wonValue: stats.wonValue,
        lostValue: stats.lostValue,
        avgValue: stats.total > 0 ? (stats.totalValue / stats.total).toFixed(0) : '0',
        agendas: agendasByETN.get(etn) || 0,
        agendaPerOp: stats.total > 0 ? ((agendasByETN.get(etn) || 0) / stats.total).toFixed(2) : '0',
        valuePerAgenda: (agendasByETN.get(etn) || 0) > 0 
          ? (stats.wonValue / (agendasByETN.get(etn) || 1)).toFixed(0) 
          : '0',
      }))
      .sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate));
  }, [data, actions]);

  // 2. Evolução de Compromissos Individual por ETN (respeitando filtros)
  const commitmentEvolution = useMemo(() => {
    const etnMonthlyMap = new Map<string, Map<string, number>>();

    for (const a of actions) {
      const etn = (a['Usuário'] || a['Usuario'] || '').trim();
      const date = (a['Data'] || '').trim();
      if (!date) continue;

      const [day, month, year] = date.split('/');
      const key = `${month}/${year}`;

      // Verificar se a ação está dentro dos dados filtrados
      const oppId = (a['Oportunidade ID'] || '').trim();
      const oppInData = data.some(r => r.oppId === oppId);
      if (!oppInData) continue;

      if (!etnMonthlyMap.has(etn)) {
        etnMonthlyMap.set(etn, new Map());
      }
      const monthMap = etnMonthlyMap.get(etn)!;
      monthMap.set(key, (monthMap.get(key) || 0) + 1);
    }

    // Converter para formato de gráfico (por ETN)
    const etnChartData: any[] = [];
    const allMonths = new Set<string>();
    etnMonthlyMap.forEach((monthMap) => {
      monthMap.forEach((_, month) => {
        allMonths.add(month);
      });
    });

    const sortedMonths = Array.from(allMonths).sort((a, b) => {
      const [mA, yA] = a.split('/').map(Number);
      const [mB, yB] = b.split('/').map(Number);
      return yA === yB ? mA - mB : yA - yB;
    });

    etnMonthlyMap.forEach((monthMap, etn) => {
      const etnData: any = { etn };
      for (const month of sortedMonths) {
        etnData[month] = monthMap.get(month) || 0;
      }
      etnChartData.push(etnData);
    });

    return { chartData: etnChartData, months: sortedMonths };
  }, [data, actions]);

  // 3. Valor Total Ganho por ETN
  const valueWonByETN = useMemo(() => {
    const etnMap = new Map<string, number>();
    for (const r of data) {
      if (r.etapa === 'Fechada e Ganha' || r.etapa === 'Fechada e Ganha TR') {
        etnMap.set(r.etn, (etnMap.get(r.etn) || 0) + (r.valorUnificado ?? r.valorFechado));
      }
    }
    const result: any[] = [];
    etnMap.forEach((value, etn) => {
      result.push({ etn, value });
    });
    return result.sort((a, b) => b.value - a.value);
  }, [data]);

  // 4. Valor Total Perdido por ETN
  const valueLostByETN = useMemo(() => {
    const etnMap = new Map<string, number>();
    for (const r of data) {
      if (r.etapa === 'Fechada e Perdida') {
        etnMap.set(r.etn, (etnMap.get(r.etn) || 0) + (r.valorUnificado ?? r.valorPrevisto));
      }
    }
    const result: any[] = [];
    etnMap.forEach((value, etn) => {
      result.push({ etn, value });
    });
    return result.sort((a, b) => b.value - a.value);
  }, [data]);

  // 5. Valor em Risco (pipeline aberto) por ETN
  const valueAtRiskByETN = useMemo(() => {
    const etnMap = new Map<string, number>();
    for (const r of data) {
      if (r.etapa !== 'Fechada e Ganha' && r.etapa !== 'Fechada e Ganha TR' && r.etapa !== 'Fechada e Perdida') {
        etnMap.set(r.etn, (etnMap.get(r.etn) || 0) + (r.valorUnificado ?? r.valorPrevisto));
      }
    }
    const result: any[] = [];
    etnMap.forEach((value, etn) => {
      result.push({ etn, value });
    });
    return result.sort((a, b) => b.value - a.value);
  }, [data]);

  // 6. Valor por Etapa (Funil)
  const valueByStage = useMemo(() => {
    const stageMap = new Map<string, { value: number; count: number }>();
    const stages = ['Prospecção', 'Qualificação', 'Negociação', 'Fechada e Ganha', 'Fechada e Perdida'];

    for (const stage of stages) {
      stageMap.set(stage, { value: 0, count: 0 });
    }

    for (const r of data) {
      const stage = r.etapa;
      if (stageMap.has(stage)) {
        const s = stageMap.get(stage)!;
        s.value += (r.valorUnificado ?? (r.etapa === 'Fechada e Ganha' || r.etapa === 'Fechada e Ganha TR' ? r.valorFechado : r.valorPrevisto));
        s.count++;
      }
    }

    return Array.from(stageMap.entries())
      .map(([stage, { value, count }]) => ({
        name: stage,
        value,
        count,
        fill: FUNNEL_COLORS[stages.indexOf(stage)],
      }));
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
              {performanceMatrix.map((row) => (
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
        <DateRangeFooter data={data} />
      </div>

      {/* Seção 2: Evolução de Compromissos por ETN */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          Evolução de Compromissos Realizados por ETN
        </h3>
        {commitmentEvolution.chartData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={commitmentEvolution.chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="etn" />
                <YAxis />
                <Tooltip {...tooltipStyle} />
                <Legend />
                {commitmentEvolution.months.map((month, idx) => (
                  <Line
                    key={month}
                    type="monotone"
                    dataKey={month}
                    stroke={COLORS[idx % COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <DateRangeFooter data={data} />
          </>
        ) : (
          <p className="text-gray-500 text-center py-8">Sem dados de compromissos</p>
        )}
      </div>

      {/* Seção 3: Valor Ganho, Perdido e Risco */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Valor Ganho */}
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-sm font-semibold mb-4 flex items-center gap-2 text-green-600">
            <DollarSign className="w-4 h-4" />
            Valor Total Ganho
          </h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={valueWonByETN}>
              <XAxis dataKey="etn" angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip {...tooltipStyle} formatter={(v: any) => formatCurrency(typeof v === 'number' ? v : 0)} />
              <Bar dataKey="value" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
          <DateRangeFooter data={data} />
        </div>

        {/* Valor Perdido */}
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-sm font-semibold mb-4 flex items-center gap-2 text-red-600">
            <AlertCircle className="w-4 h-4" />
            Valor Total Perdido
          </h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={valueLostByETN}>
              <XAxis dataKey="etn" angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip {...tooltipStyle} formatter={(v: any) => formatCurrency(typeof v === 'number' ? v : 0)} />
              <Bar dataKey="value" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
          <DateRangeFooter data={data} />
        </div>

        {/* Valor em Risco */}
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-sm font-semibold mb-4 flex items-center gap-2 text-orange-600">
            <Zap className="w-4 h-4" />
            Valor em Risco (Pipeline)
          </h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={valueAtRiskByETN}>
              <XAxis dataKey="etn" angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip {...tooltipStyle} formatter={(v: any) => formatCurrency(typeof v === 'number' ? v : 0)} />
              <Bar dataKey="value" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
          <DateRangeFooter data={data} />
        </div>
      </div>

      {/* Seção 4: Funil de Valor por Etapa */}
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


