import { useMemo } from 'react';
import type { GoalRecord, PedidoRecord, GoalMetrics } from '@/types/goals';
import type { Action, Opportunity } from './useDataProcessor';
import { findHeaderByCandidates } from '@/lib/headerMatching';
import { isEligibleCommitmentCategory } from '@/lib/commitmentCategories';

function norm(s: string): string {
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
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

const ALL_MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const MONTH_KEYS: Record<string, keyof GoalRecord> = {
  Janeiro: 'janeiro', Fevereiro: 'fevereiro', Março: 'marco',
  Abril: 'abril', Maio: 'maio', Junho: 'junho',
  Julho: 'julho', Agosto: 'agosto', Setembro: 'setembro',
  Outubro: 'outubro', Novembro: 'novembro', Dezembro: 'dezembro',
};

export interface AnnualGoalResult {
  metaLicencasServicos: number;
  realLicencasServicos: number;
  realLicenca: number;
  realServico: number;
  metaRecorrente: number;
  realRecorrente: number;
  percentualAtingimento: number;
  monthlyData: AnnualMonthData[];
}

export interface AnnualMonthData {
  mes: string;
  metaLicServAcum: number;
  realLicServAcum: number;
  metaRecorrenteAcum: number;
  realRecorrenteAcum: number;
}

/**
 * Uses the EXACT same cross-referencing chain as useGoalMetricsProcessor:
 * Goal userId → Compromisso (eligible category) → Oportunidade (Fechada e Ganha) → Pedido
 * But accumulates ALL months of the year instead of filtering by period.
 */
export const useAnnualGoalMetrics = (
  goals: GoalRecord[],
  pedidos: PedidoRecord[],
  actions: Action[],
  opportunities: Opportunity[],
  selectedYear?: string,
): AnnualGoalResult | null => {
  return useMemo(() => {
    if (!goals.length || !pedidos.length) return null;

    const goalYears = new Set(goals.map(g => normalizeYear(g.ano)).filter(Boolean));
    const targetYear = selectedYear || (goalYears.size > 0 ? Array.from(goalYears)[0] : '');
    if (!targetYear) return null;

    const actionCols = resolveColumns(actions, 'actions');
    const oppCols = resolveColumns(opportunities, 'opportunities');
    const useRawDataset = actions.length > 0 && opportunities.length > 0;

    // 0) Goal user IDs
    const goalUserIds = new Set(goals.map(g => g.idUsuario));

    // 1) Map user ERP ID → Name
    const userIdToName = new Map<string, string>();
    if (useRawDataset) {
      for (const action of actions as Record<string, any>[]) {
        const userId = getField(action, actionCols.userId);
        const userName = getField(action, actionCols.userName);
        if (userId && userId !== '0' && userName) userIdToName.set(userId, userName);
      }
      for (const opp of opportunities as Record<string, any>[]) {
        const userId = getField(opp, oppCols.userId);
        const userName = getField(opp, oppCols.responsible);
        if (userId && userId !== '0' && userName && !userIdToName.has(userId)) userIdToName.set(userId, userName);
      }
    }

    // Check at least one goal user is resolved
    let hasResolvedUser = false;
    for (const uid of goalUserIds) {
      if (userIdToName.has(uid)) { hasResolvedUser = true; break; }
    }
    if (useRawDataset && !hasResolvedUser) return null;

    // 2) Eligible opp IDs from goal users (same chain as useGoalMetricsProcessor)
    const oppIdsWithValidCategory = new Set<string>();
    if (useRawDataset) {
      for (const action of actions as Record<string, any>[]) {
        const categoria = getField(action, actionCols.category);
        if (!isEligibleCommitmentCategory(categoria)) continue;
        const actionUserId = getField(action, actionCols.userId);
        if (!actionUserId || !goalUserIds.has(actionUserId)) continue;
        const oppId = getField(action, actionCols.oppId);
        if (oppId) oppIdsWithValidCategory.add(oppId);
      }
    }

    if (oppIdsWithValidCategory.size === 0 && useRawDataset) return null;

    // 3) Won opp IDs + pedido nums
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
    }

    // 4) Build pedido lookups
    const pedidoByNumero = new Map<string, PedidoRecord[]>();
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

    // 5) Calculate metas (same rubrica logic)
    const hasTotalGestao = goals.some(g => norm(g.produto).includes('total'));
    const filteredGoals = hasTotalGestao ? goals.filter(g => norm(g.produto).includes('total')) : goals;

    let metaTotalLicServ = 0;
    let metaTotalRecorrente = 0;
    const monthlyMetaLicServ: number[] = [];
    const monthlyMetaRecorrente: number[] = [];

    for (const month of ALL_MONTHS) {
      let metaLS = 0;
      let metaRec = 0;
      for (const goal of filteredGoals) {
        const key = MONTH_KEYS[month];
        const metaValue = (goal[key] as number) || 0;
        const rubricaNorm = norm(goal.rubrica);
        if (
          rubricaNorm.includes('setup') || rubricaNorm.includes('licenca') ||
          rubricaNorm.includes('licencas') || rubricaNorm.includes('servicos nao recorrentes') ||
          rubricaNorm.includes('servicos não recorrentes') ||
          (rubricaNorm.includes('servico') && rubricaNorm.includes('nao recorrente'))
        ) {
          metaLS += metaValue;
        } else if (rubricaNorm.includes('recorrente') && !rubricaNorm.includes('nao')) {
          metaRec += metaValue;
        }
      }
      monthlyMetaLicServ.push(metaLS);
      monthlyMetaRecorrente.push(metaRec);
      metaTotalLicServ += metaLS;
      metaTotalRecorrente += metaRec;
    }

    // 6) Calculate realized per month using the SAME chain
    const monthNameToIdx: Record<string, number> = {};
    ALL_MONTHS.forEach((m, i) => { monthNameToIdx[m] = i; });

    const monthlyRealLicenca: number[] = new Array(12).fill(0);
    const monthlyRealServico: number[] = new Array(12).fill(0);
    const monthlyRealRecorrente: number[] = new Array(12).fill(0);

    for (const oppId of oppIdsFechadaGanha) {
      const pedidoNums = oppIdToPedidoNums.get(oppId);
      let matchedPedidos: PedidoRecord[] = [];

      if (pedidoNums && pedidoNums.size > 0) {
        for (const num of pedidoNums) {
          const found = pedidoByNumero.get(num);
          if (found) matchedPedidos.push(...found);
        }
      }
      if (matchedPedidos.length === 0) {
        const direct = pedidoByOppId.get(oppId);
        if (direct) matchedPedidos = direct;
      }

      for (const pedido of matchedPedidos) {
        if (pedido.anoFechamento !== targetYear) continue;
        const monthIdx = monthNameToIdx[pedido.mesFechamento];
        if (monthIdx === undefined) continue;

        monthlyRealLicenca[monthIdx] += (pedido.produtoValorLicenca || 0);
        monthlyRealServico[monthIdx] += (pedido.servicoValorLiquido || 0);
        monthlyRealRecorrente[monthIdx] += (pedido.produtoValorManutencao || 0);
      }
    }

    // 7) Build cumulative monthly data + totals
    const monthlyData: AnnualMonthData[] = [];
    let acumMetaLS = 0, acumRealLS = 0, acumMetaR = 0, acumRealR = 0;
    let totalRealLicenca = 0, totalRealServico = 0, totalRealRecorrente = 0;

    for (let i = 0; i < 12; i++) {
      acumMetaLS += monthlyMetaLicServ[i];
      acumRealLS += monthlyRealLicenca[i] + monthlyRealServico[i];
      acumMetaR += monthlyMetaRecorrente[i];
      acumRealR += monthlyRealRecorrente[i];
      totalRealLicenca += monthlyRealLicenca[i];
      totalRealServico += monthlyRealServico[i];
      totalRealRecorrente += monthlyRealRecorrente[i];

      monthlyData.push({
        mes: ALL_MONTHS[i].substring(0, 3),
        metaLicServAcum: acumMetaLS,
        realLicServAcum: acumRealLS,
        metaRecorrenteAcum: acumMetaR,
        realRecorrenteAcum: acumRealR,
      });
    }

    const realLicencasServicos = totalRealLicenca + totalRealServico;
    const pctLS = metaTotalLicServ > 0 ? (realLicencasServicos / metaTotalLicServ) * 100 : 0;
    const pctR = metaTotalRecorrente > 0 ? (totalRealRecorrente / metaTotalRecorrente) * 100 : 0;

    return {
      metaLicencasServicos: metaTotalLicServ,
      realLicencasServicos,
      realLicenca: totalRealLicenca,
      realServico: totalRealServico,
      metaRecorrente: metaTotalRecorrente,
      realRecorrente: totalRealRecorrente,
      percentualAtingimento: pctLS * 0.5 + pctR * 0.5,
      monthlyData,
    };
  }, [goals, pedidos, actions, opportunities, selectedYear]);
};
