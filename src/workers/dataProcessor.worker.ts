// Web Worker para parsing CSV/XLSX + processamento de dados
// Tudo roda fora da thread principal para não travar a UI
import * as XLSX from 'xlsx';

const MONTH_NAMES: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril',
  5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto',
  9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro'
};

const MONTH_ORDER: Record<string, number> = {
  'Janeiro': 1, 'Fevereiro': 2, 'Março': 3, 'Abril': 4,
  'Maio': 5, 'Junho': 6, 'Julho': 7, 'Agosto': 8,
  'Setembro': 9, 'Outubro': 10, 'Novembro': 11, 'Dezembro': 12
};

function parseDate(dateStr: string): { month: string; year: string; monthNum: number; dateObj: Date | null } {
  if (!dateStr) return { month: '', year: '', monthNum: 0, dateObj: null };
  const parts = dateStr.split('/');
  if (parts.length >= 3) {
    const dayClean = parseInt(parts[0].replace(/[^0-9]/g, ''));
    const mesClean = parseInt(parts[1].replace(/[^0-9]/g, ''));
    const anoClean = parts[2].replace(/[^0-9]/g, '');
    const anoNum = parseInt(anoClean);
    if (mesClean >= 1 && mesClean <= 12 && anoClean.length === 4 && anoNum >= 2000 && anoNum <= 2100) {
      const dateObj = new Date(anoNum, mesClean - 1, dayClean || 1);
      return { month: MONTH_NAMES[mesClean], year: anoClean, monthNum: mesClean, dateObj };
    }
  }
  return { month: '', year: '', monthNum: 0, dateObj: null };
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

function splitSubtipos(raw: string): string[] {
  return String(raw || '').split(/[;,]/).map(s => s.trim()).filter(Boolean);
}

function extractSequential(oppId: string): number {
  const nums = oppId.replace(/[^0-9]/g, '');
  return nums ? parseInt(nums) : 0;
}

// Verifica se um nome contém "OLD" ou "INATIVO"
function isOLD(name: string): boolean {
  const upper = name.trim().toUpperCase();
  return upper.includes('OLD') || upper.includes('INATIVO');
}

// ====== CSV PARSER (roda no worker) ======

function parseCSVLine(line: string, sep: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"' && current === '') {
        inQuotes = true;
        i++;
      } else if (char === sep) {
        fields.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseCSVText(text: string, sep: string): any[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];

  // Handle multi-line quoted fields
  const mergedLines: string[] = [];
  let buffer = '';
  let openQuotes = false;

  for (const line of lines) {
    if (openQuotes) {
      buffer += '\n' + line;
      const quoteCount = (line.match(/"/g) || []).length;
      if (quoteCount % 2 === 1) {
        openQuotes = false;
        mergedLines.push(buffer);
        buffer = '';
      }
    } else {
      const quoteCount = (line.match(/"/g) || []).length;
      if (quoteCount % 2 === 1) {
        openQuotes = true;
        buffer = line;
      } else {
        mergedLines.push(line);
      }
    }
  }
  if (buffer) mergedLines.push(buffer);

  const validLines = mergedLines.filter(l => l.trim());
  if (validLines.length < 2) return [];

  const headers = parseCSVLine(validLines[0], sep);
  const records: any[] = [];

  for (let i = 1; i < validLines.length; i++) {
    const values = parseCSVLine(validLines[i], sep);
    if (values.length < 2) continue;
    const record: any = {};
    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = (j < values.length ? values[j] : '').replace(/^"|"$/g, '');
    }
    records.push(record);
  }
  return records;
}

function readFileBuffer(buffer: ArrayBuffer): string {
  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true });
    return utf8.decode(buffer);
  } catch {
    const latin1 = new TextDecoder('windows-1252');
    return latin1.decode(buffer);
  }
}

// ====== PROCESSAMENTO DE DADOS ======

// Categorias com reconhecimento integral (100%)
function normalizeStr(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const CATEGORIAS_100_NORMALIZED = new Set([
  'analise de aderencia',
  'analise de rfp/rfi',
  'demonstracao presencial',
  'demonstracao remota',
  'edital',
  'termo de referencia',
]);

const CATEGORIA_APOIO_NORMALIZED = 'etn apoio';

function getReconhecimentoPercentual(categoria: string): number {
  if (!categoria) return 0;
  const catNorm = normalizeStr(categoria);
  if (CATEGORIAS_100_NORMALIZED.has(catNorm)) return 100;
  if (catNorm === CATEGORIA_APOIO_NORMALIZED) return 25;
  return 0;
}

function processData(opportunities: any[], actions: any[]) {
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // ITEM 16: Filtrar compromissos com data futura - remover antes de processar
  const validActions = actions.filter(act => {
    const dateStr = trim(act['Data']);
    if (!dateStr) return true; // Se não tem data, manter
    const { dateObj } = parseDate(dateStr);
    if (!dateObj) return true;
    return dateObj <= today; // Só manter compromissos com data <= hoje
  });

  // INDEX: Ações agrupadas por Oportunidade ID (usando apenas ações válidas)
  const actionsByOppId = new Map<string, any[]>();
  for (const act of validActions) {
    const oppId = trim(act['Oportunidade ID']);
    if (oppId) {
      if (!actionsByOppId.has(oppId)) actionsByOppId.set(oppId, []);
      actionsByOppId.get(oppId)!.push(act);
    }
  }

  // INDEX: Para Agendas Faltantes
  const etnContaOppMap = new Map<string, Map<string, Set<string>>>();

  // PROCESSAMENTO: Desdobramento 1:N
  const records: any[] = [];

  for (const opp of opportunities) {
    const oppId = trim(opp['Oportunidade ID']);
    const contaId = trim(opp['Conta ID']);
    const conta = trim(opp['Conta']);
    const responsavel = trim(opp['Responsável']);
    const representante = trim(opp['Representante']);
    const etapa = trim(opp['Etapa']);
    const subtipoOportunidade = trim(opp['Subtipo de Oportunidade']);

    // OLD/INATIVO: Não remover dos dados, apenas dos dropdowns de filtro

    const prob = cleanProb(opp['Prob.']);
    const valorPrevisto = parseValue(opp['Valor Previsto']);
    const valorFechado = parseValue(opp['Valor Fechado']);

    // ITEM 15: Para oportunidades Fechada e Ganha com data futura, usar Efetivação do Fechamento
    let previsaoStr = trim(opp['Previsão de Fechamento']);
    const isGanha = etapa === 'Fechada e Ganha' || etapa === 'Fechada e Ganha TR';
    if (isGanha) {
      const { dateObj: previsaoDate } = parseDate(previsaoStr);
      if (previsaoDate && previsaoDate > today) {
        // Data futura - usar Efetivação do Fechamento
        const efetivacao = trim(opp['Efetivação do Fechamento']) || trim(opp['Efetivacao do Fechamento']);
        if (efetivacao) {
          previsaoStr = efetivacao;
        }
      }
    }

    const { month, year, monthNum } = parseDate(previsaoStr);

    // ITEM 10/14: Regra de valor unificado
    // Fechada e Ganha → usar Valor Fechado; Restante → usar Valor Previsto
    // A regra de reconhecimento (25% ETN Apoio) se aplica sobre o valor base

    const linkedActions = actionsByOppId.get(oppId) || [];

    if (linkedActions.length > 0) {
      const byUser = new Map<string, any[]>();
      for (const act of linkedActions) {
        const user = trim(act['Usuario']) || trim(act['Responsavel']) || trim(act['Usuário Ação']) || 'Sem Agenda';
        if (!byUser.has(user)) byUser.set(user, []);
        byUser.get(user)!.push(act);
      }

      for (const [user, userActions] of Array.from(byUser.entries())) {
        // OLD/INATIVO: Manter nos dados, filtrar apenas nos dropdowns

        if (contaId && user !== 'Sem Agenda') {
          if (!etnContaOppMap.has(user)) etnContaOppMap.set(user, new Map());
          const contaMap = etnContaOppMap.get(user)!;
          if (!contaMap.has(contaId)) contaMap.set(contaId, new Set());
          contaMap.get(contaId)!.add(oppId);

        }

        const catCount = new Map<string, number>();
        const actCount = new Map<string, number>();
        let maxReconhecimento = 0;
        for (const a of userActions) {
          const c = trim(a['Categoria']); 
          if (c) {
            catCount.set(c, (catCount.get(c) || 0) + 1);
            const pct = getReconhecimentoPercentual(c);
            if (pct > maxReconhecimento) maxReconhecimento = pct;
          }
          const at = trim(a['Atividade']); if (at) actCount.set(at, (actCount.get(at) || 0) + 1);
        }
        let topCat = ''; let topCatN = 0;
        catCount.forEach((v, k) => { if (v > topCatN) { topCat = k; topCatN = v; } });
        let topAct = ''; let topActN = 0;
        actCount.forEach((v, k) => { if (v > topActN) { topAct = k; topActN = v; } });

        const percentualReconhecimento = maxReconhecimento > 0 ? maxReconhecimento : 100;

        // ITEM 10/14: Valor unificado
        // Se Fechada e Ganha → valor base = Valor Fechado
        // Senão → valor base = Valor Previsto
        // Aplicar % reconhecimento sobre o valor base
        const valorBase = isGanha ? valorFechado : valorPrevisto;
        const valorUnificado = valorBase * (percentualReconhecimento / 100);

        records.push({
          oppId, conta, contaId,
          representante,
          responsavel,
          etn: user,
          etapa,
          probabilidade: prob.str,
          probNum: prob.num,
          anoPrevisao: year,
          mesPrevisao: month,
          mesPrevisaoNum: monthNum,
          mesFech: month,
          valorPrevisto,
          valorFechado,
          // Valor unificado: substitui valorReconhecido e valorFechadoReconhecido
          valorUnificado,
          percentualReconhecimento,
          agenda: userActions.length,
          tipoOportunidade: trim(opp['Tipo de Oportunidade']),
          subtipoOportunidade,
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
      const valorBase = isGanha ? valorFechado : valorPrevisto;

      records.push({
        oppId, conta, contaId,
        representante,
        responsavel,
        etn: 'Sem Agenda',
        etapa,
        probabilidade: prob.str,
        probNum: prob.num,
        anoPrevisao: year,
        mesPrevisao: month,
        mesPrevisaoNum: monthNum,
        mesFech: month,
        valorPrevisto,
        valorFechado,
        valorUnificado: valorBase,
        percentualReconhecimento: 100,
        agenda: 0,
        tipoOportunidade: trim(opp['Tipo de Oportunidade']),
        subtipoOportunidade,
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

  // AGENDAS FALTANTES - ITEM 11: Cruzar por ETN + Subtipo de Oportunidade (Produto)
  // Lógica: Para cada ETN, verificar quais OPs da mesma conta NÃO têm compromisso
  // com aquele ETN para o mesmo Produto (Subtipo de Oportunidade).
  // Ex: Se ETN tem compromisso com HCM Senior na OP 379211, mas a OP também tem ERP,
  // e o ETN NÃO tem compromisso com ERP, então a OP aparece como faltante para ERP.
  const missingAgendas: any[] = [];
  const oppById = new Map<string, any>();
  for (const opp of opportunities) {
    oppById.set(trim(opp['Oportunidade ID']), opp);
  }

  const oppsByContaId = new Map<string, any[]>();
  for (const opp of opportunities) {
    const cid = trim(opp['Conta ID']);
    if (cid) {
      if (!oppsByContaId.has(cid)) oppsByContaId.set(cid, []);
      oppsByContaId.get(cid)!.push(opp);
    }
  }

  // Conjunto de OPs que já foram adicionadas como faltantes (evitar duplicatas)
  const missingAdded = new Set<string>();

  for (const [etn, contaMap] of Array.from(etnContaOppMap.entries())) {

    for (const [contaId, oppIdsWithAction] of Array.from(contaMap.entries())) {
      let maxSeqWithAction = 0;
      let bestPrevOppId = '';
      for (const oid of Array.from(oppIdsWithAction)) {
        const seq = extractSequential(oid);
        if (seq > maxSeqWithAction) {
          maxSeqWithAction = seq;
          bestPrevOppId = oid;
        }
      }

      const subtiposComCompromissoNaConta = new Set<string>();
      for (const oppIdComCompromisso of Array.from(oppIdsWithAction)) {
        const oppComCompromisso = oppById.get(oppIdComCompromisso);
        if (!oppComCompromisso) continue;
        for (const subtipo of splitSubtipos(trim(oppComCompromisso['Subtipo de Oportunidade']))) {
          subtiposComCompromissoNaConta.add(subtipo);
        }
      }

      const allOppsForConta = oppsByContaId.get(contaId) || [];
      for (const opp of allOppsForConta) {
        const thisOppId = trim(opp['Oportunidade ID']);
        const thisSeq = extractSequential(thisOppId);
        const thisSubtipo = trim(opp['Subtipo de Oportunidade']);
        const thisSubtipos = splitSubtipos(thisSubtipo);

        // OP sem nenhum compromisso do ETN e sequencial maior
        // (Produto/Subtipo é apenas informativo, não cruza por produto)
        if (!oppIdsWithAction.has(thisOppId) && thisSeq > maxSeqWithAction) {
          // Ajuste 3: sempre cruzar por produto na própria conta.
          // Se não houver produto em comum entre a nova OP e os compromissos já feitos pelo ETN
          // nesta conta, não listar como agenda faltante.
          if (thisSubtipos.length > 0 && subtiposComCompromissoNaConta.size > 0) {
            const hasMatchingProduct = thisSubtipos.some(st => subtiposComCompromissoNaConta.has(st));
            if (!hasMatchingProduct) continue;
          } else if (subtiposComCompromissoNaConta.size > 0 && thisSubtipos.length === 0) {
            continue;
          }
          const missingKey = `${thisOppId}||${etn}`;
          if (missingAdded.has(missingKey)) continue;
          missingAdded.add(missingKey);

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
            subtipoOportunidade: thisSubtipo,
            dataCriacao: trim(opp['Data']) || trim(opp['Data de Criação']) || trim(opp['Data Criação']) || '',
            oppAnteriorId: bestPrevOppId,
            oppAnteriorEtapa: trim(oppById.get(bestPrevOppId)?.['Etapa'] || ''),
            agendaAnterior: (actionsByOppId.get(bestPrevOppId) || []).length,
          });
        }
      }
    }
  }

  // Extrair opções de filtro
  // ITEM 1: Meses ordenados por número do mês
  const monthSet = new Map<string, number>();
  for (const r of records) {
    if (r.mesPrevisao && r.mesPrevisaoNum) {
      monthSet.set(r.mesPrevisao, r.mesPrevisaoNum);
    }
  }
  const sortedMonths = Array.from(monthSet.entries())
    .sort((a, b) => a[1] - b[1])
    .map(([name]) => name);

  // ITEM 5: Probabilidades agrupadas - acima de 75% vira ">75%"
  const probSet = new Set<string>();
  for (const r of records) {
    if (r.probabilidade) {
      const num = parseInt(r.probabilidade);
      if (num > 75) {
        probSet.add('>75%');
      } else {
        probSet.add(r.probabilidade);
      }
    }
  }
  const sortedProbs = Array.from(probSet).sort((a, b) => {
    if (a === '>75%') return 1;
    if (b === '>75%') return -1;
    return parseInt(a) - parseInt(b);
  });

  // ITEM 6: Adicionar subtipos de oportunidade como opção de filtro
  // Simplificar: separar valores compostos (ex: 'HCM Senior; Wiipo') em itens individuais
  const subtiposSet = new Set<string>();
  for (const r of records) {
    const raw = (r as any).subtipoOportunidade;
    if (!raw) continue;
    // Separar por ; e , para extrair produtos individuais
    const parts = String(raw).split(/[;,]/).map((s: string) => s.trim()).filter(Boolean);
    for (const p of parts) subtiposSet.add(p);
  }
  const subtipos = Array.from(subtiposSet).sort();

  // ITEM 2: Filtrar OLD dos filtros
  const filterOLD = (arr: string[]) => arr.filter(s => !isOLD(s));

  const filterOptions = {
    years: Array.from(new Set(records.map((r: any) => r.anoPrevisao).filter(Boolean))).sort(),
    months: sortedMonths,
    representantes: filterOLD(Array.from(new Set(records.map((r: any) => r.representante).filter(Boolean))).sort()),
    responsaveis: filterOLD(Array.from(new Set(records.map((r: any) => r.responsavel).filter(Boolean))).sort()),
    etns: filterOLD(Array.from(new Set(records.map((r: any) => r.etn).filter(Boolean))).sort()),
    etapas: Array.from(new Set(records.map((r: any) => r.etapa).filter(Boolean))),
    probabilidades: sortedProbs,
    agenda: Array.from(new Set(records.map((r: any) => r.agenda.toString()).filter(Boolean))).sort((a: string, b: string) => parseInt(a) - parseInt(b)),
    contas: Array.from(new Set(records.map((r: any) => r.conta).filter(Boolean))).sort(),
    tipos: Array.from(new Set(records.map((r: any) => r.tipoOportunidade).filter(Boolean))).sort(),
    subtipos,
    segmentos: Array.from(new Set(records.map((r: any) => r.cnaeSegmento).filter(Boolean))).sort(),
  };

  // KPIs básicos
  const seenOps = new Set<string>();
  let totalAgendas = 0;
  let totalGanhas = 0;
  let totalGanhasValor = 0;
  let totalPerdidas = 0;
  let totalPerdidasValor = 0;
  for (const r of records) {
    if (!seenOps.has(r.oppId)) {
      seenOps.add(r.oppId);
      if (r.etapa === 'Fechada e Ganha' || r.etapa === 'Fechada e Ganha TR') {
        totalGanhas++;
        totalGanhasValor += r.valorUnificado;
      } else if (r.etapa === 'Fechada e Perdida') {
        totalPerdidas++;
        totalPerdidasValor += r.valorUnificado;
      }
    }
    totalAgendas += r.agenda;
  }
  const totalConversao = totalGanhas + totalPerdidas > 0 ? Math.round((totalGanhas / (totalGanhas + totalPerdidas)) * 100) : 0;

  // Funnel data
  const funnelSeen = new Set<string>();
  const funnelMap = new Map<string, { count: number; value: number }>();
  for (const r of records) {
    if (funnelSeen.has(r.oppId)) continue;
    funnelSeen.add(r.oppId);
    const stage = r.etapa || 'Desconhecido';
    const f = funnelMap.get(stage) || { count: 0, value: 0 };
    f.count++;
    f.value += r.valorUnificado;
    funnelMap.set(stage, f);
  }
  const funnelData = Array.from(funnelMap.entries()).map(([etapa, d]) => ({ etapa, ...d }));

  // Forecast funnel
  const fcSeen = new Set<string>();
  const fcMap = new Map<string, { count: number; value: number; probs: number[] }>();
  for (const r of records) {
    if (fcSeen.has(r.oppId) || r.probNum < 75) continue;
    fcSeen.add(r.oppId);
    const stage = r.etapa || 'Desconhecido';
    const f = fcMap.get(stage) || { count: 0, value: 0, probs: [] };
    f.count++;
    f.value += r.valorUnificado;
    f.probs.push(r.probNum);
    fcMap.set(stage, f);
  }
  const forecastFunnel = Array.from(fcMap.entries())
    .map(([etapa, d]) => ({
      etapa, count: d.count, value: d.value,
      avgProb: d.probs.length > 0 ? d.probs.reduce((a, b) => a + b, 0) / d.probs.length : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // ITEM 4: ETN Top 10 - só etapas Proposta e Negociação com prob >= 75%
  const etnSeen = new Set<string>();
  const etnMap = new Map<string, { count: number; value: number }>();
  for (const r of records) {
    if (r.etn === 'Sem Agenda') continue;
    if (r.probNum < 75) continue;
    // ITEM 4: Apenas Proposta e Negociação
    const etapaLower = r.etapa.toLowerCase();
    if (!etapaLower.includes('proposta') && !etapaLower.includes('negociação') && !etapaLower.includes('negociacao')) continue;
    if (etnSeen.has(r.oppId)) continue;
    etnSeen.add(r.oppId);
    const e = etnMap.get(r.etn) || { count: 0, value: 0 };
    e.count++;
    e.value += r.valorUnificado;
    etnMap.set(r.etn, e);
  }
  const etnTop10 = Array.from(etnMap.entries())
    .map(([name, d]) => ({ name: name.length > 20 ? name.slice(0, 20) + '...' : name, fullName: name, ...d }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Motivos de perda
  const motivoMap = new Map<string, number>();
  for (const r of records) {
    if (r.etapa !== 'Fechada e Perdida') continue;
    const motivo = r.motivoPerda || 'Sem motivo';
    motivoMap.set(motivo, (motivoMap.get(motivo) || 0) + r.valorUnificado);
  }
  const motivosPerda = Array.from(motivoMap.entries())
    .map(([motivo, value]) => ({ motivo, count: value }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // ITEM 7: TOP 10 Taxa de Conversão (somente Demonstração Presencial/Remota)
  // Ganhas / (Ganhas + Perdidas) considerando apenas oportunidades com demo presencial/remota
  const demoOppByEtn = new Set<string>();
  for (const act of validActions) {
    // Tentar vários nomes possíveis para o campo de usuário
    const user = trim(act['Usuario']) || trim(act['Responsavel']) || trim(act['Usuário']) || trim(act['Usuário Ação']) || trim(act['Usuario Acao']);
    const oppId = trim(act['Oportunidade ID']) || trim(act['ID Oportunidade']);
    const categoria = trim(act['Categoria']) || '';
    const categoriaNorm = normalizeStr(categoria);
    // Verificar se contém "demonstracao" E ("presencial" OU "remota")
    const isDemo = categoriaNorm.includes('demonstracao') && (categoriaNorm.includes('presencial') || categoriaNorm.includes('remota'));
    if (!user || !oppId || !isDemo) continue;
    demoOppByEtn.add(`${user}||${oppId}`);
  }

  const etnConversionMap = new Map<string, { total: number; ganhas: number; perdidas: number; ganhasValor: number; perdidasValor: number }>();
  const etnConversionSeen = new Set<string>();
  for (const r of records) {
    if (r.etn === 'Sem Agenda') continue;
    const key = `${r.etn}||${r.oppId}`;
    if (!demoOppByEtn.has(key) || etnConversionSeen.has(key)) continue;
    etnConversionSeen.add(key);

    const isGanha = r.etapa === 'Fechada e Ganha' || r.etapa === 'Fechada e Ganha TR';
    const isPerdida = r.etapa === 'Fechada e Perdida';
    if (!isGanha && !isPerdida) continue;

    const e = etnConversionMap.get(r.etn) || { total: 0, ganhas: 0, perdidas: 0, ganhasValor: 0, perdidasValor: 0 };
    e.total++;
    if (isGanha) {
      e.ganhas++;
      e.ganhasValor += r.valorUnificado;
    }
    if (isPerdida) {
      e.perdidas++;
      e.perdidasValor += r.valorUnificado;
    }
    etnConversionMap.set(r.etn, e);
  }
  const etnConversionTop10 = Array.from(etnConversionMap.entries())
    .filter(([name, d]) => d.total > 0)
    .map(([name, d]) => ({
      name: name.length > 20 ? name.slice(0, 20) + '...' : name,
      fullName: name,
      total: d.total,
      ganhas: d.ganhas,
      perdidas: d.perdidas,
      ganhasValor: d.ganhasValor,
      perdidasValor: d.perdidasValor,
      taxaConversao: d.ganhas + d.perdidas > 0 ? Math.round((d.ganhas / (d.ganhas + d.perdidas)) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total || b.taxaConversao - a.taxaConversao)
    .slice(0, 10);

  // ITEM 8: TOP 10 Maiores Recursos X Agendas - TODOS os compromissos
  const etnAgendaMap = new Map<string, { valor: number; agendas: number }>();
  for (const r of records) {
    if (r.etn === 'Sem Agenda') continue;
    const e = etnAgendaMap.get(r.etn) || { valor: 0, agendas: 0 };
    e.valor += r.valorUnificado;
    e.agendas += r.agenda; // Todos os compromissos
    etnAgendaMap.set(r.etn, e);
  }
  const etnRecursosAgendas = Array.from(etnAgendaMap.entries())
    .map(([name, d]) => ({
      name: name.length > 20 ? name.slice(0, 20) + '...' : name,
      fullName: name,
      valor: d.valor,
      agendas: d.agendas,
    }))
    .sort((a, b) => b.agendas - a.agendas)
    .slice(0, 10);

  return {
    records,
    missingAgendas,
    filterOptions,
    kpis: { 
      totalOps: seenOps.size, 
      totalAgendas,
      totalGanhas,
      totalGanhasValor,
      totalPerdidas,
      totalPerdidasValor,
      totalConversao,
    },
    motivosPerda,
    funnelData,
    forecastFunnel,
    etnTop10,
    etnConversionTop10,
    etnRecursosAgendas,
  };
}

// ====== MESSAGE HANDLER ======

self.onmessage = (event: MessageEvent) => {
  const { type } = event.data;

  if (type === 'process') {
    try {
      const result = processData(event.data.opportunities, event.data.actions);
      self.postMessage({ type: 'result', ...result });
    } catch (error) {
      self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Unknown error' });
    }
  } else if (type === 'processFiles') {
    try {
      const { oppBuffer, actBuffer, oppFileName, actFileName } = event.data;

      self.postMessage({ type: 'progress', stage: 'parsing', progress: 5, message: 'Lendo arquivo de oportunidades...' });

      let opportunities: any[] = [];
      let actions: any[] = [];

      if (oppBuffer) {
        self.postMessage({ type: 'progress', stage: 'parsing', progress: 15, message: 'Parseando oportunidades...' });
        
        if (oppFileName?.toLowerCase().endsWith('.csv')) {
          const oppText = readFileBuffer(oppBuffer);
          const firstLine = oppText.split(/\r?\n/)[0] || '';
          const sep = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
          opportunities = parseCSVText(oppText, sep);
        } else {
          const workbook = XLSX.read(new Uint8Array(oppBuffer), { type: 'array' });
          for (const sheetName of workbook.SheetNames) {
            const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]) as any[];
            opportunities.push(...data);
          }
        }
        self.postMessage({ type: 'progress', stage: 'parsing', progress: 35, message: `${opportunities.length} oportunidades carregadas` });
      }

      if (actBuffer) {
        self.postMessage({ type: 'progress', stage: 'parsing', progress: 40, message: 'Lendo arquivo de compromissos...' });
        self.postMessage({ type: 'progress', stage: 'parsing', progress: 50, message: 'Parseando compromissos...' });
        
        if (actFileName?.toLowerCase().endsWith('.csv')) {
          const actText = readFileBuffer(actBuffer);
          const firstLine = actText.split(/\r?\n/)[0] || '';
          const sep = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';
          actions = parseCSVText(actText, sep);
        } else {
          const workbook = XLSX.read(new Uint8Array(actBuffer), { type: 'array' });
          for (const sheetName of workbook.SheetNames) {
            const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]) as any[];
            actions.push(...data);
          }
        }
        self.postMessage({ type: 'progress', stage: 'parsing', progress: 70, message: `${actions.length} compromissos carregados` });
      }

      if (!opportunities.length && !actions.length) {
        self.postMessage({ type: 'error', message: 'Nenhum dado válido encontrado nos arquivos.' });
        return;
      }

      self.postMessage({ type: 'progress', stage: 'processing', progress: 75, message: 'Processando dados...' });

      const result = processData(opportunities, actions);

      self.postMessage({ type: 'progress', stage: 'done', progress: 95, message: 'Finalizando...' });
      self.postMessage({ type: 'result', ...result });

    } catch (error) {
      self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Erro ao processar arquivos' });
    }
  }
};
