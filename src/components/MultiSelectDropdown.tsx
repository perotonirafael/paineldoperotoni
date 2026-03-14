import { useState, useRef, useEffect, memo } from 'react';
import { ChevronDown, X, Search } from 'lucide-react';

interface Props {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

function MultiSelectDropdownInner({ label, options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = search
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options;

  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]);
  };

  return (
    <div ref={ref} className="relative w-[140px] flex-shrink-0">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg border transition-colors ${
          selected.length > 0
            ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
            : 'border-gray-200 bg-white hover:bg-gray-50'
        }`}
      >
        <span className="truncate">
          {selected.length > 0 ? (
            <span className="flex items-center gap-1">
              <span className="bg-emerald-500 text-white text-xs px-1.5 py-0.5 rounded-full font-mono font-bold">
                {selected.length}
              </span>
              <span className="text-emerald-700 text-xs font-medium">{label}</span>
            </span>
          ) : (
            <span className="text-gray-500">{label}</span>
          )}
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-[240px] bg-white border border-gray-200 rounded-xl shadow-xl shadow-gray-200/50 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="w-full pl-8 pr-2 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                autoFocus
              />
            </div>
          </div>

          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="w-full px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 flex items-center gap-1 transition-colors font-medium"
            >
              <X size={12} /> Limpar seleção
            </button>
          )}

          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-xs text-gray-400">Nenhum resultado</p>
            ) : (
              filtered.map(opt => (
                <label
                  key={opt}
                  className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ${
                    selected.includes(opt) ? 'bg-emerald-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-400 w-3.5 h-3.5"
                  />
                  <span className="text-xs text-gray-700 truncate">{opt}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const MultiSelectDropdown = memo(MultiSelectDropdownInner);
