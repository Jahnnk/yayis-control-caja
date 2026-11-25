-- ============================================================================
-- Delivery de compras — fase 1 «Recibir y devolverle al delivery» (pedido de Jahnn, 24-nov-2026)
-- ============================================================================
-- Desde que Compras quedó sin persona, cada administrador GESTIONA las compras de su sede: coordina con los
-- proveedores y con un delivery tercerizado que compra con SU plata, saca factura de lo que se puede (en el
-- mercado no siempre) y cobra sus carreras. Ejemplo real: «ya compré todo, pagué S/ 500 (S/ 400 con factura,
-- S/ 100 sin factura) y 7 carreras de S/ 6» → la sede le devuelve S/ 542.
--
-- Qué hace este archivo (NO borra ni cambia datos existentes):
--   1. repartidores: el delivery de compras (nombre, teléfono, precio por carrera).
--   2. encargos_repartidor: cada vez que trae una compra: carreras, total y si ya se le devolvió la plata.
--   3. compras: nueva forma de pago «reembolso» (la pagó el delivery y la sede le devuelve), con sus reglas.
--   4. registrar_compra_repartidor(): guarda TODO de una vez (encargo + una compra por proveedor + productos)
--      y marca como comprados y recibidos los productos de la lista que trajo.
--   5. pagar_repartidor(): al devolverle la plata crea los gastos para la rendición: uno por compra (con su
--      proveedor, categoría y comprobante) y uno por las carreras (Delivery y fletes).
--   6. anular_encargo_repartidor(): borra un registro equivocado mientras no se le haya pagado.
-- Ejecutar completo en el SQL Editor de Supabase. Al final debe salir una tabla con 6 piezas en 1.
-- ============================================================================

-- 1. Repartidores ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS repartidores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  telefono TEXT,
  precio_carrera NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (precio_carrera >= 0),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS repartidores_nombre_unico ON repartidores (lower(nombre));
ALTER TABLE repartidores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "repartidores_select" ON repartidores;
CREATE POLICY "repartidores_select" ON repartidores
  FOR SELECT USING (get_user_rol() IN ('owner', 'admin'));
DROP POLICY IF EXISTS "repartidores_escribir" ON repartidores;
CREATE POLICY "repartidores_escribir" ON repartidores
  FOR ALL USING (get_user_rol() = 'owner') WITH CHECK (get_user_rol() = 'owner');

-- 2. Encargos (cada compra que trae el delivery) ------------------------------
CREATE TABLE IF NOT EXISTS encargos_repartidor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id UUID NOT NULL REFERENCES sedes(id),
  repartidor_id UUID NOT NULL REFERENCES repartidores(id),
  pedido_id UUID REFERENCES pedidos(id) ON DELETE SET NULL,
  fecha DATE NOT NULL,
  carreras INTEGER NOT NULL DEFAULT 0 CHECK (carreras >= 0),
  precio_carrera NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (precio_carrera >= 0),
  total_carreras NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_carreras >= 0),
  total_compras NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_compras >= 0),
  notas TEXT,
  estado TEXT NOT NULL DEFAULT 'por_pagar' CHECK (estado IN ('por_pagar', 'pagado')),
  metodo_pago metodo_pago_tipo,
  evidencia_pago_path TEXT,
  fecha_pago DATE,
  pagado_at TIMESTAMPTZ,
  pagado_por UUID REFERENCES profiles(id),
  gasto_carreras_id UUID REFERENCES gastos(id) ON DELETE SET NULL,
  registrado_por UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT encargos_pagado_completo CHECK (
    estado <> 'pagado' OR (metodo_pago IS NOT NULL AND fecha_pago IS NOT NULL
                           AND (metodo_pago = 'efectivo' OR evidencia_pago_path IS NOT NULL))
  )
);
CREATE INDEX IF NOT EXISTS idx_encargos_sede_estado ON encargos_repartidor (sede_id, estado);
ALTER TABLE encargos_repartidor ENABLE ROW LEVEL SECURITY;
-- Solo se lee directo; se escribe con las funciones de abajo (todo o nada).
DROP POLICY IF EXISTS "encargos_select" ON encargos_repartidor;
CREATE POLICY "encargos_select" ON encargos_repartidor
  FOR SELECT USING (puede_pedir_en_sede(sede_id) OR get_user_rol() = 'owner');

