import React, { useMemo, useState, useCallback } from 'react';
import { X, TrendingUp, Award, Target, Calendar, Trophy, XCircle, DollarSign, Search, Filter, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList, Cell, PieChart, Pie } from 'recharts';
import { KPICard } from './KPICard';
import type { GoalMetrics } from '@/types/goals';

interface ProcessedRecord {
  oppId: string;
  conta: string;
  contaId: string;
  representante: string;
  responsavel: string;
  etn: string;
  etapa: string;
  probabilidade: string;
  probNum: number;
  anoPrevisao: string;
  mesPrevisao: string;
  mesPrevisaoNum: number;
  mesFech: string;
  valorPrevisto: number;
  valorFechado: number;
  valorUnificado?: number;
  valorReconhecido?: number;
  valorFechadoReconhecido?: number;
  percentualReconhecimento: number;
  agenda: number;
  tipoOportunidade: string;
  subtipoOportunidade: string;
  origemOportunidade: string;
  motivoFechamento: string;
  motivoPerda: string;
  concorrentes: string;
  cidade: string;
  estado: string;
  cnaeSegmento: string;
  categoriaCompromisso: string;
  atividadeCompromisso: string;
}

interface Action { [key: string]: any; }

interface ETNDetailModalProps {
  etn: string;
  data: ProcessedRecord[];
  actions?: Action[];
  onClose: () => void;
  goalMetricas?: GoalMetrics[];
}

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6'];
const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316', '#6366f1'];

const formatCurrency = (v: number) => {
  if (v >= 1e9) return `R$ ${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)}K`;
  return `R$ ${v.toFixed(0)}`;
};

const MONTH_ORDER = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

type SortField = 'oppId' | 'conta' | 'representante' | 'etapa' | 'probabilidade' | 'valorPrevisto' | 'valorFechado' | 'agenda' | 'mesFech';
type SortDir = 'asc' | 'desc';

function trim(val: any): string {
  return val ? val.toString().trim() : '';
}

