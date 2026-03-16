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

const MONTH_NAMES: Record<number, string> = {
  1: 'Janeiro',
  2: 'Fevereiro',
  3: 'Março',
  4: 'Abril',
  5: 'Maio',
  6: 'Junho',
  7: 'Julho',
  8: 'Agosto',
  9: 'Setembro',
  10: 'Outubro',
  11: 'Novembro',
  12: 'Dezembro',
};

function normalizeYearValue(value: any): string {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  return digits.length === 4 ? digits : '';
}

function parseSpreadsheetDate(value: any): { raw: string; month: string; year: string; monthNum: number } {
  if (value === undefined || value === null || value === '') {
    return { raw: '', month: '', year: '', monthNum: 0 };
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const monthNum = value.getMonth() + 1;
    return {
      raw: value.toISOString(),
      month: MONTH_NAMES[monthNum] || '',
      year: String(value.getFullYear()),
      monthNum,
    };
  }

  if (typeof value === 'number' && value > 1 && value < 100000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    const monthNum = date.getUTCMonth() + 1;
    return {
      raw: date.toISOString(),
      month: MONTH_NAMES[monthNum] || '',
      year: String(date.getUTCFullYear()),
      monthNum,
    };
  }

  const raw = String(value).trim();
  const normalized = raw.replace(/^"|"$/g, '');
  const parts = normalized.match(/(\d{1,4})\D(\d{1,2})\D(\d{2,4})/);

  if (parts) {
    let day = parseInt(parts[1], 10);
    let monthNum = parseInt(parts[2], 10);
    let year = parts[3];

    if (parts[1].length === 4) {
      year = parts[1];
      monthNum = parseInt(parts[2], 10);
      day = parseInt(parts[3], 10);
    }

    if (year.length === 2) {
      year = `${parseInt(year, 10) >= 70 ? '19' : '20'}${year}`;
    }

    if (monthNum >= 1 && monthNum <= 12) {
      return {
        raw: normalized,
        month: MONTH_NAMES[monthNum] || '',
        year,
        monthNum,
      };
    }
  }

  return { raw: normalized, month: '', year: '', monthNum: 0 };
}

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

      // Tentar encontrar automaticamente a planilha que contém as colunas de metas
      let targetSheetName: string | null = null;
      let headers: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const ws = workbook.Sheets[sheetName];
        const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true }) as any[][];
        if (!matrix || matrix.length < 2) continue;

        const headerRow = (matrix[0] || []).map((h) => cleanHeaderName(String(h ?? '')));
        const hasProduto = !!findHeaderByCandidates(headerRow, ['Produto']);
        const hasIdUsuario = !!findHeaderByCandidates(headerRow, ['ID Usuário', 'ID Usuário ERP', 'ID Usuario', 'ID Usuario ERP']);
        const hasRubrica = !!findHeaderByCandidates(headerRow, ['Rubrica']);

        if (hasProduto && hasIdUsuario && hasRubrica) {
          targetSheetName = sheetName;
          headers = headerRow;
          break;
        }
      }

      if (!targetSheetName) {
        // Fallback: primeira planilha
        targetSheetName = workbook.SheetNames[0];
        const ws = workbook.Sheets[targetSheetName];
        const matrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true }) as any[][];
        if (!matrix || matrix.length < 2) {
          console.log('[METAS] Planilha sem linhas de dados:', targetSheetName);
          return [];
        }
        headers = (matrix[0] || []).map((h) => cleanHeaderName(String(h ?? '')));
      }

      const worksheet = workbook.Sheets[targetSheetName];
      const matrix = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, raw: true }) as any[][];
      if (!matrix || matrix.length < 2) {
        console.log('[METAS] Planilha sem linhas de dados (2):', targetSheetName);
        return [];
      }

      const headerRow = (matrix[0] || []).map((h) => cleanHeaderName(String(h ?? '')));
      headers = headerRow;
      console.log('[METAS] Sheet selecionada:', targetSheetName, 'Headers:', headers);

      const colProduto = resolveHeader(headers, ['Produto']);
      const colIdUsuario = resolveHeader(headers, ['ID Usuário', 'ID Usuário ERP', 'ID Usuario', 'ID Usuario ERP']);
      const colRubrica = resolveHeader(headers, ['Rubrica']);
      const colAno = resolveHeader(headers, ['Ano']);
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

      const idxProduto = headers.indexOf(colProduto);
      const idxIdUsuario = headers.indexOf(colIdUsuario);
      const idxRubrica = headers.indexOf(colRubrica);
      const idxAno = headers.indexOf(colAno);
      const idxJaneiro = headers.indexOf(colJaneiro);
      const idxFevereiro = headers.indexOf(colFevereiro);
      const idxMarco = headers.indexOf(colMarco);
      const idxAbril = headers.indexOf(colAbril);
      const idxMaio = headers.indexOf(colMaio);
      const idxJunho = headers.indexOf(colJunho);
      const idxJulho = headers.indexOf(colJulho);
      const idxAgosto = headers.indexOf(colAgosto);
      const idxSetembro = headers.indexOf(colSetembro);
      const idxOutubro = headers.indexOf(colOutubro);
      const idxNovembro = headers.indexOf(colNovembro);
      const idxDezembro = headers.indexOf(colDezembro);
      const idxTotalAno = headers.indexOf(colTotalAno);

      if (idxProduto === -1 || idxIdUsuario === -1 || idxRubrica === -1) {
        console.warn('[METAS] Colunas obrigatórias não encontradas em', targetSheetName, {
          colProduto,
          colIdUsuario,
          colRubrica,
        });
        return [];
      }

      const goals: GoalRecord[] = [];

      for (let i = 1; i < matrix.length; i++) {
        const row = matrix[i];
        if (!row || row.length === 0) continue;

        const produto = String(row[idxProduto] ?? '').trim();
        const idUsuario = String(row[idxIdUsuario] ?? '').trim();
        if (!produto || !idUsuario) continue;

        const getVal = (idx: number) => (idx >= 0 && idx < row.length ? parseGoalValue(row[idx]) : 0);

        const goal: GoalRecord = {
          produto,
          idUsuario,
          rubrica: String(row[idxRubrica] ?? '').trim(),
          janeiro: getVal(idxJaneiro),
          fevereiro: getVal(idxFevereiro),
          marco: getVal(idxMarco),
          primeiroTrimestre: 0,
          abril: getVal(idxAbril),
          maio: getVal(idxMaio),
          junho: getVal(idxJunho),
          segundoTrimestre: 0,
          julho: getVal(idxJulho),
          agosto: getVal(idxAgosto),
          setembro: getVal(idxSetembro),
          terceiroTrimestre: 0,
          outubro: getVal(idxOutubro),
          novembro: getVal(idxNovembro),
          dezembro: getVal(idxDezembro),
          quartoTrimestre: 0,
          totalAno: getVal(idxTotalAno),
        };

        goals.push(goal);

        if (i % 2000 === 0) {
          await yieldToMainThread();
        }
      }

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
      const colNumeroPedido = resolveHeader(headers, ['NUMERO PEDIDO', 'NÚMERO PEDIDO', 'NUM PEDIDO']);
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
          numeroPedido: row[colNumeroPedido] || '',
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
