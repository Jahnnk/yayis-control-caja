-- =============================================================
-- Recojo sin pago (S/ 0) y total repartido (pedido de Fabio, 6-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- 1. «Recojo sin pago»: Fabio recoge productos que ya estaban pagados. Se guarda una compra de
--    S/ 0 que NO pide dinero entregado, forma de pago, boleta ni fotos (no sale dinero de nadie).
--    Las compras con dinero siguen con exactamente las mismas reglas de siempre.
-- 2. «Total repartido»: cuando el vendedor solo da el total, el sistema reparte ese total entre los
--    productos. Esas líneas se marcan (precio_repartido) para NO usarlas en el seguimiento de
--    precios ni en las alertas de precio.
-- No cambia ninguna compra ni gasto existente.
-- =============================================================

-- 1. El total de una compra puede ser S/ 0 (antes debía ser mayor a 0).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'compras'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%total > %' AND conname NOT LIKE 'compras_total_no_negativo'
  LOOP
    EXECUTE format('ALTER TABLE compras DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE compras DROP CONSTRAINT IF EXISTS compras_total_no_negativo;
ALTER TABLE compras ADD CONSTRAINT compras_total_no_negativo CHECK (total >= 0);

-- 2. Con total S/ 0 no hace falta entrega, forma de pago ni fotos.
ALTER TABLE compras DROP CONSTRAINT IF EXISTS compras_contado_completo;
ALTER TABLE compras ADD CONSTRAINT compras_contado_completo CHECK (
  condicion_pago <> 'contado' OR total = 0 OR (entrega_id IS NOT NULL AND metodo_pago IS NOT NULL)
);

ALTER TABLE compras DROP CONSTRAINT IF EXISTS compras_evidencia_obligatoria;
ALTER TABLE compras ADD CONSTRAINT compras_evidencia_obligatoria CHECK (
  evidencia_pendiente
  OR total = 0
  OR CASE
       WHEN tipo_comprobante = 'sin_comprobante' THEN
         metodo_pago = 'efectivo'
         OR (metodo_pago = 'cuentas' AND evidencia_producto_path IS NOT NULL AND evidencia_pago_path IS NOT NULL)
       ELSE
         evidencia_comprobante_path IS NOT NULL
         AND (condicion_pago = 'credito' OR metodo_pago = 'efectivo' OR evidencia_pago_path IS NOT NULL)
     END
);

-- 3. Líneas con precio repartido a partir de un total.
ALTER TABLE compra_items ADD COLUMN IF NOT EXISTS precio_repartido BOOLEAN NOT NULL DEFAULT false;

-- Verificación: debe salir 1 restricción de total (>= 0), 1 columna y 0 líneas repartidas.
SELECT
  (SELECT count(*) FROM pg_constraint WHERE conname = 'compras_total_no_negativo') AS restriccion_total,
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'compra_items' AND column_name = 'precio_repartido') AS columna,
  (SELECT count(*) FROM compra_items WHERE precio_repartido) AS lineas_repartidas;
