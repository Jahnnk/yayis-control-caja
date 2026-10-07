-- =============================================================
-- Origen de cada gasto: «administrador» o «compras» (pedido de Jahnn, 8-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- Los gastos que hace Fabio (Compras) nacen al CERRAR una rendición: cada compra al contado se convierte
-- en un gasto de la sede. Esta marca permite separarlos de los gastos que registran los administradores
-- (Registro de Gastos) y armar el consolidado para reposición.
--   · gastos.origen = 'compras'      → viene de una compra de Fabio (cerrar_entrega)
--   · gastos.origen = 'administrador' → todo lo demás (lo que registra el administrador)
-- 1. Agrega la columna y marca los gastos que ya vienen de compras.
-- 2. Un disparador marca solo, de ahora en adelante, los gastos que crea el cierre de una rendición.
-- No cambia montos, fechas, estados ni reposiciones.
-- =============================================================

ALTER TABLE gastos ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'administrador';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gastos_origen_valido') THEN
    ALTER TABLE gastos ADD CONSTRAINT gastos_origen_valido CHECK (origen IN ('administrador', 'compras'));
  END IF;
END $$;

-- 1. Los gastos que ya nacieron de una compra.
UPDATE gastos SET origen = 'compras'
WHERE origen <> 'compras' AND id IN (SELECT gasto_id FROM compras WHERE gasto_id IS NOT NULL);

-- 2. Desde ahora, el cierre de rendición marca el gasto que crea (SECURITY DEFINER: el administrador
--    no puede editar gastos de días anteriores, y esta marca no depende de eso).
CREATE OR REPLACE FUNCTION public.marcar_gasto_de_compras()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE gastos SET origen = 'compras' WHERE id = NEW.gasto_id AND origen <> 'compras';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_marcar_gasto_de_compras ON compras;
CREATE TRIGGER trg_marcar_gasto_de_compras AFTER INSERT OR UPDATE OF gasto_id ON compras
  FOR EACH ROW WHEN (NEW.gasto_id IS NOT NULL)
  EXECUTE FUNCTION marcar_gasto_de_compras();

-- Verificación: cuántos gastos hay de cada origen.
SELECT origen, count(*) AS gastos, round(sum(monto)::numeric, 2) AS monto FROM gastos GROUP BY origen ORDER BY origen;
