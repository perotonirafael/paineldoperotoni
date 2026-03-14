import { useMemo, memo } from 'react';
import type { ProcessedRecord } from '@/hooks/useDataProcessor';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, LineChart, Line, CartesianGrid, Legend, LabelList,
  Treemap,
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

// Item 3: Padronizar nome - Primeira letra maiúscula, nome e sobrenome
function formatName(name: string): string {
  if (!name) return name;
  return name
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// OLD/INATIVO: Não filtrar dos gráficos, apenas dos dropdowns de filtro
// Dados OLD/INATIVO aparecem normalmente nos gráficos e tabelas

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

// Componente de rodapé com intervalo de datas (Item 9)
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

function ChartsSectionInner({ data, funnelData, motivosPerda, forecastFunnel, etnTop10, etnConversionTop10, etnRecursosAgendas, onChartClick, onETNClick }: Props) {
  // Item 1: Pipeline por Etapa - mostrar valor em R$ (não quantidade)
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

  // Item 4: Motivos de perda COM identificação de ETNs que mais perderam
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

  // Item 3: ETN Top 10 filtrado - remover "Sem Agenda" e nomes OLD, padronizar nomes
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

  // Item 10: Funil de Forecast recalculado com dados filtrados
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
      {/* Item 3: ETN Top 10 - PRIMEIRO GRÁFICO */}
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
                  {...tooltipStyle}
                  formatter={(v: number, name: string) => {
                    if (name === 'Valor') return [formatCurrency(v), 'Valor Previsto'];
                    return [formatNum(v), name];
                  }}
                  labelFormatter={(label: string) => {
                    const item = etnTop10Clean.find(d => d.name === label);
                    return item?.fullName || label;
                  }}
                />
                <Bar dataKey="value" name="Valor" radius={[0, 6, 6, 0]} cursor="pointer" onClick={(d: any) => {
                  if (onETNClick) onETNClick(d.fullName || d.name);
                  onChartClick('etn', d.fullName || d.name);
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

      {/* Item 1: Pipeline por Etapa + Item 4: Motivos de Perda + Item 5: Taxa Conversão + Item 6: Recursos X Agendas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline por Etapa - Item 1: valor em R$, gráfico maior */}
        <div className="bg-white rounded-xl p-5 border border-border shadow-sm">
          <h3 className="text-sm font-bold text-foreground mb-1">Pipeline por Etapa</h3>
          <p className="text-xs text-muted-foreground mb-4">Valor previsto de oportunidades abertas (clique para filtrar)</p>
          <div style={{ height: Math.max(300, pipelineByStage.length * 50) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineByStage} layout="vertical" margin={{ left: 10, right: 50 }}>
                <XAxis type="number" tickFormatter={formatCurrency} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} />
                <YAxis type="category" dataKey="name" width={220} tick={{ fill: '#374151', fontSize: 10 }} axisLine={{ stroke: '#e5e7eb' }} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => [formatCurrency(v), 'Valor Previsto']} labelFormatter={(label: string) => { const item = pipelineByStage.find(d => d.name === label); return item?.fullName || label; }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} cursor="pointer" onClick={(d: any) => onChartClick('etapa', d.fullName || d.name)}>
                  {pipelineByStage.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                  <LabelList dataKey="value" position="right" fill="#374151" fontSize={10} formatter={(v: number) => formatCurrency(v)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <DateRangeFooter data={data} />
        </div>

        {/* Item 4: Top 10 Motivos de Perda com ETNs */}
        {lossReasonsWithETN.length > 0 && (
          <div className="bg-white rounded-xl p-5 border border-border shadow-sm">
            <h3 className="text-sm font-bold text-foreground mb-1">Top 10 Motivos de Perda</h3>
            <p className="text-xs text-muted-foreground mb-4">Principais causas e ETNs com mais perdas (clique para filtrar)</p>
            <div style={{ height: Math.max(320, lossReasonsWithETN.length * 55) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={lossReasonsWithETN} layout="vertical" margin={{ left: 10, right: 60 }}>
                  <XAxis type="number" tickFormatter={formatCurrency} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} />
                  <YAxis type="category" dataKey="name" width={220} tick={{ fill: '#374151', fontSize: 10 }} axisLine={{ stroke: '#e5e7eb' }} />
                  <Tooltip
                    {...tooltipStyle}
                    content={({ active, payload }: any) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-lg text-xs">
                          <p className="font-bold text-gray-800 mb-1">{d.fullName}</p>
                          <p className="text-gray-600">Valor: <span className="font-bold text-red-600">{formatCurrency(d.value)}</span></p>
                          <p className="text-gray-600 mb-2">Qtd: <span className="font-bold">{d.count}</span> oportunidades</p>
                          {d.topETNs?.length > 0 && (
                            <>
                              <p className="font-semibold text-gray-700 border-t pt-1 mt-1">ETNs com mais perdas:</p>
                              {d.topETNs.map((etn: any, i: number) => (
                                <p key={i} className="text-gray-600 pl-2">
                                  {i + 1}. {etn.name}: <span className="font-bold text-red-600">{formatCurrency(etn.value)}</span> ({etn.count} ops)
                                </p>
                              ))}
                            </>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} cursor="pointer" onClick={(d: any) => onChartClick('motivoPerda', d.fullName || d.name)}>
                    {lossReasonsWithETN.map((_, i) => {
                      const colors = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6'];
                      return <Cell key={i} fill={colors[i % colors.length]} />;
                    })}
                    <LabelList dataKey="value" position="right" fill="#374151" fontSize={10} formatter={(v: number) => formatCurrency(v)} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <DateRangeFooter data={data} />
          </div>
        )}
      </div>

      {/* Item 10: FUNIL DE FORECAST - Funnel Chart estilo, linha inteira */}
      <div className="bg-white rounded-xl p-5 border border-border shadow-sm">
        <h3 className="text-sm font-bold text-foreground mb-1">FUNIL DE FORECAST</h3>
        <p className="text-xs text-muted-foreground mb-4">Oportunidades com probabilidade ≥75% por etapa (clique para filtrar)</p>
        {forecastFunnelFiltered.length > 0 ? (
          <>
            <div className="space-y-2 mb-4">
              {forecastFunnelFiltered.map((item, i) => {
                const maxValue = forecastFunnelFiltered[0]?.value || 1;
                const widthPct = Math.max(20, (item.value / maxValue) * 100);
                return (
                  <div
                    key={i}
                    className="cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => onChartClick('etapa', item.etapa)}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="rounded-lg py-3 px-4 text-white font-semibold text-sm flex items-center justify-between transition-all"
                        style={{
                          width: `${widthPct}%`,
                          background: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
                          minWidth: '200px',
                        }}
                      >
                        <span className="truncate">{item.etapa}</span>
                        <span className="ml-2 whitespace-nowrap">{formatCurrency(item.value)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-600 whitespace-nowrap">
                        <span className="font-bold">{item.count} ops</span>
                        <span>Prob. média: {item.avgProb}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Legenda sem quebra de linha */}
            <div className="flex flex-wrap gap-3 mt-3">
              {forecastFunnelFiltered.map((item, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                  <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }} />
                  <span className="text-gray-700">{item.etapa}</span>
                  <span className="font-mono font-bold text-emerald-700">{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
            Nenhuma oportunidade com probabilidade ≥75%
          </div>
        )}
        <DateRangeFooter data={data} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                <Tooltip {...tooltipStyle} formatter={(v: number) => [formatCurrency(v)]} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="previsto" stroke="#f59e0b" strokeWidth={2.5} dot={false} name="Previsto" />
                <Line type="monotone" dataKey="fechado" stroke="#10b981" strokeWidth={2.5} dot={false} name="Fechado" />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <DateRangeFooter data={data} />
        </div>

        {/* Ajuste 3: TOP 10 Taxa de Conversão - Novo estilo com barras de progresso */}
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
              <p className="text-xs text-muted-foreground mb-4">Fechada e Ganha vs Fechada e Perdida (% aproveitamento) — respeitando filtros aplicados</p>
              
              {/* Resumo geral */}
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

              {/* Lista de ETNs com barras de progresso */}
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
                        {d.taxaConversao >= 15 && (
                          <span className="text-[9px] font-bold text-white">{d.ganhas}</span>
                        )}
                      </div>
                      <div
                        className="h-full bg-gradient-to-r from-red-400 to-red-500 flex items-center justify-center transition-all duration-500"
                        style={{ width: `${100 - d.taxaConversao}%`, minWidth: d.perdidas > 0 ? '8px' : '0' }}
                      >
                        {(100 - d.taxaConversao) >= 15 && (
                          <span className="text-[9px] font-bold text-white">{d.perdidas}</span>
                        )}
                      </div>
                    </div>
                    {/* Tooltip com valores */}
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
      </div>

      {/* Item 6: TOP 10 Maiores Recursos X Agendas */}
      <div className="bg-white rounded-xl p-5 border border-border shadow-sm">
        <h3 className="text-sm font-bold text-foreground mb-1">TOP 10 Maiores Recursos X Agendas</h3>
        <p className="text-xs text-muted-foreground mb-4">Valor previsto vs quantidade de compromissos por ETN</p>
        {etnRecursosAgendas.length > 0 ? (
          <div style={{ height: Math.max(280, etnRecursosAgendas.length * 35) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={etnRecursosAgendas} layout="vertical" margin={{ left: 10, right: 50 }}>
                <XAxis type="number" tickFormatter={formatCurrency} tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} />
                <YAxis type="category" dataKey="name" width={170} tick={{ fill: '#374151', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: number, name: string) => {
                    if (name === 'Valor') return [formatCurrency(v), 'Valor Previsto'];
                    return [formatNum(v), 'Agendas'];
                  }}
                  labelFormatter={(label: string) => {
                    const item = etnRecursosAgendas.find(d => d.name === label);
                    return item?.fullName || label;
                  }}
                />
                <Bar dataKey="valor" name="Valor" radius={[0, 6, 6, 0]} cursor="pointer" onClick={(d: any) => onChartClick('etn', d.fullName || d.name)}>
                  {etnRecursosAgendas.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                  <LabelList dataKey="valor" position="right" fill="#374151" fontSize={10} formatter={(v: number) => formatCurrency(v)} />
                </Bar>
                <Bar dataKey="agendas" name="Agendas" radius={[0, 6, 6, 0]} fill="#d1d5db" opacity={0.6} />
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
