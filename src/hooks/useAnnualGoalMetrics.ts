import { useMemo } from 'react';
import type { GoalRecord, PedidoRecord, GoalMetrics } from '@/types/goals';
import type { Action, Opportunity, ProcessedRecord } from './useDataProcessor';
import { findHeaderByCandidates } from '@/lib/headerMatching';
import { isEligibleCommitmentCategory } from '@/lib/commitmentCategories';
import { isLicencaServicoGoalRubrica, isRecurringGoalRubrica } from '@/lib/goalRubricas';
import { aggregateEligiblePedidoRows } from '@/lib/pedidoMetrics';

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

export interface AnnualMonthData {
  mes: string;
  metaLicServAcum: number;
  realLicServAcum: number;
  metaRecorrenteAcum: number;
  realRecorrenteAcum: number;
  atingimentoAcum: number;
}

export interface MatchedPedidoExport {
  numeroPedido: string;
  idOportunidade: string;
  etapaOportunidade: string;
  proprietario: string;
  idErpProprietario: string;
  dataFechamento: string;
  anoFechamento: string;
  mesFechamento: string;
  produto: string;
  produtoCodigoModulo: string;
  produtoModulo: string;
  valorLicenca: number;
  valorLicencaCanal: number;
  valorManutencao: number;
  valorManutencaoCanal: number;
  servico: string;
  servicoTipoDeFaturamento: string;
  servicoQtdeDeHoras: number;
  servicoValorHora: number;
  servicoValorBruto: number;
  servicoValorOver: number;
  servicoValorDesconto: number;
  servicoValorCanal: number;
  servicoValorLiquido: number;
}

export interface GoalCompositionExport {
  produto: string;
  rubrica: string;
  janeiro: number;
  fevereiro: number;
  marco: number;
  abril: number;
  maio: number;
  junho: number;
  julho: number;
  agosto: number;
  setembro: number;
  outubro: number;
  novembro: number;
  dezembro: number;
  totalAno: number;
}

export interface AnnualGoalResult {
  metaLicencasServicos: number;
  realLicencasServicos: number;
  realLicenca: number;
  realServico: number;
  metaRecorrente: number;
  realRecorrente: number;
  percentualAtingimento: number;
  monthlyData: AnnualMonthData[];
  goalComposition: GoalCompositionExport[];
  matchedPedidos: MatchedPedidoExport[];
}

