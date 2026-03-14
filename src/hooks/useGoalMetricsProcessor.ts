import { useMemo } from 'react';
import type { GoalRecord, PedidoRecord, GoalMetrics } from '@/types/goals';
import type { ProcessedRecord } from './useDataProcessor';
import type { Action, Opportunity } from './useDataProcessor';

/**
 * Normalize string for comparison: remove accents, lowercase, trim.
 */
function norm(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Valid commitment categories for goal calculation.
 * Stored normalized for comparison.
 */
const VALID_CATEGORIES_NORMALIZED = new Set([
  'demonstracao presencial',
  'demonstracao remota',
  'analise de aderencia',
  'analise de rfp/rfi',
  'etn apoio',
  'termo de referencia',
  'edital',
  'analise arquiteto de software - exclusivo gtn',
]);

function isValidCategory(categoria: string): boolean {
  return VALID_CATEGORIES_NORMALIZED.has(norm(categoria));
}

/**
 * Processa metas e pedidos para calcular % de atingimento.
 *
 * Fluxo:
 * 1. Construir mapa userErpId → ETN name (via actions + opportunities)
 * 2. Filtrar compromissos (actions) com categorias válidas → obter oppIds
 * 3. Filtrar oportunidades com status "Fechada e Ganha" → intersectar com oppIds
 * 4. Somar pedidos ligados a essas oportunidades filtradas
 * 5. Calcular % de atingimento com pesos (50% Lic+Serv, 50% Recorrente)
 */
export const useGoalMetricsProcessor = (
  goals: GoalRecord[],
  pedidos: PedidoRecord[],
  processedData: ProcessedRecord[],
  selectedPeriod: string,
  actions: Action[],
  opportunities: Opportunity[]
) => {
  const metricas = useMemo((): GoalMetrics[] => {
    const periodToMonths: Record<string, string[]> = {
      'Janeiro': ['Janeiro'],
      'Fevereiro': ['Fevereiro'],
      'Março': ['Março'],
      '1ºTrimestre': ['Janeiro', 'Fevereiro', 'Março'],
      'Abril': ['Abril'],
      'Maio': ['Maio'],
      'Junho': ['Junho'],
      '2ºTrimestre': ['Abril', 'Maio', 'Junho'],
      'Julho': ['Julho'],
      'Agosto': ['Agosto'],
      'Setembro': ['Setembro'],
      '3ºTrimestre': ['Julho', 'Agosto', 'Setembro'],
      'Outubro': ['Outubro'],
      'Novembro': ['Novembro'],
      'Dezembro': ['Dezembro'],
      '4ºTrimestre': ['Outubro', 'Novembro', 'Dezembro'],
    };

    const months = periodToMonths[selectedPeriod] || [];
    if (!months.length || !goals.length) {
      console.log('[GOAL_METRICS] No months or goals. months=', months.length, 'goals=', goals.length);
      return [];
    }

    // ── Build User ERP ID → ETN Name mapping ──
    const userIdToName = new Map<string, string>();

    // From actions: "Id Usuário ERP" → "Usuario"
    for (const action of actions) {
      const userId = String(action['Id Usuário ERP'] || action['Id Usuario ERP'] || '').trim();
      const userName = String(action['Usuario'] || action['Usuário'] || '').trim();
      if (userId && userId !== '0' && userName) {
        userIdToName.set(userId, userName);
      }
    }

    // From opportunities: "Id ERP Usuário" → "Responsável"
    for (const opp of opportunities) {
      const userId = String(opp['Id ERP Usuário'] || opp['Id ERP Usuario'] || '').trim();
      const userName = String(opp['Responsável'] || opp['Responsavel'] || '').trim();
      if (userId && userId !== '0' && userName) {
        if (!userIdToName.has(userId)) {
          userIdToName.set(userId, userName);
        }
      }
    }

    console.log('[GOAL_METRICS] User ID → Name mapping:', Object.fromEntries(userIdToName));

    // ── Identify goal user's ETN name ──
    const goalUserIds = new Set(goals.map(g => g.idUsuario));
    const goalUserNames = new Map<string, string>();
    for (const userId of goalUserIds) {
      const name = userIdToName.get(userId);
      if (name) {
        goalUserNames.set(userId, name);
        console.log(`[GOAL_METRICS] Goal user ${userId} = "${name}"`);
      } else {
        console.warn(`[GOAL_METRICS] Could not find ETN name for goal user ID "${userId}". Available IDs:`, Array.from(userIdToName.keys()).slice(0, 20));
      }
    }

    // ── Filter goals: avoid double-counting ──
    // If "Total Gestão" rows exist, use only those. Otherwise use individual products.
    const hasTotalGestao = goals.some(g => norm(g.produto).includes('total'));
    const filteredGoals = hasTotalGestao
      ? goals.filter(g => norm(g.produto).includes('total'))
      : goals;

    console.log(`[GOAL_METRICS] Using ${filteredGoals.length} goal rows (hasTotalGestao=${hasTotalGestao})`);

    // ── Calculate target for selected period ──
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
        rubricaNorm.includes('licencas')
      ) {
        metaTotalLicencasServicos += metaValue;
      } else if (
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

    // ── STEP 1: Filter actions with valid categories → get oppIds ──
    const oppIdsWithValidCategory = new Set<string>();
    const oppIdToEtn = new Map<string, Set<string>>();

    for (const action of actions) {
      const categoria = (action['Categoria'] || '').toString().trim();
      if (!isValidCategory(categoria)) continue;

      const oppId = String(action['Oportunidade ID'] || '').trim();
      if (!oppId) continue;

      oppIdsWithValidCategory.add(oppId);

      // Map oppId → ETN (user name from action)
      const etn = (action['Usuario'] || action['Usuário'] || '').toString().trim();
      if (etn) {
        if (!oppIdToEtn.has(oppId)) oppIdToEtn.set(oppId, new Set());
        oppIdToEtn.get(oppId)!.add(etn);
      }
    }

    console.log(`[GOAL_METRICS] OppIds with valid categories: ${oppIdsWithValidCategory.size}`);
    console.log(`[GOAL_METRICS] OppId→ETN mappings: ${oppIdToEtn.size}`);

    // ── STEP 2: Filter opportunities "Fechada e Ganha" ──
    const oppIdsFechadaGanha = new Set<string>();

    for (const opp of opportunities) {
      const oppId = String(opp['Oportunidade ID'] || '').trim();
      const etapa = (opp['Etapa'] || '').toString().trim();
      if ((etapa === 'Fechada e Ganha' || etapa === 'Fechada e Ganha TR') && oppIdsWithValidCategory.has(oppId)) {
        oppIdsFechadaGanha.add(oppId);
      }
    }

    console.log(`[GOAL_METRICS] OppIds Fechada e Ganha with valid categories: ${oppIdsFechadaGanha.size}`);

    // ── Collect all ETNs from valid oppIds ──
    const allEtns = new Set<string>();
    for (const [oppId, etns] of Array.from(oppIdToEtn.entries())) {
      if (oppIdsFechadaGanha.has(oppId)) {
        for (const etn of Array.from(etns)) allEtns.add(etn);
      }
    }

    // Also add ETNs from processedData if no valid opps found
    if (allEtns.size === 0 && processedData.length > 0) {
      // Use goal user names if available
      for (const [, name] of goalUserNames) {
        allEtns.add(name);
      }
      // Fallback: use all ETNs from processed data
      if (allEtns.size === 0) {
        for (const r of processedData) {
          if (r.etn && r.etn !== 'Sem Agenda') allEtns.add(r.etn);
        }
      }
    }

    if (allEtns.size === 0) allEtns.add('TOTAL');

    console.log(`[GOAL_METRICS] ETNs for metrics:`, Array.from(allEtns));

    // ── STEP 3: Sum pedidos linked to qualified opportunities ──
    const etnRealizacao = new Map<string, { realLicencasServicos: number; realRecorrente: number }>();
    for (const etn of Array.from(allEtns)) {
      etnRealizacao.set(etn, { realLicencasServicos: 0, realRecorrente: 0 });
    }

    let pedidosMatchCount = 0;
    for (const pedido of pedidos) {
      const oppId = pedido.idOportunidade.toString().trim();
      if (!oppIdsFechadaGanha.has(oppId)) continue;

      pedidosMatchCount++;
      const licServicos = (pedido.produtoValorLicenca || 0) + (pedido.servicoValorLiquido || 0);
      const recorrente = pedido.produtoValorManutencao || 0;

      // Distribute among ETNs of the opportunity
      const etns = oppIdToEtn.get(oppId);
      if (etns && etns.size > 0) {
        const numEtns = etns.size;
        for (const etn of Array.from(etns)) {
          const real = etnRealizacao.get(etn);
          if (real) {
            real.realLicencasServicos += licServicos / numEtns;
            real.realRecorrente += recorrente / numEtns;
          }
        }
      }
    }

    console.log(`[GOAL_METRICS] Pedidos matched: ${pedidosMatchCount} of ${pedidos.length}`);

    // ── STEP 4: Calculate metrics per ETN + TOTAL ──
    let totalRealLicServicos = 0;
    let totalRealRecorrente = 0;

    const etnResults = Array.from(allEtns).map((etn) => {
      const real = etnRealizacao.get(etn) || { realLicencasServicos: 0, realRecorrente: 0 };

      totalRealLicServicos += real.realLicencasServicos;
      totalRealRecorrente += real.realRecorrente;

      const percentualLicencas = metaTotalLicencasServicos > 0
        ? (real.realLicencasServicos / metaTotalLicencasServicos) * 100
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
        realLicencasServicos: real.realLicencasServicos,
        metaRecorrente: metaTotalRecorrente,
        realRecorrente: real.realRecorrente,
        percentualAtingimento,
      };
    });

    // Add TOTAL row
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
      metaRecorrente: metaTotalRecorrente,
      realRecorrente: totalRealRecorrente,
      percentualAtingimento: percentualLicTotal * 0.5 + percentualRecTotal * 0.5,
    };

    console.log(`[GOAL_METRICS] TOTAL: realLicServicos=${totalRealLicServicos} realRecorrente=${totalRealRecorrente} atingimento=${totalMetric.percentualAtingimento.toFixed(1)}%`);

    // Log per-ETN audit for goal user
    for (const [userId, name] of goalUserNames) {
      const etnMetric = etnResults.find(m => m.etn === name);
      if (etnMetric) {
        console.log(`[GOAL_METRICS] AUDIT "${name}" (ID ${userId}): realLicServicos=${etnMetric.realLicencasServicos} realRecorrente=${etnMetric.realRecorrente} atingimento=${etnMetric.percentualAtingimento.toFixed(1)}%`);
      } else {
        console.log(`[GOAL_METRICS] AUDIT "${name}" (ID ${userId}): NOT FOUND in ETN results`);
      }
    }

    return [totalMetric, ...etnResults];
  }, [goals, pedidos, processedData, selectedPeriod, actions, opportunities]);

  return metricas;
};
