import { useMemo, useState } from 'react';
import type { ProcessedRecord, Action } from '@/hooks/useDataProcessor';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, LineChart, Line, CartesianGrid, Legend, Funnel, FunnelChart,
  ComposedChart, LabelList,
} from 'recharts';
import { TrendingUp, BarChart3, Clock, Users } from 'lucide-react';
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

function parseDuration(durStr: string): number {
  if (!durStr || durStr === '00:00' || durStr === '00:00:00') return 0;
  const parts = durStr.split(':').map(Number);
  if (parts.length >= 2) {
    return (parts[0] || 0) + (parts[1] || 0) / 60;
  }
  return 0;
}

function countBusinessDays(dates: string[]): number {
  let minDate = Infinity, maxDate = -Infinity;
  for (const d of dates) {
    const parts = d.split('/');
    if (parts.length >= 3) {
      const day = parseInt(parts[0]) || 1;
      const month = parseInt(parts[1]) || 1;
      const year = parseInt(parts[2]) || 2025;
      const ts = new Date(year, month - 1, day).getTime();
      if (ts < minDate) minDate = ts;
      if (ts > maxDate) maxDate = ts;
    }
  }
  if (minDate === Infinity) return 0;
  let count = 0;
  const oneDay = 86400000;
  for (let t = minDate; t <= maxDate; t += oneDay) {
    const dow = new Date(t).getDay();
    if (dow >= 1 && dow <= 5) count++;
  }
  return count;
}

const CUTOFF_DATE = new Date(2025, 0, 1).getTime(); // 01/01/2025

function parseActionDate(dateStr: string): number {
  if (!dateStr) return 0;
  const parts = dateStr.split('/');
  if (parts.length >= 3) {
    const day = parseInt(parts[0]) || 1;
    const month = parseInt(parts[1]) || 1;
    const year = parseInt(parts[2]) || 2000;
    return new Date(year, month - 1, day).getTime();
  }
  return 0;
}

function isAfterCutoff(dateStr: string): boolean {
  const ts = parseActionDate(dateStr);
  return ts >= CUTOFF_DATE;
}

interface Props {
  data: ProcessedRecord[];
  actions: Action[];
}

