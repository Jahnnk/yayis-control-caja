-- =============================================================
-- Precio de referencia en la lista de compra (pedido de Jahnn, 7-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- El administrador puede escribir, producto por producto, el precio que cree que costará
-- (S/ por kg, por litro o por unidad). Fabio recibe la lista con ese precio; si al comprar
-- cambia, lo corrige y el sistema calcula cuánto subió o bajó frente a la referencia.
-- Solo AGREGA una columna opcional. No cambia ninguna lista ni compra existente.
-- =============================================================

ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS precio_referencia NUMERIC(10,2) CHECK (precio_referencia IS NULL OR precio_referencia >= 0);

-- Verificación: debe salir 1.
SELECT count(*) AS columna FROM information_schema.columns WHERE table_name = 'pedido_items' AND column_name = 'precio_referencia';
