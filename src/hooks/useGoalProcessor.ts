import { useCallback } from 'react';
import * as XLSX from 'xlsx';
import { GoalRecord, PedidoRecord } from '@/types/goals';

/**
 * Robust value parser: handles numbers, "R$ 62,814.00", "62.814,00", "-", etc.
 */
const parseGoalValue = (v: any): number => {
  if (v === undefined || v === null || v === '' || v === '-') return 0;
  if (typeof v === 'number') return isNaN(v) ? 0 : v;

  let s = String(v).trim();
  // Remove currency symbols and spaces
  s = s.replace(/R\$\s*/gi, '').replace(/\s/g, '');
  if (!s || s === '-') return 0;

  // Detect format: "62,814.00" (US) vs "62.814,00" (BR)
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  if (lastComma > lastDot) {
    // BR format: 62.814,00 → remove dots, replace comma with dot
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // US format: 62,814.00 → remove commas
    s = s.replace(/,/g, '');
  }

  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

// Parse valor no formato brasileiro: 4.771,20 → 4771.20
const parseBR = (v: string | undefined): number => {
  if (!v || v.trim() === '') return 0;
  const cleaned = v.trim().replace(/^"|"$/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

/**
 * Flexible column finder: matches headers ignoring case, accents, and whitespace.
 */
function normalizeHeader(h: string): string {
  return String(h || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function findKey(row: any, possibleNames: string[]): string | undefined {
  const normalizedPossible = possibleNames.map(normalizeHeader);
  const keys = Object.keys(row);
  for (const key of keys) {
    const norm = normalizeHeader(key);
    if (normalizedPossible.includes(norm)) return key;
  }
  // Partial match fallback
  for (const key of keys) {
    const norm = normalizeHeader(key);
    for (const target of normalizedPossible) {
      if (norm.includes(target) || target.includes(norm)) return key;
    }
  }
  return undefined;
}

function getVal(row: any, possibleNames: string[]): any {
  const key = findKey(row, possibleNames);
  return key ? row[key] : undefined;
}

export const useGoalProcessor = () => {
  const parseGoalsFile = useCallback(async (file: File): Promise<GoalRecord[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          // CRITICAL: XLSX.read with type 'array' expects Uint8Array, not raw ArrayBuffer
          const uint8 = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
          const workbook = XLSX.read(uint8, { type: 'array' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(worksheet) as any[];

          console.log('[METAS] Total rows from XLSX:', rows.length);
          if (rows.length > 0) {
            console.log('[METAS] Headers detected:', Object.keys(rows[0]));
            console.log('[METAS] Sample row 0:', JSON.stringify(rows[0]));
          }

          const goals: GoalRecord[] = rows
            .filter((row) => {
              const produto = getVal(row, ['Produto']);
              const idUsuario = getVal(row, ['ID Usuário', 'ID Usuário ERP', 'ID Usuario', 'ID Usuario ERP']);
              return produto && idUsuario;
            })
            .map((row) => {
              const g: GoalRecord = {
                produto: String(getVal(row, ['Produto']) || '').trim(),
                idUsuario: String(getVal(row, ['ID Usuário', 'ID Usuário ERP', 'ID Usuario', 'ID Usuario ERP']) || '').trim(),
                rubrica: String(getVal(row, ['Rubrica']) || '').trim(),
                janeiro: parseGoalValue(getVal(row, ['Janeiro'])),
                fevereiro: parseGoalValue(getVal(row, ['Fevereiro'])),
                marco: parseGoalValue(getVal(row, ['Março', 'Marco'])),
                primeiroTrimestre: parseGoalValue(getVal(row, ['1ºTri', '1º Tri', '1ºTrimestre', '1 Tri'])),
                abril: parseGoalValue(getVal(row, ['Abril'])),
                maio: parseGoalValue(getVal(row, ['Maio'])),
                junho: parseGoalValue(getVal(row, ['Junho'])),
                segundoTrimestre: parseGoalValue(getVal(row, ['2ºTri', '2º Tri', '2ºTrimestre', '2 Tri'])),
                julho: parseGoalValue(getVal(row, ['Julho'])),
                agosto: parseGoalValue(getVal(row, ['Agosto'])),
                setembro: parseGoalValue(getVal(row, ['Setembro'])),
                terceiroTrimestre: parseGoalValue(getVal(row, ['3ºTri', '3º Tri', '3ºTrimestre', '3 Tri'])),
                outubro: parseGoalValue(getVal(row, ['Outubro'])),
                novembro: parseGoalValue(getVal(row, ['Novembro'])),
                dezembro: parseGoalValue(getVal(row, ['Dezembro'])),
                quartoTrimestre: parseGoalValue(getVal(row, ['4ºTri', '4º Tri', '4ºTrimestre', '4 Tri'])),
                totalAno: parseGoalValue(getVal(row, ['Total Ano', 'Total'])),
              };
              return g;
            });

          console.log('[METAS] Parsed goals:', goals.length);
          for (const g of goals) {
            console.log(`[METAS] Produto="${g.produto}" ID="${g.idUsuario}" Rubrica="${g.rubrica}" Mar=${g.marco} Abr=${g.abril} TotalAno=${g.totalAno}`);
          }

          resolve(goals);
        } catch (err) {
          reject(new Error(`Erro ao processar arquivo de metas: ${err}`));
        }
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo de metas'));
      reader.readAsArrayBuffer(file);
    });
  }, []);

  const parsePedidosFile = useCallback(async (file: File): Promise<PedidoRecord[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          let text: string;

          if (typeof data === 'string') {
            text = data;
          } else {
            const decoder = new TextDecoder('iso-8859-1');
            text = decoder.decode(data as ArrayBuffer);
          }

          const lines = text.split('\n');
          if (lines.length === 0) throw new Error('Arquivo vazio');

          // Parse header with flexible quote removal
          const rawHeaders = lines[0].split(';').map((h) => h.trim().replace(/^"|"$/g, ''));
          console.log('[PEDIDOS] Headers:', rawHeaders.slice(0, 15).join(' | '));

          // Flexible column finder for pedidos
          const findCol = (possibles: string[]): string => {
            const normalized = possibles.map(normalizeHeader);
            for (const h of rawHeaders) {
              const hn = normalizeHeader(h);
              if (normalized.includes(hn)) return h;
            }
            // Partial match
            for (const h of rawHeaders) {
              const hn = normalizeHeader(h);
              for (const t of normalized) {
                if (hn.includes(t) || t.includes(hn)) return h;
              }
            }
            return possibles[0]; // fallback
          };

          const colIdOpp = findCol(['ID OPORTUNIDADE']);
          const colEtapa = findCol(['ETAPA OPORTUNIDADE']);
          const colProp = findCol(['PROPRIETARIO OPORTUNIDADE']);
          const colIdErp = findCol(['ID ERP PROPRIETARIO']);
          const colProduto = findCol(['PRODUTO']);
          const colCodModulo = findCol(['PRODUTO - CÓDIGO DO MÓDULO', 'PRODUTO - CODIGO DO MODULO']);
          const colModulo = findCol(['PRODUTO - MODULO']);
          const colValLic = findCol(['PRODUTO - VALOR LICENCA']);
          const colValLicCanal = findCol(['PRODUTO - VALOR LICENCA CANAL']);
          const colValMan = findCol(['PRODUTO - VALOR MANUTENCAO']);
          const colValManCanal = findCol(['PRODUTO - VALOR MANUTENCAO CANAL']);
          const colServico = findCol(['SERVICO']);
          const colServTipo = findCol(['SERVICO - TIPO DE FATURAMENTO']);
          const colServQtde = findCol(['SERVICO - QTDE DE HORAS']);
          const colServValHora = findCol(['SERVICO - VALOR HORA']);
          const colServValBruto = findCol(['SERVICO - VALOR BRUTO']);
          const colServValOver = findCol(['SERVICO - VALOR OVER']);
          const colServValDesc = findCol(['SERVICO - VALOR DESCONTO']);
          const colServValCanal = findCol(['SERVICO - VALOR CANAL']);
          const colServValLiq = findCol(['SERVICO - VALOR LIQUIDO']);

          const pedidos: PedidoRecord[] = [];

          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const values = line.split(';').map((v) => v.trim().replace(/^"|"$/g, ''));
            const row: Record<string, string> = {};
            rawHeaders.forEach((header, idx) => {
              row[header] = values[idx] || '';
            });

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
          }

          console.log(`[PEDIDOS] Parsed ${pedidos.length} records`);
          if (pedidos.length > 0) {
            console.log('[PEDIDOS] Sample:', JSON.stringify(pedidos[0]));
          }

          resolve(pedidos);
        } catch (err) {
          reject(new Error(`Erro ao processar arquivo de pedidos: ${err}`));
        }
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo de pedidos'));
      reader.readAsArrayBuffer(file);
    });
  }, []);

  return { parseGoalsFile, parsePedidosFile };
};
