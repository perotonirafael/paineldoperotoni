import { useMemo } from 'react';
import { useCallback } from 'react';

export interface Opportunity { [key: string]: any; }
export interface Action { [key: string]: any; }

export interface ProcessedRecord {
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
  valorUnificado: number; // Fechada e Ganha → Valor Fechado * %rec; Restante → Valor Previsto * %rec
  valorReconhecido?: number; // Legado - manter compatibilidade
  valorFechadoReconhecido?: number; // Legado - manter compatibilidade
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

export interface MissingAgendaRecord {
  oppId: string;
  conta: string;
  contaId: string;
  etn: string;
  etapa: string;
  probabilidade: string;
  valorPrevisto: number;
  mesFech: string;
  anoPrevisao: string;
  subtipoOportunidade?: string;
  dataCriacao: string;
  oppAnteriorId: string;
  oppAnteriorEtapa: string;
  agendaAnterior: number;
}

const MONTH_NAMES: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril',
  5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
  9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'
};

function parseDate(dateStr: string): { month: string; year: string; monthNum: number } {
  if (!dateStr) return { month: '', year: '', monthNum: 0 };
  const parts = dateStr.split('/');
  if (parts.length >= 3) {
    const mesClean = parseInt(parts[1].replace(/[^0-9]/g, ''));
    const anoClean = parts[2].replace(/[^0-9]/g, '');
    const anoNum = parseInt(anoClean);
    if (mesClean >= 1 && mesClean <= 12 && anoClean.length === 4 && anoNum >= 2000 && anoNum <= 2100) {
      return { month: MONTH_NAMES[mesClean], year: anoClean, monthNum: mesClean };
    }
  }
  return { month: '', year: '', monthNum: 0 };
}

function cleanProb(val: any): { str: string; num: number } {
  if (!val) return { str: '', num: 0 };
  const s = val.toString().replace(/[^0-9]/g, '');
  const n = parseInt(s);
  return isNaN(n) ? { str: '', num: 0 } : { str: `${n}%`, num: n };
}