export function ETNComparativeAnalysis({ data, actions }: Props) {
  const [matrixPage, setMatrixPage] = useState(0);

  const eligibleOppIds = useMemo(() => {
    const set = new Set<string>();
    for (const a of actions) {
      const categoria = (a['Categoria'] || '').toString().trim();
      if (!isEligibleCommitmentCategory(categoria)) continue;
      const oppId = (a['Oportunidade ID'] || '').toString().trim();
      if (oppId) set.add(oppId);
    }
    if (set.size === 0) {
      for (const r of data) {
        if (r.categoriaCompromisso && isEligibleCommitmentCategory(r.categoriaCompromisso)) {
          set.add(r.oppId);
        }
      }
    }
    return set;
  }, [data, actions]);

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

  // Build oppId → etapa map for quick lookup
  const oppEtapaMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of data) {
      if (!map.has(r.oppId)) map.set(r.oppId, r.etapa);
    }
    return map;
  }, [data]);

  // Chart 1: Tempo Trabalhado por ETN (eligible commitments)
  const etnDurationForConversion = useMemo(() => {
    const etnMap = new Map<string, { totalHours: number; eligibleCount: number; wonHours: number; lostHours: number }>();
    const etnsInData = new Set<string>();
    for (const r of data) {
      if (r.etn && r.etn !== 'Sem Agenda') etnsInData.add(r.etn);
    }

    for (const a of actions) {
      const dateStr = (a['Data'] || '').toString().trim();
      if (!isAfterCutoff(dateStr)) continue;
      const etn = (a['Usuário'] || a['Usuario'] || '').trim();
      if (!etnsInData.has(etn)) continue;
      const categoria = (a['Categoria'] || '').toString().trim();
      if (!isEligibleCommitmentCategory(categoria)) continue;
      const durStr = (a['Duracao'] || a['Duração'] || '').toString().trim();
      const hours = parseDuration(durStr);
      const oppId = (a['Oportunidade ID'] || '').toString().trim();

      if (!etnMap.has(etn)) etnMap.set(etn, { totalHours: 0, eligibleCount: 0, wonHours: 0, lostHours: 0 });
      const stats = etnMap.get(etn)!;
      stats.totalHours += hours;
      stats.eligibleCount++;

      const etapa = oppEtapaMap.get(oppId);
      if (etapa === 'Fechada e Ganha' || etapa === 'Fechada e Ganha TR') {
        stats.wonHours += hours;
      } else if (etapa === 'Fechada e Perdida') {
        stats.lostHours += hours;
      }
    }

    return Array.from(etnMap.entries())
      .filter(([, s]) => s.totalHours > 0)
      .map(([etn, s]) => ({
        etn,
        totalHours: parseFloat(s.totalHours.toFixed(1)),
        wonHours: parseFloat(s.wonHours.toFixed(1)),
        lostHours: parseFloat(s.lostHours.toFixed(1)),
        eligibleCount: s.eligibleCount,
      }))
      .sort((a, b) => b.totalHours - a.totalHours);
  }, [data, actions, oppEtapaMap]);

  // Chart 2: Taxa de Disponibilidade
  const etnAvailability = useMemo(() => {
    const etnMap = new Map<string, { totalHours: number; dates: string[] }>();
    const etnsInData = new Set<string>();
    for (const r of data) {
      if (r.etn && r.etn !== 'Sem Agenda') etnsInData.add(r.etn);
    }

    for (const a of actions) {
      const etn = (a['Usuário'] || a['Usuario'] || '').trim();
      if (!etnsInData.has(etn)) continue;
      const durStr = (a['Duracao'] || a['Duração'] || '').toString().trim();
      const hours = parseDuration(durStr);
      const date = (a['Data'] || '').toString().trim();

      if (!etnMap.has(etn)) etnMap.set(etn, { totalHours: 0, dates: [] });
      const stats = etnMap.get(etn)!;
      stats.totalHours += hours;
      if (date) stats.dates.push(date);
    }

    return Array.from(etnMap.entries())
      .filter(([, s]) => s.totalHours > 0)
      .map(([etn, s]) => {
        const bizDays = countBusinessDays(s.dates);
        const capacidade = bizDays * 6;
        const utilizacao = capacidade > 0 ? parseFloat(((s.totalHours / capacidade) * 100).toFixed(1)) : 0;
        return {
          etn,
          horasRegistradas: parseFloat(s.totalHours.toFixed(1)),
          capacidade,
          disponibilidade: parseFloat(Math.max(0, capacidade - s.totalHours).toFixed(1)),
          utilizacao,
          diasUteis: bizDays,
        };
      })
      .sort((a, b) => b.utilizacao - a.utilizacao);
  }, [data, actions]);

  // Matriz de Performance ETN
  const performanceMatrix = useMemo(() => {
    const etnMap = new Map<string, {
      total: number; won: number; wonValue: number; lostValue: number;
      totalValue: number; agendas: number; demoWon: number; demoLost: number;
      totalEligibleHours: number;
    }>();
    const seen = new Set<string>();

    for (const r of data) {
      if (!etnMap.has(r.etn)) {
        etnMap.set(r.etn, { total: 0, won: 0, wonValue: 0, lostValue: 0, totalValue: 0, agendas: 0, demoWon: 0, demoLost: 0, totalEligibleHours: 0 });
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
          stats.won++; stats.wonValue += (r.valorUnificado ?? r.valorFechado); stats.total++;
          if (hasDemo) stats.demoWon++;
        } else if (isPerdida && (!shouldGateByCategory || hasEligible)) {
          stats.lostValue += (r.valorUnificado ?? r.valorPrevisto); stats.total++;
          if (hasDemo) stats.demoLost++;
        }
        stats.totalValue += (r.valorUnificado ?? r.valorPrevisto);
      }
      stats.agendas += r.agenda;
    }

    const agendasByETN = new Map<string, number>();
    const durationByETN = new Map<string, number>();
    for (const a of actions) {
      const etn = (a['Usuário'] || a['Usuario'] || '').trim();
      agendasByETN.set(etn, (agendasByETN.get(etn) || 0) + 1);
      const categoria = (a['Categoria'] || '').toString().trim();
      if (isEligibleCommitmentCategory(categoria)) {
        const durStr = (a['Duracao'] || a['Duração'] || '').toString().trim();
        durationByETN.set(etn, (durationByETN.get(etn) || 0) + parseDuration(durStr));
      }
    }
    for (const [etn, hours] of durationByETN) {
      if (etnMap.has(etn)) etnMap.get(etn)!.totalEligibleHours = hours;
    }

    return Array.from(etnMap.entries())
      .map(([etn, stats]) => {
        const demoTotal = stats.demoWon + stats.demoLost;
        const winRate = demoTotal > 0
          ? ((stats.demoWon / demoTotal) * 100).toFixed(1)
          : stats.total > 0 ? ((stats.won / stats.total) * 100).toFixed(1) : '0';
        const totalAgendas = agendasByETN.get(etn) || 0;
        return {
          etn, total: stats.total, won: stats.won, winRate,
          wonValue: stats.wonValue, lostValue: stats.lostValue,
          avgValue: stats.total > 0 ? (stats.totalValue / stats.total).toFixed(0) : '0',
          agendas: totalAgendas,
          agendaPerOp: stats.total > 0 ? (totalAgendas / stats.total).toFixed(2) : '0',
          valuePerAgenda: totalAgendas > 0 ? (stats.wonValue / totalAgendas).toFixed(0) : '0',
          totalEligibleHours: parseFloat(stats.totalEligibleHours.toFixed(1)),
        };
      })
      .sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate));
  }, [data, actions, eligibleOppIds, demoOppIds, shouldGateByCategory]);

  const matrixTotalPages = Math.ceil(performanceMatrix.length / MATRIX_PAGE_SIZE);
  const matrixPaged = performanceMatrix.slice(matrixPage * MATRIX_PAGE_SIZE, (matrixPage + 1) * MATRIX_PAGE_SIZE);

  // Evolução de Compromissos por ETN
  const commitmentEvolution = useMemo(() => {
    const etnsInData = new Set<string>();
    for (const r of data) {
      if (r.etn && r.etn !== 'Sem Agenda') etnsInData.add(r.etn);
    }
    const etnMonthlyMap = new Map<string, Map<string, number>>();
    for (const a of actions) {
      const etn = (a['Usuário'] || a['Usuario'] || '').trim();
      if (!etnsInData.has(etn)) continue;
      const categoria = (a['Categoria'] || '').toString().trim();
      if (!isEligibleCommitmentCategory(categoria)) continue;
      const date = (a['Data'] || '').trim();
      if (!date) continue;
      const parts = date.split('/');
      if (parts.length < 3) continue;
      const key = `${parts[1]}/${parts[2]}`;
      if (!etnMonthlyMap.has(etn)) etnMonthlyMap.set(etn, new Map());
      const monthMap = etnMonthlyMap.get(etn)!;
      monthMap.set(key, (monthMap.get(key) || 0) + 1);
    }
    const allMonths = new Set<string>();
    etnMonthlyMap.forEach((mm) => mm.forEach((_, m) => allMonths.add(m)));
    const sortedMonths = Array.from(allMonths).sort((a, b) => {
      const [mA, yA] = a.split('/').map(Number);
      const [mB, yB] = b.split('/').map(Number);
      return yA === yB ? mA - mB : yA - yB;
    });
    const chartData: any[] = sortedMonths.map(month => {
      const point: any = { month };
      etnMonthlyMap.forEach((mm, etn) => { point[etn] = mm.get(month) || 0; });
      return point;
    });
    return { chartData, etnList: Array.from(etnMonthlyMap.keys()) };
  }, [data, actions]);

  // Funil de Valor por Etapa
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
      .map(([stage, { value, count }], i) => ({ name: stage, value, count, fill: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Tempo Trabalhado por ETN */}
      {etnDurationForConversion.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-600" />
            Tempo Trabalhado por ETN — Compromissos Elegíveis
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Horas registradas em compromissos elegíveis para conversão de venda (Demonstração, Análise de Aderência, etc.)
          </p>
          <div style={{ height: Math.max(300, Math.min(etnDurationForConversion.length, 10) * 50) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={etnDurationForConversion.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 60 }} barSize={22}>
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} />
                <YAxis type="category" dataKey="etn" width={170} tick={{ fill: '#374151', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} />
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg text-xs">
                        <p className="font-bold text-gray-800 mb-1">{d.etn}</p>
                        <p className="text-gray-600">Total Horas: <span className="font-bold text-emerald-600">{d.totalHours}h</span></p>
                        <p className="text-gray-600">Horas em Ganhas: <span className="font-bold text-green-600">{d.wonHours}h</span></p>
                        <p className="text-gray-600">Horas em Perdidas: <span className="font-bold text-red-600">{d.lostHours}h</span></p>
                        <p className="text-gray-600">Compromissos: <span className="font-bold">{d.eligibleCount}</span></p>
                      </div>
                    );
                  }}
                />
                <Legend />
                <Bar dataKey="wonHours" name="Horas Ganhas" stackId="hours" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="lostHours" name="Horas Perdidas" stackId="hours" fill="#ef4444" radius={[0, 6, 6, 0]}>
                  <LabelList dataKey="totalHours" position="right" fill="#374151" fontSize={10} formatter={(v: number) => `${v}h`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <DateRangeFooter data={data} />
        </div>
      )}

      {/* Taxa de Disponibilidade do Time */}
      {etnAvailability.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Taxa de Disponibilidade do Time
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Comparação entre horas registradas e capacidade disponível (6h/dia útil, seg–sex)
          </p>
          <div style={{ height: Math.max(300, Math.min(etnAvailability.length, 10) * 50) }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={etnAvailability.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 80 }} barSize={20}>
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} />
                <YAxis type="category" dataKey="etn" width={170} tick={{ fill: '#374151', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} />
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg text-xs">
                        <p className="font-bold text-gray-800 mb-1">{d.etn}</p>
                        <p className="text-gray-600">Horas Registradas: <span className="font-bold text-blue-600">{d.horasRegistradas}h</span></p>
                        <p className="text-gray-600">Capacidade (6h/dia): <span className="font-bold text-gray-700">{d.capacidade}h</span></p>
                        <p className="text-gray-600">Disponível: <span className="font-bold text-amber-600">{d.disponibilidade}h</span></p>
                        <p className="text-gray-600">Utilização: <span className="font-bold text-emerald-600">{d.utilizacao}%</span></p>
                        <p className="text-gray-600">Dias Úteis: <span className="font-bold">{d.diasUteis}</span></p>
                      </div>
                    );
                  }}
                />
                <Legend />
                <Bar dataKey="horasRegistradas" name="Horas Registradas" fill="#3b82f6" stackId="cap" />
                <Bar dataKey="disponibilidade" name="Horas Disponíveis" fill="#e5e7eb" stackId="cap" radius={[0, 6, 6, 0]}>
                  <LabelList dataKey="utilizacao" position="right" fill="#374151" fontSize={10} formatter={(v: number) => `${v}%`} />
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {(() => {
              const totalReg = etnAvailability.reduce((s, d) => s + d.horasRegistradas, 0);
              const totalCap = etnAvailability.reduce((s, d) => s + d.capacidade, 0);
              const avgUtil = totalCap > 0 ? ((totalReg / totalCap) * 100).toFixed(1) : '0';
              return (
                <>
                  <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-100">
                    <p className="text-lg font-bold text-blue-700">{totalReg.toFixed(0)}h</p>
                    <p className="text-[10px] text-blue-600 font-medium">Total Registrado</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center border border-gray-200">
                    <p className="text-lg font-bold text-gray-700">{totalCap.toFixed(0)}h</p>
                    <p className="text-[10px] text-gray-600 font-medium">Capacidade Total</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg p-3 text-center border border-emerald-100">
                    <p className="text-lg font-bold text-emerald-700">{avgUtil}%</p>
                    <p className="text-[10px] text-emerald-600 font-medium">Utilização Média</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-100">
                    <p className="text-lg font-bold text-amber-700">{(totalCap - totalReg).toFixed(0)}h</p>
                    <p className="text-[10px] text-amber-600 font-medium">Horas Disponíveis</p>
                  </div>
                </>
              );
            })()}
          </div>
          <DateRangeFooter data={data} />
        </div>
      )}

      {/* Matriz de Performance */}
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
                <th className="px-4 py-2 text-right font-semibold">Horas Elegíveis</th>
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
                  <td className="px-4 py-2 text-right font-semibold text-blue-600">{row.totalEligibleHours}h</td>
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
              <button onClick={() => setMatrixPage(p => Math.max(0, p - 1))} disabled={matrixPage === 0}
                className="px-3 py-1 text-xs rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 transition-colors font-medium">
                Anterior
              </button>
              <button onClick={() => setMatrixPage(p => Math.min(matrixTotalPages - 1, p + 1))} disabled={matrixPage >= matrixTotalPages - 1}
                className="px-3 py-1 text-xs rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 transition-colors font-medium">
                Próxima
              </button>
            </div>
          </div>
        )}
        <DateRangeFooter data={data} />
      </div>

      {/* Evolução de Compromissos por ETN */}
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
                  <Line key={etn} type="monotone" dataKey={etn} stroke={COLORS[idx % COLORS.length]}
                    strokeWidth={2} dot={{ r: 3 }} name={etn.length > 25 ? etn.slice(0, 25) + '...' : etn} />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <DateRangeFooter data={data} />
          </>
        ) : (
          <p className="text-gray-500 text-center py-8">Sem dados de compromissos elegíveis para os filtros aplicados</p>
        )}
      </div>

      {/* Funil de Valor por Etapa */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">Funil de Valor por Etapa</h3>
        <ResponsiveContainer width="100%" height={350}>
          <FunnelChart>
            <Tooltip {...tooltipStyle} formatter={(v: any) => formatCurrency(typeof v === 'number' ? v : 0)} />
            <Funnel data={valueByStage} dataKey="value" stroke="none" fill="#8884d8">
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
