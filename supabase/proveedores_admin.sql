-- =============================================================
-- Proveedores: los administradores de sede también pueden registrarlos
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- Mismas reglas que Compras: el administrador registra y edita proveedores
-- AL CONTADO. Las condiciones de crédito las sigue definiendo solo Gerencia.
-- No toca datos: solo cambia 2 reglas de seguridad de la tabla proveedores.
-- =============================================================

DROP POLICY IF EXISTS "proveedores_insert" ON proveedores;
CREATE POLICY "proveedores_insert" ON proveedores
  FOR INSERT WITH CHECK (
    get_user_rol() = 'owner'
    OR (get_user_rol() IN ('compras', 'admin') AND condicion_pago = 'contado')
  );

DROP POLICY IF EXISTS "proveedores_update" ON proveedores;
CREATE POLICY "proveedores_update" ON proveedores
  FOR UPDATE
  USING (get_user_rol() = 'owner' OR (get_user_rol() IN ('compras', 'admin') AND condicion_pago = 'contado'))
  WITH CHECK (get_user_rol() = 'owner' OR (get_user_rol() IN ('compras', 'admin') AND condicion_pago = 'contado'));

-- Verificación: debe mostrar las 2 reglas con 'admin' dentro.
SELECT policyname, cmd, (with_check LIKE '%admin%' OR qual LIKE '%admin%') AS incluye_admin
FROM pg_policies
WHERE tablename = 'proveedores' AND policyname IN ('proveedores_insert', 'proveedores_update')
ORDER BY policyname;
