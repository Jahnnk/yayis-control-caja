-- =============================================================
-- Fase 1 — Base multi-sede (Atelier, Fonavi, Centro)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase.
-- Es seguro volver a ejecutarlo: no duplica nada.
-- =============================================================

-- 1. Nuevo rol "compras" (Fabio). Se agrega ahora; su pantalla llega en la Fase 2.
ALTER TYPE rol_usuario ADD VALUE IF NOT EXISTS 'compras';

-- 2. La sede original se creó con el nombre "Fonavi", pero sus datos son de Atelier (Luis).
--    Solo cambia el NOMBRE: gastos, reposiciones, categorías y usuarios siguen en la misma sede.
--    Si no se encuentra la sede esperada, el script se detiene sin cambiar nada.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sedes WHERE nombre = 'Atelier') THEN
    IF NOT EXISTS (SELECT 1 FROM sedes WHERE nombre = 'Fonavi') THEN
      RAISE EXCEPTION 'No encontré la sede "Fonavi" para renombrarla a "Atelier". No se cambió nada.';
    END IF;
    UPDATE sedes SET nombre = 'Atelier' WHERE nombre = 'Fonavi';
  END IF;
END $$;

-- 3. Sedes nuevas y vacías para Sol (Fonavi) y Chari (Centro).
INSERT INTO sedes (nombre, activa) VALUES ('Fonavi', true), ('Centro', true)
ON CONFLICT (nombre) DO NOTHING;

-- 4. Calendario de compras por sede (0 = domingo ... 6 = sábado).
--    Solo se llena si está vacío, para no pisar cambios hechos después desde Configuración.
ALTER TABLE sedes ADD COLUMN IF NOT EXISTS dias_compra SMALLINT[] NOT NULL DEFAULT '{}';
UPDATE sedes SET dias_compra = '{1,4}' WHERE nombre = 'Atelier' AND dias_compra = '{}';  -- lunes y jueves
UPDATE sedes SET dias_compra = '{1,3}' WHERE nombre = 'Fonavi'  AND dias_compra = '{}';  -- lunes y miércoles
UPDATE sedes SET dias_compra = '{2,5}' WHERE nombre = 'Centro'  AND dias_compra = '{}';  -- martes y viernes

-- 5. Las sedes nuevas arrancan con las mismas categorías de gasto que Atelier.
INSERT INTO categorias (nombre, sede_id, orden, activa)
SELECT c.nombre, s.id, c.orden, c.activa
FROM categorias c
JOIN sedes a ON a.id = c.sede_id AND a.nombre = 'Atelier'
CROSS JOIN sedes s
WHERE s.nombre IN ('Fonavi', 'Centro')
ON CONFLICT (nombre, sede_id) DO NOTHING;

-- 6. Constancias (fotos/PDF de los gastos): se asegura que estén instaladas y
--    se permite que Gerencia suba constancias en cualquier sede (antes solo en la suya).
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS constancia_path TEXT;

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
  AND (storage.foldername(name))[2] = auth.uid()::TEXT
  AND (
    public.get_user_rol() = 'owner'
    OR (
      public.get_user_rol() = 'admin'
      AND (storage.foldername(name))[1] = public.get_user_sede_id()::TEXT
    )
  )
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

-- 7. Verificación: Atelier debe tener TODOS los gastos de siempre; Fonavi y Centro, cero.
SELECT
  s.nombre,
  s.dias_compra,
  (SELECT count(*) FROM gastos g WHERE g.sede_id = s.id)     AS gastos,
  (SELECT count(*) FROM categorias c WHERE c.sede_id = s.id) AS categorias,
  (SELECT string_agg(p.nombre || ' (' || p.rol || ')', ', ')
     FROM profiles p WHERE p.sede_id = s.id)                 AS usuarios
FROM sedes s
ORDER BY s.nombre;
