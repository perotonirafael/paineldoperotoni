import { useState, useMemo, memo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, Download } from 'lucide-react';
import type { ProcessedRecord } from '@/hooks/useDataProcessor';

interface Props {
  data: ProcessedRecord[];
}

const COLUMNS: { key: keyof ProcessedRecord; label: string }[] = [
  { key: 'oppId', label: 'ID Op.' },
  { key: 'conta', label: 'Conta' },
  { key: 'representante', label: 'Representante' },
  { key: 'responsavel', label: 'Responsável' },
  { key: 'etn', label: 'ETN' },
  { key: 'etapa', label: 'Etapa' },
  { key: 'subtipoOportunidade', label: 'Produto' },
  { key: 'probabilidade', label: 'Prob.' },
  { key: 'agenda', label: 'Agenda' },
  { key: 'mesFech', label: 'Mês Fech.' },
  { key: 'anoPrevisao', label: 'Ano' },
  { key: 'valorUnificado', label: 'Valor' },
];

const PAGE_SIZE = 20;

function AnalyticsTableInner({ data }: Props) {
  const [sortKey, setSortKey] = useState<keyof ProcessedRecord | ''>('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!search) return data;
    const term = search.toLowerCase();
    return data.filter((r: ProcessedRecord) =>
      r.conta.toLowerCase().includes(term) ||
      r.representante.toLowerCase().includes(term) ||
      r.responsavel.toLowerCase().includes(term) ||
      r.etn.toLowerCase().includes(term) ||
      r.oppId.toLowerCase().includes(term) ||
      r.etapa.toLowerCase().includes(term)
    );
  }, [data, search]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a: ProcessedRecord, b: ProcessedRecord) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      const sa = (av || '').toString();
      const sb = (bv || '').toString();
      return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
  }, [filtered, sortKey, sortDir]);

  const paged = useMemo(() => {
    const start = page * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [sorted, page]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  const handleSort = (key: keyof ProcessedRecord) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const exportCSV = () => {
    const headers = COLUMNS.map(c => c.label).join(';');
    const rows = sorted.map((r: ProcessedRecord) =>
      COLUMNS.map(c => {
        const v = r[c.key];
        return typeof v === 'number' ? v.toString() : `"${(v || '').toString().replace(/"/g, '""')}"`;
      }).join(';')
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pipeline_analytics_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (v: number) =>
    v > 0 ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '-';

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-800">
            Tabela Analítica
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {sorted.length.toLocaleString('pt-BR')} registros {search ? '(filtrados)' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0); }}
              placeholder="Buscar..."
              className="pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 w-48"
            />
          </div>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-gradient-to-r from-emerald-500 to-green-500 text-white rounded-lg hover:from-emerald-600 hover:to-green-600 transition-all shadow-sm"
          >
            <Download size={14} /> Exportar CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="px-3 py-2.5 text-left font-semibold text-gray-500 uppercase tracking-wider cursor-pointer hover:text-gray-700 transition-colors whitespace-nowrap"
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key ? (
                      sortDir === 'asc' ? <ArrowUp size={12} className="text-emerald-500" /> : <ArrowDown size={12} className="text-emerald-500" />
                    ) : (
                      <ArrowUpDown size={12} className="opacity-30" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((r: ProcessedRecord, i: number) => (
              <tr
                key={`${r.oppId}-${r.etn}-${i}`}
                className="border-b border-gray-50 hover:bg-emerald-50/50 transition-colors"
              >
                <td className="px-3 py-2 font-mono text-blue-600 font-medium">{r.oppId}</td>
                <td className="px-3 py-2 truncate max-w-[200px] text-gray-700">{r.conta}</td>
                <td className="px-3 py-2 truncate text-gray-700">{r.representante}</td>
                <td className="px-3 py-2 truncate text-gray-700">{r.responsavel}</td>
                <td className="px-3 py-2 truncate text-gray-700">{r.etn}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    r.etapa.includes('Ganha') ? 'bg-emerald-100 text-emerald-700' :
                    r.etapa.includes('Perdida') ? 'bg-red-100 text-red-700' :
                    r.etapa.includes('Proposta') ? 'bg-amber-100 text-amber-700' :
                    r.etapa.includes('Negociação') ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {r.etapa}
                  </span>
                </td>
                <td className="px-3 py-2 truncate max-w-[150px] text-gray-600">{r.subtipoOportunidade || '-'}</td>
                <td className="px-3 py-2 font-mono text-gray-600">{r.probabilidade}</td>
                <td className="px-3 py-2 font-mono text-center text-gray-600">{r.agenda}</td>
                <td className="px-3 py-2 text-gray-600">{r.mesFech}</td>
                <td className="px-3 py-2 font-mono text-gray-600">{r.anoPrevisao}</td>
                <td className="px-3 py-2 font-mono text-right font-medium text-emerald-700">{formatCurrency(r.valorUnificado ?? r.valorReconhecido ?? r.valorPrevisto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="p-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
          <p className="text-xs text-gray-500">
            Página {page + 1} de {totalPages}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1 text-xs rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 transition-colors font-medium"
            >
              Anterior
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-3 py-1 text-xs rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-30 transition-colors font-medium"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const AnalyticsTable = memo(AnalyticsTableInner);