function parseValue(val: any): number {
  if (!val) return 0;
  const s = val.toString().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function trim(val: any): string {
  return val ? val.toString().trim() : '';
}

// Extrair número sequencial do ID da oportunidade (ex: "OPP001" → 1, "12345" → 12345)
function extractSequential(oppId: string): number {
  const nums = oppId.replace(/[^0-9]/g, '');
  return nums ? parseInt(nums) : 0;
}

// Verifica se um nome contém "OLD" ou "INATIVO"
function isOLD(name: string): boolean {
  const upper = name.trim().toUpperCase();
  return upper.includes('OLD') || upper.includes('INATIVO');
}

// Filtrar OLD/INATIVO dos dropdowns
function filterOLD(arr: string[]): string[] {
  const filtered = arr.filter(s => !isOLD(s));
  if (arr.length > 0 && filtered.length !== arr.length) {
    console.log(`filterOLD: ${arr.length} → ${filtered.length}`, { original: arr.slice(0, 3), filtered: filtered.slice(0, 3) });
  }
  return filtered;
}

export function useDataProcessor(opportunities: Opportunity[], actions: Action[]) {
  const combinedData = useMemo(() => {
    if (!opportunities.length && !actions.length) return null;

    // INDEX: Ações agrupadas APENAS por Oportunidade ID
    const actionsByOppId = new Map<string, Action[]>();
    for (const act of actions) {
      const oppId = trim(act['Oportunidade ID']);
      if (oppId) {
        if (!actionsByOppId.has(oppId)) actionsByOppId.set(oppId, []);
        actionsByOppId.get(oppId)!.push(act);
      }
    }

    // INDEX: Para Agendas Faltantes - mapear ETN → Conta ID → Oportunidades com compromissos
    const etnContaOppMap = new Map<string, Map<string, Set<string>>>();

    // PROCESSAMENTO: Desdobramento 1:N
    const records: ProcessedRecord[] = [];

    for (const opp of opportunities) {
      const oppId = trim(opp['Oportunidade ID']);
      const contaId = trim(opp['Conta ID']);
      const conta = trim(opp['Conta']);
      const { month, year, monthNum } = parseDate(trim(opp['Previsão de Fechamento']));
      const prob = cleanProb(opp['Prob.']);
      const valorPrevisto = parseValue(opp['Valor Previsto']);
      const valorFechado = parseValue(opp['Valor Fechado']);

      const linkedActions = actionsByOppId.get(oppId) || [];

      if (linkedActions.length > 0) {
        const byUser = new Map<string, Action[]>();
        for (const act of linkedActions) {
          const user = trim(act['Usuario']) || trim(act['Responsavel']) || trim(act['Usuário Ação']) || 'Sem Agenda';
          if (!byUser.has(user)) byUser.set(user, []);
          byUser.get(user)!.push(act);
        }

        for (const [user, userActions] of Array.from(byUser.entries())) {
          if (contaId && user !== 'Sem Agenda') {
            if (!etnContaOppMap.has(user)) etnContaOppMap.set(user, new Map());
            const contaMap = etnContaOppMap.get(user)!;
            if (!contaMap.has(contaId)) contaMap.set(contaId, new Set());
            contaMap.get(contaId)!.add(oppId);
          }

          const catCount = new Map<string, number>();
          const actCount = new Map<string, number>();
          for (const a of userActions) {
            const c = trim(a['Categoria']); if (c) catCount.set(c, (catCount.get(c) || 0) + 1);
            const at = trim(a['Atividade']); if (at) actCount.set(at, (actCount.get(at) || 0) + 1);
          }
          let topCat = ''; let topCatN = 0;
          catCount.forEach((v, k) => { if (v > topCatN) { topCat = k; topCatN = v; } });
          let topAct = ''; let topActN = 0;
          actCount.forEach((v, k) => { if (v > topActN) { topAct = k; topActN = v; } });

          records.push({
            oppId, conta, contaId,
            representante: trim(opp['Representante']),
            responsavel: trim(opp['Responsável']),
            etn: user,
            etapa: trim(opp['Etapa']),
            probabilidade: prob.str,
            probNum: prob.num,
            anoPrevisao: year,
            mesPrevisao: month, // CORRIGIDO: agora armazena nome do mês
            mesPrevisaoNum: monthNum,
            mesFech: month,
            valorPrevisto, valorFechado,
            valorUnificado: valorPrevisto,
            valorReconhecido: valorPrevisto,
            valorFechadoReconhecido: valorFechado,
            percentualReconhecimento: 100,
            agenda: userActions.length,
            tipoOportunidade: trim(opp['Tipo de Oportunidade']),
            subtipoOportunidade: trim(opp['Subtipo de Oportunidade']),
            origemOportunidade: trim(opp['Origem da Oportunidade']),
            motivoFechamento: trim(opp['Motivo de Fechamento']),
            motivoPerda: trim(opp['Motivo da Perda']),
            concorrentes: trim(opp['Concorrentes']),
            cidade: trim(opp['Cidade']),
            estado: trim(opp['Estado']),
            cnaeSegmento: trim(opp['CNAE Segmento']),
            categoriaCompromisso: topCat,
            atividadeCompromisso: topAct,
          });
        }
      } else {
        records.push({
          oppId, conta, contaId,
          representante: trim(opp['Representante']),
          responsavel: trim(opp['Responsável']),
          etn: 'Sem Agenda',
          etapa: trim(opp['Etapa']),
          probabilidade: prob.str,
          probNum: prob.num,
          anoPrevisao: year,
          mesPrevisao: month, // CORRIGIDO: agora armazena nome do mês
          mesPrevisaoNum: monthNum,
          mesFech: month,
            valorPrevisto, valorFechado,
            valorUnificado: valorPrevisto,
            valorReconhecido: valorPrevisto,
            valorFechadoReconhecido: valorFechado,
            percentualReconhecimento: 100,
            agenda: 0,
          tipoOportunidade: trim(opp['Tipo de Oportunidade']),
          subtipoOportunidade: trim(opp['Subtipo de Oportunidade']),
          origemOportunidade: trim(opp['Origem da Oportunidade']),
          motivoFechamento: trim(opp['Motivo de Fechamento']),
          motivoPerda: trim(opp['Motivo da Perda']),
          concorrentes: trim(opp['Concorrentes']),
          cidade: trim(opp['Cidade']),
          estado: trim(opp['Estado']),
          cnaeSegmento: trim(opp['CNAE Segmento']),
          categoriaCompromisso: '',
          atividadeCompromisso: '',
        });
      }
    }

    // AGENDAS FALTANTES (CORRIGIDO Item 2):
    const missingAgendas: MissingAgendaRecord[] = [];
    const oppById = new Map<string, Opportunity>();
    for (const opp of opportunities) {
      oppById.set(trim(opp['Oportunidade ID']), opp);
    }

    const oppsByContaId = new Map<string, Opportunity[]>();
    for (const opp of opportunities) {
      const cid = trim(opp['Conta ID']);
      if (cid) {
        if (!oppsByContaId.has(cid)) oppsByContaId.set(cid, []);
        oppsByContaId.get(cid)!.push(opp);
      }
    }

    for (const [etn, contaMap] of Array.from(etnContaOppMap.entries())) {
      for (const [contaId, oppIdsWithAction] of Array.from(contaMap.entries())) {
        // Encontrar o maior sequencial entre as oportunidades com compromisso
        let maxSeqWithAction = 0;
        let bestPrevOppId = '';
        for (const oid of Array.from(oppIdsWithAction)) {
          const seq = extractSequential(oid);
          if (seq > maxSeqWithAction) {
            maxSeqWithAction = seq;
            bestPrevOppId = oid;
          }
        }

        const allOppsForConta = oppsByContaId.get(contaId) || [];
        for (const opp of allOppsForConta) {
          const thisOppId = trim(opp['Oportunidade ID']);
          const thisSeq = extractSequential(thisOppId);

          // NOVA LÓGICA: Só considerar oportunidades com sequencial MAIOR que a original
          if (!oppIdsWithAction.has(thisOppId) && thisSeq > maxSeqWithAction) {
            const etapa = trim(opp['Etapa']);
            const { month: mFech, year: yFech } = parseDate(trim(opp['Previsão de Fechamento']));
            const prob = cleanProb(opp['Prob.']);
            missingAgendas.push({
              oppId: thisOppId,
              conta: trim(opp['Conta']),
              contaId,
              etn,
              etapa,
              probabilidade: prob.str,
              valorPrevisto: parseValue(opp['Valor Previsto']),
              mesFech: mFech,
              anoPrevisao: yFech,
              dataCriacao: trim(opp['Data']) || trim(opp['Data de Criação']) || trim(opp['Data Criação']) || '',
              oppAnteriorId: bestPrevOppId,
              oppAnteriorEtapa: trim(oppById.get(bestPrevOppId)?.[' Etapa'] || ''),
              agendaAnterior: (actionsByOppId.get(bestPrevOppId) || []).length,
            });
          }
        }
      }
    }

      // Extrair opções de filtro
    const filterOptions = {
      years: Array.from(new Set(records.map(r => r.anoPrevisao).filter(Boolean))).sort(),
      months: Array.from(new Set(records.map(r => r.mesPrevisao).filter(Boolean))),
      representantes: filterOLD(Array.from(new Set(records.map(r => r.representante).filter(Boolean))).sort()),
      responsaveis: filterOLD(Array.from(new Set(records.map(r => r.responsavel).filter(Boolean))).sort()),
      etns: filterOLD(Array.from(new Set(records.map(r => r.etn).filter(Boolean))).sort()),
      etapas: Array.from(new Set(records.map(r => r.etapa).filter(Boolean))),
      probabilidades: Array.from(new Set(records.map(r => r.probabilidade).filter(Boolean))).sort(),
      agenda: Array.from(new Set(records.map(r => (r.agenda != null ? r.agenda.toString() : '')).filter(Boolean))).sort((a: string, b: string) => parseInt(a) - parseInt(b)),
      contas: filterOLD(Array.from(new Set(records.map(r => r.conta).filter(Boolean))).sort()),
      tipos: filterOLD(Array.from(new Set(records.map(r => r.tipoOportunidade).filter(Boolean))).sort()),
      subtipos: filterOLD(Array.from(new Set(records.map(r => r.subtipoOportunidade).filter(Boolean))).sort()),
      origens: Array.from(new Set(records.map(r => r.origemOportunidade).filter(Boolean))).sort(),
      segmentos: filterOLD(Array.from(new Set(records.map(r => r.cnaeSegmento).filter(Boolean))).sort()),
    };

    // KPIs básicos (deduplicados por oppId)
    const seenOps = new Set<string>();
    let totalAgendas = 0;
    for (const r of records) {
      if (!seenOps.has(r.oppId)) {
        seenOps.add(r.oppId);
      }
      totalAgendas += r.agenda;
    }

    return {
      records,
      missingAgendas,
      filterOptions,
      kpis: { totalOps: seenOps.size, totalAgendas },
    };
  }, [opportunities, actions]);

  // Funnel data (lazy-evaluated)
  const funnelData = useMemo(() => {
    if (!combinedData?.records) return [];
    const records = combinedData.records;
    const seen = new Set<string>();
    const funnel = new Map<string, { count: number; value: number }>();
    
    for (const r of records) {
      if (seen.has(r.oppId)) continue;
      seen.add(r.oppId);
      const stage = r.etapa || 'Desconhecido';
      const f = funnel.get(stage) || { count: 0, value: 0 };
      f.count++;
      f.value += r.valorPrevisto;
      funnel.set(stage, f);
    }
    
    return Array.from(funnel.entries()).map(([etapa, d]) => ({ etapa, ...d }));
  }, [combinedData]);

  // Forecast funnel (lazy-evaluated)
  const forecastFunnel = useMemo(() => {
    if (!combinedData?.records) return [];
    const records = combinedData.records;
    const seen = new Set<string>();
    const funnel = new Map<string, { count: number; value: number; probs: number[] }>();
    
    for (const r of records) {
      if (seen.has(r.oppId) || r.probNum < 75) continue;
      seen.add(r.oppId);
      const stage = r.etapa || 'Desconhecido';
      const f = funnel.get(stage) || { count: 0, value: 0, probs: [] };
      f.count++;
      f.value += r.valorPrevisto;
      f.probs.push(r.probNum);
      funnel.set(stage, f);
    }
    
    return Array.from(funnel.entries())
      .map(([etapa, d]) => ({
        etapa,
        count: d.count,
        value: d.value,
        avgProb: d.probs.length > 0 ? d.probs.reduce((a, b) => a + b, 0) / d.probs.length : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [combinedData]);

  // ETN Top 10 (lazy-evaluated)
  const etnTop10 = useMemo(() => {
    if (!combinedData?.records) return [];
    const records = combinedData.records;
    const seen = new Set<string>();
    const etnMap = new Map<string, { count: number; value: number }>();
    
    for (const r of records) {
      if (r.probNum < 75 || seen.has(r.oppId)) continue;
      seen.add(r.oppId);
      const e = etnMap.get(r.etn) || { count: 0, value: 0 };
      e.count++;
      e.value += r.valorPrevisto;
      etnMap.set(r.etn, e);
    }
    
    return Array.from(etnMap.entries())
      .map(([name, d]) => ({ name: name.length > 20 ? name.slice(0, 20) + '...' : name, fullName: name, ...d }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [combinedData]);

  // Motivos de perda (lazy-evaluated)
  const motivosPerda = useMemo(() => {
    if (!combinedData?.records) return [];
    const records = combinedData.records;
    const motivoMap = new Map<string, number>();
    
    for (const r of records) {
      if (r.etapa !== 'Fechada e Perdida') continue;
      const motivo = r.motivoPerda || 'Sem motivo';
      motivoMap.set(motivo, (motivoMap.get(motivo) || 0) + r.valorPrevisto);
    }
    
    return Array.from(motivoMap.entries())
      .map(([motivo, value]) => ({ motivo, count: value }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [combinedData]);

  // ETN Conversion Top 10 (lazy-evaluated)
  const etnConversionTop10 = useMemo(() => {
    if (!combinedData?.records) return [];
    const records = combinedData.records;
    const etnMap = new Map<string, { total: number; ganhas: number; perdidas: number }>();
    const seen = new Set<string>();
    
    for (const r of records) {
      if (seen.has(r.oppId)) continue;
      // Filtrar apenas oportunidades com Demonstração Presencial/Remota (normalizado sem acentos)
      const catNorm = (r.categoriaCompromisso || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const hasDemo = catNorm.includes('demonstracao presencial') || catNorm.includes('demonstracao remota');
      if (!hasDemo) continue;
      
      seen.add(r.oppId);
      const e = etnMap.get(r.etn) || { total: 0, ganhas: 0, perdidas: 0 };
      e.total++;
      if (r.etapa === 'Fechada e Ganha') e.ganhas++;
      if (r.etapa === 'Fechada e Perdida') e.perdidas++;
      etnMap.set(r.etn, e);
    }
    
    return Array.from(etnMap.entries())
      .map(([name, d]) => ({
        name: name.length > 20 ? name.slice(0, 20) + '...' : name,
        fullName: name,
        total: d.total,
        ganhas: d.ganhas,
        perdidas: d.perdidas,
        taxaConversao: d.total > 0 ? (d.ganhas / d.total) * 100 : 0,
      }))
      .sort((a, b) => b.taxaConversao - a.taxaConversao)
      .slice(0, 10);
  }, [combinedData]);

  // ETN Recursos X Agendas (lazy-evaluated)
  const etnRecursosAgendas = useMemo(() => {
    if (!combinedData?.records) return [];
    const records = combinedData.records;
    const etnMap = new Map<string, { valor: number; agendas: number }>();
    
    for (const r of records) {
      const e = etnMap.get(r.etn) || { valor: 0, agendas: 0 };
      e.valor += (r.valorUnificado ?? r.valorReconhecido ?? r.valorPrevisto);
      e.agendas += r.agenda;
      etnMap.set(r.etn, e);
    }
    
    return Array.from(etnMap.entries())
      .map(([name, d]) => ({
        name: name.length > 20 ? name.slice(0, 20) + '...' : name,
        fullName: name,
        valor: d.valor,
        agendas: d.agendas,
      }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10);
  }, [combinedData]);

  return combinedData ? {
    records: combinedData.records,
    missingAgendas: combinedData.missingAgendas,
    kpis: combinedData.kpis,
    motivosPerda,
    funnelData,
    forecastFunnel,
    etnTop10,
    etnConversionTop10,
    etnRecursosAgendas,
    filterOptions: combinedData.filterOptions,
  } : null;
}
