import { useCallback } from 'react';
import * as XLSX from 'xlsx';
import { GoalRecord, PedidoRecord } from '@/types/goals';
import { cleanHeaderName, findHeaderByCandidates } from '@/lib/headerMatching';

/**
 * Robust value parser: handles numbers, "R$ 62,814.00", "62.814,00", "-", etc.
 */
const parseGoalValue = (v: any): number => {
  if (v === undefined || v === null || v === '' || v === '-') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;

  let s = String(v).trim();
  s = s.replace(/R\$\s*/gi, '').replace(/\s/g, '');
  if (!s || s === '-') return 0;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }

  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

const parseBR = (v: string | undefined): number => {
  if (!v || v.trim() === '') return 0;
  const cleaned = v
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/R\$\s*/gi, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

async function yieldToMainThread() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

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

async function parseCSVText(text: string, sep: string): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  const mergedLines: string[] = [];
  let buffer = '';
  let openQuotes = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (openQuotes) {
      buffer += `\n${line}`;
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

    if (i > 0 && i % 5000 === 0) {
      await yieldToMainThread();
    }
  }

  if (buffer) mergedLines.push(buffer);

  const validLines = mergedLines.filter((l) => l.trim());
  if (validLines.length < 2) return { headers: [], rows: [] };

  const headers = parseCSVLine(validLines[0], sep).map(cleanHeaderName);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < validLines.length; i++) {
    const values = parseCSVLine(validLines[i], sep);
    if (values.length < 2) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = (idx < values.length ? values[idx] : '').replace(/^"|"$/g, '');
    });

    rows.push(row);

    if (i % 4000 === 0) {
      await yieldToMainThread();
    }
  }

  return { headers, rows };
}

async function readFileAsText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();

  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true });
    return utf8.decode(buffer);
  } catch {
    const latin = new TextDecoder('windows-1252');
    return latin.decode(buffer);
  }
}

function resolveHeader(headers: string[], aliases: string[]): string {
  return findHeaderByCandidates(headers, aliases) || aliases[0];
}