export const useAnnualGoalMetrics = (
  goals: GoalRecord[],
  pedidos: PedidoRecord[],
  actions: Action[],
  opportunities: Opportunity[],
  processedData: ProcessedRecord[],
  selectedYear?: string,
): AnnualGoalResult | null => {
  return useMemo(() => {
    if (!goals.length || !pedidos.length) {
      console.log('[ANNUAL_GOAL] No goals or pedidos');
      return null;
    }

    const goalYears = new Set(goals.map(g => normalizeYear(g.ano)).filter(Boolean));
    const targetYear = selectedYear || (goalYears.size > 0 ? Array.from(goalYears)[0] : '');
    if (!targetYear) { console.log('[ANNUAL_GOAL] No target year'); return null; }

    // If selected year has no goals, don't show the chart
    if (!goalYears.has(targetYear)) {
      console.log('[ANNUAL_GOAL] No goals for year', targetYear);
      return null;
    }

    const actionCols = resolveColumns(actions, 'actions');
    const oppCols = resolveColumns(opportunities, 'opportunities');
    const useRawDataset = actions.length > 0 && opportunities.length > 0;

    console.log('[ANNUAL_GOAL] start', { targetYear, goals: goals.length, pedidos: pedidos.length, actions: actions.length, opportunities: opportunities.length, processedData: processedData.length, useRawDataset });

    const goalUserIds = new Set(goals.map(g => g.idUsuario));
    console.log('[ANNUAL_GOAL] Goal user IDs:', Array.from(goalUserIds));

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
    } else {
      for (const record of processedData) {
        if (!record.oppId) continue;
        if (!isEligibleCommitmentCategory(record.categoriaCompromisso || '')) continue;
        const actionUserId = String(record.actionUserId || '').trim();
        if (!actionUserId || !goalUserIds.has(actionUserId)) continue;
        oppIdsWithValidCategory.add(record.oppId);
      }
    }

    console.log('[ANNUAL_GOAL] Eligible opp IDs from compromissos:', oppIdsWithValidCategory.size);
    if (oppIdsWithValidCategory.size === 0) {
      console.log('[ANNUAL_GOAL] No eligible compromissos. Returning null.');
      return null;
    }

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

    console.log('[ANNUAL_GOAL] Won opps:', oppIdsFechadaGanha.size, 'with pedido nums:', oppIdToPedidoNums.size);

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

    const hasTotalGestao = goals.some(g => norm(g.produto).includes('total'));
    const filteredGoals = hasTotalGestao ? goals.filter(g => norm(g.produto).includes('total')) : goals;

    const monthlyMetaLicServ: number[] = new Array(12).fill(0);
    const monthlyMetaRecorrente: number[] = new Array(12).fill(0);

    for (let i = 0; i < 12; i++) {
      const month = ALL_MONTHS[i];
      const key = MONTH_KEYS[month];
      for (const goal of filteredGoals) {
        const metaValue = (goal[key] as number) || 0;
        if (isLicencaServicoGoalRubrica(goal.rubrica)) {
          monthlyMetaLicServ[i] += metaValue;
        } else if (isRecurringGoalRubrica(goal.rubrica)) {
          monthlyMetaRecorrente[i] += metaValue;
        }
      }
    }

    // Goal composition for export
    const goalComposition: GoalCompositionExport[] = filteredGoals.map(g => ({
      produto: g.produto,
      rubrica: g.rubrica,
      janeiro: g.janeiro,
      fevereiro: g.fevereiro,
      marco: g.marco,
      abril: g.abril,
      maio: g.maio,
      junho: g.junho,
      julho: g.julho,
      agosto: g.agosto,
      setembro: g.setembro,
      outubro: g.outubro,
      novembro: g.novembro,
      dezembro: g.dezembro,
      totalAno: g.totalAno,
    }));

    // 6) Calculate realized per month
    const monthlyRealLicenca: number[] = new Array(12).fill(0);
    const monthlyRealServico: number[] = new Array(12).fill(0);
    const monthlyRealRecorrente: number[] = new Array(12).fill(0);
    const allMatchedPedidos: MatchedPedidoExport[] = [];

    let pedidosMatched = 0;
    for (const oppId of oppIdsFechadaGanha) {
      const pedidoNums = oppIdToPedidoNums.get(oppId);
      let matched: PedidoRecord[] = [];

      if (pedidoNums && pedidoNums.size > 0) {
        for (const num of pedidoNums) {
          const found = pedidoByNumero.get(num);
          if (found) matched.push(...found);
        }
      }
      if (matched.length === 0) {
        const direct = pedidoByOppId.get(oppId);
        if (direct) matched = direct;
      }

      const eligibleRows = aggregateEligiblePedidoRows(matched);

      for (const pedido of eligibleRows) {
        if (pedido.anoFechamento !== targetYear) continue;
        const monthIdx = ALL_MONTHS.indexOf(pedido.mesFechamento);
        if (monthIdx === -1) continue;

        pedidosMatched++;
        monthlyRealLicenca[monthIdx] += (pedido.produtoValorLicenca || 0);
        monthlyRealServico[monthIdx] += (pedido.servicoValorLiquido || 0);
        monthlyRealRecorrente[monthIdx] += (pedido.produtoValorManutencao || 0);

        allMatchedPedidos.push({
          numeroPedido: pedido.numeroPedido,
          idOportunidade: pedido.idOportunidade,
          etapaOportunidade: pedido.idEtapaOportunidade,
          proprietario: pedido.proprietarioOportunidade,
          idErpProprietario: pedido.idErpProprietario,
          dataFechamento: pedido.dataFechamento,
          anoFechamento: pedido.anoFechamento,
          mesFechamento: pedido.mesFechamento,
          produto: pedido.produto,
          produtoCodigoModulo: pedido.produtoCodigoModulo,
          produtoModulo: pedido.produtoModulo,
          valorLicenca: pedido.produtoValorLicenca || 0,
          valorLicencaCanal: pedido.produtoValorLicencaCanal || 0,
          valorManutencao: pedido.produtoValorManutencao || 0,
          valorManutencaoCanal: pedido.produtoValorManutencaoCanal || 0,
          servico: pedido.servico,
          servicoTipoDeFaturamento: pedido.servicoTipoDeFaturamento,
          servicoQtdeDeHoras: pedido.servicoQtdeDeHoras || 0,
          servicoValorHora: pedido.servicoValorHora || 0,
          servicoValorBruto: pedido.servicoValorBruto || 0,
          servicoValorOver: pedido.servicoValorOver || 0,
          servicoValorDesconto: pedido.servicoValorDesconto || 0,
          servicoValorCanal: pedido.servicoValorCanal || 0,
          servicoValorLiquido: pedido.servicoValorLiquido || 0,
        });
      }
    }

    console.log('[ANNUAL_GOAL] Pedidos matched:', pedidosMatched);

    // 7) Build cumulative monthly data + totals
    const monthlyData: AnnualMonthData[] = [];
    let acumMetaLS = 0, acumRealLS = 0, acumMetaR = 0, acumRealR = 0;
    let totalRealLicenca = 0, totalRealServico = 0, totalRealRecorrente = 0;
    let metaTotalLicServ = 0, metaTotalRecorrente = 0;

    for (let i = 0; i < 12; i++) {
      acumMetaLS += monthlyMetaLicServ[i];
      acumRealLS += monthlyRealLicenca[i] + monthlyRealServico[i];
      acumMetaR += monthlyMetaRecorrente[i];
      acumRealR += monthlyRealRecorrente[i];
      totalRealLicenca += monthlyRealLicenca[i];
      totalRealServico += monthlyRealServico[i];
      totalRealRecorrente += monthlyRealRecorrente[i];
      metaTotalLicServ += monthlyMetaLicServ[i];
      metaTotalRecorrente += monthlyMetaRecorrente[i];

      const pctLS = acumMetaLS > 0 ? (acumRealLS / acumMetaLS) * 100 : 0;
      const pctR = acumMetaR > 0 ? (acumRealR / acumMetaR) * 100 : 0;

      monthlyData.push({
        mes: ALL_MONTHS[i].substring(0, 3),
        metaLicServAcum: acumMetaLS,
        realLicServAcum: acumRealLS,
        metaRecorrenteAcum: acumMetaR,
        realRecorrenteAcum: acumRealR,
        atingimentoAcum: pctLS * 0.5 + pctR * 0.5,
      });
    }

    const realLicencasServicos = totalRealLicenca + totalRealServico;
    const pctLS = metaTotalLicServ > 0 ? (realLicencasServicos / metaTotalLicServ) * 100 : 0;
    const pctR = metaTotalRecorrente > 0 ? (totalRealRecorrente / metaTotalRecorrente) * 100 : 0;

    console.log('[ANNUAL_GOAL] Totals:', {
      metaLS: metaTotalLicServ, realLS: realLicencasServicos,
      metaR: metaTotalRecorrente, realR: totalRealRecorrente,
      atingimento: (pctLS * 0.5 + pctR * 0.5).toFixed(1),
    });

    return {
      metaLicencasServicos: metaTotalLicServ,
      realLicencasServicos,
      realLicenca: totalRealLicenca,
      realServico: totalRealServico,
      metaRecorrente: metaTotalRecorrente,
      realRecorrente: totalRealRecorrente,
      percentualAtingimento: pctLS * 0.5 + pctR * 0.5,
      monthlyData,
      goalComposition,
      matchedPedidos: allMatchedPedidos,
    };
  }, [goals, pedidos, actions, opportunities, processedData, selectedYear]);
};
