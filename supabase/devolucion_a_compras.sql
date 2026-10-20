-- =============================================================
-- Devolverle a Compras lo que puso de su bolsillo (20-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- Cuando una rendición se cierra con «la sede le debe a Compras» (Compras gastó más de lo
-- que le entregaron), el administrador le devuelve esa plata EN MANO. Antes no había dónde
-- anotarlo y se disfrazaba de «entrega para comprar», lo que enredaba las cuentas.
-- Ahora se marca en la misma rendición: queda quién lo marcó y cuándo.
-- No cambia compras, gastos ni reposiciones.
-- =============================================================

ALTER TABLE entregas ADD COLUMN IF NOT EXISTS devuelto_a_compras NUMERIC(10,2) NOT NULL DEFAULT 0
  CHECK (devuelto_a_compras >= 0);
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS devuelto_a_compras_at TIMESTAMPTZ;
ALTER TABLE entregas ADD COLUMN IF NOT EXISTS devuelto_a_compras_por UUID REFERENCES profiles(id);

CREATE OR REPLACE FUNCTION public.registrar_devolucion_a_compras(p_entrega UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_ent entregas%ROWTYPE;
  v_gastado NUMERIC;
  v_debe NUMERIC;
BEGIN
  SELECT * INTO v_ent FROM entregas WHERE id = p_entrega FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe esa entrega.'; END IF;
  IF NOT puede_pedir_en_sede(v_ent.sede_id) THEN
    RAISE EXCEPTION 'No tienes permiso para esta sede.';
  END IF;
  IF v_ent.estado <> 'cerrada' THEN
    RAISE EXCEPTION 'Primero cierra la rendición.';
  END IF;
  IF v_ent.devuelto_a_compras > 0 THEN
    RAISE EXCEPTION 'Esta devolución ya se registró.';
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_gastado FROM compras WHERE entrega_id = p_entrega;
  -- Lo que la sede le debe a Compras = lo que Compras puso de su bolsillo.
  v_debe := v_gastado + COALESCE(v_ent.vuelto_recibido, 0) + v_ent.saldo_continua - v_ent.monto;
  IF v_debe <= 0 THEN
    RAISE EXCEPTION 'En esta rendición la sede no le debe nada a Compras.';
  END IF;

  UPDATE entregas
     SET devuelto_a_compras = v_debe, devuelto_a_compras_at = now(), devuelto_a_compras_por = auth.uid()
   WHERE id = p_entrega;
  RETURN v_debe;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Verificación: 3 columnas nuevas y la función.
SELECT 'columnas nuevas' AS pieza, count(*)::TEXT AS valor FROM information_schema.columns
  WHERE table_name = 'entregas' AND column_name IN ('devuelto_a_compras', 'devuelto_a_compras_at', 'devuelto_a_compras_por')
UNION ALL
SELECT 'funcion registrar_devolucion_a_compras', count(*)::TEXT FROM pg_proc WHERE proname = 'registrar_devolucion_a_compras';