export const useGoalProcessor = () => {
  const parseGoalsFile = useCallback(async (file: File): Promise<GoalRecord[]> => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

      console.log('[METAS] Total rows from XLSX:', rows.length);
      if (rows.length === 0) return [];

      const headers = Object.keys(rows[0]).map(cleanHeaderName);
      console.log('[METAS] Headers detectados:', headers);

      const colProduto = resolveHeader(headers, ['Produto']);
      const colIdUsuario = resolveHeader(headers, ['ID Usuário', 'ID Usuário ERP', 'ID Usuario', 'ID Usuario ERP']);
      const colRubrica = resolveHeader(headers, ['Rubrica']);
      const colJaneiro = resolveHeader(headers, ['Janeiro']);
      const colFevereiro = resolveHeader(headers, ['Fevereiro']);
      const colMarco = resolveHeader(headers, ['Março', 'Marco']);
      const colAbril = resolveHeader(headers, ['Abril']);
      const colMaio = resolveHeader(headers, ['Maio']);
      const colJunho = resolveHeader(headers, ['Junho']);
      const colJulho = resolveHeader(headers, ['Julho']);
      const colAgosto = resolveHeader(headers, ['Agosto']);
      const colSetembro = resolveHeader(headers, ['Setembro']);
      const colOutubro = resolveHeader(headers, ['Outubro']);
      const colNovembro = resolveHeader(headers, ['Novembro']);
      const colDezembro = resolveHeader(headers, ['Dezembro']);
      const colTotalAno = resolveHeader(headers, ['Total Ano', 'Total']);

      const goals: GoalRecord[] = rows
        .filter((row) => {
          const produto = String(row[colProduto] || '').trim();
          const idUsuario = String(row[colIdUsuario] || '').trim();
          return Boolean(produto && idUsuario);
        })
        .map((row) => ({
          produto: String(row[colProduto] || '').trim(),
          idUsuario: String(row[colIdUsuario] || '').trim(),
          rubrica: String(row[colRubrica] || '').trim(),
          janeiro: parseGoalValue(row[colJaneiro]),
          fevereiro: parseGoalValue(row[colFevereiro]),
          marco: parseGoalValue(row[colMarco]),
          primeiroTrimestre: parseGoalValue(row['1ºTri'] ?? row['1º Tri'] ?? row['1ºTrimestre'] ?? row['1 Tri']),
          abril: parseGoalValue(row[colAbril]),
          maio: parseGoalValue(row[colMaio]),
          junho: parseGoalValue(row[colJunho]),
          segundoTrimestre: parseGoalValue(row['2ºTri'] ?? row['2º Tri'] ?? row['2ºTrimestre'] ?? row['2 Tri']),
          julho: parseGoalValue(row[colJulho]),
          agosto: parseGoalValue(row[colAgosto]),
          setembro: parseGoalValue(row[colSetembro]),
          terceiroTrimestre: parseGoalValue(row['3ºTri'] ?? row['3º Tri'] ?? row['3ºTrimestre'] ?? row['3 Tri']),
          outubro: parseGoalValue(row[colOutubro]),
          novembro: parseGoalValue(row[colNovembro]),
          dezembro: parseGoalValue(row[colDezembro]),
          quartoTrimestre: parseGoalValue(row['4ºTri'] ?? row['4º Tri'] ?? row['4ºTrimestre'] ?? row['4 Tri']),
          totalAno: parseGoalValue(row[colTotalAno]),
        }));

      console.log('[METAS] Parsed goals:', goals.length);
      if (goals.length > 0) {
        console.log('[METAS] Amostra meta:', goals[0]);
      }

      return goals;
    } catch (err) {
      throw new Error(`Erro ao processar arquivo de metas: ${err}`);
    }
  }, []);

  const parsePedidosFile = useCallback(async (file: File): Promise<PedidoRecord[]> => {
    try {
      const text = await readFileAsText(file);
      const firstLine = text.split(/\r?\n/)[0] || '';
      const sep = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';

      const { headers, rows } = await parseCSVText(text, sep);
      if (rows.length === 0) {
        throw new Error('Arquivo de pedidos vazio ou inválido');
      }

      console.log('[PEDIDOS] Headers detectados:', headers.slice(0, 20).join(' | '));

      const colIdOpp = resolveHeader(headers, ['ID OPORTUNIDADE']);
      const colEtapa = resolveHeader(headers, ['ETAPA OPORTUNIDADE']);
      const colProp = resolveHeader(headers, ['PROPRIETARIO OPORTUNIDADE']);
      const colIdErp = resolveHeader(headers, ['ID ERP PROPRIETARIO']);
      const colProduto = resolveHeader(headers, ['PRODUTO']);
      const colCodModulo = resolveHeader(headers, ['PRODUTO - CÓDIGO DO MÓDULO', 'PRODUTO - CODIGO DO MODULO']);
      const colModulo = resolveHeader(headers, ['PRODUTO - MODULO']);
      const colValLic = resolveHeader(headers, ['PRODUTO - VALOR LICENCA']);
      const colValLicCanal = resolveHeader(headers, ['PRODUTO - VALOR LICENCA CANAL']);
      const colValMan = resolveHeader(headers, ['PRODUTO - VALOR MANUTENCAO']);
      const colValManCanal = resolveHeader(headers, ['PRODUTO - VALOR MANUTENCAO CANAL']);
      const colServico = resolveHeader(headers, ['SERVICO']);
      const colServTipo = resolveHeader(headers, ['SERVICO - TIPO DE FATURAMENTO']);
      const colServQtde = resolveHeader(headers, ['SERVICO - QTDE DE HORAS']);
      const colServValHora = resolveHeader(headers, ['SERVICO - VALOR HORA']);
      const colServValBruto = resolveHeader(headers, ['SERVICO - VALOR BRUTO']);
      const colServValOver = resolveHeader(headers, ['SERVICO - VALOR OVER']);
      const colServValDesc = resolveHeader(headers, ['SERVICO - VALOR DESCONTO']);
      const colServValCanal = resolveHeader(headers, ['SERVICO - VALOR CANAL']);
      const colServValLiq = resolveHeader(headers, ['SERVICO - VALOR LIQUIDO']);

      console.log('[PEDIDOS] Mapeamento de colunas:', {
        colIdOpp,
        colEtapa,
        colProp,
        colIdErp,
        colProduto,
      });

      const pedidos: PedidoRecord[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        const pedido: PedidoRecord = {
          idOportunidade: row[colIdOpp] || '',
          idEtapaOportunidade: row[colEtapa] || '',
          proprietarioOportunidade: row[colProp] || '',
          idErpProprietario: row[colIdErp] || '',
          produto: row[colProduto] || '',
          produtoCodigoModulo: row[colCodModulo] || '',
          produtoModulo: row[colModulo] || '',
          produtoValorLicenca: parseBR(row[colValLic]),
          produtoValorLicencaCanal: parseBR(row[colValLicCanal]),
          produtoValorManutencao: parseBR(row[colValMan]),
          produtoValorManutencaoCanal: parseBR(row[colValManCanal]),
          servico: row[colServico] || '',
          servicoTipoDeFaturamento: row[colServTipo] || '',
          servicoQtdeDeHoras: parseBR(row[colServQtde]),
          servicoValorHora: parseBR(row[colServValHora]),
          servicoValorBruto: parseBR(row[colServValBruto]),
          servicoValorOver: parseBR(row[colServValOver]),
          servicoValorDesconto: parseBR(row[colServValDesc]),
          servicoValorCanal: parseBR(row[colServValCanal]),
          servicoValorLiquido: parseBR(row[colServValLiq]),
        };

        if (pedido.idOportunidade) {
          pedidos.push(pedido);
        }

        if (i > 0 && i % 5000 === 0) {
          await yieldToMainThread();
        }
      }

      console.log(`[PEDIDOS] Parsed ${pedidos.length} records`);
      if (pedidos.length > 0) {
        console.log('[PEDIDOS] Sample:', pedidos[0]);
      }

      return pedidos;
    } catch (err) {
      throw new Error(`Erro ao processar arquivo de pedidos: ${err}`);
    }
  }, []);

  return { parseGoalsFile, parsePedidosFile };
};