function normalize(val: string): string {
  return (val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function ETNDetailModal({ etn, data, actions = [], onClose, goalMetricas = [] }: ETNDetailModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEtapa, setFilterEtapa] = useState('');
  const [filterProb, setFilterProb] = useState('');
  const [filterAno, setFilterAno] = useState('');
  const [filterMes, setFilterMes] = useState('');
  const [activeKPIFilter, setActiveKPIFilter] = useState<string | null>(null);
  const [chartFilter, setChartFilter] = useState<{ type: string; value: string } | null>(null);
  const [sortField, setSortField] = useState<SortField>('valorPrevisto');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const etnData = useMemo(() => {
    return data.filter(r => r.etn === etn);
  }, [etn, data]);

  // Compromissos do ETN (da planilha de compromissos/ações)
  const etnActions = useMemo(() => {
    if (!actions.length) return [];
    return actions.filter(a => {
      const user = trim(a['Usuario']) || trim(a['Responsavel']) || trim(a['Usuário Ação']);
      return user === etn;
    });
  }, [etn, actions]);

  // Anos e meses disponíveis para filtro (Item 1)
  const anosDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const r of etnData) if (r.anoPrevisao) set.add(r.anoPrevisao);
    return Array.from(set).sort();
  }, [etnData]);

  const mesesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const r of etnData) if (r.mesPrevisao) set.add(r.mesPrevisao);
    return MONTH_ORDER.filter(m => set.has(m));
  }, [etnData]);

  // Dados filtrados por Ano e Mês
  const etnDataFiltered = useMemo(() => {
    let filtered = etnData;
    if (filterAno) filtered = filtered.filter(r => r.anoPrevisao === filterAno);
    if (filterMes) filtered = filtered.filter(r => r.mesPrevisao === filterMes);
    return filtered;
  }, [etnData, filterAno, filterMes]);

  // Base oficial de oportunidades únicas do ETN (respeitando filtros de período)
  const uniqueOps = useMemo(() => {
    const oppMap = new Map<string, ProcessedRecord>();
    for (const r of etnDataFiltered) {
      if (!oppMap.has(r.oppId)) oppMap.set(r.oppId, r);
    }
    return Array.from(oppMap.values());
  }, [etnDataFiltered]);

  // 7 tipos de compromisso que qualificam uma OP para KPIs de Fechada e Ganha/Perdida no modal
  const QUALIFYING_CATEGORIES = new Set([
    'demonstracao presencial',
    'demonstracao remota',
    'analise de aderencia',
    'etn apoio',
    'analise de rfp/rfi',
    'termo de referencia',
    'edital',
  ]);

  // Conjunto de OPs que possuem pelo menos 1 compromisso dos 7 tipos qualificadores
  const qualifiedOppIds = useMemo(() => {
    const qualified = new Set<string>();
    // Primeiro: verificar via actions (planilha de compromissos)
    if (etnActions.length > 0) {
      for (const a of etnActions) {
        const cat = normalize(trim(a['Categoria']));
        if (QUALIFYING_CATEGORIES.has(cat)) {
          const oppId = trim(a['Oportunidade ID']);
          if (oppId) qualified.add(oppId);
        }
      }
    }
    // Fallback: verificar via categoriaCompromisso dos records
    if (qualified.size === 0) {
      for (const r of etnData) {
        const catNorm = normalize(r.categoriaCompromisso || '');
        if (QUALIFYING_CATEGORIES.has(catNorm)) {
          qualified.add(r.oppId);
        }
      }
    }
    return qualified;
  }, [etnActions, etnData]);

  // Conjunto de OPs com Demo Presencial/Remota (para Taxa de Conversão)
  const demoOppIds = useMemo(() => {
    const demoSet = new Set<string>();
    if (etnActions.length > 0) {
      for (const a of etnActions) {
        const cat = normalize(trim(a['Categoria']));
        if (cat.includes('demonstracao') && (cat.includes('presencial') || cat.includes('remota'))) {
          const oppId = trim(a['Oportunidade ID']);
          if (oppId) demoSet.add(oppId);
        }
      }
    }
    if (demoSet.size === 0) {
      for (const r of etnData) {
        const catNorm = normalize(r.categoriaCompromisso || '');
        if (catNorm.includes('demonstracao') && (catNorm.includes('presencial') || catNorm.includes('remota'))) {
          demoSet.add(r.oppId);
        }
      }
    }
    return demoSet;
  }, [etnActions, etnData]);

  // KPIs
  const kpis = useMemo(() => {
    const totalOps = uniqueOps.length;

    // Fechada e Ganha/Perdida: apenas OPs com pelo menos 1 compromisso dos 7 tipos
    const ganhasOps = uniqueOps.filter(r =>
      (r.etapa === 'Fechada e Ganha' || r.etapa === 'Fechada e Ganha TR') && qualifiedOppIds.has(r.oppId)
    );
    const perdidasOps = uniqueOps.filter(r =>
      r.etapa === 'Fechada e Perdida' && qualifiedOppIds.has(r.oppId)
    );
    const ganhas = ganhasOps.length;
    const perdidas = perdidasOps.length;
    const ganhasValor = ganhasOps.reduce((sum, r) => sum + (r.valorUnificado ?? r.valorFechadoReconhecido ?? r.valorFechado), 0);
    const perdidasValor = perdidasOps.reduce((sum, r) => sum + (r.valorUnificado ?? r.valorReconhecido ?? r.valorPrevisto), 0);

    // Taxa de Conversão: apenas OPs com Demo Presencial/Remota
    const ganhasDemo = uniqueOps.filter(r =>
      (r.etapa === 'Fechada e Ganha' || r.etapa === 'Fechada e Ganha TR') && demoOppIds.has(r.oppId)
    ).length;
    const perdidasDemo = uniqueOps.filter(r =>
      r.etapa === 'Fechada e Perdida' && demoOppIds.has(r.oppId)
    ).length;
    const closedDemo = ganhasDemo + perdidasDemo;
    const winRate = closedDemo > 0 ? ((ganhasDemo / closedDemo) * 100).toFixed(1) : '0';

    const valorTotal = uniqueOps.reduce((sum, r) => sum + (r.valorUnificado ?? r.valorReconhecido ?? r.valorPrevisto), 0);
    const valorMedio = totalOps > 0 ? valorTotal / totalOps : 0;
    const totalAgendas = etnDataFiltered.reduce((sum, r) => sum + r.agenda, 0);

    return { totalOps, ganhas, perdidas, ganhasValor, perdidasValor, winRate, valorTotal, valorMedio, totalAgendas, closedTotal: ganhas + perdidas, ganhasDemo, perdidasDemo };
  }, [etnDataFiltered, uniqueOps, qualifiedOppIds, demoOppIds]);

  const conversionChartData = useMemo(() => ([
    { name: 'Conversão', ganhas: kpis.ganhasDemo ?? kpis.ganhas, perdidas: kpis.perdidasDemo ?? kpis.perdidas },
  ]), [kpis.ganhas, kpis.perdidas, kpis.ganhasDemo, kpis.perdidasDemo]);

  // Gráfico: Distribuição por Etapa
  const etapaDistribution = useMemo(() => {
    const map = new Map<string, number>();
    const seen = new Set<string>();
    for (const r of etnDataFiltered) {
      if (seen.has(r.oppId)) continue;
      seen.add(r.oppId);
      map.set(r.etapa, (map.get(r.etapa) || 0) + 1);
    }
    return Array.from(map.entries()).map(([etapa, count]) => ({ etapa, count }));
  }, [etnDataFiltered]);

  // Item 6: Tipo de Compromisso por Categoria (da planilha compromissos)
  const categoriaCompromisso = useMemo(() => {
    const map = new Map<string, number>();
    // Usar ações diretamente da planilha de compromissos
    if (etnActions.length > 0) {
      for (const a of etnActions) {
        const cat = trim(a['Categoria']) || 'Sem Categoria';
        map.set(cat, (map.get(cat) || 0) + 1);
      }
    } else {
      // Fallback: usar dados processados
      for (const r of etnDataFiltered) {
        if (r.categoriaCompromisso) {
          map.set(r.categoriaCompromisso, (map.get(r.categoriaCompromisso) || 0) + 1);
        }
      }
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [etnDataFiltered, etnActions]);

  // Item 4: Evolução de Compromissos - usar dados da planilha de compromissos
  const compromissosTimeline = useMemo(() => {
    const map = new Map<string, number>();

    if (etnActions.length > 0) {
      // Usar datas da planilha de compromissos
      for (const a of etnActions) {
        const dateStr = trim(a['Data']) || trim(a['Data Início']) || trim(a['Data da Ação']);
        if (!dateStr) continue;
        const parts = dateStr.split('/');
        if (parts.length >= 3) {
          const mesNum = parseInt(parts[1].replace(/[^0-9]/g, ''));
          const anoStr = parts[2].replace(/[^0-9]/g, '');
          const anoNum = parseInt(anoStr);
          if (mesNum >= 1 && mesNum <= 12 && anoStr.length === 4 && anoNum >= 2000 && anoNum <= 2100) {
            const monthName = MONTH_ORDER[mesNum - 1];
            const key = `${anoStr}-${monthName}`;
            map.set(key, (map.get(key) || 0) + 1);
          }
        }
      }
    }

    // Fallback se não tiver ações com data: usar dados processados
    if (map.size === 0) {
      for (const r of etnDataFiltered) {
        if (!r.anoPrevisao || !r.mesPrevisao) continue;
        const key = `${r.anoPrevisao}-${r.mesPrevisao}`;
        map.set(key, (map.get(key) || 0) + r.agenda);
      }
    }

    return Array.from(map.entries())
      .sort(([a], [b]) => {
        const [aY, aM] = a.split('-');
        const [bY, bM] = b.split('-');
        if (aY !== bY) return aY.localeCompare(bY);
        return MONTH_ORDER.indexOf(aM) - MONTH_ORDER.indexOf(bM);
      })
      .map(([key, agendas]) => {
        const [year, month] = key.split('-');
        const shortMonth = month.slice(0, 3);
        return { name: `${shortMonth}/${year.slice(2)}`, agendas, fullMonth: month, year };
      });
  }, [etnDataFiltered, etnActions]);

  // Calcular acumulado para a timeline
  const compromissosTimelineWithAccum = useMemo(() => {
    let acum = 0;
    return compromissosTimeline.map(item => {
      acum += item.agendas;
      return { ...item, acumulado: acum };
    });
  }, [compromissosTimeline]);

  // Item 5/7: Fechamento de Oportunidades Ganhas Mensal
  const fechamentoGanhasMensal = useMemo(() => {
    const map = new Map<string, { count: number; valor: number }>();
    const seen = new Set<string>();
    for (const r of etnDataFiltered) {
      if (seen.has(r.oppId)) continue;
      seen.add(r.oppId);
      if (r.etapa === 'Fechada e Ganha' || r.etapa === 'Fechada e Ganha TR') {
        if (!r.anoPrevisao || !r.mesPrevisao) continue;
        const key = `${r.anoPrevisao}-${r.mesPrevisao}`;
        const e = map.get(key) || { count: 0, valor: 0 };
        e.count++;
        e.valor += (r.valorUnificado ?? r.valorFechadoReconhecido ?? r.valorFechado);
        map.set(key, e);
      }
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        const [aY, aM] = a.split('-');
        const [bY, bM] = b.split('-');
        if (aY !== bY) return aY.localeCompare(bY);
        return MONTH_ORDER.indexOf(aM) - MONTH_ORDER.indexOf(bM);
      })
      .map(([key, d]) => {
        const [year, month] = key.split('-');
        return { name: `${month.slice(0, 3)}/${year.slice(2)}`, fullMonth: month, year, ...d };
      });
  }, [etnDataFiltered]);

  // Etapas e probabilidades disponíveis para filtro
  const etapasDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const r of etnDataFiltered) set.add(r.etapa);
    return Array.from(set).sort();
  }, [etnDataFiltered]);

  const probsDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const r of etnDataFiltered) if (r.probabilidade) set.add(r.probabilidade);
    return Array.from(set).sort((a, b) => parseInt(a) - parseInt(b));
  }, [etnDataFiltered]);

  // Tabela com filtros, pesquisa e ordenação (Itens 2, 3, 8)
  const filteredOps = useMemo(() => {
    const oppMap = new Map<string, ProcessedRecord>();
    for (const r of etnDataFiltered) {
      if (!oppMap.has(r.oppId)) oppMap.set(r.oppId, r);
    }
    let ops = Array.from(oppMap.values());

    // Filtro por KPI clicado
    if (activeKPIFilter === 'ganhas') {
      ops = ops.filter(r => r.etapa === 'Fechada e Ganha' || r.etapa === 'Fechada e Ganha TR');
    } else if (activeKPIFilter === 'perdidas') {
      ops = ops.filter(r => r.etapa === 'Fechada e Perdida');
    }

    // Item 2: Filtro por clique em gráfico
    if (chartFilter) {
      if (chartFilter.type === 'etapa') {
        ops = ops.filter(r => r.etapa === chartFilter.value);
      } else if (chartFilter.type === 'fechamentoMes') {
        const [month, year] = chartFilter.value.split('|');
        ops = ops.filter(r => r.mesPrevisao === month && r.anoPrevisao === year && (r.etapa === 'Fechada e Ganha' || r.etapa === 'Fechada e Ganha TR'));
      } else if (chartFilter.type === 'compromissoMes') {
        // Mostrar oportunidades vinculadas ao mês de compromisso
        const [month, year] = chartFilter.value.split('|');
        ops = ops.filter(r => r.mesPrevisao === month && r.anoPrevisao === year);
      } else if (chartFilter.type === 'categoria') {
        ops = ops.filter(r => r.categoriaCompromisso === chartFilter.value);
      }
    }

    // Filtro por etapa dropdown
    if (filterEtapa) ops = ops.filter(r => r.etapa === filterEtapa);
    // Filtro por probabilidade dropdown
    if (filterProb) ops = ops.filter(r => r.probabilidade === filterProb);

    // Pesquisa textual
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      ops = ops.filter(r =>
        r.oppId.toLowerCase().includes(term) ||
        r.conta.toLowerCase().includes(term) ||
        r.etapa.toLowerCase().includes(term) ||
        r.representante.toLowerCase().includes(term)
      );
    }

    // Item 3: Ordenação
    ops.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'oppId': cmp = a.oppId.localeCompare(b.oppId); break;
        case 'conta': cmp = a.conta.localeCompare(b.conta); break;
        case 'representante': cmp = (a.representante || '').localeCompare(b.representante || ''); break;
        case 'etapa': cmp = a.etapa.localeCompare(b.etapa); break;
        case 'probabilidade': cmp = a.probNum - b.probNum; break;
        case 'valorPrevisto': cmp = a.valorPrevisto - b.valorPrevisto; break;
        case 'valorFechado': cmp = a.valorFechado - b.valorFechado; break;
        case 'agenda': cmp = a.agenda - b.agenda; break;
        case 'mesFech': cmp = (a.mesPrevisaoNum || 0) - (b.mesPrevisaoNum || 0); break;
        default: cmp = 0;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return ops;
  }, [etnDataFiltered, searchTerm, filterEtapa, filterProb, activeKPIFilter, chartFilter, sortField, sortDir]);

  // Intervalo de datas para rodapé
  const dateRange = useMemo(() => {
    let minYear = 9999, maxYear = 0;
    let minMonth = 13, maxMonth = 0;
    for (const r of etnDataFiltered) {
      if (!r.anoPrevisao || !r.mesPrevisaoNum) continue;
      const y = parseInt(r.anoPrevisao);
      const m = r.mesPrevisaoNum;
      const ym = y * 100 + m;
      if (ym < minYear * 100 + minMonth) { minYear = y; minMonth = m; }
      if (ym > maxYear * 100 + maxMonth) { maxYear = y; maxMonth = m; }
    }
    if (minYear === 9999) return 'Sem dados';
    const mNames = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    return `${mNames[minMonth]}/${minYear} — ${mNames[maxMonth]}/${maxYear}`;
  }, [etnDataFiltered]);

  const handleKPIClick = useCallback((filter: string) => {
    setActiveKPIFilter(prev => prev === filter ? null : filter);
    setChartFilter(null);
  }, []);

  const handleChartClick = useCallback((type: string, value: string) => {
    setChartFilter(prev => prev?.type === type && prev?.value === value ? null : { type, value });
    setActiveKPIFilter(null);
  }, []);

  const handleSort = useCallback((field: SortField) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return field;
      }
      setSortDir('desc');
      return field;
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setSearchTerm('');
    setFilterEtapa('');
    setFilterProb('');
    setActiveKPIFilter(null);
    setChartFilter(null);
  }, []);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown size={12} className="text-gray-400" />;
    return sortDir === 'asc' ? <ChevronUp size={12} className="text-green-600" /> : <ChevronDown size={12} className="text-green-600" />;
  };

  const hasActiveFilter = searchTerm || filterEtapa || filterProb || activeKPIFilter || chartFilter;

  // Descrição do filtro ativo
  const activeFilterLabel = useMemo(() => {
    if (activeKPIFilter === 'ganhas') return 'Fechada e Ganha';
    if (activeKPIFilter === 'perdidas') return 'Fechada e Perdida';
    if (activeKPIFilter === 'total') return 'Todas';
    if (chartFilter) {
      if (chartFilter.type === 'etapa') return `Etapa: ${chartFilter.value}`;
      if (chartFilter.type === 'fechamentoMes') {
        const [month] = chartFilter.value.split('|');
        return `Ganhas em: ${month}`;
      }
      if (chartFilter.type === 'compromissoMes') {
        const [month] = chartFilter.value.split('|');
        return `Compromissos em: ${month}`;
      }
      if (chartFilter.type === 'categoria') return `Categoria: ${chartFilter.value}`;
    }
    return null;
  }, [activeKPIFilter, chartFilter]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-green-600 to-emerald-700 text-white p-6 rounded-t-2xl flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">{etn}</h2>
            <p className="text-green-100 text-sm">Desempenho Individual</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Filtros Ano e Mês (Item 1) */}
          <div className="flex flex-wrap items-center gap-3 bg-gray-50 p-3 rounded-xl border border-gray-200">
            <span className="text-xs font-semibold text-gray-600 flex items-center gap-1"><Filter size={13} /> Filtros:</span>
            <select
              value={filterAno}
              onChange={(e) => setFilterAno(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-green-500 outline-none bg-white"
            >
              <option value="">Todos os Anos</option>
              {anosDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select
              value={filterMes}
              onChange={(e) => setFilterMes(e.target.value)}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-green-500 outline-none bg-white"
            >
              <option value="">Todos os Meses</option>
              {mesesDisponiveis.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {(filterAno || filterMes) && (
              <button onClick={() => { setFilterAno(''); setFilterMes(''); }} className="text-xs font-semibold text-red-600 hover:text-red-800 underline">
                Limpar
              </button>
            )}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <div onClick={() => handleKPIClick('total')} className={`cursor-pointer transition-all ${activeKPIFilter === 'total' ? 'ring-2 ring-blue-500 rounded-xl' : ''}`}>
              <KPICard title="Total de Oportunidades" value={kpis.totalOps.toString()} icon={<Target size={18} />} color="blue" />
            </div>
            <div onClick={() => handleKPIClick('ganhas')} className={`cursor-pointer transition-all ${activeKPIFilter === 'ganhas' ? 'ring-2 ring-green-500 rounded-xl' : ''}`}>
              <KPICard title="Fechada e Ganha" value={kpis.ganhas.toString()} subtitle={formatCurrency(kpis.ganhasValor)} icon={<Trophy size={18} />} color="green" />
            </div>
            <div onClick={() => handleKPIClick('perdidas')} className={`cursor-pointer transition-all ${activeKPIFilter === 'perdidas' ? 'ring-2 ring-red-500 rounded-xl' : ''}`}>
              <KPICard title="Fechada e Perdida" value={kpis.perdidas.toString()} subtitle={formatCurrency(kpis.perdidasValor)} icon={<XCircle size={18} />} color="red" />
            </div>
            <KPICard title="Taxa de Conversão" value={`${kpis.winRate}%`} icon={<TrendingUp size={18} />} color="amber" />
            <KPICard title="Total de Agendas" value={kpis.totalAgendas.toString()} icon={<Calendar size={18} />} color="purple" />

          </div>

          {/* Filtro ativo */}
          {activeFilterLabel && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2 text-sm">
              <Filter size={14} className="text-blue-600" />
              <span className="text-blue-800">
                Tabela filtrada por: <strong>{activeFilterLabel}</strong>
              </span>
              <button onClick={clearAllFilters} className="ml-auto text-xs font-semibold text-blue-700 hover:text-blue-900 underline">Limpar</button>
            </div>
          )}

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Distribuição por Etapa - clique filtra grid (Item 2) */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
              <h3 className="font-semibold text-gray-800 mb-1 text-sm">Distribuição por Etapa</h3>
              <p className="text-[10px] text-gray-500 mb-3">Clique para filtrar a tabela abaixo</p>
              <ResponsiveContainer width="100%" height={420}>
                <BarChart data={etapaDistribution} margin={{ bottom: 10, left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="etapa" angle={-40} textAnchor="end" height={150} tick={{ fontSize: 9, fill: '#6b7280' }} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.97)', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '12px' }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Oportunidades" cursor="pointer" onClick={(d: any) => handleChartClick('etapa', d.etapa)}>
                    {etapaDistribution.map((entry, i) => {
                      const color = entry.etapa.includes('Ganha') ? '#10b981' : entry.etapa.includes('Perdida') ? '#ef4444' : COLORS[i % COLORS.length];
                      const isActive = chartFilter?.type === 'etapa' && chartFilter?.value === entry.etapa;
                      return <Cell key={i} fill={color} opacity={chartFilter?.type === 'etapa' && !isActive ? 0.3 : 1} />;
                    })}
                    <LabelList dataKey="count" position="top" fill="#374151" fontSize={11} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-gray-400 text-center mt-2">Período: {dateRange}</p>
            </div>

            {/* Item 6: Tipo de Compromisso por Categoria */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
              <h3 className="font-semibold text-gray-800 mb-1 text-sm">Tipo de Compromisso</h3>
              <p className="text-[10px] text-gray-500 mb-3">Distribuição por categoria · Clique para filtrar</p>
              {categoriaCompromisso.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={categoriaCompromisso}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        innerRadius={40}
                        dataKey="value"
                        nameKey="name"
                        cursor="pointer"
                        onClick={(d: any) => handleChartClick('categoria', d.name)}
                      >
                        {categoriaCompromisso.map((entry, i) => {
                          const isActive = chartFilter?.type === 'categoria' && chartFilter?.value === entry.name;
                          return <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} opacity={chartFilter?.type === 'categoria' && !isActive ? 0.3 : 1} />;
                        })}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.97)', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '12px' }} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 gap-1 mt-2">
                    {categoriaCompromisso.map((item, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[11px] cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5" onClick={() => handleChartClick('categoria', item.name)}>
                        <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="text-gray-700 truncate">{item.name}</span>
                        <span className="ml-auto font-bold text-gray-800">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-sm text-gray-400">
                  Sem dados de categoria
                </div>
              )}
              <p className="text-[10px] text-gray-400 text-center mt-2">Período: {dateRange}</p>
            </div>

            {/* Taxa de Conversão - mesmo padrão visual do dashboard principal */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
              <h3 className="font-semibold text-gray-800 mb-1 text-sm">Taxa de Conversão</h3>
              <p className="text-[10px] text-gray-500 mb-3">Fechada e Ganha vs Fechada e Perdida (base de oportunidades fechadas)</p>

              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-emerald-50 rounded-lg p-2 text-center border border-emerald-100">
                  <p className="text-base font-bold text-emerald-700">{kpis.winRate}%</p>
                  <p className="text-[10px] text-emerald-600 font-medium">Taxa Geral</p>
                </div>
                <div className="bg-green-50 rounded-lg p-2 text-center border border-green-100">
                  <p className="text-base font-bold text-green-700">{kpis.ganhas}</p>
                  <p className="text-[10px] text-green-600 font-medium">Ganhas</p>
                </div>
                <div className="bg-red-50 rounded-lg p-2 text-center border border-red-100">
                  <p className="text-base font-bold text-red-600">{kpis.perdidas}</p>
                  <p className="text-[10px] text-red-500 font-medium">Perdidas</p>
                </div>
              </div>

              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={conversionChartData} layout="vertical" margin={{ left: 10, right: 10, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis type="number" allowDecimals={false} domain={[0, Math.max(1, kpis.closedTotal)]} tick={{ fontSize: 10, fill: '#6b7280' }} />
                  <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: '#6b7280' }} />
                  <Tooltip
                    contentStyle={{ background: 'rgba(255,255,255,0.97)', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '12px' }}
                    formatter={(value: number, key: string) => [value, key === 'ganhas' ? 'Fechada e Ganha' : 'Fechada e Perdida']}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} formatter={(value) => value === 'ganhas' ? 'Fechada e Ganha' : 'Fechada e Perdida'} />
                  <Bar dataKey="ganhas" name="ganhas" stackId="conversion" fill="#10b981" radius={[4, 0, 0, 4]}>
                    <LabelList dataKey="ganhas" position="inside" fill="#ffffff" fontSize={10} />
                  </Bar>
                  <Bar dataKey="perdidas" name="perdidas" stackId="conversion" fill="#ef4444" radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="perdidas" position="inside" fill="#ffffff" fontSize={10} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-gray-400 text-center mt-2">Período: {dateRange}</p>
            </div>

            {/* Evolução de Compromissos Realizados - quantidade por mês */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
              <h3 className="font-semibold text-gray-800 mb-1 text-sm">Evolução de Compromissos Realizados</h3>
              <p className="text-[10px] text-gray-500 mb-3">Quantidade de compromissos por mês · Clique para ver oportunidades vinculadas</p>
              {compromissosTimeline.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={compromissosTimeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: 'rgba(255,255,255,0.97)', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="agendas" fill="#3b82f6" name="Compromissos no Mês" radius={[4, 4, 0, 0]} cursor="pointer"
                      onClick={(d: any) => handleChartClick('compromissoMes', `${d.fullMonth}|${d.year}`)}>
                      {compromissosTimeline.map((entry, i) => {
                        const isActive = chartFilter?.type === 'compromissoMes' && chartFilter?.value === `${entry.fullMonth}|${entry.year}`;
                        return <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={chartFilter?.type === 'compromissoMes' && !isActive ? 0.3 : 1} />;
                      })}
                      <LabelList dataKey="agendas" position="top" fill="#374151" fontSize={10} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-sm text-gray-400">
                  Sem dados de compromissos para este período
                </div>
              )}
              <p className="text-[10px] text-gray-400 text-center mt-2">Período: {dateRange}</p>
            </div>

            {/* Item 5/7: Fechamento de Oportunidades Ganhas Mensal - clique filtra grid */}
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
              <h3 className="font-semibold text-gray-800 mb-1 text-sm">Fechamento de Oportunidades Ganhas Mensal</h3>
              <p className="text-[10px] text-gray-500 mb-3">Clique para filtrar a tabela abaixo</p>
              {fechamentoGanhasMensal.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={fechamentoGanhasMensal}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6b7280' }} />
                    <YAxis tickFormatter={(v: number) => formatCurrency(v)} tick={{ fontSize: 10, fill: '#6b7280' }} />
                    <Tooltip
                      contentStyle={{ background: 'rgba(255,255,255,0.97)', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '12px' }}
                      formatter={(v: number, name: string) => {
                        if (name === 'Valor Fechado') return [formatCurrency(v), 'Valor Fechado'];
                        return [v, 'Qtd. Ganhas'];
                      }}
                    />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="valor" fill="#10b981" radius={[6, 6, 0, 0]} name="Valor Fechado" cursor="pointer"
                      onClick={(d: any) => handleChartClick('fechamentoMes', `${d.fullMonth}|${d.year}`)}>
                      {fechamentoGanhasMensal.map((entry, i) => {
                        const isActive = chartFilter?.type === 'fechamentoMes' && chartFilter?.value === `${entry.fullMonth}|${entry.year}`;
                        return <Cell key={i} fill={COLORS[i % COLORS.length]} opacity={chartFilter?.type === 'fechamentoMes' && !isActive ? 0.3 : 1} />;
                      })}
                      <LabelList dataKey="valor" position="top" fill="#374151" fontSize={9} formatter={(v: number) => formatCurrency(v)} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[280px] flex items-center justify-center text-sm text-gray-400">
                  Nenhuma oportunidade ganha neste período
                </div>
              )}
              <p className="text-[10px] text-gray-400 text-center mt-2">Valores de oportunidades Fechadas e Ganhas · Período: {dateRange}</p>
            </div>
          </div>

          {/* Tabela de Oportunidades com filtros, pesquisa e ordenação (Itens 2, 3, 8) */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="font-semibold text-gray-800 text-sm">Oportunidades ({filteredOps.length})</h3>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Pesquisar..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none w-48"
                  />
                </div>
                <select value={filterEtapa} onChange={(e) => setFilterEtapa(e.target.value)}
                  className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-green-500 outline-none bg-white">
                  <option value="">Todas Etapas</option>
                  {etapasDisponiveis.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <select value={filterProb} onChange={(e) => setFilterProb(e.target.value)}
                  className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-green-500 outline-none bg-white">
                  <option value="">Todas Prob.</option>
                  {probsDisponiveis.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {hasActiveFilter && (
                  <button onClick={clearAllFilters} className="text-xs font-semibold text-red-600 hover:text-red-800 underline">
                    Limpar filtros
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gradient-to-r from-gray-100 to-gray-200">
                  <tr>
                    {([
                      { field: 'oppId' as SortField, label: 'ID Op.', align: 'left' },
                      { field: 'conta' as SortField, label: 'Conta', align: 'left' },
                      { field: 'representante' as SortField, label: 'Representante', align: 'left' },
                      { field: 'etapa' as SortField, label: 'Etapa', align: 'left' },
                      { field: 'probabilidade' as SortField, label: 'Prob.', align: 'left' },
                      { field: 'valorPrevisto' as SortField, label: 'Valor Previsto', align: 'right' },
                      { field: 'valorFechado' as SortField, label: 'Valor Fechado', align: 'right' },
                      { field: 'valorPrevisto' as SortField, label: '% Rec.', align: 'center' },
                      { field: 'valorPrevisto' as SortField, label: 'Valor Reconhecido', align: 'right' },
                      { field: 'agenda' as SortField, label: 'Agendas', align: 'center' },
                      { field: 'mesFech' as SortField, label: 'Produto', align: 'left' },
                      { field: 'mesFech' as SortField, label: 'Mês Fech.', align: 'left' },
                    ]).map(col => (
                      <th key={col.field}
                        className={`px-3 py-2.5 font-bold text-gray-700 cursor-pointer hover:bg-gray-300/50 transition select-none text-${col.align}`}
                        onClick={() => handleSort(col.field)}>
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          <SortIcon field={col.field} />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOps.slice(0, 100).map((op) => (
                    <tr key={op.oppId} className="border-b border-gray-100 hover:bg-gray-100/50 transition-colors">
                      <td className="px-3 py-2 font-semibold text-gray-800">{op.oppId}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate">{op.conta}</td>
                      <td className="px-3 py-2 text-gray-700 max-w-[150px] truncate">{op.representante || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          op.etapa === 'Fechada e Ganha' || op.etapa === 'Fechada e Ganha TR' ? 'bg-green-100 text-green-800' :
                          op.etapa === 'Fechada e Perdida' ? 'bg-red-100 text-red-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {op.etapa}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{op.probabilidade}</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-800">{formatCurrency(op.valorPrevisto)}</td>
                      <td className="px-3 py-2 text-right font-semibold text-green-700">
                        {op.valorFechado > 0 ? formatCurrency(op.valorFechado) : '—'}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          (op.percentualReconhecimento ?? 100) === 100 ? 'bg-green-100 text-green-700' :
                          (op.percentualReconhecimento ?? 100) === 25 ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {op.percentualReconhecimento ?? 100}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-blue-700">
                        {formatCurrency(op.valorUnificado ?? op.valorReconhecido ?? op.valorPrevisto)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          op.agenda === 0 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {op.agenda}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600 truncate max-w-[120px]">{op.subtipoOportunidade || '-'}</td>
                      <td className="px-3 py-2 text-gray-700">{op.mesFech}/{op.anoPrevisao?.slice(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredOps.length > 100 && (
              <div className="px-4 py-2 bg-gray-100 text-xs text-gray-600 text-center border-t">
                Exibindo 100 de {filteredOps.length} registros
              </div>
            )}
            <p className="text-[10px] text-gray-400 text-center mt-2">Período: {dateRange}</p>
          </div>

          {/* Seção de Metas */}
          <div className="bg-white rounded-xl border border-purple-200 overflow-hidden">
            <div className="bg-gradient-to-r from-purple-50 to-violet-50 px-5 py-3 border-b border-purple-200">
              <h3 className="text-sm font-bold text-purple-900 flex items-center gap-2">
                <Target size={16} className="text-purple-600" />
                Atingimento de Metas
              </h3>
            </div>
            <div className="p-5">
              {(() => {
                const etnGoal = goalMetricas.find(m => m.etn === etn);
                if (!etnGoal || (etnGoal.realLicencasServicos === 0 && etnGoal.realRecorrente === 0)) {
                  return (
                    <div className="h-32 flex flex-col items-center justify-center text-muted-foreground">
                      <Target size={24} className="mb-2 opacity-50" />
                      <p className="text-sm">Sem dados de realização de meta para este ETN</p>
                      <p className="text-xs opacity-70 mt-1">Carregue os arquivos de Metas e Pedidos CRM</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                        <p className="text-xs font-medium text-blue-700">Licenças + Serviços</p>
                        <p className="text-lg font-bold text-blue-900">R$ {etnGoal.realLicencasServicos.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
                      </div>
                      <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                        <p className="text-xs font-medium text-purple-700">Recorrente</p>
                        <p className="text-lg font-bold text-purple-900">R$ {etnGoal.realRecorrente.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
                      </div>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-emerald-700">Total Realizado</p>
                        <p className="text-lg font-bold text-emerald-900">R$ {(etnGoal.realLicencasServicos + etnGoal.realRecorrente).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
