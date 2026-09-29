-- =============================================================
-- Fase 2A — Pedidos de compra y ruta de Compras
-- Ejecutar UNA VEZ en el SQL Editor de Supabase (DESPUÉS de fase1_multisede.sql).
-- Es seguro volver a ejecutarlo: no duplica nada ni borra datos.
-- =============================================================

-- Quién puede ver datos de una sede: Gerencia y Compras ven todas; el resto, solo la suya.
CREATE OR REPLACE FUNCTION public.puede_ver_sede(p_sede UUID)
RETURNS BOOLEAN AS $$
  SELECT get_user_rol() IN ('owner', 'compras') OR p_sede = get_user_sede_id();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Quién puede armar pedidos de una sede: Gerencia en cualquiera; el administrador en la suya.
CREATE OR REPLACE FUNCTION public.puede_pedir_en_sede(p_sede UUID)
RETURNS BOOLEAN AS $$
  SELECT get_user_rol() = 'owner'
      OR (get_user_rol() = 'admin' AND p_sede = get_user_sede_id());
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 1. PROVEEDORES -------------------------------------------------
CREATE TABLE IF NOT EXISTS proveedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  telefono TEXT,
  direccion TEXT,
  condicion_pago TEXT NOT NULL DEFAULT 'contado' CHECK (condicion_pago IN ('contado', 'credito')),
  dias_credito INTEGER NOT NULL DEFAULT 0 CHECK (dias_credito >= 0),
  notas TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_por UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS proveedores_nombre_unico ON proveedores (lower(nombre));
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proveedores_select" ON proveedores;
CREATE POLICY "proveedores_select" ON proveedores
  FOR SELECT USING (get_user_rol() IN ('owner', 'admin', 'compras'));

-- Compras puede registrar proveedores nuevos, pero solo al contado:
-- las condiciones de crédito las define Gerencia.
DROP POLICY IF EXISTS "proveedores_insert" ON proveedores;
CREATE POLICY "proveedores_insert" ON proveedores
  FOR INSERT WITH CHECK (
    get_user_rol() = 'owner'
    OR (get_user_rol() = 'compras' AND condicion_pago = 'contado')
  );

DROP POLICY IF EXISTS "proveedores_update" ON proveedores;
CREATE POLICY "proveedores_update" ON proveedores
  FOR UPDATE
  USING (get_user_rol() = 'owner' OR (get_user_rol() = 'compras' AND condicion_pago = 'contado'))
  WITH CHECK (get_user_rol() = 'owner' OR (get_user_rol() = 'compras' AND condicion_pago = 'contado'));

-- 2. CATÁLOGO DE PRODUCTOS (uno solo para las 3 sedes) -------------
CREATE TABLE IF NOT EXISTS productos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  unidad TEXT NOT NULL DEFAULT 'unidad',
  proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL,  -- proveedor habitual
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_por UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS productos_nombre_unico ON productos (lower(nombre));
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "productos_select" ON productos;
CREATE POLICY "productos_select" ON productos
  FOR SELECT USING (get_user_rol() IN ('owner', 'admin', 'compras'));

DROP POLICY IF EXISTS "productos_insert" ON productos;
CREATE POLICY "productos_insert" ON productos
  FOR INSERT WITH CHECK (get_user_rol() IN ('owner', 'admin', 'compras'));

DROP POLICY IF EXISTS "productos_update" ON productos;
CREATE POLICY "productos_update" ON productos
  FOR UPDATE USING (get_user_rol() IN ('owner', 'compras'));

