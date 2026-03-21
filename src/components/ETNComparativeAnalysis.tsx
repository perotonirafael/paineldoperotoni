import { useMemo, useState, useCallback } from 'react';
import type { ProcessedRecord, Action } from '@/hooks/useDataProcessor';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, LineChart, Line, CartesianGrid, Legend, Funnel, FunnelChart,
  ComposedChart, LabelList,
} from 'recharts';
import { TrendingUp, BarChart3, Clock, Users, Search, ChevronDown, ChevronUp, Filter, ArrowUpDown } from 'lucide-react';
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
const HEATMAP_DEFAULT_SHOW = 20;

const MONTH_NAMES = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

type UtilBand = 'all' | 'low' | 'mid' | 'high' | 'over';

function getUtilBand(u: number): UtilBand {
  if (u <= 60) return 'low';
  if (u <= 85) return 'mid';
  if (u <= 100) return 'high';
  return 'over';
}

function getUtilColor(u: number) {
  if (u <= 60) return '#10b981';
  if (u <= 85) return '#f59e0b';
  if (u <= 100) return '#3b82f6';
  return '#ef4444';
}

function getUtilBg(u: number) {
  if (u <= 60) return 'bg-emerald-100 text-emerald-800';
  if (u <= 85) return 'bg-amber-100 text-amber-800';
  if (u <= 100) return 'bg-blue-100 text-blue-800';
  return 'bg-red-100 text-red-800';
}

function DateRangeFooter({ data }: { data: ProcessedRecord[] }) {
  const range = useMemo(() => {
    let minYM = Infinity, maxYM = 0;
    let minLabel = '', maxLabel = '';
    for (const r of data) {
      if (!r.anoPrevisao || !r.mesPrevisaoNum) continue;
      const y = parseInt(r.anoPrevisao);
      const m = r.mesPrevisaoNum;
      const ym = y * 100 + m;
      if (ym < minYM) { minYM = ym; minLabel = `${MONTH_NAMES[m]}/${y}`; }
      if (ym > maxYM) { maxYM = ym; maxLabel = `${MONTH_NAMES[m]}/${y}`; }
    }
    if (minYM === Infinity) return 'Sem dados de período';
    return `${minLabel} — ${maxLabel}`;
  }, [data]);

  return (
    <p className="text-[10px] text-muted-foreground text-center mt-2 pt-1 border-t border-border/30">
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

const CUTOFF_DATE = new Date(2025, 0, 1).getTime();

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
  return parseActionDate(dateStr) >= CUTOFF_DATE;
}

function parseMonthYear(dateStr: string): { month: number; year: number } | null {
  const parts = dateStr.split('/');
  if (parts.length < 3) return null;
  return { month: parseInt(parts[1]), year: parseInt(parts[2]) };
}

function isInQuarter(month: number, quarter: number): boolean {
  const q = Math.ceil(month / 3);
  return q === quarter;
}

// Small filter pill component
function FilterPill({ active, label, onClick, count }: { active: boolean; label: string; onClick: () => void; count?: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-full font-medium transition-colors border ${
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-card text-muted-foreground border-border hover:bg-muted'
      }`}
    >
      {label}{count !== undefined && <span className="ml-1 opacity-75">({count})</span>}
    </button>
  );
}

// Sort header component
function SortHeader({ label, sortKey, currentSort, onSort, className = '' }: {
  label: string; sortKey: string; currentSort: { key: string; dir: 'asc' | 'desc' };
  onSort: (key: string) => void; className?: string;
}) {
  const isActive = currentSort.key === sortKey;
  return (
    <th
      className={`px-3 py-2 font-semibold cursor-pointer select-none hover:bg-muted/70 transition-colors ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          currentSort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        ) : (
          <ArrowUpDown size={10} className="opacity-30" />
        )}
      </span>
    </th>
  );
}

interface Props {
  data: ProcessedRecord[];
  actions: Action[];
}

