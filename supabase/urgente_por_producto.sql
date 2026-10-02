-- =============================================================
-- Productos urgentes dentro de una lista de compra
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- El administrador puede marcar productos puntuales de su lista como URGENTES
-- (por ejemplo fruta y verdura) y Compras los ve primero en su ruta.
-- Solo agrega una columna nueva; no cambia ni borra datos.
-- =============================================================

ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS urgente BOOLEAN NOT NULL DEFAULT false;

-- Verificación: debe mostrar la columna 'urgente' y que ninguna línea está marcada todavía.
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'pedido_items' AND column_name = 'urgente') AS columna_creada,
  (SELECT count(*) FROM pedido_items WHERE urgente) AS lineas_urgentes;
