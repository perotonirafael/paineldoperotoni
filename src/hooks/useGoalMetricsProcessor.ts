import { useMemo } from 'react';
import type { GoalRecord, PedidoRecord, GoalMetrics } from '@/types/goals';
import type { ProcessedRecord } from './useDataProcessor';
import type { Action, Opportunity } from './useDataProcessor';
import type { MatchedPedidoExport, GoalCompositionExport } from './useAnnualGoalMetrics';
import { findHeaderByCandidates } from '@/lib/headerMatching';
import { isEligibleCommitmentCategory } from '@/lib/commitmentCategories';

export interface GoalMetricsResult {
  metricas: GoalMetrics[];
  goalComposition: GoalCompositionExport[];
  matchedPedidos: MatchedPedidoExport[];
}

function norm(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function resolveColumns(rows: Record<string, any>[], type: 'actions' | 'opportunities') {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];

  if (type === 'actions') {
    return {
      userId: findHeaderByCandidates(headers, ['Id Usuário ERP', 'Id Usuario ERP', 'ID USUARIO ERP']),
      userName: findHeaderByCandidates(headers, ['Usuario', 'Usuário', 'Usuário Ação', 'Responsavel', 'Responsável']),
      category: findHeaderByCandidates(headers, ['Categoria']),
      oppId: findHeaderByCandidates(headers, ['Oportunidade ID', 'ID OPORTUNIDADE']),
    };
  }

  return {
    oppId: findHeaderByCandidates(headers, ['Oportunidade ID', 'ID OPORTUNIDADE']),
    stage: findHeaderByCandidates(headers, ['Etapa']),
    responsible: findHeaderByCandidates(headers, ['Responsável', 'Responsavel', 'PROPRIETARIO OPORTUNIDADE']),
    userId: findHeaderByCandidates(headers, ['Id ERP Usuário', 'Id ERP Usuario', 'ID ERP PROPRIETARIO']),
    pedido: findHeaderByCandidates(headers, ['Pedido']),
  };
}

