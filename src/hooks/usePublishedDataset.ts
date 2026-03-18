import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface PublishedBatchInfo {
  batchId: string;
  versionName: string | null;
  publishedAt: string | null;
  createdBy: string | null;
  createdByName: string | null;
  fileCount: number;
}

export interface PublishedSnapshot {
  workerResult: any;
  goals: any[];
  pedidos: any[];
  rawOpportunities: any[];
  rawActions: any[];
}

export function usePublishedDataset() {
  const [batchInfo, setBatchInfo] = useState<PublishedBatchInfo | null>(null);
  const [snapshot, setSnapshot] = useState<PublishedSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadPublishedBatch = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Find the published batch
      const { data: batch, error: batchError } = await supabase
        .from('data_batches')
        .select('id, version_name, published_at, created_by, file_count, snapshot_path')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(1)
        .single();

      if (batchError || !batch) {
        setBatchInfo(null);
        setSnapshot(null);
        setIsLoading(false);
        return;
      }

      // Get creator name
      let createdByName: string | null = null;
      if (batch.created_by) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, username')
          .eq('id', batch.created_by)
          .single();
        if (profile) {
          createdByName = profile.full_name || profile.username;
        }
      }

      setBatchInfo({
        batchId: batch.id,
        versionName: batch.version_name,
        publishedAt: batch.published_at,
        createdBy: batch.created_by,
        createdByName,
        fileCount: batch.file_count,
      });

      // Load snapshot from storage
      if (batch.snapshot_path) {
        const { data: fileData, error: downloadError } = await supabase.storage
          .from('data-files')
          .download(batch.snapshot_path);

        if (downloadError || !fileData) {
          setError('Erro ao carregar dados da base publicada');
          setIsLoading(false);
          return;
        }

        const text = await fileData.text();
        const parsed = JSON.parse(text);
        console.log('[PUBLISHED] Snapshot loaded:', {
          hasWorkerResult: !!parsed.workerResult,
          goalsCount: parsed.goals?.length ?? 0,
          pedidosCount: parsed.pedidos?.length ?? 0,
          rawOpportunitiesCount: parsed.rawOpportunities?.length ?? 0,
          rawActionsCount: parsed.rawActions?.length ?? 0,
        });
        setSnapshot(parsed);
      }
    } catch (err) {
      console.error('[PUBLISHED] Error loading:', err);
      setError('Erro ao carregar base publicada');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPublishedBatch();
  }, [loadPublishedBatch]);

  return { batchInfo, snapshot, isLoading, error, reload: loadPublishedBatch };
}
