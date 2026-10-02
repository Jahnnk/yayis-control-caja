-- =============================================================
-- Deliverys de Compras (Fabio) — control de entregas a clientes y del dinero que cobra
-- Ejecutar UNA VEZ en el SQL Editor de Supabase (DESPUÉS de fase2b_compras.sql).
-- Es seguro volver a ejecutarlo: no duplica nada ni borra datos.
--
-- Solo CREA tablas nuevas. No toca gastos, reposiciones, entregas ni compras:
-- este control NO mueve la caja chica de ninguna sede.
-- =============================================================

-- 1. LIQUIDACIONES DE EFECTIVO --------------------------------------
--    Cada vez que Fabio entrega al administrador el efectivo que cobró en deliverys,
--    el administrador cuenta el dinero y queda registrado lo esperado, lo recibido y la diferencia.
CREATE TABLE IF NOT EXISTS liquidaciones_delivery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id UUID NOT NULL REFERENCES sedes(id),
  entregado_por UUID NOT NULL REFERENCES profiles(id),   -- quien llevaba el efectivo (Fabio)
  recibido_por UUID NOT NULL REFERENCES profiles(id),    -- quien lo contó y lo recibió
  esperado NUMERIC(10,2) NOT NULL CHECK (esperado >= 0),
  recibido NUMERIC(10,2) NOT NULL CHECK (recibido >= 0),
  diferencia NUMERIC(10,2) GENERATED ALWAYS AS (esperado - recibido) STORED,  -- positivo = faltó dinero
  nota TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Si no cuadró, hay que dejar escrito por qué.
  CONSTRAINT liquidacion_nota_si_no_cuadra CHECK (esperado = recibido OR COALESCE(trim(nota), '') <> '')
);
CREATE INDEX IF NOT EXISTS idx_liquidaciones_delivery_sede ON liquidaciones_delivery (sede_id, created_at DESC);
ALTER TABLE liquidaciones_delivery ENABLE ROW LEVEL SECURITY;

-- Se ven: Gerencia todas, el administrador las de su sede, Compras las que entregó él.
-- No hay política de INSERT/UPDATE/DELETE: solo se crean con la función de abajo.
DROP POLICY IF EXISTS "liquidaciones_delivery_select" ON liquidaciones_delivery;
CREATE POLICY "liquidaciones_delivery_select" ON liquidaciones_delivery
  FOR SELECT USING (
    get_user_rol() = 'owner'
    OR (get_user_rol() = 'admin' AND sede_id = get_user_sede_id())
    OR (get_user_rol() = 'compras' AND entregado_por = auth.uid())
  );