function getField(row: Record<string, any>, key?: string): string {
  if (!key) return '';
  const value = row[key];
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeYear(value: unknown): string {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  return digits.length === 4 ? digits : '';
}

export const useGoalMetricsProcessor = (
  goals: GoalRecord[],
  pedidos: PedidoRecord[],
  processedData: ProcessedRecord[],
  selectedPeriod: string,
  actions: Action[],
  opportunities: Opportunity[],
): GoalMetricsResult => {
  return useMemo((): GoalMetricsResult => {
    const emptyResult: GoalMetricsResult = { metricas: [], goalComposition: [], matchedPedidos: [] };
    const periodToMonths: Record<string, string[]> = {
      Janeiro: ['Janeiro'],
      Fevereiro: ['Fevereiro'],
      Março: ['Março'],
      '1ºTrimestre': ['Janeiro', 'Fevereiro', 'Março'],
      Abril: ['Abril'],
      Maio: ['Maio'],
      Junho: ['Junho'],
      '2ºTrimestre': ['Abril', 'Maio', 'Junho'],
      Julho: ['Julho'],
      Agosto: ['Agosto'],
      Setembro: ['Setembro'],
      '3ºTrimestre': ['Julho', 'Agosto', 'Setembro'],
      Outubro: ['Outubro'],
      Novembro: ['Novembro'],
      Dezembro: ['Dezembro'],
      '4ºTrimestre': ['Outubro', 'Novembro', 'Dezembro'],
    };

    const months = periodToMonths[selectedPeriod] || [];
    const goalYears = new Set(goals.map((g) => normalizeYear(g.ano)).filter(Boolean));
    console.log('[GOAL_METRICS] start', { selectedPeriod, months: months.length, goalYears: Array.from(goalYears), goals: goals.length, pedidos: pedidos.length });
    if (!months.length || !goals.length) {
      console.log('[GOAL_METRICS] No months or goals. months=', months.length, 'goals=', goals.length);
      return [];
    }

    const actionCols = resolveColumns(actions, 'actions');
    const oppCols = resolveColumns(opportunities, 'opportunities');
    const useRawDataset = actions.length > 0 && opportunities.length > 0;

    console.log('[GOAL_METRICS] Column mapping', {
      actionCols,
      oppCols,
      actionsCount: actions.length,
      opportunitiesCount: opportunities.length,
      pedidosCount: pedidos.length,
      processedDataCount: processedData.length,
      useRawDataset,
    });

    // 0) Collect goal user IDs
    const goalUserIds = new Set(goals.map((g) => g.idUsuario));
    console.log('[GOAL_METRICS] Goal user IDs:', Array.from(goalUserIds));

    // 1) Map user ERP ID → Name (only from raw data when available)
    const userIdToName = new Map<string, string>();

    if (useRawDataset) {
      for (const action of actions as Record<string, any>[]) {
        const userId = getField(action, actionCols.userId);
        const userName = getField(action, actionCols.userName);
        if (userId && userId !== '0' && userName) {
          userIdToName.set(userId, userName);
        }
      }

      for (const opp of opportunities as Record<string, any>[]) {
        const userId = getField(opp, oppCols.userId);
        const userName = getField(opp, oppCols.responsible);
        if (userId && userId !== '0' && userName && !userIdToName.has(userId)) {
          userIdToName.set(userId, userName);
        }
      }
    }

    const goalUserNames = new Map<string, string>();
    for (const userId of goalUserIds) {
      const mapped = userIdToName.get(userId);
      if (mapped) {
        goalUserNames.set(userId, mapped);
      }
    }

    console.log('[GOAL_METRICS] User ID → Name mapping:', Object.fromEntries(userIdToName));
    console.log('[GOAL_METRICS] Goal users resolved:', Object.fromEntries(goalUserNames));

    if (useRawDataset && goalUserNames.size === 0) {
      console.log('[GOAL_METRICS] No goal users could be resolved from raw data. Returning empty metrics.');
      return [];
    }

    // 2) Metas do período
    const hasTotalGestao = goals.some((g) => norm(g.produto).includes('total'));
    const filteredGoals = hasTotalGestao ? goals.filter((g) => norm(g.produto).includes('total')) : goals;

    let metaTotalLicencasServicos = 0;
    let metaTotalRecorrente = 0;

    for (const goal of filteredGoals) {
      let metaValue = 0;
      for (const month of months) {
        if (month === 'Janeiro') metaValue += goal.janeiro;
        else if (month === 'Fevereiro') metaValue += goal.fevereiro;
        else if (month === 'Março') metaValue += goal.marco;
        else if (month === 'Abril') metaValue += goal.abril;
        else if (month === 'Maio') metaValue += goal.maio;
        else if (month === 'Junho') metaValue += goal.junho;
        else if (month === 'Julho') metaValue += goal.julho;
        else if (month === 'Agosto') metaValue += goal.agosto;
        else if (month === 'Setembro') metaValue += goal.setembro;
        else if (month === 'Outubro') metaValue += goal.outubro;
        else if (month === 'Novembro') metaValue += goal.novembro;
        else if (month === 'Dezembro') metaValue += goal.dezembro;
      }

      const rubricaNorm = norm(goal.rubrica);
      if (
        rubricaNorm.includes('setup') ||
        rubricaNorm.includes('licenca') ||
        rubricaNorm.includes('licencas') ||
        rubricaNorm.includes('servicos nao recorrentes') ||
        rubricaNorm.includes('servicos não recorrentes') ||
        (rubricaNorm.includes('servico') && rubricaNorm.includes('nao recorrente'))
      ) {
        metaTotalLicencasServicos += metaValue;
      } else if (rubricaNorm.includes('recorrente') && !rubricaNorm.includes('nao')) {
        metaTotalRecorrente += metaValue;
      }
    }

    console.log(`[GOAL_METRICS] Period="${selectedPeriod}" metaLicServicos=${metaTotalLicencasServicos} metaRecorrente=${metaTotalRecorrente}`);

    // 3) STRICT cross-reference: Only eligible compromissos from goal users
    // Chain: Goal userId → Compromisso userId ERP (eligible category) → Oportunidade ID
    const oppIdsWithValidCategory = new Set<string>();
    const oppIdToEtn = new Map<string, Set<string>>();

    if (useRawDataset) {
      for (const action of actions as Record<string, any>[]) {
        const categoria = getField(action, actionCols.category);
        if (!isEligibleCommitmentCategory(categoria)) continue;

        const actionUserId = getField(action, actionCols.userId);
        // STRICT: only consider compromissos from users that are in the goals file
        if (!actionUserId || !goalUserIds.has(actionUserId)) continue;

        const oppId = getField(action, actionCols.oppId);
        if (!oppId) continue;
        oppIdsWithValidCategory.add(oppId);

        const etn = getField(action, actionCols.userName);
        if (etn) {
          if (!oppIdToEtn.has(oppId)) oppIdToEtn.set(oppId, new Set());
          oppIdToEtn.get(oppId)!.add(etn);
        }
      }
    } else {
      // Fallback for cached/processed data - match by action user ERP ID captured in processedData
      for (const record of processedData) {
        if (!record.oppId) continue;
        if (!isEligibleCommitmentCategory(record.categoriaCompromisso || '')) continue;

        const actionUserId = String(record.actionUserId || '').trim();
        if (!actionUserId || !goalUserIds.has(actionUserId)) continue;

        const etn = record.etn && record.etn !== 'Sem Agenda' ? record.etn : record.responsavel;
        if (!etn) continue;

        oppIdsWithValidCategory.add(record.oppId);
        if (!oppIdToEtn.has(record.oppId)) oppIdToEtn.set(record.oppId, new Set());
        oppIdToEtn.get(record.oppId)!.add(etn);
      }
    }

    // NO fallback to all records - if no eligible compromissos from goal users, return empty
    if (oppIdsWithValidCategory.size === 0) {
      console.log('[GOAL_METRICS] No eligible compromissos from goal users found. Returning empty metrics.');
      return [];
    }

    // 4) From Oportunidades, get "Pedido" number for eligible won opportunities
    // Chain: eligible oppId → Oportunidades row (Fechada e Ganha) → Pedido column value
    const oppIdsFechadaGanha = new Set<string>();
    const oppIdToPedidoNums = new Map<string, Set<string>>();

    if (useRawDataset) {
      for (const opp of opportunities as Record<string, any>[]) {
        const oppId = getField(opp, oppCols.oppId);
        const etapa = getField(opp, oppCols.stage);
        const isWon = etapa === 'Fechada e Ganha' || etapa === 'Fechada e Ganha TR';
        if (isWon && oppIdsWithValidCategory.has(oppId)) {
          oppIdsFechadaGanha.add(oppId);
          const pedidoNum = getField(opp, oppCols.pedido);
          if (pedidoNum) {
            if (!oppIdToPedidoNums.has(oppId)) oppIdToPedidoNums.set(oppId, new Set());
            oppIdToPedidoNums.get(oppId)!.add(pedidoNum);
          }
        }
      }
    } else {
      for (const record of processedData) {
        const isWon = record.etapa === 'Fechada e Ganha' || record.etapa === 'Fechada e Ganha TR';
        if (isWon && oppIdsWithValidCategory.has(record.oppId)) {
          oppIdsFechadaGanha.add(record.oppId);
        }
      }
    }

    // Only ETNs that are goal users with won opps
    const allEtns = new Set<string>();
    for (const [, goalName] of goalUserNames) {
      allEtns.add(goalName);
    }
    for (const etns of oppIdToEtn.values()) {
      for (const etn of etns) allEtns.add(etn);
    }

    if (allEtns.size === 0) allEtns.add('TOTAL');

    // Build a map of NUMERO PEDIDO → Pedido record for fast lookup
    const pedidoByNumero = new Map<string, PedidoRecord[]>();
    // Build a map of ID OPORTUNIDADE → Pedido records for direct lookup (fallback path)
    const pedidoByOppId = new Map<string, PedidoRecord[]>();
    for (const pedido of pedidos) {
      const num = (pedido.numeroPedido || '').trim();
      if (num) {
        if (!pedidoByNumero.has(num)) pedidoByNumero.set(num, []);
        pedidoByNumero.get(num)!.push(pedido);
      }
      const oppId = (pedido.idOportunidade || '').trim();
      if (oppId) {
        if (!pedidoByOppId.has(oppId)) pedidoByOppId.set(oppId, []);
        pedidoByOppId.get(oppId)!.push(pedido);
      }
    }

    console.log('[GOAL_METRICS] OppIds with valid categories from goal users:', oppIdsWithValidCategory.size);
    console.log('[GOAL_METRICS] OppIds Fechada e Ganha:', oppIdsFechadaGanha.size);
    console.log('[GOAL_METRICS] OppId → Pedido nums mappings:', oppIdToPedidoNums.size);
    console.log('[GOAL_METRICS] Pedidos by NUMERO PEDIDO:', pedidoByNumero.size);
    console.log('[GOAL_METRICS] Pedidos by OPP ID (direct):', pedidoByOppId.size);
    console.log('[GOAL_METRICS] ETNs para cálculo:', Array.from(allEtns));

    // 5) Pedidos linked via: oppId → Oportunidades.Pedido → Pedidos.NUMERO PEDIDO
    const etnRealizacao = new Map<string, { realLicenca: number; realServico: number; realRecorrente: number; oppIds: Set<string> }>();
    for (const etn of allEtns) {
      etnRealizacao.set(etn, { realLicenca: 0, realServico: 0, realRecorrente: 0, oppIds: new Set() });
    }

    let pedidosMatchCount = 0;
    let pedidosDateMismatchCount = 0;

    const isPedidoWithinSelectedPeriod = (pedido: PedidoRecord) => {
      const monthMatch = months.includes(pedido.mesFechamento);
      const yearMatch = goalYears.size === 0 || goalYears.has(pedido.anoFechamento);
      return monthMatch && yearMatch;
    };

    for (const oppId of oppIdsFechadaGanha) {
      const etns = oppIdToEtn.get(oppId);
      if (!etns || etns.size === 0) continue;
      const divisor = etns.size;

      // Strategy 1: oppId → Oportunidades.Pedido → Pedidos.NUMERO PEDIDO (raw dataset)
      const pedidoNums = oppIdToPedidoNums.get(oppId);
      let matchedPedidosList: PedidoRecord[] = [];

      if (pedidoNums && pedidoNums.size > 0) {
        for (const pedidoNum of pedidoNums) {
          const found = pedidoByNumero.get(pedidoNum);
          if (found) matchedPedidosList.push(...found);
        }
      }

      // Strategy 2 (fallback): oppId → Pedidos.idOportunidade (direct match)
      if (matchedPedidosList.length === 0) {
        const directMatch = pedidoByOppId.get(oppId);
        if (directMatch) matchedPedidosList = directMatch;
      }

      for (const pedido of matchedPedidosList) {
        if (!isPedidoWithinSelectedPeriod(pedido)) {
          pedidosDateMismatchCount++;
          continue;
        }

        pedidosMatchCount++;
        const licenca = pedido.produtoValorLicenca || 0;
        const servico = pedido.servicoValorLiquido || 0;
        const recorrente = pedido.produtoValorManutencao || 0;

        for (const etn of etns) {
          const real = etnRealizacao.get(etn);
          if (!real) continue;
          real.realLicenca += licenca / divisor;
          real.realServico += servico / divisor;
          real.realRecorrente += recorrente / divisor;
          real.oppIds.add(oppId);
        }
      }
    }

    // 6) Metrics per ETN + TOTAL
    let totalRealLicenca = 0;
    let totalRealServico = 0;
    let totalRealRecorrente = 0;

    const etnResults = Array.from(allEtns).map((etn) => {
      const real = etnRealizacao.get(etn) || { realLicenca: 0, realServico: 0, realRecorrente: 0, oppIds: new Set<string>() };
      totalRealLicenca += real.realLicenca;
      totalRealServico += real.realServico;
      totalRealRecorrente += real.realRecorrente;

      const realLicencasServicos = real.realLicenca + real.realServico;
      const percentualLicencas = metaTotalLicencasServicos > 0
        ? (realLicencasServicos / metaTotalLicencasServicos) * 100
        : 0;
      const percentualRecorrente = metaTotalRecorrente > 0
        ? (real.realRecorrente / metaTotalRecorrente) * 100
        : 0;
      const percentualAtingimento = percentualLicencas * 0.5 + percentualRecorrente * 0.5;

      return {
        idUsuario: goals[0]?.idUsuario || '',
        etn,
        periodo: selectedPeriod,
        metaLicencasServicos: metaTotalLicencasServicos,
        realLicencasServicos,
        realLicenca: real.realLicenca,
        realServico: real.realServico,
        metaRecorrente: metaTotalRecorrente,
        realRecorrente: real.realRecorrente,
        percentualAtingimento,
      } satisfies GoalMetrics;
    });

    const totalRealLicServicos = totalRealLicenca + totalRealServico;
    const percentualLicTotal = metaTotalLicencasServicos > 0
      ? (totalRealLicServicos / metaTotalLicencasServicos) * 100
      : 0;
    const percentualRecTotal = metaTotalRecorrente > 0
      ? (totalRealRecorrente / metaTotalRecorrente) * 100
      : 0;

    const totalMetric: GoalMetrics = {
      idUsuario: goals[0]?.idUsuario || '',
      etn: 'TOTAL',
      periodo: selectedPeriod,
      metaLicencasServicos: metaTotalLicencasServicos,
      realLicencasServicos: totalRealLicServicos,
      realLicenca: totalRealLicenca,
      realServico: totalRealServico,
      metaRecorrente: metaTotalRecorrente,
      realRecorrente: totalRealRecorrente,
      percentualAtingimento: percentualLicTotal * 0.5 + percentualRecTotal * 0.5,
    };

    console.log(`[GOAL_METRICS] Pedidos matched in selected period/year: ${pedidosMatchCount} of ${pedidos.length} (ignored by date=${pedidosDateMismatchCount})`);
    console.log(`[GOAL_METRICS] TOTAL: realLicenca=${totalRealLicenca} realServico=${totalRealServico} realRecorrente=${totalRealRecorrente} atingimento=${totalMetric.percentualAtingimento.toFixed(1)}%`);

    for (const [goalUserId, goalName] of goalUserNames.entries()) {
      const etnMetric = etnResults.find((m) => m.etn === goalName);
      console.log('[GOAL_METRICS][AUDIT]', {
        goalUserId,
        goalName,
        found: Boolean(etnMetric),
        realLicenca: etnMetric?.realLicenca ?? 0,
        realServico: etnMetric?.realServico ?? 0,
        realRecorrente: etnMetric?.realRecorrente ?? 0,
        atingimento: Number((etnMetric?.percentualAtingimento ?? 0).toFixed(2)),
      });
    }

    return [totalMetric, ...etnResults];
  }, [goals, pedidos, processedData, selectedPeriod, actions, opportunities]);

  return metricas;
};
