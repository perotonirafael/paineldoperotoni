-- Endurecer políticas RLS para evitar permissões triviais USING/WITH CHECK (true)

DROP POLICY IF EXISTS "temp_upload_batches_insert_all" ON public.temp_upload_batches;
DROP POLICY IF EXISTS "temp_upload_batches_update_all" ON public.temp_upload_batches;
DROP POLICY IF EXISTS "temp_upload_batches_delete_all" ON public.temp_upload_batches;

CREATE POLICY "temp_upload_batches_insert_latest"
ON public.temp_upload_batches
FOR INSERT
TO anon, authenticated
WITH CHECK (snapshot_key = 'latest');

CREATE POLICY "temp_upload_batches_update_latest"
ON public.temp_upload_batches
FOR UPDATE
TO anon, authenticated
USING (snapshot_key = 'latest')
WITH CHECK (snapshot_key = 'latest');

CREATE POLICY "temp_upload_batches_delete_latest"
ON public.temp_upload_batches
FOR DELETE
TO anon, authenticated
USING (snapshot_key = 'latest');

DROP POLICY IF EXISTS "temp_upload_chunks_insert_all" ON public.temp_upload_file_chunks;
DROP POLICY IF EXISTS "temp_upload_chunks_update_all" ON public.temp_upload_file_chunks;
DROP POLICY IF EXISTS "temp_upload_chunks_delete_all" ON public.temp_upload_file_chunks;

CREATE POLICY "temp_upload_chunks_insert_latest"
ON public.temp_upload_file_chunks
FOR INSERT
TO anon, authenticated
WITH CHECK (
  file_type IN ('opportunities', 'commitments', 'goals', 'orders')
  AND EXISTS (
    SELECT 1
    FROM public.temp_upload_batches b
    WHERE b.id = batch_id
      AND b.snapshot_key = 'latest'
  )
);

CREATE POLICY "temp_upload_chunks_update_latest"
ON public.temp_upload_file_chunks
FOR UPDATE
TO anon, authenticated
USING (
  file_type IN ('opportunities', 'commitments', 'goals', 'orders')
  AND EXISTS (
    SELECT 1
    FROM public.temp_upload_batches b
    WHERE b.id = batch_id
      AND b.snapshot_key = 'latest'
  )
)
WITH CHECK (
  file_type IN ('opportunities', 'commitments', 'goals', 'orders')
  AND EXISTS (
    SELECT 1
    FROM public.temp_upload_batches b
    WHERE b.id = batch_id
      AND b.snapshot_key = 'latest'
  )
);

CREATE POLICY "temp_upload_chunks_delete_latest"
ON public.temp_upload_file_chunks
FOR DELETE
TO anon, authenticated
USING (
  file_type IN ('opportunities', 'commitments', 'goals', 'orders')
  AND EXISTS (
    SELECT 1
    FROM public.temp_upload_batches b
    WHERE b.id = batch_id
      AND b.snapshot_key = 'latest'
  )
);