-- =============================================================
-- Fase 2B — Dinero a rendir, compras con evidencia, rendición y recepción
-- Ejecutar UNA VEZ en el SQL Editor de Supabase (DESPUÉS de fase2a_pedidos.sql).
-- Es seguro volver a ejecutarlo: no duplica nada ni borra datos.
-- =============================================================

-- 0. Lista de usuarios de Compras (los admins no pueden ver perfiles de otras sedes,
--    pero sí necesitan elegir a quién le entregan el dinero).
CREATE OR REPLACE FUNCTION public.usuarios_compras()
RETURNS TABLE (id UUID, nombre TEXT) AS $$
  SELECT p.id, p.nombre FROM profiles p
  WHERE p.rol = 'compras' AND p.activo AND get_user_rol() IS NOT NULL
  ORDER BY p.nombre;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- 1. ENTREGAS DE DINERO A RENDIR ------------------------------------
--    abierta (Compras tiene el dinero) → rendida (Compras informa el vuelto)
--    → cerrada (el admin confirma el vuelto y las compras pasan a gastos de la sede)
CREATE TABLE IF NOT EXISTS entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id UUID NOT NULL REFERENCES sedes(id),
  fecha DATE NOT NULL,
  monto NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  metodo_pago metodo_pago_tipo NOT NULL,          -- de qué caja de la sede sale: efectivo o cuentas
  receptor_id UUID NOT NULL REFERENCES profiles(id),
  entregado_por UUID NOT NULL REFERENCES profiles(id),
  notas TEXT,
  estado TEXT NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta', 'rendida', 'cerrada')),
  vuelto NUMERIC(10,2) CHECK (vuelto >= 0),        -- lo que Compras dice que devuelve
  rendida_at TIMESTAMPTZ,
  vuelto_recibido NUMERIC(10,2) CHECK (vuelto_recibido >= 0),  -- lo que el admin confirma
  cerrada_at TIMESTAMPTZ,
  cerrada_por UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_entregas_sede_estado ON entregas (sede_id, estado);
CREATE INDEX IF NOT EXISTS idx_entregas_receptor ON entregas (receptor_id, estado);
ALTER TABLE entregas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entregas_select" ON entregas;
CREATE POLICY "entregas_select" ON entregas
  FOR SELECT USING (puede_ver_sede(sede_id));

DROP POLICY IF EXISTS "entregas_insert" ON entregas;
CREATE POLICY "entregas_insert" ON entregas
  FOR INSERT WITH CHECK (puede_pedir_en_sede(sede_id) AND entregado_por = auth.uid() AND estado = 'abierta');

-- Una entrega cerrada ya no se toca (sus compras ya son gastos de la sede).
DROP POLICY IF EXISTS "entregas_update" ON entregas;
CREATE POLICY "entregas_update" ON entregas
  FOR UPDATE USING (
    estado <> 'cerrada'
    AND (puede_pedir_en_sede(sede_id) OR (get_user_rol() = 'compras' AND receptor_id = auth.uid()))
  );

DROP POLICY IF EXISTS "entregas_delete" ON entregas;
CREATE POLICY "entregas_delete" ON entregas
  FOR DELETE USING (puede_pedir_en_sede(sede_id) AND estado = 'abierta');