export function ETNComparativeAnalysis({ data, actions }: Props) {
  const [matrixPage, setMatrixPage] = useState(0);

  // ── Tempo Trabalhado state ──
  const [tempoSort, setTempoSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'totalHours', dir: 'desc' });
  const [tempoSearch, setTempoSearch] = useState('');
  const [tempoPeriod, setTempoPeriod] = useState<'all' | 'q1' | 'q2' | 'q3' | 'q4' | 'h1' | 'h2'>('all');
  const [tempoShowAll, setTempoShowAll] = useState(false);

  // ── Disponibilidade state ──
  const [dispBand, setDispBand] = useState<UtilBand>('all');
  const [dispSort, setDispSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'utilizacao', dir: 'desc' });
  const [dispSearch, setDispSearch] = useState('');

  // ── Heatmap state ──
  const [hmSort, setHmSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'media', dir: 'desc' });
  const [hmSearch, setHmSearch] = useState('');
  const [hmYear, setHmYear] = useState<string>('all');
  const [hmQuarter, setHmQuarter] = useState<string>('all');
  const [hmShowAll, setHmShowAll] = useState(false);

  const toggleSort = useCallback((setter: React.Dispatch<React.SetStateAction<{ key: string; dir: 'asc' | 'desc' }>>) => {
    return (key: string) => {
      setter(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
    };
  }, []);

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

  const oppEtapaMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of data) {
      if (!map.has(r.oppId)) map.set(r.oppId, r.etapa);
    }
    return map;
  }, [data]);

  // ════════════════════════════════════════════
  // 1. Tempo Trabalhado por ETN (with period filter + efficiency)
  // ════════════════════════════════════════════
  const etnDurationRaw = useMemo(() => {
    const etnMap = new Map<string, { totalHours: number; eligibleCount: number; wonHours: number; lostHours: number }>();
    const etnsInData = new Set<string>();
    for (const r of data) {
      if (r.etn && r.etn !== 'Sem Agenda') etnsInData.add(r.etn);
    }

    for (const a of actions) {
      const dateStr = (a['Data'] || '').toString().trim();
      if (!isAfterCutoff(dateStr)) continue;

      // Period filter
      if (tempoPeriod !== 'all') {
        const parsed = parseMonthYear(dateStr);
        if (!parsed) continue;
        const m = parsed.month;
        if (tempoPeriod === 'q1' && !isInQuarter(m, 1)) continue;
        if (tempoPeriod === 'q2' && !isInQuarter(m, 2)) continue;
        if (tempoPeriod === 'q3' && !isInQuarter(m, 3)) continue;
        if (tempoPeriod === 'q4' && !isInQuarter(m, 4)) continue;
        if (tempoPeriod === 'h1' && m > 6) continue;
        if (tempoPeriod === 'h2' && m <= 6) continue;
      }

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
        efficiency: s.totalHours > 0 ? parseFloat(((s.wonHours / s.totalHours) * 100).toFixed(1)) : 0,
      }));
  }, [data, actions, oppEtapaMap, tempoPeriod]);

  const etnDurationForConversion = useMemo(() => {
    let filtered = etnDurationRaw;
    if (tempoSearch) {
      const q = tempoSearch.toLowerCase();
      filtered = filtered.filter(d => d.etn.toLowerCase().includes(q));
    }
    const sorted = [...filtered].sort((a, b) => {
      const va = (a as any)[tempoSort.key] ?? 0;
      const vb = (b as any)[tempoSort.key] ?? 0;
      return tempoSort.dir === 'desc' ? vb - va : va - vb;
    });
    return tempoShowAll ? sorted : sorted.slice(0, 15);
  }, [etnDurationRaw, tempoSearch, tempoSort, tempoShowAll]);

  // ════════════════════════════════════════════
  // 2. Disponibilidade (refactored to bar chart + table)
  // ════════════════════════════════════════════
  const etnAvailabilityRaw = useMemo(() => {
    const etnMap = new Map<string, { totalHours: number; dates: string[]; monthlyHours: Map<string, { hours: number; dates: Set<string> }> }>();
    const etnsInData = new Set<string>();
    for (const r of data) {
      if (r.etn && r.etn !== 'Sem Agenda') etnsInData.add(r.etn);
    }

    for (const a of actions) {
      const dateStr = (a['Data'] || '').toString().trim();
      if (!isAfterCutoff(dateStr)) continue;
      const etn = (a['Usuário'] || a['Usuario'] || '').trim();
      if (!etnsInData.has(etn)) continue;
      const durStr = (a['Duracao'] || a['Duração'] || '').toString().trim();
      const hours = parseDuration(durStr);
      const date = dateStr;

      if (!etnMap.has(etn)) etnMap.set(etn, { totalHours: 0, dates: [], monthlyHours: new Map() });
      const stats = etnMap.get(etn)!;
      stats.totalHours += hours;
      if (date) {
        stats.dates.push(date);
        const parts = date.split('/');
        if (parts.length >= 3) {
          const monthKey = `${parts[1]}/${parts[2]}`;
          if (!stats.monthlyHours.has(monthKey)) stats.monthlyHours.set(monthKey, { hours: 0, dates: new Set() });
          const m = stats.monthlyHours.get(monthKey)!;
          m.hours += hours;
          m.dates.add(date);
        }
      }
    }

    return Array.from(etnMap.entries())
      .filter(([, s]) => s.totalHours > 0)
      .map(([etn, s]) => {
        const bizDays = countBusinessDays(s.dates);
        const capacidade = bizDays * 6;
        const utilizacao = capacidade > 0 ? parseFloat(((s.totalHours / capacidade) * 100).toFixed(1)) : 0;
        const monthly: Record<string, number> = {};
        s.monthlyHours.forEach((mData, monthKey) => {
          const monthBizDays = countBusinessDays(Array.from(mData.dates));
          const monthCap = monthBizDays * 6;
          monthly[monthKey] = monthCap > 0 ? parseFloat(((mData.hours / monthCap) * 100).toFixed(1)) : 0;
        });
        return {
          etn,
          horasRegistradas: parseFloat(s.totalHours.toFixed(1)),
          capacidade,
          disponibilidade: parseFloat(Math.max(0, capacidade - s.totalHours).toFixed(1)),
          utilizacao,
          diasUteis: bizDays,
          monthly,
        };
      });
  }, [data, actions]);

  const etnAvailability = useMemo(() => {
    let filtered = etnAvailabilityRaw;
    if (dispBand !== 'all') {
      filtered = filtered.filter(d => getUtilBand(d.utilizacao) === dispBand);
    }
    if (dispSearch) {
      const q = dispSearch.toLowerCase();
      filtered = filtered.filter(d => d.etn.toLowerCase().includes(q));
    }
    return [...filtered].sort((a, b) => {
      const key = dispSort.key as keyof typeof a;
      const va = key === 'etn' ? a.etn : (a as any)[key] ?? 0;
      const vb = key === 'etn' ? b.etn : (b as any)[key] ?? 0;
      if (typeof va === 'string') return dispSort.dir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return dispSort.dir === 'desc' ? (vb as number) - (va as number) : (va as number) - (vb as number);
    });
  }, [etnAvailabilityRaw, dispBand, dispSearch, dispSort]);

  // Band counts for aggregate metrics
  const bandCounts = useMemo(() => {
    const counts = { low: 0, mid: 0, high: 0, over: 0 };
    for (const d of etnAvailabilityRaw) {
      counts[getUtilBand(d.utilizacao) as keyof typeof counts]++;
    }
    return counts;
  }, [etnAvailabilityRaw]);

  const avgUtilAll = useMemo(() => {
    const totalReg = etnAvailabilityRaw.reduce((s, d) => s + d.horasRegistradas, 0);
    const totalCap = etnAvailabilityRaw.reduce((s, d) => s + d.capacidade, 0);
    return totalCap > 0 ? parseFloat(((totalReg / totalCap) * 100).toFixed(1)) : 0;
  }, [etnAvailabilityRaw]);

  // ════════════════════════════════════════════
  // 3. Heatmap
  // ════════════════════════════════════════════
  const heatmapMonths = useMemo(() => {
    const allMonths = new Set<string>();
    etnAvailabilityRaw.forEach(e => Object.keys(e.monthly).forEach(m => allMonths.add(m)));
    let months = Array.from(allMonths).sort((a, b) => {
      const [mA, yA] = a.split('/').map(Number);
      const [mB, yB] = b.split('/').map(Number);
      return yA === yB ? mA - mB : yA - yB;
    });
    // Apply year/quarter filters
    if (hmYear !== 'all') {
      months = months.filter(m => m.endsWith(`/${hmYear}`));
    }
    if (hmQuarter !== 'all') {
      const q = parseInt(hmQuarter);
      months = months.filter(m => {
        const mm = parseInt(m.split('/')[0]);
        return isInQuarter(mm, q);
      });
    }
    return months;
  }, [etnAvailabilityRaw, hmYear, hmQuarter]);

  const heatmapYears = useMemo(() => {
    const years = new Set<string>();
    etnAvailabilityRaw.forEach(e => Object.keys(e.monthly).forEach(m => years.add(m.split('/')[1])));
    return Array.from(years).sort();
  }, [etnAvailabilityRaw]);

  const heatmapData = useMemo(() => {
    let rows = etnAvailabilityRaw.map(d => {
      const vals = heatmapMonths.map(m => d.monthly[m] ?? null).filter(v => v !== null) as number[];
      const media = vals.length > 0 ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : 0;
      // Standard deviation for consistency indicator
      const stdDev = vals.length > 1
        ? parseFloat(Math.sqrt(vals.reduce((sum, v) => sum + Math.pow(v - media, 2), 0) / vals.length).toFixed(1))
        : 0;
      return { ...d, media, stdDev };
    });
    if (hmSearch) {
      const q = hmSearch.toLowerCase();
      rows = rows.filter(d => d.etn.toLowerCase().includes(q));
    }
    rows.sort((a, b) => {
      if (hmSort.key === 'etn') return hmSort.dir === 'asc' ? a.etn.localeCompare(b.etn) : b.etn.localeCompare(a.etn);
      const va = (a as any)[hmSort.key] ?? 0;
      const vb = (b as any)[hmSort.key] ?? 0;
      return hmSort.dir === 'desc' ? vb - va : va - vb;
    });
    return rows;
  }, [etnAvailabilityRaw, heatmapMonths, hmSearch, hmSort]);

  const heatmapShown = hmShowAll ? heatmapData : heatmapData.slice(0, HEATMAP_DEFAULT_SHOW);

  // Monthly averages for footer row
  const heatmapMonthlyAvg = useMemo(() => {
    const avgs: Record<string, number> = {};
    for (const m of heatmapMonths) {
      const vals = etnAvailabilityRaw.map(d => d.monthly[m]).filter(v => v !== undefined && v !== null) as number[];
      avgs[m] = vals.length > 0 ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : 0;
    }
    return avgs;
  }, [etnAvailabilityRaw, heatmapMonths]);

  // ════════════════════════════════════════════
  // Performance Matrix (unchanged logic)
  // ════════════════════════════════════════════
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
      const dateStr = (a['Data'] || '').toString().trim();
      if (!isAfterCutoff(dateStr)) continue;
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
      if (!date || !isAfterCutoff(date)) continue;
      const parts = date.split('/');
      if (parts.length < 3) continue;
      const key = `${parts[1]}/${parts[2]}`;
      if (!etnMonthlyMap.has(etn)) etnMonthlyMap.set(etn, new Map());
      etnMonthlyMap.get(etn)!.set(key, (etnMonthlyMap.get(etn)!.get(key) || 0) + 1);
    }
    const allMonths = new Set<string>();
    etnMonthlyMap.forEach((mm) => mm.forEach((_, m) => allMonths.add(m)));
    const sortedMonths = Array.from(allMonths).sort((a, b) => {
      const [mA, yA] = a.split('/').map(Number);
      const [mB, yB] = b.split('/').map(Number);
      return yA === yB ? mA - mB : yA - yB;
    });

    const now = new Date();
    const currentMonthKey = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
    const currentMonthCounts: { etn: string; count: number }[] = [];
    etnMonthlyMap.forEach((mm, etn) => {
      currentMonthCounts.push({ etn, count: mm.get(currentMonthKey) || 0 });
    });
    currentMonthCounts.sort((a, b) => b.count - a.count);
    const top5Etns = new Set(currentMonthCounts.slice(0, 5).map(d => d.etn));
    const filteredEtnList = Array.from(etnMonthlyMap.keys()).filter(etn => top5Etns.has(etn));

    const chartData: any[] = sortedMonths.map(month => {
      const point: any = { month };
      for (const etn of filteredEtnList) {
        point[etn] = etnMonthlyMap.get(etn)?.get(month) || 0;
      }
      return point;
    });
    return { chartData, etnList: filteredEtnList };
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

      {/* ══════════════════════════════════════════
          1. TEMPO TRABALHADO POR ETN
          ══════════════════════════════════════════ */}
      {etnDurationRaw.length > 0 && (
        <div className="bg-card rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-600" />
            Tempo Trabalhado por ETN — Compromissos Elegíveis
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Horas registradas em compromissos elegíveis · <span className="font-semibold text-emerald-600">Eficiência = % horas ganhas / total</span>
          </p>

          {/* Filters bar */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={tempoSearch}
                onChange={e => setTempoSearch(e.target.value)}
                placeholder="Buscar ETN..."
                className="pl-8 pr-3 py-1.5 text-xs bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-44"
              />
            </div>
            <div className="flex items-center gap-1 ml-2">
              <span className="text-xs font-medium text-muted-foreground">Período:</span>
              {([['all', 'Todos'], ['q1', '1ºTri'], ['q2', '2ºTri'], ['q3', '3ºTri'], ['q4', '4ºTri'], ['h1', '1ºSem'], ['h2', '2ºSem']] as const).map(([val, label]) => (
                <FilterPill key={val} active={tempoPeriod === val} label={label} onClick={() => setTempoPeriod(val)} />
              ))}
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-xs font-medium text-muted-foreground">Ordenar:</span>
              {([['totalHours', 'Total'], ['wonHours', 'Ganhas'], ['lostHours', 'Perdidas'], ['efficiency', 'Eficiência']] as const).map(([val, label]) => (
                <FilterPill key={val} active={tempoSort.key === val} label={label + (tempoSort.key === val ? (tempoSort.dir === 'desc' ? ' ↓' : ' ↑') : '')}
                  onClick={() => setTempoSort(prev => prev.key === val ? { key: val, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key: val, dir: 'desc' })} />
              ))}
            </div>
          </div>

          <div style={{ height: Math.max(300, Math.min(etnDurationForConversion.length, 15) * 40) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={etnDurationForConversion} layout="vertical" margin={{ left: 10, right: 80 }} barSize={18}>
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} unit="h"
                  label={{ value: 'Horas', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#9ca3af' }} />
                <YAxis type="category" dataKey="etn" width={170} tick={{ fill: '#374151', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} />
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-card border border-border rounded-xl p-3 shadow-lg text-xs">
                        <p className="font-bold text-foreground mb-1">{d.etn}</p>
                        <p className="text-muted-foreground">Total: <span className="font-bold text-emerald-600">{d.totalHours}h</span></p>
                        <p className="text-muted-foreground">Ganhas: <span className="font-bold text-green-600">{d.wonHours}h</span></p>
                        <p className="text-muted-foreground">Perdidas: <span className="font-bold text-red-600">{d.lostHours}h</span></p>
                        <p className="text-muted-foreground">Eficiência: <span className="font-bold text-blue-600">{d.efficiency}%</span></p>
                        <p className="text-muted-foreground">Compromissos: <span className="font-bold">{d.eligibleCount}</span></p>
                      </div>
                    );
                  }}
                />
                <Legend />
                <Bar dataKey="wonHours" name="Horas Ganhas" stackId="hours" fill="#10b981" radius={[0, 0, 0, 0]} />
                <Bar dataKey="lostHours" name="Horas Perdidas" stackId="hours" fill="#ef4444" radius={[0, 4, 4, 0]}>
                  <LabelList
                    content={({ x, y, width, height, value, index }: any) => {
                      const d = etnDurationForConversion[index];
                      if (!d) return null;
                      return (
                        <text x={(x || 0) + (width || 0) + 4} y={(y || 0) + (height || 0) / 2} textAnchor="start" dominantBaseline="central" fontSize={10} fill="#374151">
                          {d.totalHours}h · {d.efficiency}%
                        </text>
                      );
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {etnDurationRaw.length > 15 && (
            <button onClick={() => setTempoShowAll(!tempoShowAll)}
              className="mt-2 text-xs text-primary hover:underline font-medium flex items-center gap-1 mx-auto">
              {tempoShowAll ? <><ChevronUp size={14} /> Mostrar menos</> : <><ChevronDown size={14} /> Mostrar todos ({etnDurationRaw.length})</>}
            </button>
          )}
          <DateRangeFooter data={data} />
        </div>
      )}

      {/* ══════════════════════════════════════════
          2. DISPONIBILIDADE DO TIME (bar chart + table)
          ══════════════════════════════════════════ */}
      {etnAvailabilityRaw.length > 0 && (
        <div className="bg-card rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Disponibilidade do Time — Utilização por ETN
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Utilização da capacidade (base: 6h/dia útil). Ordenável por utilização.
          </p>

          {/* Aggregate metrics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <div className="bg-muted/50 rounded-lg p-3 text-center border border-border">
              <p className="text-lg font-bold text-foreground">{avgUtilAll}%</p>
              <p className="text-[10px] text-muted-foreground font-medium">Utilização Média</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 text-center border border-emerald-200 cursor-pointer hover:ring-2 ring-emerald-300 transition-all"
              onClick={() => setDispBand(dispBand === 'low' ? 'all' : 'low')}>
              <p className="text-lg font-bold text-emerald-700">{bandCounts.low}</p>
              <p className="text-[10px] text-emerald-600 font-medium">≤ 60% Disponível</p>
            </div>
            <div className="bg-amber-50 rounded-lg p-3 text-center border border-amber-200 cursor-pointer hover:ring-2 ring-amber-300 transition-all"
              onClick={() => setDispBand(dispBand === 'mid' ? 'all' : 'mid')}>
              <p className="text-lg font-bold text-amber-700">{bandCounts.mid}</p>
              <p className="text-[10px] text-amber-600 font-medium">61–85% Bom</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center border border-blue-200 cursor-pointer hover:ring-2 ring-blue-300 transition-all"
              onClick={() => setDispBand(dispBand === 'high' ? 'all' : 'high')}>
              <p className="text-lg font-bold text-blue-700">{bandCounts.high}</p>
              <p className="text-[10px] text-blue-600 font-medium">86–100% Saturado</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center border border-red-200 cursor-pointer hover:ring-2 ring-red-300 transition-all"
              onClick={() => setDispBand(dispBand === 'over' ? 'all' : 'over')}>
              <p className="text-lg font-bold text-red-700">{bandCounts.over}</p>
              <p className="text-[10px] text-red-600 font-medium">&gt; 100% Sobrecarregado</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" value={dispSearch} onChange={e => setDispSearch(e.target.value)}
                placeholder="Buscar ETN..." className="pl-8 pr-3 py-1.5 text-xs bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-44" />
            </div>
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-xs font-medium text-muted-foreground">Ordenar:</span>
              {([['utilizacao', 'Utilização'], ['horasRegistradas', 'Horas'], ['etn', 'Nome']] as const).map(([val, label]) => (
                <FilterPill key={val} active={dispSort.key === val} label={label + (dispSort.key === val ? (dispSort.dir === 'desc' ? ' ↓' : ' ↑') : '')}
                  onClick={() => setDispSort(prev => prev.key === val ? { key: val, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key: val, dir: 'desc' })} />
              ))}
            </div>
          </div>

          {/* Horizontal bar chart */}
          <div style={{ height: Math.max(300, Math.min(etnAvailability.length, 20) * 32) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={etnAvailability.slice(0, 25)} layout="vertical" margin={{ left: 10, right: 70 }} barSize={16}>
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} domain={[0, 'auto']} unit="%"
                  label={{ value: '% Utilização', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#9ca3af' }} />
                <YAxis type="category" dataKey="etn" width={170} tick={{ fill: '#374151', fontSize: 11 }} />
                <Tooltip
                  content={({ active, payload }: any) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-card border border-border rounded-xl p-3 shadow-lg text-xs">
                        <p className="font-bold text-foreground mb-1">{d.etn}</p>
                        <p className="text-muted-foreground">Utilização: <span className="font-bold" style={{ color: getUtilColor(d.utilizacao) }}>{d.utilizacao}%</span></p>
                        <p className="text-muted-foreground">Horas: <span className="font-bold">{d.horasRegistradas}h / {d.capacidade}h</span></p>
                        <p className="text-muted-foreground">Disponível: <span className="font-bold text-emerald-600">{d.disponibilidade}h</span></p>
                        <p className="text-muted-foreground">Dias úteis: <span className="font-bold">{d.diasUteis}</span></p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="utilizacao" name="Utilização %">
                  {etnAvailability.slice(0, 25).map((d, i) => (
                    <Cell key={d.etn} fill={getUtilColor(d.utilizacao)} />
                  ))}
                  <LabelList dataKey="utilizacao" position="right" fill="#374151" fontSize={10} formatter={(v: number) => `${v}%`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Summary table below chart */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-3 py-2 text-left font-semibold text-foreground">ETN</th>
                  <th className="px-3 py-2 text-right font-semibold text-foreground">Utilização</th>
                  <th className="px-3 py-2 text-right font-semibold text-foreground">Registrado</th>
                  <th className="px-3 py-2 text-right font-semibold text-foreground">Capacidade</th>
                  <th className="px-3 py-2 text-right font-semibold text-foreground">Disponível</th>
                  <th className="px-3 py-2 text-right font-semibold text-foreground">Dias Úteis</th>
                  <th className="px-3 py-2 text-center font-semibold text-foreground">Faixa</th>
                </tr>
              </thead>
              <tbody>
                {etnAvailability.map(d => (
                  <tr key={d.etn} className="border-t border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-1.5 font-medium text-foreground">{d.etn}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold" style={{ color: getUtilColor(d.utilizacao) }}>{d.utilizacao}%</td>
                    <td className="px-3 py-1.5 text-right font-mono">{d.horasRegistradas}h</td>
                    <td className="px-3 py-1.5 text-right font-mono">{d.capacidade}h</td>
                    <td className="px-3 py-1.5 text-right font-mono text-emerald-600">{d.disponibilidade}h</td>
                    <td className="px-3 py-1.5 text-right">{d.diasUteis}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${getUtilBg(d.utilizacao)}`}>
                        {d.utilizacao <= 60 ? 'Disponível' : d.utilizacao <= 85 ? 'Bom' : d.utilizacao <= 100 ? 'Saturado' : 'Sobrecarregado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DateRangeFooter data={data} />
        </div>
      )}

      {/* ══════════════════════════════════════════
          3. MAPA DE CALOR — UTILIZAÇÃO MENSAL POR ETN
          ══════════════════════════════════════════ */}
      {heatmapMonths.length > 0 && (
        <div className="bg-card rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-amber-600" />
            Mapa de Calor — Utilização Mensal por ETN
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            🟢 ≤60% · 🟡 61-85% · 🔵 86-100% · 🔴 &gt;100%
          </p>

          {/* Heatmap filters */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" value={hmSearch} onChange={e => setHmSearch(e.target.value)}
                placeholder="Buscar ETN..." className="pl-8 pr-3 py-1.5 text-xs bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-44" />
            </div>
            <select value={hmYear} onChange={e => setHmYear(e.target.value)}
              className="text-xs border border-border rounded-lg px-3 py-1.5 bg-card text-foreground cursor-pointer">
              <option value="all">Todos os anos</option>
              {heatmapYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={hmQuarter} onChange={e => setHmQuarter(e.target.value)}
              className="text-xs border border-border rounded-lg px-3 py-1.5 bg-card text-foreground cursor-pointer">
              <option value="all">Todos os trimestres</option>
              <option value="1">1º Trimestre</option>
              <option value="2">2º Trimestre</option>
              <option value="3">3º Trimestre</option>
              <option value="4">4º Trimestre</option>
            </select>
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-xs font-medium text-muted-foreground">Ordenar:</span>
              {([['media', 'Média'], ['stdDev', 'Desvio'], ['etn', 'Nome']] as const).map(([val, label]) => (
                <FilterPill key={val} active={hmSort.key === val} label={label + (hmSort.key === val ? (hmSort.dir === 'desc' ? ' ↓' : ' ↑') : '')}
                  onClick={() => setHmSort(prev => prev.key === val ? { key: val, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key: val, dir: 'desc' })} />
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-foreground bg-muted/50 sticky left-0 z-10">ETN</th>
                  {heatmapMonths.map(m => {
                    const [mm, yy] = m.split('/');
                    return <th key={m} className="px-2 py-2 text-center font-medium text-muted-foreground bg-muted/50 whitespace-nowrap">{MONTH_NAMES[parseInt(mm)]}/{yy.slice(2)}</th>;
                  })}
                  <th className="px-3 py-2 text-center font-semibold text-foreground bg-muted/50">Média</th>
                  <th className="px-3 py-2 text-center font-semibold text-foreground bg-muted/50" title="Desvio padrão — menor = mais constante">σ</th>
                </tr>
              </thead>
              <tbody>
                {heatmapShown.map((d) => (
                  <tr key={d.etn} className="border-t border-border/50">
                    <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap sticky left-0 bg-card z-10" title={d.etn}>
                      {d.etn.length > 20 ? d.etn.slice(0, 20) + '…' : d.etn}
                    </td>
                    {heatmapMonths.map(m => {
                      const val = d.monthly[m] ?? null;
                      const bg = val === null ? 'bg-muted/30'
                        : val <= 60 ? 'bg-emerald-100 text-emerald-800'
                        : val <= 85 ? 'bg-amber-100 text-amber-800'
                        : val <= 100 ? 'bg-blue-100 text-blue-800'
                        : 'bg-red-100 text-red-800';
                      return (
                        <td key={m} className={`px-2 py-2 text-center font-mono font-semibold ${bg} rounded-sm`}>
                          {val !== null ? `${val}%` : '—'}
                        </td>
                      );
                    })}
                    <td className={`px-3 py-2 text-center font-mono font-bold ${
                      d.media <= 60 ? 'text-emerald-700' : d.media <= 85 ? 'text-amber-700' : d.media <= 100 ? 'text-blue-700' : 'text-red-700'
                    }`}>{d.media}%</td>
                    <td className="px-3 py-2 text-center font-mono text-muted-foreground" title={`Desvio padrão: ${d.stdDev}% — ${d.stdDev <= 10 ? 'Muito constante' : d.stdDev <= 20 ? 'Moderado' : 'Irregular'}`}>
                      <span className={`inline-flex items-center gap-1 ${d.stdDev <= 10 ? 'text-emerald-600' : d.stdDev <= 20 ? 'text-amber-600' : 'text-red-600'}`}>
                        {d.stdDev}%
                        <span className="text-[9px]">{d.stdDev <= 10 ? '●' : d.stdDev <= 20 ? '◐' : '○'}</span>
                      </span>
                    </td>
                  </tr>
                ))}
                {/* Footer row: monthly averages */}
                <tr className="border-t-2 border-border bg-muted/30 font-bold">
                  <td className="px-3 py-2 text-foreground sticky left-0 bg-muted/50 z-10">Média Geral</td>
                  {heatmapMonths.map(m => {
                    const val = heatmapMonthlyAvg[m] ?? 0;
                    return (
                      <td key={m} className={`px-2 py-2 text-center font-mono font-bold ${getUtilBg(val)}`}>
                        {val}%
                      </td>
                    );
                  })}
                  <td className={`px-3 py-2 text-center font-mono font-bold ${getUtilBg(avgUtilAll)}`}>
                    {avgUtilAll}%
                  </td>
                  <td className="px-3 py-2 text-center text-muted-foreground">—</td>
                </tr>
              </tbody>
            </table>
          </div>

          {heatmapData.length > HEATMAP_DEFAULT_SHOW && (
            <button onClick={() => setHmShowAll(!hmShowAll)}
              className="mt-3 text-xs text-primary hover:underline font-medium flex items-center gap-1 mx-auto">
              {hmShowAll ? <><ChevronUp size={14} /> Mostrar top {HEATMAP_DEFAULT_SHOW}</> : <><ChevronDown size={14} /> Mostrar todos ({heatmapData.length})</>}
            </button>
          )}
          <DateRangeFooter data={data} />
        </div>
      )}

      {/* Matriz de Performance */}
      <div className="bg-card rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-600" />
          Matriz de Performance - ETNs
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
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
                <tr key={row.etn} className="border-b hover:bg-muted/30 transition-colors">
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
          <div className="p-3 border-t border-border flex items-center justify-between bg-muted/30 mt-2">
            <p className="text-xs text-muted-foreground">
              Página {matrixPage + 1} de {matrixTotalPages} · {performanceMatrix.length} registros
            </p>
            <div className="flex gap-1">
              <button onClick={() => setMatrixPage(p => Math.max(0, p - 1))} disabled={matrixPage === 0}
                className="px-3 py-1 text-xs rounded-lg bg-card border border-border text-foreground hover:bg-muted disabled:opacity-30 transition-colors font-medium">
                Anterior
              </button>
              <button onClick={() => setMatrixPage(p => Math.min(matrixTotalPages - 1, p + 1))} disabled={matrixPage >= matrixTotalPages - 1}
                className="px-3 py-1 text-xs rounded-lg bg-card border border-border text-foreground hover:bg-muted disabled:opacity-30 transition-colors font-medium">
                Próxima
              </button>
            </div>
          </div>
        )}
        <DateRangeFooter data={data} />
      </div>

      {/* Evolução de Compromissos por ETN */}
      <div className="bg-card rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-blue-600" />
          Evolução de Compromissos Realizados por ETN
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
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
          <p className="text-muted-foreground text-center py-8">Sem dados de compromissos elegíveis para os filtros aplicados</p>
        )}
      </div>

      {/* Funil de Valor por Etapa */}
      <div className="bg-card rounded-lg shadow p-6">
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
            <div key={stage.name} className="text-center p-2 bg-muted/50 rounded">
              <p className="text-xs font-semibold text-muted-foreground">{stage.name}</p>
              <p className="text-sm font-bold">{stage.count} ops</p>
              <p className="text-xs text-muted-foreground">{formatCurrency(stage.value)}</p>
            </div>
          ))}
        </div>
        <DateRangeFooter data={data} />
      </div>
    </div>
  );
}
