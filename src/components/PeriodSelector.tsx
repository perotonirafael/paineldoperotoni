import React from 'react';
import { ChevronDown } from 'lucide-react';

interface PeriodSelectorProps {
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
}

const PERIODS = [
  // Meses
  { label: 'Janeiro', value: 'Janeiro' },
  { label: 'Fevereiro', value: 'Fevereiro' },
  { label: 'Março', value: 'Março' },
  { label: 'Abril', value: 'Abril' },
  { label: 'Maio', value: 'Maio' },
  { label: 'Junho', value: 'Junho' },
  { label: 'Julho', value: 'Julho' },
  { label: 'Agosto', value: 'Agosto' },
  { label: 'Setembro', value: 'Setembro' },
  { label: 'Outubro', value: 'Outubro' },
  { label: 'Novembro', value: 'Novembro' },
  { label: 'Dezembro', value: 'Dezembro' },
  // Trimestres
  { label: '1º Trimestre', value: '1ºTrimestre' },
  { label: '2º Trimestre', value: '2ºTrimestre' },
  { label: '3º Trimestre', value: '3ºTrimestre' },
  { label: '4º Trimestre', value: '4ºTrimestre' },
];

export const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  selectedPeriod,
  onPeriodChange,
}) => {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-semibold text-foreground">Período:</label>
      <div className="relative">
        <select
          value={selectedPeriod}
          onChange={(e) => onPeriodChange(e.target.value)}
          className="appearance-none bg-white border border-border rounded-lg px-4 py-2 pr-8 text-sm font-medium text-foreground cursor-pointer hover:border-primary transition-colors"
        >
          {PERIODS.map((period) => (
            <option key={period.value} value={period.value}>
              {period.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
      </div>
    </div>
  );
};
