-- =============================================================
-- Cerrar una rendición reabierta (20-oct-2026)
-- Ejecutar en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- cerrar_entrega calculaba la diferencia (entregado − gastado − vuelto) solo con las compras
-- que aún no eran gasto. En una rendición reabierta (las compras viejas ya eran gasto) el cálculo
-- salía mal y «el saldo que sigue con Compras» no cuadraba. Ahora usa todas las compras.
-- Sigue creando gastos SOLO para las compras nuevas (no duplica nada). Nada más cambia.
-- =============================================================

CREATE OR REPLACE FUNCTION public.cerrar_entrega(p_entrega UUID, p_vuelto_recibido NUMERIC)
RETURNS JSONB AS $$
DECLARE
  v_ent entregas%ROWTYPE;
  v_compra RECORD;
  v_gasto UUID;
  v_total NUMERIC := 0;
  v_gastado_todo NUMERIC := 0;
  v_cantidad INTEGER := 0;
  v_mes TEXT;
  v_num INTEGER;
  v_meses TEXT[] := ARRAY['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio',
                          'Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
BEGIN
  SELECT * INTO v_ent FROM entregas WHERE id = p_entrega FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe esa entrega.'; END IF;
  IF NOT puede_pedir_en_sede(v_ent.sede_id) THEN
    RAISE EXCEPTION 'No tienes permiso para cerrar entregas de esta sede.';
  END IF;
  IF v_ent.estado <> 'rendida' THEN
    RAISE EXCEPTION 'Compras todavía no rindió esta entrega (o ya se cerró).';
  END IF;
  IF p_vuelto_recibido IS NULL OR p_vuelto_recibido < 0 THEN
    RAISE EXCEPTION 'Indica cuánto vuelto recibiste (0 si no hubo).';
  END IF;
  IF EXISTS (
    SELECT 1 FROM compras c
    LEFT JOIN categorias cat ON cat.id = c.categoria_id AND cat.sede_id = v_ent.sede_id
    WHERE c.entrega_id = p_entrega AND c.gasto_id IS NULL AND cat.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Elige la categoría de gasto de cada compra antes de cerrar.';
  END IF;

  FOR v_compra IN
    SELECT c.*, pr.nombre AS proveedor
    FROM compras c JOIN proveedores pr ON pr.id = c.proveedor_id
    WHERE c.entrega_id = p_entrega AND c.gasto_id IS NULL
    ORDER BY c.fecha, c.created_at
  LOOP
    -- Mismo formato que la app: "Septiembre 2026" y la semana del mes.
    v_mes := v_meses[EXTRACT(MONTH FROM v_compra.fecha)::INT] || ' ' || EXTRACT(YEAR FROM v_compra.fecha)::INT;
    SELECT COALESCE(MAX(numero_registro), 0) + 1 INTO v_num
      FROM gastos WHERE sede_id = v_ent.sede_id AND mes = v_mes;

    INSERT INTO gastos (numero_registro, fecha, descripcion, categoria_id, metodo_pago, monto, estado,
                        notas, semana, mes, sede_id, registrado_por, constancia_path)
    VALUES (
      v_num,
      v_compra.fecha,
      'Compra a ' || v_compra.proveedor,
      v_compra.categoria_id,
      v_ent.metodo_pago,
      v_compra.total,
      'pendiente',
      trim(both ' ' FROM concat_ws(' · ',
        CASE WHEN v_compra.tipo_comprobante = 'sin_comprobante' THEN 'Sin comprobante'
             ELSE initcap(v_compra.tipo_comprobante) || COALESCE(' ' || v_compra.numero_comprobante, '') END,
        'Pagó ' || CASE WHEN v_compra.metodo_pago = 'cuentas' THEN 'Yape/transferencia' ELSE 'efectivo' END,
        v_compra.observacion)),
      calcular_semana_mes(v_compra.fecha),
      v_mes,
      v_ent.sede_id,
      auth.uid(),
      COALESCE(v_compra.evidencia_comprobante_path, v_compra.evidencia_producto_path)
    )
    RETURNING id INTO v_gasto;

    UPDATE compras SET gasto_id = v_gasto WHERE id = v_compra.id;
    v_total := v_total + v_compra.total;
    v_cantidad := v_cantidad + 1;
  END LOOP;

  -- La diferencia se calcula con TODAS las compras de la entrega (también las que ya eran gasto
  -- si la rendición se reabrió); arriba solo se crean gastos para las compras nuevas.
  SELECT COALESCE(SUM(total), 0) INTO v_gastado_todo FROM compras WHERE entrega_id = p_entrega;

  UPDATE entregas
     SET estado = 'cerrada', cerrada_at = now(), cerrada_por = auth.uid(), vuelto_recibido = p_vuelto_recibido
   WHERE id = p_entrega;

  RETURN jsonb_build_object(
    'gastos_creados', v_cantidad,
    'total_gastado', v_total,
    -- > 0: faltó dinero · < 0: Compras puso de su bolsillo
    'diferencia', v_ent.monto - v_gastado_todo - p_vuelto_recibido
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

SELECT 'cerrar_entrega corregida' AS pieza, count(*) AS valor FROM pg_proc WHERE proname = 'cerrar_entrega' AND prosrc LIKE '%v_gastado_todo%';
