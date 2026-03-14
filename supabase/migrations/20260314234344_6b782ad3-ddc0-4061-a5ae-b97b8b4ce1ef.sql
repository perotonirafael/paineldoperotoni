-- Persistência temporária dos uploads com sobrescrita por chave lógica "latest"
CREATE TABLE IF NOT EXISTS public.temp_upload_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_key TEXT NOT NULL UNIQUE,
  opp_file_name TEXT,
  act_file_name TEXT,
  goal_file_name TEXT,
  pedido_file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.temp_upload_file_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.temp_upload_batches(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER NOT NULL DEFAULT 0,
  chunk_index INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  chunk_base64 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT temp_upload_file_chunks_unique_chunk UNIQUE (batch_id, file_type, chunk_index),
  CONSTRAINT temp_upload_file_chunks_file_type_chk CHECK (
    file_type IN ('opportunities', 'commitments', 'goals', 'orders')
  )
);

CREATE INDEX IF NOT EXISTS idx_temp_upload_chunks_batch_file
  ON public.temp_upload_file_chunks (batch_id, file_type, chunk_index);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.set_temp_upload_batches_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_temp_upload_batches_updated_at ON public.temp_upload_batches;
CREATE TRIGGER trg_temp_upload_batches_updated_at
BEFORE UPDATE ON public.temp_upload_batches
FOR EACH ROW
EXECUTE FUNCTION public.set_temp_upload_batches_updated_at();

ALTER TABLE public.temp_upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.temp_upload_file_chunks ENABLE ROW LEVEL SECURITY;

-- App atual é pública (sem login obrigatório): políticas permissivas controladas por chave lógica
DROP POLICY IF EXISTS "temp_upload_batches_select_all" ON public.temp_upload_batches;
CREATE POLICY "temp_upload_batches_select_all"
ON public.temp_upload_batches
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "temp_upload_batches_insert_all" ON public.temp_upload_batches;
CREATE POLICY "temp_upload_batches_insert_all"
ON public.temp_upload_batches
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "temp_upload_batches_update_all" ON public.temp_upload_batches;
CREATE POLICY "temp_upload_batches_update_all"
ON public.temp_upload_batches
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "temp_upload_batches_delete_all" ON public.temp_upload_batches;
CREATE POLICY "temp_upload_batches_delete_all"
ON public.temp_upload_batches
FOR DELETE
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "temp_upload_chunks_select_all" ON public.temp_upload_file_chunks;
CREATE POLICY "temp_upload_chunks_select_all"
ON public.temp_upload_file_chunks
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "temp_upload_chunks_insert_all" ON public.temp_upload_file_chunks;
CREATE POLICY "temp_upload_chunks_insert_all"
ON public.temp_upload_file_chunks
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "temp_upload_chunks_update_all" ON public.temp_upload_file_chunks;
CREATE POLICY "temp_upload_chunks_update_all"
ON public.temp_upload_file_chunks
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "temp_upload_chunks_delete_all" ON public.temp_upload_file_chunks;
CREATE POLICY "temp_upload_chunks_delete_all"
ON public.temp_upload_file_chunks
FOR DELETE
TO anon, authenticated
USING (true);