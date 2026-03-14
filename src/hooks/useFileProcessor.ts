import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';

export interface FileProcessingState {
  isProcessing: boolean;
  progress: number;
  currentFile: string;
  error: string | null;
}

export interface ProcessedFileData {
  opportunities: any[];
  actions: any[];
}

const MAX_RECORDS = 200000;

async function yieldToMain() {
  return new Promise<void>(r => setTimeout(r, 0));
}

async function readFileAsText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  // Try UTF-8 first
  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true });
    return utf8.decode(buffer);
  } catch {
    // Fallback to Latin-1/Windows-1252 (common for Brazilian CSVs)
    const latin1 = new TextDecoder('windows-1252');
    return latin1.decode(buffer);
  }
}

/**
 * RFC 4180 compliant CSV parser that handles:
 * - Quoted fields containing the separator character
 * - Quoted fields containing newlines
 * - Escaped quotes ("" inside quoted fields)
 */
function parseCSVLine(line: string, sep: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote ""
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === '"' && current === '') {
        // Start of quoted field
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

function parseCSV(text: string, sep: string): any[] {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];

  // Handle multi-line quoted fields: merge lines that are inside quotes
  const mergedLines: string[] = [];
  let buffer = '';
  let openQuotes = false;

  for (const line of lines) {
    if (openQuotes) {
      buffer += '\n' + line;
      // Count quotes to determine if we're still inside
      const quoteCount = (line.match(/"/g) || []).length;
      if (quoteCount % 2 === 1) {
        openQuotes = false;
        mergedLines.push(buffer);
        buffer = '';
      }
    } else {
      const quoteCount = (line.match(/"/g) || []).length;
      if (quoteCount % 2 === 1) {
        // Odd number of quotes = field spans multiple lines
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

export function useFileProcessor() {
  const [state, setState] = useState<FileProcessingState>({
    isProcessing: false,
    progress: 0,
    currentFile: '',
    error: null,
  });

  const processFileInChunks = useCallback(async (file: File): Promise<any[]> => {
    setState(prev => ({ ...prev, isProcessing: true, currentFile: file.name, error: null, progress: 5 }));
    await yieldToMain();

    try {
      const isCSV = file.name.toLowerCase().endsWith('.csv');
      let allData: any[] = [];

      if (isCSV) {
        setState(prev => ({ ...prev, progress: 10 }));
        await yieldToMain();

        const text = await readFileAsText(file);
        setState(prev => ({ ...prev, progress: 30 }));
        await yieldToMain();

        // Detect separator
        const firstLine = text.split(/\r?\n/)[0] || '';
        const sep = firstLine.includes(';') ? ';' : firstLine.includes('\t') ? '\t' : ',';

        allData = parseCSV(text, sep);
        setState(prev => ({ ...prev, progress: 70 }));
        await yieldToMain();

        // Trim to max
        if (allData.length > MAX_RECORDS) allData = allData.slice(0, MAX_RECORDS);
      } else {
        // Excel
        setState(prev => ({ ...prev, progress: 10 }));
        const arrayBuffer = await file.arrayBuffer();
        await yieldToMain();

        setState(prev => ({ ...prev, progress: 25 }));
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        await yieldToMain();

        setState(prev => ({ ...prev, progress: 40 }));

        for (const sheetName of workbook.SheetNames) {
          if (allData.length >= MAX_RECORDS) break;
          const worksheet = workbook.Sheets[sheetName];
          const data = XLSX.utils.sheet_to_json(worksheet) as any[];
          if (!data.length) continue;

          for (let i = 0; i < data.length && allData.length < MAX_RECORDS; i += 5000) {
            await yieldToMain();
            const chunk = data.slice(i, i + 5000);
            allData.push(...chunk);
            const pct = 40 + Math.round((allData.length / Math.min(data.length, MAX_RECORDS)) * 55);
            setState(prev => ({ ...prev, progress: Math.min(95, pct) }));
          }
        }
      }

      setState(prev => ({ ...prev, progress: 100, isProcessing: false }));
      return allData;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido';
      setState(prev => ({ ...prev, isProcessing: false, error: msg }));
      throw err;
    }
  }, []);

  const processFiles = useCallback(
    async (oppFile: File | null, actFile: File | null): Promise<ProcessedFileData | null> => {
      try {
        let opportunities: any[] = [];
        let actions: any[] = [];

        if (oppFile) {
          opportunities = await processFileInChunks(oppFile);
        }
        if (actFile) {
          actions = await processFileInChunks(actFile);
        }

        if (!opportunities.length && !actions.length) {
          throw new Error('Nenhum dado válido encontrado nos arquivos.');
        }

        return { opportunities, actions };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao processar arquivos';
        setState(prev => ({ ...prev, error: msg, isProcessing: false }));
        return null;
      }
    },
    [processFileInChunks],
  );

  const resetState = useCallback(() => {
    setState({ isProcessing: false, progress: 0, currentFile: '', error: null });
  }, []);

  return { state, processFiles, resetState };
}
