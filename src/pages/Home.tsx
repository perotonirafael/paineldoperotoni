import {
  Upload, AlertCircle, TrendingUp, Target, Zap, DollarSign,
  Loader, BarChart3, Trophy, XCircle, FileText, RotateCcw,
  Calendar, AlertTriangle, Search, Database, Trash2, Clock, ChevronDown,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useDataProcessor, type Opportunity, type Action, type ProcessedRecord, type MissingAgendaRecord } from '@/hooks/useDataProcessor';
import { useFileProcessor } from '@/hooks/useFileProcessor';
import { useWorkerDataProcessor } from '@/hooks/useWorkerDataProcessor';
import { useGoalProcessor } from '@/hooks/useGoalProcessor';
import { useGoalMetricsProcessor } from '@/hooks/useGoalMetricsProcessor';
import type { GoalRecord, PedidoRecord } from '@/types/goals';
import { PeriodSelector } from '@/components/PeriodSelector';
import { GoalChart } from '@/components/GoalChart';
import { MultiSelectDropdown } from '@/components/MultiSelectDropdown';
import { KPICard } from '@/components/KPICard';
import { AnalyticsTable } from '@/components/AnalyticsTable';
import { ChartsSection } from '@/components/ChartsSection';
import { ProgressBar } from '@/components/ProgressBar';
import { ETNDetailModal } from '@/components/ETNDetailModal';
import { ETNComparativeAnalysis } from '@/components/ETNComparativeAnalysis';
import { DEMO_DATA } from '@/lib/demoData';
import { saveToCache, loadFromCache, clearCache, getCacheInfo } from '@/hooks/useDataCache';