-- 3. PEDIDOS (la lista de una sede para un día de compra) ----------
--    borrador → enviado (a Compras) → comprado → recibido (Fase 2B)  |  cancelado
CREATE TABLE IF NOT EXISTS pedidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id UUID NOT NULL REFERENCES sedes(id),
  fecha_compra DATE NOT NULL,
  urgente BOOLEAN NOT NULL DEFAULT false,
  motivo_urgente TEXT,
  estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'enviado', 'comprado', 'recibido', 'cancelado')),
  notas TEXT,
  creado_por UUID NOT NULL REFERENCES profiles(id),
  enviado_at TIMESTAMPTZ,
  comprado_at TIMESTAMPTZ,
  recibido_at TIMESTAMPTZ,
  recibido_por UUID REFERENCES profiles(id),
  observacion_recepcion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pedidos_urgente_con_motivo CHECK (NOT urgente OR coalesce(trim(motivo_urgente), '') <> '')
);
CREATE INDEX IF NOT EXISTS idx_pedidos_sede_fecha ON pedidos (sede_id, fecha_compra);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado_fecha ON pedidos (estado, fecha_compra);
-- Una sola lista regular por sede y día de compra (las urgentes van aparte).
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_uno_por_dia
  ON pedidos (sede_id, fecha_compra) WHERE NOT urgente AND estado <> 'cancelado';
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pedidos_select" ON pedidos;
CREATE POLICY "pedidos_select" ON pedidos
  FOR SELECT USING (puede_ver_sede(sede_id));

DROP POLICY IF EXISTS "pedidos_insert" ON pedidos;
CREATE POLICY "pedidos_insert" ON pedidos
  FOR INSERT WITH CHECK (puede_pedir_en_sede(sede_id) AND creado_por = auth.uid());

DROP POLICY IF EXISTS "pedidos_update" ON pedidos;
CREATE POLICY "pedidos_update" ON pedidos
  FOR UPDATE USING (puede_pedir_en_sede(sede_id) OR get_user_rol() = 'compras');

DROP POLICY IF EXISTS "pedidos_delete" ON pedidos;
CREATE POLICY "pedidos_delete" ON pedidos
  FOR DELETE USING (puede_pedir_en_sede(sede_id) AND estado = 'borrador');

-- 4. LÍNEAS DEL PEDIDO ---------------------------------------------
CREATE TABLE IF NOT EXISTS pedido_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id),
  cantidad NUMERIC(10,2) NOT NULL CHECK (cantidad > 0),
  unidad TEXT NOT NULL,
  nota TEXT,
  proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL,  -- a quién se le compra
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'comprado', 'no_habia')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pedido_items_pedido ON pedido_items (pedido_id);
ALTER TABLE pedido_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sede_del_pedido(p_pedido UUID)
RETURNS UUID AS $$
  SELECT sede_id FROM pedidos WHERE id = p_pedido;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS "pedido_items_select" ON pedido_items;
CREATE POLICY "pedido_items_select" ON pedido_items
  FOR SELECT USING (puede_ver_sede(sede_del_pedido(pedido_id)));

DROP POLICY IF EXISTS "pedido_items_insert" ON pedido_items;
CREATE POLICY "pedido_items_insert" ON pedido_items
  FOR INSERT WITH CHECK (puede_pedir_en_sede(sede_del_pedido(pedido_id)));

DROP POLICY IF EXISTS "pedido_items_update" ON pedido_items;
CREATE POLICY "pedido_items_update" ON pedido_items
  FOR UPDATE USING (puede_pedir_en_sede(sede_del_pedido(pedido_id)) OR get_user_rol() = 'compras');

DROP POLICY IF EXISTS "pedido_items_delete" ON pedido_items;
CREATE POLICY "pedido_items_delete" ON pedido_items
  FOR DELETE USING (puede_pedir_en_sede(sede_del_pedido(pedido_id)));

-- 5. Verificación: deben aparecer las 4 tablas nuevas, vacías y con seguridad activa.
SELECT c.relname AS tabla, c.relrowsecurity AS seguridad_activa,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS reglas
FROM pg_class c
WHERE c.relname IN ('proveedores', 'productos', 'pedidos', 'pedido_items')
ORDER BY c.relname;
