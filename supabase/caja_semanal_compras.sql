-- =============================================================
-- Caja semanal de compras (acuerdo de Gerencia, 2-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- Cada administrador maneja un monto semanal para las compras de Fabio
-- (Atelier S/ 800, Fonavi S/ 500, Centro S/ 500). Fabio rinde una vez por semana y lo que
-- sobra puede PASAR A LA SEMANA SIGUIENTE: el administrador solo le completa hasta el monto.
--
-- 1) sedes.monto_semanal_compras: el monto semanal de cada sede (editable en Configuración).
-- 2) entregas.saldo_continua: lo que Fabio no devolvió y sigue con él al cerrar la rendición.
-- 3) cerrar_entrega_con_saldo: cierra la rendición y abre una entrega nueva con ese saldo.
-- No borra ni cambia compras, gastos ni reposiciones existentes.
-- =============================================================

ALTER TABLE sedes ADD COLUMN IF NOT EXISTS monto_semanal_compras NUMERIC(10,2)
  CHECK (monto_semanal_compras IS NULL OR monto_semanal_compras >= 0);

-- Valores acordados. Solo se llenan si la sede aún no tiene monto (no pisa lo que se edite después).
UPDATE sedes SET monto_semanal_compras = 800 WHERE nombre = 'Atelier' AND monto_semanal_compras IS NULL;
UPDATE sedes SET monto_semanal_compras = 500 WHERE nombre IN ('Fonavi', 'Centro') AND monto_semanal_compras IS NULL;

ALTER TABLE entregas ADD COLUMN IF NOT EXISTS saldo_continua NUMERIC(10,2) NOT NULL DEFAULT 0
  CHECK (saldo_continua >= 0);

CREATE OR REPLACE FUNCTION public.cerrar_entrega_con_saldo(p_entrega UUID, p_vuelto_recibido NUMERIC, p_saldo_continua NUMERIC)
RETURNS JSONB AS $$
DECLARE
  v_res JSONB;
  v_ent entregas%ROWTYPE;
BEGIN
  IF p_saldo_continua IS NULL OR p_saldo_continua <= 0 THEN
    RAISE EXCEPTION 'El saldo que continúa debe ser mayor a 0 (si no hay saldo, cierra la rendición normal).';
  END IF;

  -- Mismas validaciones y mismos gastos que el cierre normal (permiso, estado, categorías).
  v_res := cerrar_entrega(p_entrega, p_vuelto_recibido);

  -- Lo que Fabio no devolvió debe ser EXACTAMENTE el saldo que sigue con él: no puede quedar dinero sin explicar.
  IF abs((v_res->>'diferencia')::NUMERIC - p_saldo_continua) > 0.009 THEN
    RAISE EXCEPTION 'El saldo que sigue con Compras debe ser exactamente lo que no devolvió (entregado - gastado - vuelto).';
  END IF;

  SELECT * INTO v_ent FROM entregas WHERE id = p_entrega;
  UPDATE entregas SET saldo_continua = p_saldo_continua WHERE id = p_entrega;

  -- El saldo pasa a una entrega nueva, abierta, para que Fabio siga comprando con él.
  INSERT INTO entregas (sede_id, fecha, monto, metodo_pago, receptor_id, entregado_por, notas, estado)
  VALUES (
    v_ent.sede_id, (now() AT TIME ZONE 'America/Lima')::DATE, p_saldo_continua, v_ent.metodo_pago, v_ent.receptor_id, auth.uid(),
    'Saldo que continúa de la entrega del ' || to_char(v_ent.fecha, 'DD/MM'), 'abierta'
  );

  RETURN v_res || jsonb_build_object('saldo_continua', p_saldo_continua, 'diferencia', 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Verificación: columnas y función creadas, y los montos semanales de cada sede.
SELECT 'funcion cerrar_entrega_con_saldo' AS pieza, count(*)::TEXT AS valor FROM pg_proc WHERE proname = 'cerrar_entrega_con_saldo'
UNION ALL
SELECT 'columna entregas.saldo_continua', count(*)::TEXT FROM information_schema.columns WHERE table_name = 'entregas' AND column_name = 'saldo_continua'
UNION ALL
SELECT 'monto semanal ' || nombre, COALESCE(monto_semanal_compras::TEXT, 'sin monto') FROM sedes WHERE activa ORDER BY 1;