-- 3. Compras pagadas por el delivery («reembolso») -------------------------------
ALTER TABLE compras ADD COLUMN IF NOT EXISTS encargo_id UUID REFERENCES encargos_repartidor(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_compras_encargo ON compras (encargo_id);

-- La forma de pago admite «reembolso» (se reemplaza la regla vieja, que solo aceptaba contado y crédito).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'compras'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) ILIKE '%condicion_pago%' AND pg_get_constraintdef(oid) ILIKE '%credito%'
             AND pg_get_constraintdef(oid) NOT ILIKE '%entrega_id%' AND pg_get_constraintdef(oid) NOT ILIKE '%evidencia%'
  LOOP
    EXECUTE format('ALTER TABLE compras DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;
ALTER TABLE compras DROP CONSTRAINT IF EXISTS compras_condicion_valida;
ALTER TABLE compras ADD CONSTRAINT compras_condicion_valida CHECK (condicion_pago IN ('contado', 'credito', 'reembolso'));

ALTER TABLE compras DROP CONSTRAINT IF EXISTS compras_reembolso_completo;
ALTER TABLE compras ADD CONSTRAINT compras_reembolso_completo CHECK (
  (condicion_pago = 'reembolso') = (encargo_id IS NOT NULL)
  AND (condicion_pago <> 'reembolso' OR entrega_id IS NULL)
);

-- Evidencias: lo de siempre para contado y crédito (copia de pago_con_otra_compra.sql) y, para lo que pagó el
-- delivery, la foto de la factura o boleta; sin comprobante (mercado), la observación de dónde y qué.
ALTER TABLE compras DROP CONSTRAINT IF EXISTS compras_evidencia_obligatoria;
ALTER TABLE compras ADD CONSTRAINT compras_evidencia_obligatoria CHECK (
  evidencia_pendiente
  OR total = 0
  OR CASE
       WHEN condicion_pago = 'reembolso' THEN
         CASE WHEN tipo_comprobante = 'sin_comprobante' THEN COALESCE(trim(observacion), '') <> ''
              ELSE evidencia_comprobante_path IS NOT NULL END
       WHEN tipo_comprobante = 'sin_comprobante' THEN
         metodo_pago = 'efectivo'
         OR (metodo_pago = 'cuentas' AND (evidencia_pago_path IS NOT NULL OR pago_con_compra_id IS NOT NULL))
       ELSE
         evidencia_comprobante_path IS NOT NULL
         AND (condicion_pago = 'credito' OR metodo_pago = 'efectivo' OR evidencia_pago_path IS NOT NULL OR pago_con_compra_id IS NOT NULL)
     END
);

-- 4. Registrar lo que trajo el delivery (todo o nada) -------------------------------
-- p_compras: [{ proveedor_id, categoria_id, tipo_comprobante, numero_comprobante, evidencia_comprobante_path,
--               evidencia_producto_path, observacion,
--               items: [{ producto_id, cantidad, unidad, precio_total, pedido_item_id }] }]
CREATE OR REPLACE FUNCTION public.registrar_compra_repartidor(
  p_sede UUID, p_repartidor UUID, p_pedido UUID, p_fecha DATE,
  p_carreras INTEGER, p_precio_carrera NUMERIC, p_notas TEXT, p_compras JSONB
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
  IF COALESCE(p_carreras, 0) < 0 OR COALESCE(p_precio_carrera, 0) < 0 THEN
    RAISE EXCEPTION 'Las carreras no pueden ser negativas.';
  END IF;
  IF p_pedido IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pedidos WHERE id = p_pedido AND sede_id = p_sede) THEN
    RAISE EXCEPTION 'Esa lista no es de esta sede.';
  END IF;
  IF jsonb_typeof(p_compras) <> 'array' OR jsonb_array_length(p_compras) = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un producto comprado.';
  END IF;

  INSERT INTO encargos_repartidor (sede_id, repartidor_id, pedido_id, fecha, carreras, precio_carrera, total_carreras, notas, registrado_por)
  VALUES (p_sede, p_repartidor, p_pedido, p_fecha, COALESCE(p_carreras, 0), COALESCE(p_precio_carrera, 0),
          round(COALESCE(p_carreras, 0) * COALESCE(p_precio_carrera, 0), 2), NULLIF(trim(COALESCE(p_notas, '')), ''), auth.uid())
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
REVOKE EXECUTE ON FUNCTION public.registrar_compra_repartidor(UUID, UUID, UUID, DATE, INTEGER, NUMERIC, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_compra_repartidor(UUID, UUID, UUID, DATE, INTEGER, NUMERIC, TEXT, JSONB) TO authenticated;

-- 5. Devolverle la plata al delivery: nacen los gastos para la rendición ----------------
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
            'pendiente', v_enc.carreras || ' carreras × S/ ' || to_char(v_enc.precio_carrera, 'FM9990.00'),
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

-- 6. Anular un registro equivocado (solo si todavía no se le pagó) -----------------------
CREATE OR REPLACE FUNCTION public.anular_encargo_repartidor(p_encargo UUID)
RETURNS VOID AS $$
DECLARE
  v_enc encargos_repartidor%ROWTYPE;
BEGIN
  SELECT * INTO v_enc FROM encargos_repartidor WHERE id = p_encargo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe ese registro.'; END IF;
  IF NOT puede_pedir_en_sede(v_enc.sede_id) THEN RAISE EXCEPTION 'No tienes permiso en esta sede.'; END IF;
  IF v_enc.estado <> 'por_pagar' THEN RAISE EXCEPTION 'Ya se le pagó: no se puede anular.'; END IF;
  -- Los productos de la lista vuelven a «pendiente» y sin revisar.
  UPDATE pedido_items SET entregado_at = NULL
    WHERE id IN (SELECT ci.pedido_item_id FROM compra_items ci JOIN compras c ON c.id = ci.compra_id
                 WHERE c.encargo_id = p_encargo AND ci.pedido_item_id IS NOT NULL) AND entregado_at IS NOT NULL;
  UPDATE pedido_items SET estado = 'pendiente'
    WHERE id IN (SELECT ci.pedido_item_id FROM compra_items ci JOIN compras c ON c.id = ci.compra_id
                 WHERE c.encargo_id = p_encargo AND ci.pedido_item_id IS NOT NULL);
  IF v_enc.pedido_id IS NOT NULL THEN
    UPDATE pedidos SET estado = 'enviado', comprado_at = NULL, recibido_at = NULL, recibido_por = NULL
      WHERE id = v_enc.pedido_id AND estado IN ('comprado', 'recibido')
        AND EXISTS (SELECT 1 FROM pedido_items WHERE pedido_id = v_enc.pedido_id AND estado = 'pendiente');
  END IF;
  DELETE FROM encargos_repartidor WHERE id = p_encargo; -- sus compras y productos se borran en cascada
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.anular_encargo_repartidor(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anular_encargo_repartidor(UUID) TO authenticated;

-- Verificación: deben salir las 6 piezas en 1.
SELECT 'tabla repartidores' AS pieza, count(*)::TEXT AS valor FROM information_schema.tables WHERE table_name = 'repartidores'
UNION ALL SELECT 'tabla encargos_repartidor', count(*)::TEXT FROM information_schema.tables WHERE table_name = 'encargos_repartidor'
UNION ALL SELECT 'columna compras.encargo_id', count(*)::TEXT FROM information_schema.columns WHERE table_name = 'compras' AND column_name = 'encargo_id'
UNION ALL SELECT 'regla de forma de pago', count(*)::TEXT FROM pg_constraint WHERE conname = 'compras_condicion_valida'
UNION ALL SELECT 'regla de reembolso', count(*)::TEXT FROM pg_constraint WHERE conname = 'compras_reembolso_completo'
UNION ALL SELECT 'funciones', (count(*) / 3)::TEXT FROM pg_proc WHERE proname IN ('registrar_compra_repartidor', 'pagar_repartidor', 'anular_encargo_repartidor');
