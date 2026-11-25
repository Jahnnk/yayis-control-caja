-- ============================================================================
-- Delivery de compras — los administradores agregan otro delivery (pedido de Jahnn, 24-nov-2026)
-- ============================================================================
-- El delivery habitual es un tercero: a veces no puede y se pide otro (p. ej. una app de delivery). El
-- administrador lo agrega al registrar la compra, sin esperar a Gerencia. Editar o desactivar sigue siendo
-- de Gerencia. Requiere haber corrido supabase/delivery_de_compras.sql. No cambia datos existentes.
-- Ejecutar completo en el SQL Editor de Supabase. Al final debe salir 1.
-- ============================================================================

DROP POLICY IF EXISTS "repartidores_insert_admin" ON repartidores;
CREATE POLICY "repartidores_insert_admin" ON repartidores
  FOR INSERT WITH CHECK (get_user_rol() IN ('owner', 'admin') AND activo);

SELECT count(*) AS politica_nueva FROM pg_policies WHERE tablename = 'repartidores' AND policyname = 'repartidores_insert_admin';