export default function Home() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [oppFile, setOppFile] = useState<File | null>(null);
  const [actFile, setActFile] = useState<File | null>(null);
  const [oppFileName, setOppFileName] = useState('');
  const [actFileName, setActFileName] = useState('');
  const [goalFile, setGoalFile] = useState<File | null>(null);
  const [pedidoFile, setPedidoFile] = useState<File | null>(null);
  const [goalFileName, setGoalFileName] = useState('');
  const [pedidoFileName, setPedidoFileName] = useState('');
  const [goals, setGoals] = useState<GoalRecord[]>([]);
  const [pedidos, setPedidos] = useState<PedidoRecord[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<string>('Março'); // Período padrão

  const { state: processingState, processFiles: processFilesLegacy, resetState } = useFileProcessor();
  const { processData: processDataWithWorker, processFiles: processFilesWithWorker, isProcessing: isWorkerProcessing, progress: workerProgress } = useWorkerDataProcessor();
  const { parseGoalsFile, parsePedidosFile } = useGoalProcessor();
  const [workerResult, setWorkerResult] = useState<any>(null);
  const [useWorkerOnly, setUseWorkerOnly] = useState(false);
  const [lightOpportunities, setLightOpportunities] = useState<Opportunity[]>([]);
  const [lightActions, setLightActions] = useState<Action[]>([]);

  const handleLoadDemo = useCallback(() => {
    setOpportunities([]);
    setActions([]);
    setLightOpportunities([]);
    setLightActions([]);
    setWorkerResult(null);
    setUseWorkerOnly(false);
    setError(null);
    setTimeout(() => {
      const demoOppsData = DEMO_DATA.map(d => ({
        'Oportunidade ID': d.oppId,
        'Conta': d.conta,
        'Conta ID': d.contaId,
        'Representante': d.representante,
        'Responsável': d.responsavel,
        'Usuário Ação': d.etn,
        'Etapa': d.etapa,
        'Prob.': d.probabilidade,
        'Previsão de Fechamento': `01/${d.mesPrevisao === 'Janeiro' ? '01' : d.mesPrevisao === 'Fevereiro' ? '02' : d.mesPrevisao === 'Março' ? '03' : d.mesPrevisao === 'Abril' ? '04' : '05'}/${d.anoPrevisao}`,
        'Mês Fechamento': d.mesFech,
        'Valor Previsto': d.valorPrevisto,
        'Valor Fechado': d.valorFechado,
        '% Reconhecimento': d.percentualReconhecimento ?? 100,
        'Valor Reconhecido': d.valorReconhecido ?? d.valorPrevisto,
        'Valor Fechado Reconhecido': d.valorFechadoReconhecido ?? d.valorFechado,
        'Tipo Oportunidade': d.tipoOportunidade,
        'Subtipo Oportunidade': d.subtipoOportunidade,
        'Origem Oportunidade': d.origemOportunidade,
        'Motivo Fechamento': d.motivoFechamento,
        'Motivo Perda': d.motivoPerda,
        'Concorrentes': d.concorrentes,
        'Cidade': d.cidade,
        'Estado': d.estado,
        'CNAE Segmento': d.cnaeSegmento,
      }));
      setOpportunities(demoOppsData);
      setLightOpportunities(demoOppsData);
      const demoActions: any[] = [];
      for (const d of DEMO_DATA) {
        if (d.etn === 'Sem Agenda' || d.agenda === 0) continue;
        for (let i = 0; i < d.agenda; i++) {
          const day = Math.min(28, i + 5);
          const mesNum = d.mesPrevisaoNum.toString().padStart(2, '0');
          demoActions.push({
            'Oportunidade ID': d.oppId,
            'Usuario': d.etn,
            'Categoria': d.categoriaCompromisso || 'Reunião',
            'Atividade': d.atividadeCompromisso || 'Geral',
            'Data': `${day.toString().padStart(2, '0')}/${mesNum}/${d.anoPrevisao}`,
          });
        }
      }
      setActions(demoActions);
      setLightActions(demoActions);
    }, 500);
  }, []);

  // Filtros
  const [selYears, setSelYears] = useState<string[]>([]);
  const [selMonths, setSelMonths] = useState<string[]>([]);
  const [selReps, setSelReps] = useState<string[]>([]);
  const [selResp, setSelResp] = useState<string[]>([]);
  const [selETN, setSelETN] = useState<string[]>([]);
  const [selStages, setSelStages] = useState<string[]>([]);
  const [selProbs, setSelProbs] = useState<string[]>([]);
  const [selAgenda, setSelAgenda] = useState<string[]>([]);
  const [selAccounts, setSelAccounts] = useState<string[]>([]);
  const [selTypes, setSelTypes] = useState<string[]>([]);
  // ITEM 6: Novo filtro Subtipo de Oportunidade (Produto)
  const [selSubtipos, setSelSubtipos] = useState<string[]>([]);

  const [chartFilter, setChartFilter] = useState<{ field: string; value: string } | null>(null);
  const [selETNMissing, setSelETNMissing] = useState<string[]>([]);
  const [missingSearch, setMissingSearch] = useState('');
  const [missingFilterEtapas, setMissingFilterEtapas] = useState<string[]>([]);
  const [showEtapaDropdown, setShowEtapaDropdown] = useState(false);
  const [missingPage, setMissingPage] = useState(0);
  useEffect(() => { setMissingPage(0); }, [missingSearch, missingFilterEtapas, selETNMissing, chartFilter]);

  const [selectedETNDetail, setSelectedETNDetail] = useState<string | null>(null);

  const [cacheInfo, setCacheInfo] = useState<{
    exists: boolean;
    timestamp?: number;
    oppFileName?: string;
    actFileName?: string;
    oppCount?: number;
    actCount?: number;
  } | null>(null);
  const [isLoadingCache, setIsLoadingCache] = useState(false);

  useEffect(() => {
    getCacheInfo().then(info => setCacheInfo(info));
  }, []);

  const normalResult = useDataProcessor(lightOpportunities, lightActions);
  const result = workerResult || normalResult;

  const processedData = result?.records ?? [];
  const goalMetricas = useGoalMetricsProcessor(goals, pedidos, processedData, selectedPeriod, actions, opportunities);
  const missingAgendas = result?.missingAgendas ?? [];
  const kpis = result?.kpis ?? null;
  const motivosPerdaBrutos = result?.motivosPerda ?? [];
  const funnelData = result?.funnelData ?? [];
  const forecastFunnel = result?.forecastFunnel ?? [];
  const etnTop10 = result?.etnTop10 ?? [];

  const filterOptions = result?.filterOptions ?? {
    years: [], months: [], representantes: [], responsaveis: [], etns: [],
    etapas: [], probabilidades: [], agenda: [], contas: [], tipos: [], subtipos: [], segmentos: [],
  };

  // ITEM 5: Filtrar dados com probabilidade agrupada >75%
  const filteredData = useMemo(() => {
    return processedData.filter((r: ProcessedRecord) => {
      if (selYears.length > 0 && !selYears.includes(r.anoPrevisao)) return false;
      if (selMonths.length > 0 && !selMonths.includes(r.mesPrevisao)) return false;
      if (selReps.length > 0 && !selReps.includes(r.representante)) return false;
      if (selResp.length > 0 && !selResp.includes(r.responsavel)) return false;
      if (selETN.length > 0 && !selETN.includes(r.etn)) return false;
      if (selStages.length > 0 && !selStages.includes(r.etapa)) return false;
      // ITEM 5: Probabilidade agrupada - ">75%" inclui todas acima de 75
      if (selProbs.length > 0) {
        const probNum = parseInt(r.probabilidade);
        const probLabel = probNum > 75 ? '>75%' : r.probabilidade;
        if (!selProbs.includes(probLabel)) return false;
      }
      if (selAgenda.length > 0 && !selAgenda.includes(r.agenda.toString())) return false;
      if (selAccounts.length > 0 && !selAccounts.includes(r.conta)) return false;
      if (selTypes.length > 0 && !selTypes.includes(r.tipoOportunidade)) return false;
      // ITEM 6: Filtro por Subtipo de Oportunidade (Produto)
      // Suporta valores compostos: 'HCM Senior; Wiipo' deve casar com filtro 'HCM Senior' ou 'Wiipo'
      if (selSubtipos.length > 0) {
        const parts = (r.subtipoOportunidade || '').split(/[;,]/).map((s: string) => s.trim()).filter(Boolean);
        if (parts.length === 0 || !parts.some((p: string) => selSubtipos.includes(p))) return false;
      }
      return true;
    });
  }, [processedData, selYears, selMonths, selReps, selResp, selETN, selStages, selProbs, selAgenda, selAccounts, selTypes, selSubtipos]);

  // Ajuste: Taxa de Conversão por ETN (somente Demonstração Presencial/Remota)
  // Quando actions está disponível (upload direto ou demo), calcular localmente.
  // Quando actions está vazio (cache), usar o etnConversionTop10 pré-calculado pelo worker.
  const etnConversionTop10 = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return [];

    // Função auxiliar de normalização
    const normalize = (v: string) => v
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    // Construir set de OppIds que têm demonstração (Presencial ou Remota)
    const demoOppIds = new Set<string>();

    if (actions.length > 0) {
      // Upload direto ou demo: usar actions
      for (const a of actions) {
        const categoria = normalize((a['Categoria'] || '').toString());
        const isDemo = categoria.includes('demonstracao') && (categoria.includes('presencial') || categoria.includes('remota'));
        if (!isDemo) continue;
        const oppId = (a['Oportunidade ID'] || '').toString().trim();
        if (!oppId) continue;
        demoOppIds.add(oppId);
      }
    } else {
      // Cache: varrer TODOS os records para encontrar quais OPs têm demo
      for (const r of filteredData) {
        if (!r.categoriaCompromisso) continue;
        const catNorm = normalize(r.categoriaCompromisso);
        if (catNorm.includes('demonstracao') && (catNorm.includes('presencial') || catNorm.includes('remota'))) {
          demoOppIds.add(r.oppId);
        }
      }
    }

    const etnMap = new Map<string, { total: number; ganhas: number; perdidas: number; ganhasValor: number; perdidasValor: number }>();
    const seen = new Set<string>();

    for (const r of filteredData) {
      if (r.etn === 'Sem Agenda') continue;
      const key = `${r.etn}||${r.oppId}`;
      if (seen.has(key)) continue;

      const isGanha = r.etapa === 'Fechada e Ganha' || r.etapa === 'Fechada e Ganha TR';
      const isPerdida = r.etapa === 'Fechada e Perdida';
      if (!isGanha && !isPerdida) continue;

      // Verificar se a OP tem demonstração (usando oppId apenas)
      if (!demoOppIds.has(r.oppId)) continue;

      seen.add(key);
      const e = etnMap.get(r.etn) || { total: 0, ganhas: 0, perdidas: 0, ganhasValor: 0, perdidasValor: 0 };
      e.total++;
      const val = r.valorUnificado ?? r.valorReconhecido ?? r.valorPrevisto;
      if (isGanha) { e.ganhas++; e.ganhasValor += val; }
      if (isPerdida) { e.perdidas++; e.perdidasValor += val; }
      etnMap.set(r.etn, e);
    }


    return Array.from(etnMap.entries())
      .filter(([, d]) => d.total > 0)
      .map(([name, d]) => ({
        name: name.length > 20 ? name.slice(0, 20) + '...' : name,
        fullName: name,
        total: d.total,
        ganhas: d.ganhas,
        perdidas: d.perdidas,
        ganhasValor: d.ganhasValor,
        perdidasValor: d.perdidasValor,
        taxaConversao: d.total > 0 ? Math.round((d.ganhas / d.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total || b.taxaConversao - a.taxaConversao)
      .slice(0, 10);
  }, [filteredData, actions, selYears, selMonths, selReps, selResp, selETN, selStages, selProbs, selAccounts, selTypes, selSubtipos]);

  // Ajuste 2: Recursos X Agendas recalculado a partir de filteredData
  const etnRecursosAgendas = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return [];
    const etnMap = new Map<string, { valor: number; agendas: number }>();
    for (const r of filteredData) {
      if (r.etn === 'Sem Agenda') continue;
      const e = etnMap.get(r.etn) || { valor: 0, agendas: 0 };
      e.valor += (r.valorUnificado ?? r.valorReconhecido ?? r.valorPrevisto);
      e.agendas += (r.agenda || 0);
      etnMap.set(r.etn, e);
    }
    return Array.from(etnMap.entries())
      .map(([name, d]) => ({
        name: name.length > 20 ? name.slice(0, 20) + '...' : name,
        fullName: name,
        valor: d.valor,
        agendas: d.agendas,
      }))
      .sort((a, b) => b.agendas - a.agendas)
      .slice(0, 10);
  }, [filteredData]);

  const tableData = useMemo(() => {
    if (!chartFilter) return filteredData;
    return filteredData.filter((r: ProcessedRecord) => {
      switch (chartFilter.field) {
        case 'etapa': return r.etapa === chartFilter.value;
        case 'probabilidade': return r.probabilidade === chartFilter.value;
        case 'motivoPerda': return r.motivoPerda === chartFilter.value || r.motivoFechamento === chartFilter.value;
        case 'etn': return r.etn === chartFilter.value;
        case 'etnMissing': return r.etn === chartFilter.value;
        case 'representante': return r.representante === chartFilter.value;
        default: return true;
      }
    });
  }, [filteredData, chartFilter]);
  
  const parseDate = useCallback((dateStr: string) => {
    if (!dateStr || dateStr === '-') return 0;
    const parts = dateStr.split('/');
    if (parts.length >= 3) {
      const d = parseInt(parts[0]) || 1;
      const m = parseInt(parts[1]) || 1;
      const y = parseInt(parts[2]) || 2000;
      return y * 10000 + m * 100 + d;
    }
    return 0;
  }, []);

  // OLD/INATIVO: Não filtrar dos dados, apenas dos dropdowns de filtro

  const top5MissingETNs = useMemo(() => {
    // Sem filtro de data - mostrar todos os registros
    const filtered = missingAgendas;
    
    const etnMap = new Map<string, { count: number; maxDate: number; maxDateStr: string }>();
    for (const r of filtered) {
      const dateVal = parseDate(r.dataCriacao || '');
      const existing = etnMap.get(r.etn);
      if (!existing) {
        etnMap.set(r.etn, { count: 1, maxDate: dateVal, maxDateStr: r.dataCriacao || '-' });
      } else {
        existing.count++;
        if (dateVal > existing.maxDate) {
          existing.maxDate = dateVal;
          existing.maxDateStr = r.dataCriacao || '-';
        }
      }
    }
    return Array.from(etnMap.entries())
      .sort((a, b) => b[1].maxDate - a[1].maxDate)
      .slice(0, 5)
      .map(([etn]) => etn);
  }, [missingAgendas, parseDate]);

  const missingAgendasFiltered = useMemo(() => {
    // Sem filtro de data - mostrar todos os registros
    let filtered = [...missingAgendas];
    
    if (selETNMissing.length === 0 && !missingSearch && missingFilterEtapas.length === 0 && !(chartFilter && chartFilter.field === 'etnMissing')) {
      filtered = filtered.filter((r: any) => top5MissingETNs.includes(r.etn));
    }
    
    if (selETNMissing.length > 0) {
      filtered = filtered.filter((r: any) => selETNMissing.includes(r.etn));
    }
    if (chartFilter && chartFilter.field === 'etnMissing') {
      filtered = filtered.filter((r: any) => r.etn === chartFilter.value);
    }
    if (missingFilterEtapas.length > 0) {
      filtered = filtered.filter((r: any) => missingFilterEtapas.includes(r.etapa));
    }
    if (missingSearch) {
      const term = missingSearch.toLowerCase();
      filtered = filtered.filter((r: any) =>
        r.oppId.toLowerCase().includes(term) ||
        r.conta.toLowerCase().includes(term) ||
        r.etn.toLowerCase().includes(term) ||
        r.etapa.toLowerCase().includes(term)
      );
    }
    filtered.sort((a: any, b: any) => {
      const dateA = parseDate(a.dataCriacao || '');
      const dateB = parseDate(b.dataCriacao || '');
      return dateB - dateA;
    });
    return filtered;
  }, [missingAgendas, chartFilter, selETNMissing, missingFilterEtapas, missingSearch, top5MissingETNs, parseDate]);

  // ETN Top 10 filtrado - ITEM 4: apenas Proposta e Negociação com prob >= 75%
  const etnTop10Filtered = useMemo(() => {
    const map = new Map<string, { count: number; value: number }>();
    const seen = new Set<string>();
    for (const r of filteredData) {
      if (r.probNum < 75) continue;
      // ITEM 4: Apenas etapas Proposta e Negociação
      const etapaLower = r.etapa.toLowerCase();
      if (!etapaLower.includes('proposta') && !etapaLower.includes('negociação') && !etapaLower.includes('negociacao')) continue;
      if (seen.has(r.oppId)) continue;
      seen.add(r.oppId);
      const val = r.valorUnificado ?? r.valorReconhecido ?? r.valorPrevisto;
      const e = map.get(r.etn) || { count: 0, value: 0 };
      e.count++;
      e.value += val;
      map.set(r.etn, e);
    }
    return Array.from(map.entries())
      .map(([name, d]) => ({ name: name.length > 20 ? name.slice(0, 20) + '...' : name, fullName: name, ...d }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [filteredData]);

  // Motivos de Perda filtrados
  const motivosPerdaFiltered = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of filteredData) {
      if (r.etapa !== 'Fechada e Perdida') continue;
      const motivo = r.motivoPerda || 'Sem motivo';
      const val = r.valorUnificado ?? r.valorReconhecido ?? r.valorPrevisto;
      map.set(motivo, (map.get(motivo) || 0) + val);
    }
    return Array.from(map.entries())
      .map(([motivo, value]) => ({ motivo, count: value }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filteredData]);

  // KPIs filtrados - ITEM 10: usar valorUnificado
  const filteredKPIs = useMemo(() => {
    if (!kpis) return null;
    const normalizeKPI = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    // Construir set de OPs com demonstração (para Taxa de Conversão)
    const demoOppKeys = new Set<string>();
    if (actions.length > 0) {
      for (const a of actions) {
        const cat = normalizeKPI((a['Categoria'] || '').toString());
        if (cat.includes('demonstracao') && (cat.includes('presencial') || cat.includes('remota'))) {
          const oppId = (a['Oportunidade ID'] || '').toString().trim();
          if (oppId) demoOppKeys.add(oppId);
        }
      }
    } else {
      // Cache: usar categoriaCompromisso dos records
      for (const r of filteredData) {
        if (!r.categoriaCompromisso) continue;
        const cat = normalizeKPI(r.categoriaCompromisso);
        if (cat.includes('demonstracao') && (cat.includes('presencial') || cat.includes('remota'))) {
          demoOppKeys.add(r.oppId);
        }
      }
    }

    const seenOps = new Set<string>();
    const seenGanhas = new Set<string>();
    const seenPerdidas = new Set<string>();
    const seenGanhasDemo = new Set<string>();
    const seenPerdidasDemo = new Set<string>();
    let totalAgendas = 0;
    let totalForecast = 0;
    let ganhasValor = 0;
    let perdidasValor = 0;

    for (const r of filteredData) {
      if (!seenOps.has(r.oppId)) {
        seenOps.add(r.oppId);
        if (r.etapa === 'Fechada e Ganha' || r.etapa === 'Fechada e Ganha TR') {
          seenGanhas.add(r.oppId);
          ganhasValor += (r.valorUnificado ?? r.valorFechadoReconhecido ?? r.valorFechado);
          if (demoOppKeys.has(r.oppId)) seenGanhasDemo.add(r.oppId);
        }
        if (r.etapa === 'Fechada e Perdida') {
          seenPerdidas.add(r.oppId);
          perdidasValor += (r.valorUnificado ?? r.valorReconhecido ?? r.valorPrevisto);
          if (demoOppKeys.has(r.oppId)) seenPerdidasDemo.add(r.oppId);
        }
      }
      totalAgendas += r.agenda;
      if (r.probNum >= 75 && r.etapa !== 'Fechada e Ganha' && r.etapa !== 'Fechada e Ganha TR' && r.etapa !== 'Fechada e Perdida') {
        totalForecast += (r.valorUnificado ?? r.valorReconhecido ?? r.valorPrevisto);
      }
    }

    // Taxa de Conversão: apenas OPs com Demo Presencial/Remota
    const totalDemo = seenGanhasDemo.size + seenPerdidasDemo.size;
    const winRate = totalDemo > 0 ? ((seenGanhasDemo.size / totalDemo) * 100).toFixed(1) : '0';
    return {
      totalOps: seenOps.size,
      ganhas: seenGanhas.size,
      perdidas: seenPerdidas.size,
      winRate,
      totalAgendas,
      totalForecast,
      ganhasValor,
      perdidasValor,
    };
  }, [kpis, filteredData, actions]);

  const handleChartClick = useCallback((field: string, value: string) => {
    setChartFilter({ field, value });
  }, []);

  const [isPending, startTransition] = useTransition();

  const handleLoad = useCallback(async () => {
    if (!oppFile && !actFile) return;
    setError(null);
    setUseWorkerOnly(true);
    setWorkerResult(null);
    setLightOpportunities([]);
    setLightActions([]);
    try {
      const workerRes = await processFilesWithWorker(oppFile, actFile);
      setWorkerResult(workerRes);
      // Processar metas e pedidos automaticamente se arquivos foram selecionados
      if (goalFile) {
        try {
          const goalsData = await parseGoalsFile(goalFile);
          setGoals(goalsData);
        } catch (goalErr) {
          console.warn('Erro ao processar metas:', goalErr);
        }
      }
      if (pedidoFile) {
        try {
          const pedidosData = await parsePedidosFile(pedidoFile);
          setPedidos(pedidosData);
        } catch (pedErr) {
          console.warn('Erro ao processar pedidos:', pedErr);
        }
      }
      try {
        await saveToCache(
          workerRes,
          oppFile?.name || '',
          actFile?.name || '',
          workerRes?.records?.length || 0,
          workerRes?.kpis?.totalAgendas || 0
        );
        setCacheInfo({
          exists: true,
          timestamp: Date.now(),
          oppFileName: oppFile?.name || '',
          actFileName: actFile?.name || '',
          oppCount: workerRes?.records?.length || 0,
          actCount: workerRes?.kpis?.totalAgendas || 0,
        });
      } catch (cacheErr) {
        console.warn('Erro ao salvar cache:', cacheErr);
      }
    } catch (err) {
      console.error('Erro no Web Worker:', err);
      setError(err instanceof Error ? err.message : 'Erro ao processar arquivos');
    }
  }, [oppFile, actFile, goalFile, pedidoFile, processFilesWithWorker, parseGoalsFile, parsePedidosFile]);

  const handleOppFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setOppFile(file);
      setOppFileName(file.name);
    }
  };

  const handleActFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setActFile(file);
      setActFileName(file.name);
    }
  };

  const handleGoalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setGoalFile(file);
      setGoalFileName(file.name);
    }
  };

  const handlePedidoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPedidoFile(file);
      setPedidoFileName(file.name);
    }
  };

  const handleLoadGoals = useCallback(async () => {
    if (!goalFile || !pedidoFile) return;
    setError(null);
    try {
      const goalsData = await parseGoalsFile(goalFile);
      const pedidosData = await parsePedidosFile(pedidoFile);
      setGoals(goalsData);
      setPedidos(pedidosData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao processar metas e pedidos');
    }
  }, [goalFile, pedidoFile, parseGoalsFile, parsePedidosFile]);

  // Processar metas automaticamente quando ambos arquivos são selecionados
  useEffect(() => {
    if (goalFile && pedidoFile) {
      handleLoadGoals();
    }
  }, [goalFile, pedidoFile, handleLoadGoals]);

  const handleLoadCache = useCallback(async () => {
    setIsLoadingCache(true);
    setError(null);
    setUseWorkerOnly(true);
    setLightOpportunities([]);
    setLightActions([]);
    try {
      const cached = await loadFromCache();
      if (cached && cached.result) {
        // Aplicar filterOLD ao cache para remover OLD/INATIVO dos filtros
        const isOLD = (name: string): boolean => {
          const upper = name.trim().toUpperCase();
          return upper.includes('OLD') || upper.includes('INATIVO');
        };
        const cleanedResult = {
          ...cached.result,
          filterOptions: {
            ...cached.result.filterOptions,
            representantes: cached.result.filterOptions.representantes?.filter((s: string) => !isOLD(s)) || [],
            responsaveis: cached.result.filterOptions.responsaveis?.filter((s: string) => !isOLD(s)) || [],
            etns: cached.result.filterOptions.etns?.filter((s: string) => !isOLD(s)) || [],
            tipos: cached.result.filterOptions.tipos?.filter((s: string) => !isOLD(s)) || [],
            contas: cached.result.filterOptions.contas?.filter((s: string) => !isOLD(s)) || [],
            subtipos: cached.result.filterOptions.subtipos?.filter((s: string) => !isOLD(s)) || [],
            segmentos: cached.result.filterOptions.segmentos?.filter((s: string) => !isOLD(s)) || [],
          },
        };
        setWorkerResult(cleanedResult);
      } else {
        setError('Cache não encontrado ou corrompido. Faça upload dos arquivos novamente.');
      }
    } catch (err) {
      setError('Erro ao carregar cache. Faça upload dos arquivos novamente.');
    } finally {
      setIsLoadingCache(false);
    }
  }, []);

  const handleClearCache = useCallback(async () => {
    await clearCache();
    setCacheInfo({ exists: false });
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-gradient-to-r from-green-600 to-emerald-700 text-white shadow-lg">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white/20 backdrop-blur-sm">
              <BarChart3 size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Painel do Perotoni</h1>
              <p className="text-sm text-green-100">Funil de Vendas · Oportunidades & Compromissos</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container py-8">
        {/* Upload Section */}
        {isWorkerProcessing ? (
          <div className="max-w-md mx-auto text-center py-20">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-green-100 to-emerald-100 mb-6 animate-pulse">
              <Loader className="text-green-600 animate-spin" size={36} />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              {workerProgress?.stage === 'reading' ? 'Lendo arquivos...' :
               workerProgress?.stage === 'parsing' ? 'Parseando dados...' :
               workerProgress?.stage === 'processing' ? 'Processando dados...' :
               workerProgress?.stage === 'done' ? 'Finalizando...' :
               'Processando dados...'}
            </h2>
            <p className="text-muted-foreground mb-4">
              {workerProgress?.message || 'Analisando oportunidades e compromissos em segundo plano.'}
            </p>
            <div className="w-full bg-green-100 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-green-500 to-emerald-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${workerProgress?.progress || 10}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {workerProgress?.progress ? `${workerProgress.progress}%` : ''} — Processamento em segundo plano, a interface permanece responsiva.
            </p>
          </div>
        ) : processedData.length === 0 ? (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-green-100 to-emerald-100 mb-4">
                <Upload className="text-green-600" size={32} />
              </div>
              <h2 className="text-3xl font-bold text-foreground mb-2">Análise de Pipeline</h2>
              <p className="text-muted-foreground">
                Carregue os arquivos de Oportunidades e Ações/Compromissos<br />
                para gerar insights estratégicos do seu funil de vendas.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl p-4 border-2 border-green-200 hover:border-green-400 transition-all hover:shadow-lg hover:shadow-green-100 flex flex-col">
                <div className="flex items-start gap-2 mb-3 min-h-0">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 shadow-md shadow-green-200 flex-shrink-0">
                    <FileText className="text-white" size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-bold text-green-800">Oportunidades</h3>
                    <p className="text-[10px] text-green-600/70">Base 1 - Pipeline</p>
                  </div>
                </div>
                <label className="block">
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleOppFile} className="hidden" />
                  <span className="block w-full py-3 text-center text-sm font-medium rounded-lg border-2 border-dashed border-green-300 hover:border-green-500 hover:bg-green-50 transition-all cursor-pointer">
                    {oppFileName ? (
                      <span className="text-green-700 flex items-center justify-center gap-1.5">
                        <FileText size={14} /> {oppFileName}
                      </span>
                    ) : (
                      <span className="text-emerald-500">Selecionar arquivo</span>
                    )}
                  </span>
                </label>
              </div>

              <div className="bg-white rounded-xl p-4 border-2 border-blue-200 hover:border-blue-400 transition-all hover:shadow-lg hover:shadow-blue-100 flex flex-col">
                <div className="flex items-start gap-2 mb-3 min-h-0">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-200 flex-shrink-0">
                    <FileText className="text-white" size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-bold text-blue-800">Ações/Comprom.</h3>
                    <p className="text-[10px] text-blue-600/70">Base 2 - Engajamento</p>
                  </div>
                </div>
                <label className="block">
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={handleActFile} className="hidden" />
                  <span className="block w-full py-3 text-center text-sm font-medium rounded-lg border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 transition-all cursor-pointer">
                    {actFileName ? (
                      <span className="text-blue-700 flex items-center justify-center gap-1.5">
                        <FileText size={14} /> {actFileName}
                      </span>
                    ) : (
                      <span className="text-blue-500">Selecionar arquivo</span>
                    )}
                  </span>
                </label>
              </div>

              <div className="bg-white rounded-xl p-4 border-2 border-purple-200 hover:border-purple-400 transition-all hover:shadow-lg hover:shadow-purple-100 flex flex-col">
                <div className="flex items-start gap-2 mb-3 min-h-0">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-violet-600 shadow-md shadow-purple-200 flex-shrink-0">
                    <Target className="text-white" size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-bold text-purple-800">Metas</h3>
                    <p className="text-[10px] text-purple-600/70">Base 3 - Metas (.xlsx)</p>
                  </div>
                </div>
                <label className="block">
                  <input type="file" accept=".xlsx,.xls" onChange={handleGoalFile} className="hidden" />
                  <span className="block w-full py-3 text-center text-sm font-medium rounded-lg border-2 border-dashed border-purple-300 hover:border-purple-500 hover:bg-purple-50 transition-all cursor-pointer">
                    {goalFileName ? (
                      <span className="text-purple-700 flex items-center justify-center gap-1.5">
                        <FileText size={14} /> {goalFileName}
                      </span>
                    ) : (
                      <span className="text-purple-500">Selecionar arquivo</span>
                    )}
                  </span>
                </label>
              </div>

              <div className="bg-white rounded-xl p-4 border-2 border-orange-200 hover:border-orange-400 transition-all hover:shadow-lg hover:shadow-orange-100 flex flex-col">
                <div className="flex items-start gap-2 mb-3 min-h-0">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 shadow-md shadow-orange-200 flex-shrink-0">
                    <DollarSign className="text-white" size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs font-bold text-orange-800">Pedidos CRM</h3>
                    <p className="text-[10px] text-orange-600/70">Base 4 - Pedidos (.csv)</p>
                  </div>
                </div>
                <label className="block">
                  <input type="file" accept=".csv" onChange={handlePedidoFile} className="hidden" />
                  <span className="block w-full py-3 text-center text-sm font-medium rounded-lg border-2 border-dashed border-orange-300 hover:border-orange-500 hover:bg-orange-50 transition-all cursor-pointer">
                    {pedidoFileName ? (
                      <span className="text-orange-700 flex items-center justify-center gap-1.5">
                        <FileText size={14} /> {pedidoFileName}
                      </span>
                    ) : (
                      <span className="text-orange-500">Selecionar arquivo</span>
                    )}
                  </span>
                </label>
              </div>
            </div>

            <div className="flex justify-center gap-4">
              <button
                onClick={handleLoad}
                disabled={processingState.isProcessing || isPending || isWorkerProcessing || (!oppFile && !actFile)}
                className="flex items-center gap-2 px-8 py-3 text-sm font-bold rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-200 hover:shadow-xl hover:shadow-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02]"
              >
                {processingState.isProcessing || isPending || isWorkerProcessing ? (
                  <><Loader className="animate-spin" size={18} /> Processando...</>
                ) : (
                  <><Upload size={18} /> Carregar e Analisar</>
                )}
              </button>

              <button
                onClick={handleLoadDemo}
                className="flex items-center gap-2 px-8 py-3 text-sm font-bold rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-200 hover:shadow-xl hover:shadow-amber-300 transition-all hover:scale-[1.02]"
              >
                <Zap size={18} /> Ver Demonstração
              </button>
            </div>

            <p className="text-center text-xs text-muted-foreground mt-4">
              Suporta .xlsx, .xls e .csv (separador ; ou ,) &middot; Até 200K registros
            </p>

            {cacheInfo?.exists && (
              <div className="mt-6 bg-white rounded-xl p-5 border-2 border-emerald-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-gradient-to-br from-emerald-100 to-green-100">
                      <Database className="text-emerald-600" size={20} />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-emerald-800">Dados em Cache</h3>
                      <p className="text-xs text-emerald-600/70">
                        {cacheInfo.oppFileName && <span>{cacheInfo.oppFileName}</span>}
                        {cacheInfo.actFileName && <span> + {cacheInfo.actFileName}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Clock size={10} />
                        {cacheInfo.timestamp ? new Date(cacheInfo.timestamp).toLocaleString('pt-BR') : ''}
                        {cacheInfo.oppCount ? ` · ${cacheInfo.oppCount.toLocaleString('pt-BR')} registros` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleLoadCache}
                      disabled={isLoadingCache}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-md hover:shadow-lg disabled:opacity-50 transition-all hover:scale-[1.02]"
                    >
                      {isLoadingCache ? (
                        <><Loader className="animate-spin" size={14} /> Carregando...</>
                      ) : (
                        <><Database size={14} /> Carregar do Cache</>
                      )}
                    </button>
                    <button
                      onClick={handleClearCache}
                      className="flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-all"
                      title="Limpar cache"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-200 flex gap-3">
                <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
                <div className="text-sm text-red-700">{error}</div>
              </div>
            )}

            {processingState.isProcessing && (
              <ProgressBar progress={processingState.progress} currentFile={processingState.currentFile} isVisible={processingState.isProcessing} />
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <KPICard title="OPORTUNIDADES" value={filteredKPIs?.totalOps ?? 0} icon={<Target size={20} />} color="blue" />
              <KPICard title="TOTAL DE COMPROMISSOS" value={filteredKPIs?.totalAgendas ?? 0} icon={<Calendar size={20} />} color="green" />
              <KPICard
                title="FECHADA E GANHA"
                value={`${filteredKPIs?.ganhas ?? 0}`}
                subtitle={`R$ ${((filteredKPIs?.ganhasValor ?? 0) / 1000).toFixed(0)}K`}
                icon={<Trophy size={20} />}
                color="green"
              />
              <KPICard
                title="FECHADA E PERDIDA"
                value={`${filteredKPIs?.perdidas ?? 0}`}
                subtitle={`R$ ${((filteredKPIs?.perdidasValor ?? 0) / 1000).toFixed(0)}K`}
                icon={<XCircle size={20} />}
                color="red"
              />
              <KPICard title="TAXA DE CONVERSÃO" value={`${filteredKPIs?.winRate ?? '0'}%`} icon={<TrendingUp size={20} />} color="amber" />
              <KPICard
                title="FORECAST (≥75%)"
                value={`R$ ${((filteredKPIs?.totalForecast ?? 0) / 1e6).toFixed(1)}M`}
                icon={<DollarSign size={20} />}
                color="purple"
              />
            </div>

            {/* Botão para resetar */}
            <div className="flex justify-end">
              <button
                onClick={() => {
                  setOpportunities([]);
                  setActions([]);
                  setOppFile(null);
                  setActFile(null);
                  setOppFileName('');
                  setActFileName('');
                  setChartFilter(null);
                  setWorkerResult(null);
                  setUseWorkerOnly(false);
                  setLightOpportunities([]);
                  setLightActions([]);
                  resetState();
                }}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-all"
              >
                <RotateCcw size={14} /> Novo Upload
              </button>
            </div>



            {/* Filtros - ITEM 3: Removido filtro Origem, ITEM 6: Adicionado filtro Produto */}
            <div className="bg-white rounded-xl p-5 border border-border shadow-sm">
              <h3 className="text-sm font-bold text-foreground mb-4">Filtros</h3>
              <div className="flex flex-wrap gap-3">
                <MultiSelectDropdown label="Ano" options={filterOptions.years} selected={selYears} onChange={setSelYears} />
                <MultiSelectDropdown label="Mês" options={filterOptions.months} selected={selMonths} onChange={setSelMonths} />
                <MultiSelectDropdown label="Representante" options={filterOptions.representantes} selected={selReps} onChange={setSelReps} />
                <MultiSelectDropdown label="Responsável" options={filterOptions.responsaveis} selected={selResp} onChange={setSelResp} />
                <MultiSelectDropdown label="ETN" options={filterOptions.etns} selected={selETN} onChange={setSelETN} />
                <MultiSelectDropdown label="Etapa" options={filterOptions.etapas} selected={selStages} onChange={setSelStages} />
                <MultiSelectDropdown label="Probabilidade" options={filterOptions.probabilidades} selected={selProbs} onChange={setSelProbs} />
                <MultiSelectDropdown label="Agenda" options={filterOptions.agenda} selected={selAgenda} onChange={setSelAgenda} />
                <MultiSelectDropdown label="Conta" options={filterOptions.contas} selected={selAccounts} onChange={setSelAccounts} />
                <MultiSelectDropdown label="Tipo Op." options={filterOptions.tipos} selected={selTypes} onChange={setSelTypes} />
                <MultiSelectDropdown label="Produto" options={filterOptions.subtipos || []} selected={selSubtipos} onChange={setSelSubtipos} />
              </div>
            </div>

            {/* Filtro de clique nos gráficos */}
            {chartFilter && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                <AlertTriangle className="text-amber-600" size={18} />
                <span className="text-sm text-amber-800">
                  Tabela filtrada por: <strong>{chartFilter.field === 'etapa' ? 'Etapa' : chartFilter.field === 'motivoPerda' ? 'Motivo de Perda' : chartFilter.field === 'etn' ? 'ETN' : chartFilter.field === 'representante' ? 'Representante' : chartFilter.field}</strong> = <strong>{chartFilter.value}</strong>
                </span>
                <button onClick={() => setChartFilter(null)} className="ml-auto text-xs font-semibold text-amber-700 hover:text-amber-900 underline">Limpar</button>
              </div>
            )}

            {/* Charts */}
            <ChartsSection
              data={filteredData}
              funnelData={funnelData}
              motivosPerda={motivosPerdaFiltered}
              forecastFunnel={forecastFunnel}
              etnTop10={etnTop10Filtered}
              etnConversionTop10={etnConversionTop10}
              etnRecursosAgendas={etnRecursosAgendas}
              onChartClick={handleChartClick}
              onETNClick={setSelectedETNDetail}
            />

            {/* Gráfico de Metas - sempre visível */}
            <div className="mt-10 bg-white rounded-xl p-6 border border-border shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <Target size={20} className="text-purple-600" />
                  Atingimento de Metas - {selectedPeriod}
                </h3>
                <div className="flex items-center gap-3">
                  {goals.length === 0 && (
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer px-3 py-1.5 text-xs font-medium rounded-lg border border-purple-300 text-purple-700 hover:bg-purple-50 transition-all">
                        <input type="file" accept=".xlsx,.xls" onChange={handleGoalFile} className="hidden" />
                        {goalFileName || 'Metas (.xlsx)'}
                      </label>
                      <label className="cursor-pointer px-3 py-1.5 text-xs font-medium rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-50 transition-all">
                        <input type="file" accept=".csv" onChange={handlePedidoFile} className="hidden" />
                        {pedidoFileName || 'Pedidos (.csv)'}
                      </label>
                    </div>
                  )}
                  <PeriodSelector selectedPeriod={selectedPeriod} onPeriodChange={setSelectedPeriod} />
                </div>
              </div>
              <GoalChart metricas={goalMetricas} title="" />
            </div>

            {/* Table */}
            <div className="mt-6">
              <AnalyticsTable data={tableData} />
            </div>

            {/* Agendas Faltantes */}
            {missingAgendas.length > 0 && (
              <div className="mt-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 shadow-md">
                    <AlertTriangle className="text-white" size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-foreground">Agendas Faltantes</h2>
                    <p className="text-xs text-muted-foreground">
                      Oportunidades sem compromisso registrado, cruzadas por Subtipo de Oportunidade (Produto)
                    </p>
                  </div>
                  <span className="ml-auto bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full">
                    {missingAgendasFiltered.length} registros
                  </span>
                </div>

                <div className="bg-white rounded-xl p-5 border border-border shadow-sm mb-4">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-foreground mb-1">Agendas Faltantes por ETN</h3>
                      <p className="text-xs text-muted-foreground">Clique na barra para filtrar a tabela abaixo</p>
                    </div>
                    <div className="w-56">
                      <MultiSelectDropdown
                        label="Filtrar ETN"
                        options={filterOptions.etns}
                        selected={selETNMissing}
                        onChange={setSelETNMissing}
                      />
                    </div>
                  </div>
                  <MissingAgendaChart 
                    data={missingAgendasFiltered} 
                    onBarClick={(etn) => {
                      setChartFilter({ field: 'etnMissing', value: etn });
                      setSelectedETNDetail(etn);
                    }}
                    selectedETN={selETNMissing}
                  />
                </div>

                <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-200 flex flex-wrap items-center gap-3">
                    <div className="relative">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Pesquisar ID, conta, ETN..."
                        value={missingSearch}
                        onChange={(e) => setMissingSearch(e.target.value)}
                        className="pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none w-56"
                      />
                    </div>
                    <div className="relative">
                      <button
                        onClick={() => setShowEtapaDropdown(!showEtapaDropdown)}
                        className="text-xs border border-gray-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-amber-500 outline-none min-w-[180px] flex items-center justify-between gap-2 bg-white hover:bg-gray-50"
                      >
                        <span className="truncate">
                          {missingFilterEtapas.length === 0 ? 'Filtrar Etapas' : `${missingFilterEtapas.length} etapa(s)`}
                        </span>
                        <ChevronDown size={12} className={`transition-transform ${showEtapaDropdown ? 'rotate-180' : ''}`} />
                      </button>
                      {showEtapaDropdown && (
                        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[280px] overflow-y-auto min-w-[260px]">
                          <div className="p-2 border-b border-gray-100 flex justify-between items-center">
                            <span className="text-[10px] font-semibold text-gray-500">Selecione as etapas</span>
                            {missingFilterEtapas.length > 0 && (
                              <button onClick={() => setMissingFilterEtapas([])} className="text-[10px] text-red-500 hover:text-red-700 font-semibold">Limpar</button>
                            )}
                          </div>
                          {Array.from(new Set(missingAgendas.map((r: any) => r.etapa))).sort().map((etapa: any, idx: number) => (
                            <label key={`etapa-${idx}-${etapa}`} className="flex items-center gap-2 px-3 py-1.5 hover:bg-amber-50 cursor-pointer text-xs text-gray-700">
                              <input
                                type="checkbox"
                                checked={missingFilterEtapas.includes(etapa)}
                                onChange={() => {
                                  setMissingFilterEtapas(prev =>
                                    prev.includes(etapa) ? prev.filter(e => e !== etapa) : [...prev, etapa]
                                  );
                                }}
                                className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                              />
                              {etapa}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="ml-auto text-xs text-gray-500">Pág. {missingPage + 1} de {Math.max(1, Math.ceil(missingAgendasFiltered.length / 10))} · {missingAgendasFiltered.length} registros</span>
                    {(missingSearch || missingFilterEtapas.length > 0) && (
                      <button
                        onClick={() => { setMissingSearch(''); setMissingFilterEtapas([]); }}
                        className="text-xs font-semibold text-red-600 hover:text-red-800 underline"
                      >
                        Limpar
                      </button>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200">
                          <th className="text-left px-3 py-2.5 font-bold text-amber-900">Op. ID</th>
                          <th className="text-left px-3 py-2.5 font-bold text-amber-900">Conta</th>
                          <th className="text-left px-3 py-2.5 font-bold text-amber-900">ETN</th>
                          <th className="text-left px-3 py-2.5 font-bold text-amber-900 whitespace-nowrap">Etapa</th>
                          <th className="text-left px-3 py-2.5 font-bold text-amber-900">Produto</th>
                          <th className="text-left px-3 py-2.5 font-bold text-amber-900">Prob.</th>
                          <th className="text-right px-3 py-2.5 font-bold text-amber-900">Valor Previsto</th>
                          <th className="text-left px-3 py-2.5 font-bold text-amber-900">Data Criação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {missingAgendasFiltered.slice(missingPage * 10, (missingPage + 1) * 10).map((r: any, idx: number) => (
                          <tr key={`${r.oppId}-${idx}`} className="border-b hover:bg-amber-50/50">
                            <td className="px-3 py-2 font-semibold text-amber-900">{r.oppId}</td>
                            <td className="px-3 py-2 text-gray-700">{r.conta}</td>
                            <td className="px-3 py-2 text-gray-700">{r.etn}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                r.etapa === 'Fechada e Ganha' || r.etapa === 'Fechada e Ganha TR' ? 'bg-green-100 text-green-800' :
                                r.etapa === 'Fechada e Perdida' ? 'bg-red-100 text-red-800' :
                                'bg-blue-100 text-blue-800'
                              }`}>
                                {r.etapa}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-700">{r.subtipoOportunidade || '-'}</td>
                            <td className="px-3 py-2 text-gray-700">{r.probabilidade}</td>
                            <td className="px-3 py-2 text-right font-semibold text-amber-900">R$ {(r.valorPrevisto / 1000).toFixed(0)}K</td>
                            <td className="px-3 py-2 text-gray-700">{r.dataCriacao || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {missingAgendasFiltered.length > 10 && (
                    <div className="px-4 py-3 bg-amber-50 border-t border-amber-200 flex items-center justify-between">
                      <button
                        onClick={() => setMissingPage(p => Math.max(0, p - 1))}
                        disabled={missingPage === 0}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-200 text-amber-900 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        ← Anterior
                      </button>
                      <span className="text-xs text-amber-700 font-medium">
                        Exibindo {missingPage * 10 + 1}–{Math.min((missingPage + 1) * 10, missingAgendasFiltered.length)} de {missingAgendasFiltered.length} registros
                      </span>
                      <button
                        onClick={() => setMissingPage(p => Math.min(Math.ceil(missingAgendasFiltered.length / 10) - 1, p + 1))}
                        disabled={(missingPage + 1) * 10 >= missingAgendasFiltered.length}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-200 text-amber-900 hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Próxima →
                      </button>
                    </div>
                  )}
                  <div className="px-4 py-1.5 bg-gray-50 text-[10px] text-gray-400 text-center border-t border-gray-100">
                    Período dos filtros aplicados: {(() => {
                      const mNames = ['','Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
                      let minYM = Infinity, maxYM = 0, minL = '', maxL = '';
                      for (const r of filteredData) {
                        if (!r.anoPrevisao || !r.mesPrevisaoNum) continue;
                        const ym = parseInt(r.anoPrevisao) * 100 + r.mesPrevisaoNum;
                        if (ym < minYM) { minYM = ym; minL = `${mNames[r.mesPrevisaoNum]}/${r.anoPrevisao}`; }
                        if (ym > maxYM) { maxYM = ym; maxL = `${mNames[r.mesPrevisaoNum]}/${r.anoPrevisao}`; }
                      }
                      return minYM === Infinity ? 'Sem dados' : `${minL} — ${maxL}`;
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Análise Comparativa de ETNs */}
        {opportunities.length > 0 && (
          <div className="mt-8">
            <h2 className="text-2xl font-bold text-foreground mb-6">Análise Comparativa de ETNs</h2>
            <ETNComparativeAnalysis data={filteredData} actions={actions} />
          </div>
        )}
        {/* Modal de Detalhe do ETN */}
        {selectedETNDetail && (
          <ETNDetailModal
            etn={selectedETNDetail}
            data={processedData}
            actions={actions}
            onClose={() => setSelectedETNDetail(null)}
            goalMetricas={goalMetricas}
          />
        )}
      </div>
    </div>
  );
}

// Componente de gráfico para Agendas Faltantes
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

function MissingAgendaChart({ data, onBarClick, selectedETN }: { data: MissingAgendaRecord[]; onBarClick: (etn: string) => void; selectedETN: string[] }) {
  const chartData = useMemo(() => {
    // Mostrar todos os dados (OLD/INATIVO aparecem normalmente)
    let filtered = selectedETN.length > 0 ? data.filter(r => selectedETN.includes(r.etn)) : data;
    const map = new Map<string, number>();
    for (const r of filtered) {
      map.set(r.etn, (map.get(r.etn) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name: name.length > 20 ? name.slice(0, 20) + '…' : name, count, fullName: name }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [data, selectedETN]);

  const colors = ['#f59e0b', '#f97316', '#ef4444', '#ec4899', '#8b5cf6', '#6366f1', '#3b82f6', '#06b6d4', '#14b8a6', '#10b981', '#84cc16', '#eab308', '#d946ef', '#0ea5e9', '#22d3ee'];

  return (
    <div style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
          <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} allowDecimals={false} axisLine={{ stroke: '#e5e7eb' }} />
          <YAxis type="category" dataKey="name" width={160} tick={{ fill: '#374151', fontSize: 11 }} axisLine={{ stroke: '#e5e7eb' }} />
          <Tooltip
            contentStyle={{ background: 'rgba(255,255,255,0.97)', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '12px', color: '#1f2937', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
            formatter={(v: number) => [v, 'Oportunidades sem agenda']}
            labelFormatter={(label: string) => {
              const item = chartData.find(d => d.name === label);
              return item?.fullName || label;
            }}
          />
          <Bar dataKey="count" radius={[0, 6, 6, 0]} onClick={(data: any) => onBarClick(data.fullName)}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} style={{ cursor: 'pointer' }} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
