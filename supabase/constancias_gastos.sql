-- =============================================================
-- Constancias privadas para gastos
-- Ejecutar este archivo UNA VEZ en el SQL Editor de Supabase.
-- No modifica los gastos existentes ni sus montos.
-- =============================================================

ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS constancia_path TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'constancias-gastos',
  'constancias-gastos',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "constancias_select_sede" ON storage.objects;
CREATE POLICY "constancias_select_sede"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'constancias-gastos'
  AND (
    public.get_user_rol() = 'owner'
    OR (storage.foldername(name))[1] = public.get_user_sede_id()::TEXT
  )
);

DROP POLICY IF EXISTS "constancias_insert_sede" ON storage.objects;
CREATE POLICY "constancias_insert_sede"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'constancias-gastos'
  AND public.get_user_rol() IN ('owner', 'admin')
  AND (storage.foldername(name))[1] = public.get_user_sede_id()::TEXT
  AND (storage.foldername(name))[2] = auth.uid()::TEXT
);

DROP POLICY IF EXISTS "constancias_delete_propias" ON storage.objects;
CREATE POLICY "constancias_delete_propias"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'constancias-gastos'
  AND (
    public.get_user_rol() = 'owner'
    OR owner_id = auth.uid()::TEXT
  )
);

COMMENT ON COLUMN public.gastos.constancia_path IS
  'Ruta privada de la foto o PDF de la constancia en Storage';
