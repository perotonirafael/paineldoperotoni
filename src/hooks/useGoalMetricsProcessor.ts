import { useMemo } from 'react';
import type { GoalRecord, PedidoRecord, GoalMetrics } from '@/types/goals';
import type { ProcessedRecord } from './useDataProcessor';
import type { Action, Opportunity } from './useDataProcessor';

/**
 * Categorias de compromisso válidas para cálculo de metas.
 */
const VALID_CATEGORIES = new Set([
  'Demonstracao Presencial',
  'Demonstracao Remota',
  'Analise de aderencia',
  'Analise de RFP/RFI',
  'ETN Apoio',
  'Termo de Referencia',
  'Edital',
  'Analise arquiteto de software - Exclusivo GTN',
]);

/**
 * Processa metas e pedidos para calcular % de atingimento.
 *
 * Fluxo:
 * 1. Filtrar compromissos (actions) com categorias válidas → obter oppIds
 * 2. Filtrar oportunidades (opportunities) com status "Fechada e Ganha" → intersectar com oppIds
 * 3. Somar pedidos ligados a essas oportunidades filtradas
 * 4. Calcular % de atingimento com pesos (50% Lic+Serv, 50% Recorrente)
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
    if (!months.length || !goals.length) return [];

    // ── Calcular meta TOTAL para o período ──
    let metaTotalLicencasServicos = 0;
    let metaTotalRecorrente = 0;

    for (const goal of goals) {
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

      const rubrica = goal.rubrica.trim();
      if (
        rubrica.includes('Setup') ||
        rubrica.includes('Licença') ||
        rubrica.includes('Licenças')
      ) {
        metaTotalLicencasServicos += metaValue;
      } else if (
        rubrica.includes('Serviços Não Recorrentes') ||
        rubrica.includes('Servicos Nao Recorrentes')
      ) {
        metaTotalLicencasServicos += metaValue;
      } else if (rubrica.includes('Recorrente')) {
        metaTotalRecorrente += metaValue;
      }
    }

    // ── PASSO 1: Filtrar compromissos com categorias válidas ──
    // Obter oppIds que têm pelo menos 1 compromisso com categoria válida
    const oppIdsWithValidCategory = new Set<string>();
    const oppIdToEtn = new Map<string, Set<string>>();

    for (const action of actions) {
      const categoria = (action['Categoria'] || '').trim();
      if (!VALID_CATEGORIES.has(categoria)) continue;

      const oppId = String(action['Oportunidade ID'] || '').trim();
      if (!oppId) continue;

      oppIdsWithValidCategory.add(oppId);

      // Mapear oppId → ETN (nome do usuário do compromisso)
      const etn = (action['Usuário'] || action['Usuario'] || '').trim();
      if (etn) {
        if (!oppIdToEtn.has(oppId)) oppIdToEtn.set(oppId, new Set());
        oppIdToEtn.get(oppId)!.add(etn);
      }
    }

    // ── PASSO 2: Filtrar oportunidades "Fechada e Ganha" ──
    const oppIdsFechadaGanha = new Set<string>();

    for (const opp of opportunities) {
      const oppId = String(opp['Oportunidade ID'] || '').trim();
      const etapa = (opp['Etapa'] || '').trim();
      if (etapa === 'Fechada e Ganha' && oppIdsWithValidCategory.has(oppId)) {
        oppIdsFechadaGanha.add(oppId);
      }
    }

    // ── Se não tem oportunidades qualificadas, retornar com realização zerada ──
    if (oppIdsFechadaGanha.size === 0) {
      // Obter ETNs dos processedData ou usar "Total"
      const allEtns =
        processedData.length > 0
          ? Array.from(new Set(processedData.map((r) => r.etn)))
          : ['Total'];

      return allEtns.map((etn) => ({
        idUsuario: goals[0]?.idUsuario || '',
        etn,
        periodo: selectedPeriod,
        metaLicencasServicos: metaTotalLicencasServicos,
        realLicencasServicos: 0,
        metaRecorrente: metaTotalRecorrente,
        realRecorrente: 0,
        percentualAtingimento: 0,
      }));
    }

    // ── PASSO 3: Somar pedidos ligados às oportunidades qualificadas ──
    // Agrupar por ETN
    const allEtns = new Set<string>();
    for (const [oppId, etns] of Array.from(oppIdToEtn.entries())) {
      if (oppIdsFechadaGanha.has(oppId)) {
        for (const etn of Array.from(etns)) allEtns.add(etn);
      }
    }
    if (allEtns.size === 0) allEtns.add('Total');

    const etnRealizacao = new Map<
      string,
      { realLicencasServicos: number; realRecorrente: number }
    >();
    for (const etn of Array.from(allEtns)) {
      etnRealizacao.set(etn, { realLicencasServicos: 0, realRecorrente: 0 });
    }

    for (const pedido of pedidos) {
      const oppId = pedido.idOportunidade.toString().trim();
      if (!oppIdsFechadaGanha.has(oppId)) continue;

      const licServicos =
        (pedido.produtoValorLicenca || 0) + (pedido.servicoValorLiquido || 0);
      const recorrente = pedido.produtoValorManutencao || 0;

      // Distribuir entre ETNs da oportunidade
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

    // ── PASSO 4: Calcular % de atingimento por ETN ──
    return Array.from(allEtns).map((etn) => {
      const real = etnRealizacao.get(etn) || {
        realLicencasServicos: 0,
        realRecorrente: 0,
      };

      const percentualLicencas =
        metaTotalLicencasServicos > 0
          ? (real.realLicencasServicos / metaTotalLicencasServicos) * 100
          : 0;
      const percentualRecorrente =
        metaTotalRecorrente > 0
          ? (real.realRecorrente / metaTotalRecorrente) * 100
          : 0;
      const percentualAtingimento =
        percentualLicencas * 0.5 + percentualRecorrente * 0.5;

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
  }, [goals, pedidos, processedData, selectedPeriod, actions, opportunities]);

  return metricas;
};
