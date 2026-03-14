import { memo } from 'react';
import { Loader } from 'lucide-react';

interface Props {
  progress: number;
  currentFile: string;
  isVisible: boolean;
  stage?: string;
}

function ProgressBarInner({ progress, currentFile, isVisible, stage }: Props) {
  if (!isVisible) return null;

  const getStageLabel = () => {
    if (stage === 'loading') return 'Carregando arquivo...';
    if (stage === 'parsing') return 'Analisando dados...';
    if (stage === 'processing') return 'Processando registros...';
    if (stage === 'aggregating') return 'Agregando resultados...';
    return 'Processando dados';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md mx-4 shadow-2xl shadow-emerald-200/30 border border-emerald-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-100 to-green-100">
            <Loader className="animate-spin text-emerald-600" size={24} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-800">{getStageLabel()}</h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{currentFile}</p>
          </div>
        </div>

        <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>

        <p className="text-xs text-gray-500 mt-3 text-center font-mono font-bold">
          {Math.round(progress)}%
        </p>
      </div>
    </div>
  );
}

export const ProgressBar = memo(ProgressBarInner);
