-- ============================================================================
-- Delivery de compras — carreras con varias tarifas (pedido de Jahnn, 24-nov-2026)
-- ============================================================================
-- «No siempre es 6: en ocasiones, por la distancia, cobra más.» Las carreras de una compra se anotan por tramos
-- (5 carreras × S/ 6 + 2 × S/ 8). Se guarda el detalle y el gasto de carreras lo muestra.
-- Requiere haber corrido antes supabase/delivery_de_compras.sql. No cambia datos existentes.
-- Ejecutar completo en el SQL Editor de Supabase. Al final debe salir una tabla con 2 piezas en 1.
-- ============================================================================

ALTER TABLE encargos_repartidor ADD COLUMN IF NOT EXISTS detalle_carreras JSONB;

-- La función cambia de forma (las carreras llegan por tramos): se quita la anterior.
DROP FUNCTION IF EXISTS public.registrar_compra_repartidor(UUID, UUID, UUID, DATE, INTEGER, NUMERIC, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.registrar_compra_repartidor(
  p_sede UUID, p_repartidor UUID, p_pedido UUID, p_fecha DATE,
  p_carreras JSONB, p_notas TEXT, p_compras JSONB
) RETURNS UUID AS $$
DECLARE
  v_encargo UUID;
  v_compra JSONB;
  v_item JSONB;
  v_compra_id UUID;
  v_total NUMERIC;
  v_total_todo NUMERIC := 0;
  v_items INTEGER;
  v_pi UUID;
  v_tramos JSONB;
  v_cant INTEGER;
  v_total_carreras NUMERIC;
  v_precios INTEGER;
BEGIN
  IF NOT puede_pedir_en_sede(p_sede) THEN
    RAISE EXCEPTION 'No tienes permiso para registrar compras de esta sede.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM repartidores WHERE id = p_repartidor AND activo) THEN
    RAISE EXCEPTION 'Elige el delivery que hizo la compra.';
  END IF;
  IF p_fecha IS NULL OR p_fecha > (now() AT TIME ZONE 'America/Lima')::date THEN
    RAISE EXCEPTION 'La fecha de la compra no puede ser futura.';
  END IF;
  -- Carreras por tramos: [{cantidad, precio}] (no siempre cuesta lo mismo: más lejos cobra más).
  IF p_carreras IS NOT NULL AND jsonb_typeof(p_carreras) <> 'array' THEN
    RAISE EXCEPTION 'Las carreras no tienen el formato esperado.';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(p_carreras, '[]'::jsonb)) t
             WHERE COALESCE((t->>'cantidad')::NUMERIC, 0) < 0 OR COALESCE((t->>'precio')::NUMERIC, 0) < 0
                OR (t->>'cantidad')::NUMERIC <> trunc((t->>'cantidad')::NUMERIC)) THEN
    RAISE EXCEPTION 'Revisa las carreras: cantidad entera y precio no negativo.';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('cantidad', (t->>'cantidad')::INTEGER, 'precio', round((t->>'precio')::NUMERIC, 2))), '[]'::jsonb),
         COALESCE(sum((t->>'cantidad')::INTEGER), 0),
         COALESCE(sum(round((t->>'cantidad')::INTEGER * round((t->>'precio')::NUMERIC, 2), 2)), 0),
         count(DISTINCT round((t->>'precio')::NUMERIC, 2))
    INTO v_tramos, v_cant, v_total_carreras, v_precios
    FROM jsonb_array_elements(COALESCE(p_carreras, '[]'::jsonb)) t
   WHERE COALESCE((t->>'cantidad')::INTEGER, 0) > 0;
  IF p_pedido IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pedidos WHERE id = p_pedido AND sede_id = p_sede) THEN
    RAISE EXCEPTION 'Esa lista no es de esta sede.';
  END IF;
  IF jsonb_typeof(p_compras) <> 'array' OR jsonb_array_length(p_compras) = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un producto comprado.';
  END IF;

  -- precio_carrera: el precio si fue uno solo; si hubo varios, el promedio (el detalle queda en detalle_carreras).
  INSERT INTO encargos_repartidor (sede_id, repartidor_id, pedido_id, fecha, carreras, precio_carrera, total_carreras, detalle_carreras, notas, registrado_por)
  VALUES (p_sede, p_repartidor, p_pedido, p_fecha, v_cant,
          CASE WHEN v_cant > 0 THEN round(v_total_carreras / v_cant, 2) ELSE 0 END,
          round(v_total_carreras, 2), CASE WHEN v_precios > 1 THEN v_tramos END, NULLIF(trim(COALESCE(p_notas, '')), ''), auth.uid())
  RETURNING id INTO v_encargo;

  FOR v_compra IN SELECT * FROM jsonb_array_elements(p_compras) LOOP
    IF NOT EXISTS (SELECT 1 FROM categorias WHERE id = (v_compra->>'categoria_id')::UUID AND sede_id = p_sede) THEN
      RAISE EXCEPTION 'Elige la categoría de gasto de cada proveedor.';
    END IF;
    SELECT COALESCE(sum((i->>'precio_total')::NUMERIC), 0), count(*) INTO v_total, v_items
      FROM jsonb_array_elements(v_compra->'items') i;
    IF v_items = 0 THEN RAISE EXCEPTION 'Cada proveedor debe tener al menos un producto.'; END IF;
    IF v_total <= 0 THEN RAISE EXCEPTION 'Escribe cuánto se pagó por los productos.'; END IF;

    INSERT INTO compras (sede_id, proveedor_id, pedido_id, encargo_id, fecha, total, condicion_pago, metodo_pago,
                         tipo_comprobante, numero_comprobante, estado_pago, evidencia_comprobante_path,
                         evidencia_producto_path, categoria_id, registrado_por, observacion)
    VALUES (p_sede, (v_compra->>'proveedor_id')::UUID, p_pedido, v_encargo, p_fecha, round(v_total, 2), 'reembolso', NULL,
            v_compra->>'tipo_comprobante', NULLIF(trim(COALESCE(v_compra->>'numero_comprobante', '')), ''), 'pagado',
            NULLIF(v_compra->>'evidencia_comprobante_path', ''), NULLIF(v_compra->>'evidencia_producto_path', ''),
            (v_compra->>'categoria_id')::UUID, auth.uid(), NULLIF(trim(COALESCE(v_compra->>'observacion', '')), ''))
    RETURNING id INTO v_compra_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_compra->'items') LOOP
      IF COALESCE((v_item->>'cantidad')::NUMERIC, 0) <= 0 OR COALESCE((v_item->>'precio_total')::NUMERIC, -1) < 0 THEN
        RAISE EXCEPTION 'Revisa la cantidad y el precio de cada producto.';
      END IF;
      v_pi := NULLIF(v_item->>'pedido_item_id', '')::UUID;
      IF v_pi IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM pedido_items pi JOIN pedidos p ON p.id = pi.pedido_id WHERE pi.id = v_pi AND p.sede_id = p_sede
      ) THEN
        v_pi := NULL; -- un producto de otra lista no se enlaza
      END IF;
      INSERT INTO compra_items (compra_id, pedido_item_id, producto_id, cantidad, unidad, precio_total)
      VALUES (v_compra_id, v_pi, (v_item->>'producto_id')::UUID, (v_item->>'cantidad')::NUMERIC, v_item->>'unidad',
              round((v_item->>'precio_total')::NUMERIC, 2));
      -- El producto de la lista: comprado y recibido conforme (el administrador lo está registrando al recibirlo).
      IF v_pi IS NOT NULL THEN
        UPDATE pedido_items SET estado = 'comprado' WHERE id = v_pi AND estado <> 'comprado';
        UPDATE pedido_items SET entregado_at = now(), recepcion_estado = 'conforme'
          WHERE id = v_pi AND entregado_at IS NULL;
      END IF;
    END LOOP;
    v_total_todo := v_total_todo + v_total;
  END LOOP;

  UPDATE encargos_repartidor SET total_compras = round(v_total_todo, 2) WHERE id = v_encargo;

  -- Si ya no queda nada pendiente en la lista, pasa a comprada (y a recibida si todo se revisó: lo hace su disparador).
  IF p_pedido IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pedido_items WHERE pedido_id = p_pedido AND estado = 'pendiente') THEN
    UPDATE pedidos SET estado = 'comprado', comprado_at = COALESCE(comprado_at, now())
      WHERE id = p_pedido AND estado = 'enviado';
  END IF;
  RETURN v_encargo;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.registrar_compra_repartidor(UUID, UUID, UUID, DATE, JSONB, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_compra_repartidor(UUID, UUID, UUID, DATE, JSONB, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.pagar_repartidor(p_encargo UUID, p_metodo metodo_pago_tipo, p_evidencia TEXT, p_fecha DATE)
RETURNS JSONB AS $$
DECLARE
  v_enc encargos_repartidor%ROWTYPE;
  v_rep TEXT;
  v_compra RECORD;
  v_gasto UUID;
  v_cat UUID;
  v_mes TEXT;
  v_num INTEGER;
  v_n INTEGER := 0;
  v_meses TEXT[] := ARRAY['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio',
                          'Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
BEGIN
  SELECT * INTO v_enc FROM encargos_repartidor WHERE id = p_encargo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe ese registro.'; END IF;
  IF NOT puede_pedir_en_sede(v_enc.sede_id) THEN RAISE EXCEPTION 'No tienes permiso en esta sede.'; END IF;
  IF v_enc.estado <> 'por_pagar' THEN RAISE EXCEPTION 'Ya se le pagó.'; END IF;
  IF p_metodo IS NULL THEN RAISE EXCEPTION 'Indica cómo le pagaste.'; END IF;
  IF p_metodo = 'cuentas' AND COALESCE(p_evidencia, '') = '' THEN
    RAISE EXCEPTION 'Sube la captura del Yape o la transferencia.';
  END IF;
  IF p_fecha IS NULL OR p_fecha < v_enc.fecha OR p_fecha > (now() AT TIME ZONE 'America/Lima')::date THEN
    RAISE EXCEPTION 'La fecha del pago no puede ser antes de la compra ni futura.';
  END IF;
  SELECT nombre INTO v_rep FROM repartidores WHERE id = v_enc.repartidor_id;
  v_mes := v_meses[EXTRACT(MONTH FROM v_enc.fecha)::INT] || ' ' || EXTRACT(YEAR FROM v_enc.fecha)::INT;

  -- Un gasto por compra (por proveedor), con su comprobante. El disparador de compras lo marca con origen «compras».
  FOR v_compra IN
    SELECT c.*, pr.nombre AS proveedor FROM compras c JOIN proveedores pr ON pr.id = c.proveedor_id
    WHERE c.encargo_id = p_encargo AND c.gasto_id IS NULL ORDER BY c.created_at
  LOOP
    SELECT COALESCE(MAX(numero_registro), 0) + 1 INTO v_num FROM gastos WHERE sede_id = v_enc.sede_id AND mes = v_mes;
    INSERT INTO gastos (numero_registro, fecha, descripcion, categoria_id, metodo_pago, monto, estado, notas,
                        semana, mes, sede_id, registrado_por, constancia_path, proveedor_id)
    VALUES (v_num, v_enc.fecha, 'Compra a ' || v_compra.proveedor, v_compra.categoria_id, p_metodo, v_compra.total, 'pendiente',
            concat_ws(' · ',
              CASE WHEN v_compra.tipo_comprobante = 'sin_comprobante' THEN 'Sin comprobante'
                   ELSE initcap(v_compra.tipo_comprobante) || COALESCE(' ' || v_compra.numero_comprobante, '') END,
              'La pagó ' || COALESCE(v_rep, 'el delivery') || ' y se le devolvió',
              v_compra.observacion),
            calcular_semana_mes(v_enc.fecha), v_mes, v_enc.sede_id, auth.uid(),
            COALESCE(v_compra.evidencia_comprobante_path, v_compra.evidencia_producto_path, p_evidencia),
            v_compra.proveedor_id)
    RETURNING id INTO v_gasto;
    UPDATE compras SET gasto_id = v_gasto WHERE id = v_compra.id;
    v_n := v_n + 1;
  END LOOP;

  -- Las carreras: un gasto de Delivery y fletes, pagado con el monto semanal de compras.
  IF v_enc.total_carreras > 0 THEN
    SELECT id INTO v_cat FROM categorias
      WHERE sede_id = v_enc.sede_id AND (upper(nombre) LIKE 'DELIVERY%' OR upper(nombre) LIKE '%FLETE%')
      ORDER BY (upper(nombre) LIKE 'DELIVERY Y FLETES%') DESC, nombre LIMIT 1;
    IF v_cat IS NULL THEN RAISE EXCEPTION 'Esta sede no tiene la categoría «Delivery y fletes».'; END IF;
    SELECT COALESCE(MAX(numero_registro), 0) + 1 INTO v_num FROM gastos WHERE sede_id = v_enc.sede_id AND mes = v_mes;
    INSERT INTO gastos (numero_registro, fecha, descripcion, categoria_id, metodo_pago, monto, estado, notas,
                        semana, mes, sede_id, registrado_por, constancia_path, con_monto_semanal)
    VALUES (v_num, v_enc.fecha, 'Carreras de ' || COALESCE(v_rep, 'delivery') || ' (compras)', v_cat, p_metodo, v_enc.total_carreras,
            'pendiente',
            CASE WHEN v_enc.detalle_carreras IS NOT NULL THEN
                   v_enc.carreras || ' carreras: ' || (SELECT string_agg((t->>'cantidad') || ' × S/ ' || to_char((t->>'precio')::NUMERIC, 'FM9990.00'), ' + ')
                                                     FROM jsonb_array_elements(v_enc.detalle_carreras) t)
                 ELSE v_enc.carreras || ' carreras × S/ ' || to_char(v_enc.precio_carrera, 'FM9990.00') END,
            calcular_semana_mes(v_enc.fecha), v_mes, v_enc.sede_id, auth.uid(), p_evidencia, true)
    RETURNING id INTO v_gasto;
    UPDATE encargos_repartidor SET gasto_carreras_id = v_gasto WHERE id = p_encargo;
    v_n := v_n + 1;
  END IF;

  UPDATE encargos_repartidor
     SET estado = 'pagado', metodo_pago = p_metodo, evidencia_pago_path = NULLIF(p_evidencia, ''), fecha_pago = p_fecha,
         pagado_at = now(), pagado_por = auth.uid()
   WHERE id = p_encargo;
  RETURN jsonb_build_object('gastos', v_n, 'total', v_enc.total_compras + v_enc.total_carreras);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.pagar_repartidor(UUID, metodo_pago_tipo, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pagar_repartidor(UUID, metodo_pago_tipo, TEXT, DATE) TO authenticated;

-- Verificación: deben salir las 2 piezas en 1.
SELECT 'columna detalle_carreras' AS pieza, count(*)::TEXT AS valor FROM information_schema.columns
  WHERE table_name = 'encargos_repartidor' AND column_name = 'detalle_carreras'
UNION ALL SELECT 'función con tramos', count(*)::TEXT FROM pg_proc
  WHERE proname = 'registrar_compra_repartidor' AND pg_get_function_identity_arguments(oid) LIKE '%p_carreras jsonb%';
