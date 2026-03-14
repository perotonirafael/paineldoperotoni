import { useEffect, useRef, useState, useCallback } from 'react';

export interface WorkerResult {
  records: any[];
  missingAgendas: any[];
  filterOptions: any;
  kpis: any;
  motivosPerda: any[];
  funnelData: any[];
  forecastFunnel: any[];
  etnTop10: any[];
}

export interface WorkerProgress {
  stage: string;
  progress: number;
  message: string;
}

export function useWorkerDataProcessor() {
  const workerRef = useRef<Worker | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<WorkerProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('../workers/dataProcessor.worker.ts', import.meta.url),
      { type: 'module' }
    );
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // Modo 1: Processar dados já parseados (para demo)
  const processData = useCallback((
    opportunities: any[],
    actions: any[]
  ): Promise<WorkerResult> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker não inicializado'));
        return;
      }

      setIsProcessing(true);
      setError(null);
      setProgress({ stage: 'processing', progress: 50, message: 'Processando dados...' });

      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'result') {
          setIsProcessing(false);
          setProgress(null);
          workerRef.current?.removeEventListener('message', handleMessage);
          workerRef.current?.removeEventListener('error', handleError);
          resolve(event.data);
        } else if (event.data.type === 'progress') {
          setProgress(event.data);
        } else if (event.data.type === 'error') {
          setIsProcessing(false);
          setError(event.data.message);
          setProgress(null);
          workerRef.current?.removeEventListener('message', handleMessage);
          workerRef.current?.removeEventListener('error', handleError);
          reject(new Error(event.data.message));
        }
      };

      const handleError = (event: ErrorEvent) => {
        setIsProcessing(false);
        setError(event.message);
        setProgress(null);
        workerRef.current?.removeEventListener('message', handleMessage);
        workerRef.current?.removeEventListener('error', handleError);
        reject(new Error(event.message));
      };

      workerRef.current.addEventListener('message', handleMessage);
      workerRef.current.addEventListener('error', handleError);

      workerRef.current.postMessage({
        type: 'process',
        opportunities,
        actions,
      });
    });
  }, []);

  // Modo 2: Processar arquivos completos (parsing + processamento no worker)
  const processFiles = useCallback((
    oppFile: File | null,
    actFile: File | null
  ): Promise<WorkerResult> => {
    return new Promise(async (resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker não inicializado'));
        return;
      }

      setIsProcessing(true);
      setError(null);
      setProgress({ stage: 'reading', progress: 0, message: 'Preparando arquivos...' });

      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'result') {
          setIsProcessing(false);
          setProgress(null);
          workerRef.current?.removeEventListener('message', handleMessage);
          workerRef.current?.removeEventListener('error', handleError);
          resolve(event.data);
        } else if (event.data.type === 'progress') {
          setProgress(event.data);
        } else if (event.data.type === 'error') {
          setIsProcessing(false);
          setError(event.data.message);
          setProgress(null);
          workerRef.current?.removeEventListener('message', handleMessage);
          workerRef.current?.removeEventListener('error', handleError);
          reject(new Error(event.data.message));
        }
      };

      const handleError = (event: ErrorEvent) => {
        setIsProcessing(false);
        setError(event.message);
        setProgress(null);
        workerRef.current?.removeEventListener('message', handleMessage);
        workerRef.current?.removeEventListener('error', handleError);
        reject(new Error(event.message));
      };

      workerRef.current.addEventListener('message', handleMessage);
      workerRef.current.addEventListener('error', handleError);

      try {
        // Ler arquivos como ArrayBuffer na thread principal (rápido)
        const oppBuffer = oppFile ? await oppFile.arrayBuffer() : null;
        const actBuffer = actFile ? await actFile.arrayBuffer() : null;

        // Enviar buffers para o worker (transferível = zero-copy)
        const transferables: ArrayBuffer[] = [];
        if (oppBuffer) transferables.push(oppBuffer);
        if (actBuffer) transferables.push(actBuffer);

        workerRef.current!.postMessage({
          type: 'processFiles',
          oppBuffer,
          actBuffer,
          oppFileName: oppFile?.name || '',
          actFileName: actFile?.name || '',
        }, transferables);
      } catch (err) {
        setIsProcessing(false);
        setProgress(null);
        reject(err);
      }
    });
  }, []);

  return { processData, processFiles, isProcessing, progress, error };
}