-- 2. COMPRAS (una por proveedor y por sede, con su comprobante) -----
CREATE TABLE IF NOT EXISTS compras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id UUID NOT NULL REFERENCES sedes(id),
  proveedor_id UUID NOT NULL REFERENCES proveedores(id),
  pedido_id UUID REFERENCES pedidos(id) ON DELETE SET NULL,
  entrega_id UUID REFERENCES entregas(id),
  fecha DATE NOT NULL,
  total NUMERIC(10,2) NOT NULL CHECK (total > 0),
  condicion_pago TEXT NOT NULL CHECK (condicion_pago IN ('contado', 'credito')),
  metodo_pago metodo_pago_tipo,                   -- cómo pagó: efectivo o cuentas (Yape/transferencia)
  tipo_comprobante TEXT NOT NULL CHECK (tipo_comprobante IN ('boleta', 'factura', 'sin_comprobante')),
  numero_comprobante TEXT,
  fecha_vencimiento DATE,
  estado_pago TEXT NOT NULL DEFAULT 'pagado' CHECK (estado_pago IN ('pagado', 'por_pagar')),
  pagado_at TIMESTAMPTZ,
  pagado_por UUID REFERENCES profiles(id),
  evidencia_comprobante_path TEXT,                -- foto de la boleta o factura
  evidencia_producto_path TEXT,                   -- foto del producto (cuando no hay boleta)
  evidencia_pago_path TEXT,                       -- captura del Yape/transferencia
  categoria_id UUID REFERENCES categorias(id),    -- la elige el admin al cerrar la rendición
  gasto_id UUID REFERENCES gastos(id) ON DELETE SET NULL,
  registrado_por UUID NOT NULL REFERENCES profiles(id),
  observacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Al contado: sale de una entrega y se sabe cómo se pagó. A crédito: vence y queda por pagar.
  CONSTRAINT compras_contado_completo CHECK (
    condicion_pago <> 'contado' OR (entrega_id IS NOT NULL AND metodo_pago IS NOT NULL)
  ),
  CONSTRAINT compras_credito_completo CHECK (
    condicion_pago <> 'credito'
    OR (entrega_id IS NULL AND fecha_vencimiento IS NOT NULL AND tipo_comprobante <> 'sin_comprobante')
  ),
  -- Evidencias obligatorias (reglas de Jahnn, 29-sep-2026):
  --  · con boleta/factura: foto del comprobante; si se pagó por Yape/transferencia, también la captura.
  --  · sin comprobante: foto del producto + captura del Yape. En efectivo sin boleta no hay prueba: no se permite.
  CONSTRAINT compras_evidencia_obligatoria CHECK (
    CASE
      WHEN tipo_comprobante = 'sin_comprobante' THEN
        metodo_pago = 'cuentas' AND evidencia_producto_path IS NOT NULL AND evidencia_pago_path IS NOT NULL
      ELSE
        evidencia_comprobante_path IS NOT NULL
        AND (condicion_pago = 'credito' OR metodo_pago = 'efectivo' OR evidencia_pago_path IS NOT NULL)
    END
  )
);
CREATE INDEX IF NOT EXISTS idx_compras_entrega ON compras (entrega_id);
CREATE INDEX IF NOT EXISTS idx_compras_pedido ON compras (pedido_id);
CREATE INDEX IF NOT EXISTS idx_compras_sede_fecha ON compras (sede_id, fecha);
ALTER TABLE compras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "compras_select" ON compras;
CREATE POLICY "compras_select" ON compras
  FOR SELECT USING (puede_ver_sede(sede_id));

DROP POLICY IF EXISTS "compras_insert" ON compras;
CREATE POLICY "compras_insert" ON compras
  FOR INSERT WITH CHECK (get_user_rol() IN ('compras', 'owner') AND registrado_por = auth.uid());

-- Una compra que ya se convirtió en gasto queda congelada.
DROP POLICY IF EXISTS "compras_update" ON compras;
CREATE POLICY "compras_update" ON compras
  FOR UPDATE USING (
    gasto_id IS NULL
    AND (
      get_user_rol() = 'owner'
      OR (get_user_rol() = 'compras' AND registrado_por = auth.uid())
      OR puede_pedir_en_sede(sede_id)
    )
  );

DROP POLICY IF EXISTS "compras_delete" ON compras;
CREATE POLICY "compras_delete" ON compras
  FOR DELETE USING (
    gasto_id IS NULL
    AND (get_user_rol() = 'owner' OR (get_user_rol() = 'compras' AND registrado_por = auth.uid()))
  );

