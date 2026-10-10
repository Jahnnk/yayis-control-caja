-- =============================================================
-- Productos que Gerencia paga directo: Compras solo los recoge (9-oct-2026, pedido de Sol / Fonavi)
-- Ejemplo: la panceta del mercado central la paga Kelly por transferencia; Fabio solo va a recogerla.
-- El administrador lo marca en su lista («Ya pagado · solo recoger»). Compras lo ve en su ruta y,
-- al registrar la compra, ese producto va en S/ 0 (no sale dinero de ninguna entrega).
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo. No cambia datos.
-- =============================================================

ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS pagado_directo BOOLEAN NOT NULL DEFAULT false;

-- Verificación: debe decir 1.
SELECT count(*) AS columna_nueva FROM information_schema.columns
WHERE table_name = 'pedido_items' AND column_name = 'pagado_directo';