-- 2. DELIVERYS ------------------------------------------------------
--    modalidad = cómo pagó el cliente:
--      todo_prepagado      → ya pagó producto + delivery a la sede. Fabio no cobra nada.
--      producto_prepagado  → ya pagó el producto; el delivery lo paga al recibir. Fabio cobra el delivery.
--      todo_contra_entrega → paga producto + delivery al recibir. Fabio cobra todo.
CREATE TABLE IF NOT EXISTS deliverys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id UUID NOT NULL REFERENCES sedes(id),            -- sede de donde sale el pedido
  fecha DATE NOT NULL,
  cliente TEXT NOT NULL CHECK (trim(cliente) <> ''),
  detalle TEXT,                                          -- qué productos llevó
  monto_producto NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (monto_producto >= 0),
  monto_delivery NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (monto_delivery >= 0),
  modalidad TEXT NOT NULL CHECK (modalidad IN ('todo_prepagado', 'producto_prepagado', 'todo_contra_entrega')),
  -- Lo que Fabio cobró al cliente en la puerta (se calcula solo a partir de la modalidad).
  cobrado NUMERIC(10,2) GENERATED ALWAYS AS (
    CASE modalidad
      WHEN 'todo_prepagado' THEN 0
      WHEN 'producto_prepagado' THEN monto_delivery
      ELSE monto_producto + monto_delivery
    END
  ) STORED,
  metodo_cobro metodo_pago_tipo,                         -- cómo le pagaron a Fabio: efectivo o cuentas (Yape/transferencia)
  evidencia_cobro_path TEXT,                             -- captura del Yape/transferencia
  liquidacion_id UUID REFERENCES liquidaciones_delivery(id),  -- cuando el admin recibió el efectivo
  registrado_por UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Si el cliente ya pagó todo no hay método de cobro; si Fabio cobró algo, hay que decir cómo.
  CONSTRAINT deliverys_cobro_coherente CHECK (
    CASE modalidad
      WHEN 'todo_prepagado' THEN metodo_cobro IS NULL
      WHEN 'producto_prepagado' THEN metodo_cobro IS NOT NULL AND monto_delivery > 0
      ELSE metodo_cobro IS NOT NULL AND monto_producto + monto_delivery > 0
    END
  ),
  -- Lo cobrado por Yape/transferencia necesita su captura (como en las compras).
  CONSTRAINT deliverys_evidencia_cuentas CHECK (metodo_cobro IS DISTINCT FROM 'cuentas' OR evidencia_cobro_path IS NOT NULL),
  -- Solo el efectivo se liquida con el administrador.
  CONSTRAINT deliverys_liquidacion_solo_efectivo CHECK (liquidacion_id IS NULL OR metodo_cobro = 'efectivo')
);
CREATE INDEX IF NOT EXISTS idx_deliverys_sede_fecha ON deliverys (sede_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_deliverys_registrador ON deliverys (registrado_por, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_deliverys_pendientes ON deliverys (sede_id) WHERE liquidacion_id IS NULL AND metodo_cobro = 'efectivo';
ALTER TABLE deliverys ENABLE ROW LEVEL SECURITY;

-- Se ven: Gerencia todos, el administrador los de su sede, Compras solo los que registró él.
DROP POLICY IF EXISTS "deliverys_select" ON deliverys;
CREATE POLICY "deliverys_select" ON deliverys
  FOR SELECT USING (
    get_user_rol() = 'owner'
    OR (get_user_rol() = 'admin' AND sede_id = get_user_sede_id())
    OR (get_user_rol() = 'compras' AND registrado_por = auth.uid())
  );

DROP POLICY IF EXISTS "deliverys_insert" ON deliverys;
CREATE POLICY "deliverys_insert" ON deliverys
  FOR INSERT WITH CHECK (
    get_user_rol() IN ('compras', 'owner') AND registrado_por = auth.uid() AND liquidacion_id IS NULL
  );

-- Corregir o borrar: solo mientras el efectivo no se haya liquidado.
-- Compras solo puede hacerlo el mismo día de registrarlo (para que no desaparezca dinero cobrado);
-- Gerencia puede siempre que no esté liquidado.
DROP POLICY IF EXISTS "deliverys_update" ON deliverys;
CREATE POLICY "deliverys_update" ON deliverys
  FOR UPDATE USING (
    liquidacion_id IS NULL
    AND (
      get_user_rol() = 'owner'
      OR (get_user_rol() = 'compras' AND registrado_por = auth.uid() AND created_at > now() - interval '1 day')
    )
  ) WITH CHECK (liquidacion_id IS NULL);

DROP POLICY IF EXISTS "deliverys_delete" ON deliverys;
CREATE POLICY "deliverys_delete" ON deliverys
  FOR DELETE USING (
    liquidacion_id IS NULL
    AND (
      get_user_rol() = 'owner'
      OR (get_user_rol() = 'compras' AND registrado_por = auth.uid() AND created_at > now() - interval '1 day')
    )
  );

-- 3. RECIBIR EL EFECTIVO DE FABIO ------------------------------------
--    El administrador (o Gerencia) elige los deliverys cuyo efectivo recibió, cuenta el dinero
--    y escribe cuánto recibió. Todo se guarda en un solo paso.
CREATE OR REPLACE FUNCTION public.recibir_efectivo_delivery(p_sede UUID, p_ids UUID[], p_recibido NUMERIC, p_nota TEXT)
RETURNS JSONB AS $$
DECLARE
  v_esperado NUMERIC;
  v_cantidad INTEGER;
  v_personas INTEGER;
  v_fabio UUID;
  v_liq UUID;
BEGIN
  -- IS NOT TRUE (y no NOT ...): sin sesión el permiso da NULL y debe rechazarse igual.
  IF puede_pedir_en_sede(p_sede) IS NOT TRUE THEN
    RAISE EXCEPTION 'No tienes permiso para recibir dinero de esta sede.';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Elige al menos un delivery.';
  END IF;
  IF p_recibido IS NULL OR p_recibido < 0 THEN
    RAISE EXCEPTION 'Indica cuánto dinero recibiste.';
  END IF;

  -- Se bloquean las filas para que dos personas no liquiden lo mismo a la vez.
  SELECT COALESCE(SUM(cobrado), 0), COUNT(*), COUNT(DISTINCT registrado_por), MIN(registrado_por::TEXT)::UUID
    INTO v_esperado, v_cantidad, v_personas, v_fabio
  FROM (
    SELECT cobrado, registrado_por FROM deliverys
    WHERE id = ANY (p_ids) AND sede_id = p_sede AND metodo_cobro = 'efectivo' AND liquidacion_id IS NULL
    FOR UPDATE
  ) d;

  IF v_cantidad <> array_length(p_ids, 1) THEN
    RAISE EXCEPTION 'Algún delivery ya no está pendiente (otra persona pudo recibirlo). Recarga la pantalla.';
  END IF;
  IF v_personas <> 1 THEN
    RAISE EXCEPTION 'Recibe el efectivo de una persona a la vez.';
  END IF;
  IF p_recibido <> v_esperado AND COALESCE(trim(p_nota), '') = '' THEN
    RAISE EXCEPTION 'El dinero no cuadra con lo cobrado: escribe una nota explicando la diferencia.';
  END IF;

  INSERT INTO liquidaciones_delivery (sede_id, entregado_por, recibido_por, esperado, recibido, nota)
  VALUES (p_sede, v_fabio, auth.uid(), v_esperado, p_recibido, NULLIF(trim(p_nota), ''))
  RETURNING id INTO v_liq;

  UPDATE deliverys SET liquidacion_id = v_liq WHERE id = ANY (p_ids);

  RETURN jsonb_build_object('liquidacion_id', v_liq, 'esperado', v_esperado, 'recibido', p_recibido,
                            'diferencia', v_esperado - p_recibido, 'deliverys', v_cantidad);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Verificación: debe mostrar las 2 tablas con seguridad activa y la función.
SELECT c.relname AS pieza, c.relrowsecurity AS seguridad_activa, 1 AS existe
FROM pg_class c
WHERE c.relname IN ('deliverys', 'liquidaciones_delivery') AND c.relkind = 'r'
UNION ALL
SELECT 'funcion recibir_efectivo_delivery', true, count(*) FROM pg_proc WHERE proname = 'recibir_efectivo_delivery'
ORDER BY 1;