-- 3. DETALLE DE CADA COMPRA (con precio, para detectar sobreprecios después) ----
CREATE TABLE IF NOT EXISTS compra_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id UUID NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  pedido_item_id UUID REFERENCES pedido_items(id) ON DELETE SET NULL,
  producto_id UUID NOT NULL REFERENCES productos(id),
  cantidad NUMERIC(10,2) NOT NULL CHECK (cantidad > 0),
  unidad TEXT NOT NULL,
  precio_total NUMERIC(10,2) NOT NULL CHECK (precio_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_compra_items_compra ON compra_items (compra_id);
CREATE INDEX IF NOT EXISTS idx_compra_items_producto ON compra_items (producto_id, created_at);
ALTER TABLE compra_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sede_de_compra(p_compra UUID)
RETURNS UUID AS $$
  SELECT sede_id FROM compras WHERE id = p_compra;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

DROP POLICY IF EXISTS "compra_items_select" ON compra_items;
CREATE POLICY "compra_items_select" ON compra_items
  FOR SELECT USING (puede_ver_sede(sede_de_compra(compra_id)));

DROP POLICY IF EXISTS "compra_items_insert" ON compra_items;
CREATE POLICY "compra_items_insert" ON compra_items
  FOR INSERT WITH CHECK (get_user_rol() IN ('compras', 'owner'));

DROP POLICY IF EXISTS "compra_items_delete" ON compra_items;
CREATE POLICY "compra_items_delete" ON compra_items
  FOR DELETE USING (get_user_rol() IN ('compras', 'owner'));

-- 3b. CONTROLES QUE NO DEPENDEN DE LA PANTALLA -------------------------
-- Compras solo informa su vuelto: el monto, la sede y el método de una entrega los fija el admin.
-- El vuelto informado por Compras no lo puede cambiar nadie más (el admin confirma lo que recibió aparte).
CREATE OR REPLACE FUNCTION public.proteger_entrega()
RETURNS TRIGGER AS $$
BEGIN
  IF get_user_rol() = 'compras' THEN
    IF NEW.monto IS DISTINCT FROM OLD.monto OR NEW.metodo_pago IS DISTINCT FROM OLD.metodo_pago
       OR NEW.sede_id IS DISTINCT FROM OLD.sede_id OR NEW.receptor_id IS DISTINCT FROM OLD.receptor_id
       OR NEW.entregado_por IS DISTINCT FROM OLD.entregado_por OR NEW.fecha IS DISTINCT FROM OLD.fecha
       OR NEW.vuelto_recibido IS DISTINCT FROM OLD.vuelto_recibido THEN
      RAISE EXCEPTION 'Compras solo puede informar el vuelto de una entrega.';
    END IF;
    IF NEW.estado IS DISTINCT FROM OLD.estado AND NOT (OLD.estado = 'abierta' AND NEW.estado = 'rendida') THEN
      RAISE EXCEPTION 'Ese cambio de estado no está permitido.';
    END IF;
  ELSIF NEW.vuelto IS DISTINCT FROM OLD.vuelto AND NEW.vuelto IS NOT NULL THEN
    RAISE EXCEPTION 'El vuelto lo informa Compras; al cerrar confirmas lo que recibiste.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS entregas_proteger ON entregas;
CREATE TRIGGER entregas_proteger BEFORE UPDATE ON entregas
  FOR EACH ROW EXECUTE FUNCTION proteger_entrega();

-- Una compra al contado solo puede cargarse a una entrega ABIERTA de la MISMA sede
-- (y si la registra Compras, a una entrega que le dieron a él). Rendida la entrega, sus compras
-- ya no se agregan, editan ni borran.
CREATE OR REPLACE FUNCTION public.proteger_compra()
RETURNS TRIGGER AS $$
DECLARE
  v_ent entregas%ROWTYPE;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.entrega_id IS NOT NULL THEN
    SELECT * INTO v_ent FROM entregas WHERE id = OLD.entrega_id;
    IF v_ent.estado <> 'abierta' AND get_user_rol() = 'compras' THEN
      RAISE EXCEPTION 'Esa entrega ya fue rendida: sus compras no se pueden cambiar.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  IF NEW.entrega_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.entrega_id IS DISTINCT FROM OLD.entrega_id OR NEW.sede_id IS DISTINCT FROM OLD.sede_id) THEN
    SELECT * INTO v_ent FROM entregas WHERE id = NEW.entrega_id;
    IF NOT FOUND OR v_ent.estado <> 'abierta' THEN
      RAISE EXCEPTION 'Esa entrega ya no está abierta.';
    END IF;
    IF v_ent.sede_id <> NEW.sede_id THEN
      RAISE EXCEPTION 'La compra y la entrega de dinero deben ser de la misma sede.';
    END IF;
    IF get_user_rol() = 'compras' AND v_ent.receptor_id <> auth.uid() THEN
      RAISE EXCEPTION 'Esa entrega de dinero no es tuya.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS compras_proteger ON compras;
CREATE TRIGGER compras_proteger BEFORE INSERT OR UPDATE OR DELETE ON compras
  FOR EACH ROW EXECUTE FUNCTION proteger_compra();

-- 4. CERRAR UNA RENDICIÓN (todo o nada) --------------------------------
--    El admin confirma el vuelto que recibió. Cada compra al contado de esa entrega
--    se convierte en un gasto PENDIENTE de su sede (Gerencia se lo repone a la caja
--    del admin, como cualquier gasto), con la foto del comprobante como constancia.
CREATE OR REPLACE FUNCTION public.cerrar_entrega(p_entrega UUID, p_vuelto_recibido NUMERIC)
RETURNS JSONB AS $$
DECLARE
  v_ent entregas%ROWTYPE;
  v_compra RECORD;
  v_gasto UUID;
  v_total NUMERIC := 0;
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

  UPDATE entregas
     SET estado = 'cerrada', cerrada_at = now(), cerrada_por = auth.uid(), vuelto_recibido = p_vuelto_recibido
   WHERE id = p_entrega;

  RETURN jsonb_build_object(
    'gastos_creados', v_cantidad,
    'total_gastado', v_total,
    -- > 0: faltó dinero · < 0: Compras puso de su bolsillo
    'diferencia', v_ent.monto - v_total - p_vuelto_recibido
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. FOTOS DE EVIDENCIA: van al mismo almacenamiento de constancias, en la carpeta
--    de la sede. Compras puede subir y ver en cualquier sede; cada admin ve la suya.
DROP POLICY IF EXISTS "constancias_select_sede" ON storage.objects;
CREATE POLICY "constancias_select_sede"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'constancias-gastos'
  AND (
    public.get_user_rol() IN ('owner', 'compras')
    OR (storage.foldername(name))[1] = public.get_user_sede_id()::TEXT
  )
);

DROP POLICY IF EXISTS "constancias_insert_sede" ON storage.objects;
CREATE POLICY "constancias_insert_sede"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'constancias-gastos'
  AND (storage.foldername(name))[2] = auth.uid()::TEXT
  AND (
    public.get_user_rol() IN ('owner', 'compras')
    OR (
      public.get_user_rol() = 'admin'
      AND (storage.foldername(name))[1] = public.get_user_sede_id()::TEXT
    )
  )
);

-- 6. Verificación: 3 tablas nuevas con seguridad activa + la función de cierre.
SELECT c.relname AS tabla, c.relrowsecurity AS seguridad_activa,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS reglas
FROM pg_class c
WHERE c.relname IN ('entregas', 'compras', 'compra_items')
UNION ALL
SELECT 'funcion cerrar_entrega', true, count(*) FROM pg_proc WHERE proname = 'cerrar_entrega'
UNION ALL
-- La usa el cierre para calcular la semana; debe existir desde la instalación original.
SELECT 'funcion calcular_semana_mes', true, count(*) FROM pg_proc WHERE proname = 'calcular_semana_mes'
ORDER BY 1;
