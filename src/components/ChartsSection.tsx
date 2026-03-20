import { useMemo, memo } from 'react';
import type { ProcessedRecord } from '@/hooks/useDataProcessor';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, LineChart, Line, CartesianGrid, Legend, LabelList,
} from 'recharts';

const COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
];

const FUNNEL_COLORS = [
  '#10b981', '#22c55e', '#84cc16', '#eab308', '#f59e0b',
  '#f97316', '#ef4444', '#dc2626', '#b91c1c', '#991b1b',
];

const ETN_COLORS = [
  '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
];

const formatCurrency = (v: number) => {
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}K`;
  return `R$ ${v.toFixed(0)}`;
};

const formatNum = (v: number) => v.toLocaleString('pt-BR');

function formatName(name: string): string {
  if (!name) return name;
  return name
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Tooltip padronizado (estilo Top 10 Motivos de Perda) - BLOCO 9
function StandardTooltip({ active, payload, labelKey, valueKey, valueLabel, extraContent }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const label = d.fullName || d[labelKey] || payload[0].name;
  const value = d[valueKey] || payload[0].value;
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg text-xs">
      <p className="font-bold text-gray-800 mb-1">{label}</p>
      <p className="text-gray-600">Valor: <span className="font-bold text-emerald-600">{formatCurrency(value)}</span></p>
      {d.count !== undefined && <p className="text-gray-600">Qtd: <span className="font-bold">{d.count}</span> oportunidades</p>}
      {extraContent?.(d)}
    </div>
  );
}

interface Props {
  data: ProcessedRecord[];
  funnelData: { etapa: string; count: number; value: number }[];
  motivosPerda: { motivo: string; count: number }[];
  forecastFunnel: { etapa: string; count: number; value: number; avgProb: number }[];
  etnTop10: { name: string; fullName: string; count: number; value: number }[];
  etnConversionTop10: { name: string; fullName: string; total: number; ganhas: number; perdidas: number; ganhasValor: number; perdidasValor: number; taxaConversao: number }[];
  etnRecursosAgendas: { name: string; fullName: string; valor: number; agendas: number }[];
  onChartClick: (field: string, value: string) => void;
  onETNClick?: (etn: string) => void;
}

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

// BLOCO 8: Funnel-style chart component (like Funil de Forecast)
function FunnelStyleChart({ data, title, subtitle, onItemClick, colors }: {
  data: { name: string; fullName?: string; value: number; count: number; extra?: string }[];
  title: string;
  subtitle: string;
  onItemClick: (value: string) => void;
  colors: string[];
}) {
  if (data.length === 0) return (
    <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
      Nenhum dado disponível
    </div>
  );

  const maxValue = data[0]?.value || 1;

  return (
    <div className="bg-white rounded-xl p-5 border border-border shadow-sm">
      <h3 className="text-sm font-bold text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground mb-4">{subtitle}</p>
      <div className="space-y-2 mb-4">
        {data.map((item, i) => {
          const widthPct = Math.max(20, (item.value / maxValue) * 100);
          return (
            <div
              key={i}
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => onItemClick(item.fullName || item.name)}
            >
              <div className="flex items-center gap-3">
                <div
                  className="rounded-lg py-3 px-4 text-white font-semibold text-sm flex items-center justify-between transition-all"
                  style={{
                    width: `${widthPct}%`,
                    background: colors[i % colors.length],
                    minWidth: '200px',
                  }}
                >
                  <span className="truncate">{item.fullName || item.name}</span>
                  <span className="ml-2 whitespace-nowrap">{formatCurrency(item.value)}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-600 whitespace-nowrap">
                  <span className="font-bold">{item.count} ops</span>
                  {item.extra && <span>{item.extra}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 mt-3">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs whitespace-nowrap">
            <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: colors[i % colors.length] }} />
            <span className="text-gray-700">{item.fullName || item.name}</span>
            <span className="font-mono font-bold text-emerald-700">{formatCurrency(item.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChartsSectionInner({ data, funnelData, motivosPerda, forecastFunnel, etnTop10, etnConversionTop10, etnRecursosAgendas, onChartClick, onETNClick }: Props) {
  // Pipeline por Etapa
  const pipelineByStage = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    const seen = new Set<string>();
    for (const r of data) {
      if (r.etapa === 'Fechada e Ganha' || r.etapa === 'Fechada e Ganha TR' || r.etapa === 'Fechada e Perdida') continue;
      if (seen.has(r.oppId)) continue;
      seen.add(r.oppId);
      const e = map.get(r.etapa) || { count: 0, value: 0 };
      e.count++;
      e.value += (r.valorUnificado ?? r.valorReconhecido ?? r.valorPrevisto);
      map.set(r.etapa, e);
    }
    return Array.from(map.entries())
      .map(([name, d]) => ({ name: name.length > 22 ? name.slice(0, 22) + '…' : name, fullName: name, ...d }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  // Timeline mensal
  const monthlyTimeline = useMemo(() => {
    const map = new Map<string, { previsto: number; fechado: number }>();
    const seen = new Set<string>();
    for (const r of data) {
      if (!r.anoPrevisao || !r.mesPrevisaoNum || r.mesPrevisaoNum === 0) continue;
      if (seen.has(r.oppId)) continue;
      seen.add(r.oppId);
      const key = `${r.anoPrevisao}-${r.mesPrevisaoNum.toString().padStart(2, '0')}`;
      const e = map.get(key) || { previsto: 0, fechado: 0 };
      e.previsto += (r.valorUnificado ?? r.valorReconhecido ?? r.valorPrevisto);
      e.fechado += (r.valorFechadoReconhecido ?? r.valorFechado);
      map.set(key, e);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24)
      .map(([key, d]) => {
        const [y, m] = key.split('-');
        return { name: `${m}/${y.slice(2)}`, ...d };
      });
  }, [data]);

  // Motivos de perda COM ETNs
  const lossReasonsWithETN = useMemo(() => {
    const motivoETNMap = new Map<string, Map<string, { count: number; value: number }>>();
    const motivoTotalMap = new Map<string, { count: number; value: number }>();
    const seen = new Set<string>();
    for (const r of data) {
      if (r.etapa !== 'Fechada e Perdida') continue;
      const key = `${r.oppId}-${r.etn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const motivo = r.motivoPerda || 'Sem motivo';
      const etn = r.etn || 'Sem ETN';
      
      if (!motivoETNMap.has(motivo)) motivoETNMap.set(motivo, new Map());
      const etnMap = motivoETNMap.get(motivo)!;
      const e = etnMap.get(etn) || { count: 0, value: 0 };
      e.count++;
      e.value += (r.valorUnificado ?? r.valorReconhecido ?? r.valorPrevisto);
      etnMap.set(etn, e);

      const t = motivoTotalMap.get(motivo) || { count: 0, value: 0 };
      t.count++;
      t.value += (r.valorUnificado ?? r.valorReconhecido ?? r.valorPrevisto);
      motivoTotalMap.set(motivo, t);
    }

    return Array.from(motivoTotalMap.entries())
      .sort((a, b) => b[1].value - a[1].value)
      .slice(0, 10)
      .map(([motivo, total]) => {
        const etnEntries = motivoETNMap.get(motivo) || new Map();
        const topETNs = Array.from(etnEntries.entries())
          .filter(([name]) => name !== 'Sem Agenda')
          .sort((a, b) => b[1].value - a[1].value)
          .slice(0, 3)
          .map(([name, d]) => ({ name: formatName(name), value: d.value, count: d.count }));
        return {
          name: motivo.length > 22 ? motivo.slice(0, 22) + '…' : motivo,
          fullName: motivo,
          value: total.value,
          count: total.count,
          topETNs,
        };
      });
  }, [data]);

  // ETN Top 10 clean
  const etnTop10Clean = useMemo(() => {
    return etnTop10
      .filter(e => e.fullName !== 'Sem Agenda')
      .map((e, i) => ({
        ...e,
        name: formatName(e.fullName.length > 22 ? e.fullName.slice(0, 22) : e.fullName),
        fullName: formatName(e.fullName),
        color: ETN_COLORS[i % ETN_COLORS.length],
      }));
  }, [etnTop10]);

  // Funil de Forecast recalculado
  const forecastFunnelFiltered = useMemo(() => {
    const fcSeen = new Set<string>();
    const fcMap = new Map<string, { count: number; value: number; probs: number[] }>();
    for (const r of data) {
      if (fcSeen.has(r.oppId) || r.probNum < 75) continue;
      fcSeen.add(r.oppId);
      const stage = r.etapa || 'Desconhecido';
      const f = fcMap.get(stage) || { count: 0, value: 0, probs: [] };
      f.count++;
      f.value += (r.valorUnificado ?? r.valorReconhecido ?? r.valorPrevisto);
      f.probs.push(r.probNum);
      fcMap.set(stage, f);
    }
    return Array.from(fcMap.entries())
      .map(([etapa, d]) => ({
        etapa, count: d.count, value: d.value,
        avgProb: d.probs.length > 0 ? Math.round(d.probs.reduce((a, b) => a + b, 0) / d.probs.length) : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  if (!data.length) return null;

  return (
    <div className="space-y-6">
      {/* FORECAST por ETN */}
      <div className="bg-white rounded-xl p-5 border border-border shadow-sm">
        <h3 className="text-sm font-bold text-foreground mb-1">FORECAST por ETN</h3>
        <p className="text-xs text-muted-foreground mb-4">Valor por ETN (Proposta e Negociação, prob. ≥75%) - clique para ver detalhes</p>
        {etnTop10Clean.length > 0 ? (
          <div style={{ height: Math.max(280, etnTop10Clean.length * 35) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={etnTop10Clean} layout="vertical" margin={{ left: 10, right: 50 }}>
                <XAxis type="number" tickFormatter={formatCurrency} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} />
                <YAxis type="category" dataKey="name" width={170} tick={{ fill: '#374151', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} />
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg text-xs">
                        <p className="font-bold text-gray-800 mb-1">{d.fullName}</p>
                        <p className="text-gray-600">Valor: <span className="font-bold text-emerald-600">{formatCurrency(d.value)}</span></p>
                        <p className="text-gray-600">Qtd: <span className="font-bold">{d.count}</span> oportunidades</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="value" name="Valor" radius={[0, 6, 6, 0]} cursor="pointer" onClick={(d: any) => {
                  // BLOCO 6: Forecast por ETN → filtra tabela analítica por ETN + prob >= 75% + Proposta/Negociação
                  onChartClick('forecastEtn', d.fullName || d.name);
                }}>
                  {etnTop10Clean.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                  <LabelList dataKey="value" position="right" fill="#374151" fontSize={10} formatter={(v: number) => formatCurrency(v)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
            Nenhum ETN com oportunidades ≥75%
          </div>
        )}
        <DateRangeFooter data={data} />
      </div>

      {/* BLOCO 7: NOVA ORDEM - Top 10 Motivos de Perda ao lado de Valor previsto vs Valor fechado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 10 Motivos de Perda - Estilo Funil (mesmo visual do Funil de Forecast) */}
        {lossReasonsWithETN.length > 0 && (
          <FunnelStyleChart
            data={lossReasonsWithETN.map(d => ({
              name: d.name,
              fullName: d.fullName,
              value: d.value,
              count: d.count,
              extra: d.topETNs?.length > 0
                ? `Top: ${d.topETNs.map((e: any) => e.name).join(', ')}`
                : undefined,
            }))}
            title="Top 10 Motivos de Perda"
            subtitle="Principais causas e ETNs com mais perdas (clique para filtrar)"
            onItemClick={(val) => onChartClick('motivoPerda', val)}
            colors={['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6']}
          />
        )}

        {/* Valor Previsto vs Fechado */}
        <div className="bg-white rounded-xl p-5 border border-border shadow-sm">
          <h3 className="text-sm font-bold text-foreground mb-1">Valor Previsto vs Fechado</h3>
          <p className="text-xs text-muted-foreground mb-4">Evolução mensal (últimos 24 meses)</p>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTimeline} margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 10 }} interval="preserveStartEnd" axisLine={{ stroke: '#e5e7eb' }} />
                <YAxis tickFormatter={formatCurrency} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} />
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg text-xs">
                        <p className="font-bold text-gray-800 mb-1">{label}</p>
                        {payload.map((p: any, i: number) => (
                          <p key={i} className="text-gray-600">
                            {p.name}: <span className="font-bold" style={{ color: p.color }}>{formatCurrency(p.value)}</span>
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="previsto" stroke="#f59e0b" strokeWidth={2.5} dot={false} name="Previsto" />
                <Line type="monotone" dataKey="fechado" stroke="#10b981" strokeWidth={2.5} dot={false} name="Fechado" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <DateRangeFooter data={data} />
        </div>
      </div>

      {/* BLOCO 7: Taxa de conversão ao lado de Pipeline por Etapa */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Taxa de Conversão por ETN - BLOCO 6: clique abre modal de desempenho individual */}
        {(() => {
          const convData = etnConversionTop10;
          if (convData.length === 0) return null;
          const totalGanhas = convData.reduce((s, d) => s + d.ganhas, 0);
          const totalPerdidas = convData.reduce((s, d) => s + d.perdidas, 0);
          const totalAll = totalGanhas + totalPerdidas;
          const taxaGeral = totalAll > 0 ? Math.round((totalGanhas / totalAll) * 100) : 0;
          return (
            <div className="bg-white rounded-xl p-5 border border-border shadow-sm">
              <h3 className="text-sm font-bold text-foreground mb-1">Taxa de Conversão por ETN</h3>
              <p className="text-xs text-muted-foreground mb-4">Fechada e Ganha vs Fechada e Perdida (% aproveitamento)</p>
              
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-emerald-50 rounded-lg p-3 text-center border border-emerald-100">
                  <p className="text-lg font-bold text-emerald-700">{taxaGeral}%</p>
                  <p className="text-[10px] text-emerald-600 font-medium">Taxa Geral</p>
                </div>
                <div className="bg-green-50 rounded-lg p-3 text-center border border-green-100">
                  <p className="text-lg font-bold text-green-700">{totalGanhas}</p>
                  <p className="text-[10px] text-green-600 font-medium">Ganhas</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center border border-red-100">
                  <p className="text-lg font-bold text-red-600">{totalPerdidas}</p>
                  <p className="text-[10px] text-red-500 font-medium">Perdidas</p>
                </div>
              </div>

              <div className="space-y-3">
                {convData.map((d, i) => (
                  <div key={d.fullName} className="group cursor-pointer hover:bg-gray-50 rounded-lg p-1 -m-1 transition-colors" onClick={() => onETNClick?.(d.fullName)}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700 truncate max-w-[200px] hover:text-emerald-700 hover:underline" title={`Clique para ver desempenho de ${d.fullName}`}>
                        {i + 1}. {d.fullName}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-green-600 font-medium">{d.ganhas}G</span>
                        <span className="text-[10px] text-red-500 font-medium">{d.perdidas}P</span>
                        <span className="text-xs font-bold text-gray-800 min-w-[36px] text-right">{d.taxaConversao}%</span>
                      </div>
                    </div>
                    <div className="w-full h-5 bg-gray-100 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 flex items-center justify-center transition-all duration-500"
                        style={{ width: `${d.taxaConversao}%`, minWidth: d.ganhas > 0 ? '8px' : '0' }}
                      >
                        {d.taxaConversao >= 15 && <span className="text-[9px] font-bold text-white">{d.ganhas}</span>}
                      </div>
                      <div
                        className="h-full bg-gradient-to-r from-red-400 to-red-500 flex items-center justify-center transition-all duration-500"
                        style={{ width: `${100 - d.taxaConversao}%`, minWidth: d.perdidas > 0 ? '8px' : '0' }}
                      >
                        {(100 - d.taxaConversao) >= 15 && <span className="text-[9px] font-bold text-white">{d.perdidas}</span>}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[9px] text-gray-400">{formatCurrency(d.ganhasValor)} ganhas</span>
                      <span className="text-[9px] text-gray-400">{formatCurrency(d.perdidasValor)} perdidas</span>
                    </div>
                  </div>
                ))}
              </div>
              <DateRangeFooter data={data} />
            </div>
          );
        })()}

        {/* BLOCO 8: Pipeline por Etapa - estilo Funil (como Funil de Forecast) */}
        <FunnelStyleChart
          data={pipelineByStage.map(d => ({ name: d.name, fullName: d.fullName, value: d.value, count: d.count }))}
          title="Pipeline por Etapa"
          subtitle="Valor previsto de oportunidades abertas (clique para filtrar)"
          onItemClick={(val) => onChartClick('etapa', val)}
          colors={COLORS}
        />
      </div>

      {/* BLOCO 8: Funil de Forecast - estilo Funil */}
      <FunnelStyleChart
        data={forecastFunnelFiltered.map(d => ({
          name: d.etapa,
          fullName: d.etapa,
          value: d.value,
          count: d.count,
          extra: `≥ 75% probabilidade`,
        }))}
        title="FUNIL DE FORECAST"
        subtitle="Oportunidades com probabilidade ≥75% por etapa (clique para filtrar)"
        onItemClick={(val) => onChartClick('etapa', val)}
        colors={FUNNEL_COLORS}
      />

      {/* BLOCO 8: Forecast por ETN - estilo Funil */}
      {/* (Already shown above as bar chart - keeping original as it's the main ETN view) */}

      {/* TOP 5 Maiores Recursos X Agendas */}
      <div className="bg-white rounded-xl p-5 border border-border shadow-sm">
        <h3 className="text-sm font-bold text-foreground mb-1">TOP 5 Maiores Recursos X Agendas</h3>
        <p className="text-xs text-muted-foreground mb-4">Valor previsto vs quantidade de compromissos por ETN</p>
        {etnRecursosAgendas.length > 0 ? (
          <div style={{ height: Math.max(300, Math.min(etnRecursosAgendas.length, 5) * 60) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={etnRecursosAgendas.slice(0, 5)} layout="vertical" margin={{ left: 10, right: 60 }} barSize={28}>
                <XAxis type="number" tickFormatter={formatCurrency} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} />
                <YAxis type="category" dataKey="name" width={170} tick={{ fill: '#374151', fontSize: 12, fontWeight: 600 }} axisLine={{ stroke: '#e5e7eb' }} />
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg text-xs">
                        <p className="font-bold text-gray-800 mb-1">{d.fullName}</p>
                        <p className="text-gray-600">Valor: <span className="font-bold text-emerald-600">{formatCurrency(d.valor)}</span></p>
                        <p className="text-gray-600">Agendas: <span className="font-bold">{formatNum(d.agendas)}</span></p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="valor" name="Valor" radius={[0, 6, 6, 0]} cursor="pointer" onClick={(d: any) => onChartClick('etn', d.fullName || d.name)}>
                  {etnRecursosAgendas.slice(0, 5).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                  <LabelList dataKey="valor" position="right" fill="#374151" fontSize={11} formatter={(v: number) => formatCurrency(v)} />
                </Bar>
                <Bar dataKey="agendas" name="Agendas" radius={[0, 6, 6, 0]} fill="#94a3b8" opacity={0.7} barSize={20} />
                <Legend />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
            Nenhum ETN com dados
          </div>
        )}
        <DateRangeFooter data={data} />
      </div>
    </div>
  );
}

export const ChartsSection = memo(ChartsSectionInner);
