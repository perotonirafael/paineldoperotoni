import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type UploadFileType = 'opportunities' | 'commitments' | 'goals' | 'orders';

interface UploadFilesInput {
  opportunities?: File | null;
  commitments?: File | null;
  goals?: File | null;
  orders?: File | null;
}

const CHUNK_BYTES = 256 * 1024;
const INSERT_BATCH_SIZE = 40;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 8192;

  for (let i = 0; i < bytes.length; i += chunk) {
    const part = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    for (let j = 0; j < part.length; j++) {
      binary += String.fromCharCode(part[j]);
    }
  }

  return btoa(binary);
}

async function insertChunks(
  batchId: string,
  fileType: UploadFileType,
  file: File,
): Promise<void> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  const totalChunks = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTES));
  const rows: Array<{
    batch_id: string;
    file_type: UploadFileType;
    file_name: string;
    mime_type: string;
    file_size: number;
    chunk_index: number;
    total_chunks: number;
    chunk_base64: string;
  }> = [];

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
    const start = chunkIndex * CHUNK_BYTES;
    const end = Math.min(start + CHUNK_BYTES, bytes.length);
    const slice = bytes.subarray(start, end);

    rows.push({
      batch_id: batchId,
      file_type: fileType,
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      file_size: file.size,
      chunk_index: chunkIndex,
      total_chunks: totalChunks,
      chunk_base64: bytesToBase64(slice),
    });
  }

  for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
    const batchRows = rows.slice(i, i + INSERT_BATCH_SIZE);
    const { error } = await supabase.from('temp_upload_file_chunks').insert(batchRows);
    if (error) {
      throw new Error(`Falha ao salvar chunk (${fileType}): ${error.message}`);
    }
  }
}

export function useTemporaryUploadStorage() {
  const [isPersistingUploads, setIsPersistingUploads] = useState(false);

  const persistFilesTemporarily = useCallback(async (files: UploadFilesInput): Promise<void> => {
    const hasAnyFile = Object.values(files).some(Boolean);
    if (!hasAnyFile) return;

    setIsPersistingUploads(true);

    try {
      const { data: batchData, error: batchError } = await supabase
        .from('temp_upload_batches')
        .upsert(
          {
            snapshot_key: 'latest',
            opp_file_name: files.opportunities?.name ?? null,
            act_file_name: files.commitments?.name ?? null,
            goal_file_name: files.goals?.name ?? null,
            pedido_file_name: files.orders?.name ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'snapshot_key' },
        )
        .select('id')
        .single();

      if (batchError || !batchData?.id) {
        throw new Error(batchError?.message || 'Não foi possível criar snapshot temporário');
      }

      const batchId = batchData.id;

      const { error: deleteError } = await supabase
        .from('temp_upload_file_chunks')
        .delete()
        .eq('batch_id', batchId);

      if (deleteError) {
        throw new Error(`Falha ao limpar snapshot anterior: ${deleteError.message}`);
      }

      if (files.opportunities) {
        await insertChunks(batchId, 'opportunities', files.opportunities);
      }
      if (files.commitments) {
        await insertChunks(batchId, 'commitments', files.commitments);
      }
      if (files.goals) {
        await insertChunks(batchId, 'goals', files.goals);
      }
      if (files.orders) {
        await insertChunks(batchId, 'orders', files.orders);
      }

      console.info('[UPLOAD_DB] Snapshot temporário salvo com sucesso', {
        batchId,
        files: {
          opportunities: files.opportunities?.name ?? null,
          commitments: files.commitments?.name ?? null,
          goals: files.goals?.name ?? null,
          orders: files.orders?.name ?? null,
        },
      });
    } finally {
      setIsPersistingUploads(false);
    }
  }, []);

  return { isPersistingUploads, persistFilesTemporarily };
}
