-- =============================================================
-- Presupuesto por categoría en Control de Caja (pedido de Jahnn, 6-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo:
-- no borra ni cambia ningún gasto, compra ni pedido existente.
--
-- Qué hace:
--   El presupuesto del mes se arma y se aprueba en Cash Control. Ahí Jahnn marca, de cada
--   categoría, cuánto maneja el administrador de la sede («su parte»). Al aprobarlo, Cash
--   Control manda esos topes aquí y cada administrador ve una barra por categoría que se
--   llena con sus gastos y con las compras de Fabio.
--
--   1. Cada categoría de esta app se empareja con una de la LISTA ÚNICA de Cash Control.
--   2. Cada producto del catálogo recuerda su categoría (para estimar la lista antes de comprar).
--   3. Tabla de topes del mes (solo la escribe Cash Control, con su clave).
--   4. Cuánto se gastó por categoría (una sola regla para la app y para Cash Control).
--   5. El motivo cuando un gasto o una lista pasan el tope (le llega a Finanzas como alerta).
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Las categorías de la lista única que se pueden presupuestar (las mismas de Cash Control).
CREATE OR REPLACE FUNCTION public.es_categoria_presupuesto(p TEXT)
RETURNS BOOLEAN AS $$
  SELECT p IS NULL OR p = ANY (ARRAY[
    'INSUMOS', 'PRODUCTOS ATELIER', 'PACKAGING', 'DELIVERY Y FLETES',
    'PLANILLA', 'PERSONAL',
    'ALQUILER', 'SERVICIOS', 'MANTENIMIENTO', 'LIMPIEZA', 'MENAJE Y UTENSILIOS',
    'MARKETING',
    'CONTABILIDAD Y ASESORÍAS', 'OFICINA Y SISTEMAS', 'SS BANCARIOS', 'IMPUESTOS', 'CAJA CHICA',
    'PRÉSTAMOS Y TARJETAS', 'EQUIPOS', 'REMODELACIÓN', 'AHORRO', 'UTILIDADES A SOCIOS'
  ]);
$$ LANGUAGE sql IMMUTABLE;

-- 1. EMPAREJAR CATEGORÍAS --------------------------------------------------------
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS categoria_presupuesto TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categorias_presupuesto_valida') THEN
    ALTER TABLE categorias ADD CONSTRAINT categorias_presupuesto_valida CHECK (es_categoria_presupuesto(categoria_presupuesto));
  END IF;
END $$;

-- Propuesta automática por el nombre. Nunca pisa un emparejamiento que ya exista.
-- Lo que no se reconoce (Vueltos, Cuadre de Caja, Otros…) queda SIN emparejar: se muestra
-- como gasto, pero no consume ningún tope. Gerencia lo corrige en Configuración → Categorías.
WITH n AS (
  SELECT id, ' ' || translate(upper(nombre), 'ÁÉÍÓÚÜ', 'AEIOUU') || ' ' AS t FROM categorias
)
UPDATE categorias c SET categoria_presupuesto = CASE
    WHEN n.t LIKE '% PRODUCTOS ATELIER %' THEN 'PRODUCTOS ATELIER'
    WHEN n.t LIKE '% INSUMO%' THEN 'INSUMOS'
    WHEN n.t LIKE '% DELIVER%' OR n.t LIKE '% FLETE%' OR n.t LIKE '% MOVILIDAD %' OR n.t LIKE '% TAXI %' THEN 'DELIVERY Y FLETES'
    WHEN n.t LIKE '% PACKAGING %' OR n.t LIKE '% EMPAQUE%' OR n.t LIKE '% DESCARTABLE%' THEN 'PACKAGING'
    WHEN n.t LIKE '% LIMPIEZA %' THEN 'LIMPIEZA'
    WHEN n.t LIKE '% MARKETING %' OR n.t LIKE '% PUBLICIDAD %' THEN 'MARKETING'
    WHEN n.t LIKE '% MANTENIMIENTO%' OR n.t LIKE '% REPARACION%' THEN 'MANTENIMIENTO'
    WHEN n.t LIKE '% MENAJE %' OR n.t LIKE '% UTENSILIO%' THEN 'MENAJE Y UTENSILIOS'
    WHEN n.t LIKE '% OFICINA %' OR n.t LIKE '% UTILES %' THEN 'OFICINA Y SISTEMAS'
    WHEN n.t LIKE '% PERSONAL %' OR n.t LIKE '% UNIFORME%' OR n.t LIKE '% ALMUERZO%' THEN 'PERSONAL'
    WHEN n.t LIKE '% SERVICIOS %' THEN 'SERVICIOS'
    WHEN n.t LIKE '% EQUIPO%' THEN 'EQUIPOS'
    ELSE NULL
  END
FROM n
WHERE c.id = n.id AND c.categoria_presupuesto IS NULL;

-- 2. CADA PRODUCTO RECUERDA SU CATEGORÍA ------------------------------------------
ALTER TABLE productos ADD COLUMN IF NOT EXISTS categoria_presupuesto TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'productos_presupuesto_valida') THEN
    ALTER TABLE productos ADD CONSTRAINT productos_presupuesto_valida CHECK (es_categoria_presupuesto(categoria_presupuesto));
  END IF;
END $$;

-- Igual que el proveedor habitual: el administrador, Compras y Gerencia la pueden cambiar,
-- y solo ese dato.
CREATE OR REPLACE FUNCTION public.recordar_categoria_producto(p_producto UUID, p_categoria TEXT)
RETURNS VOID AS $$
BEGIN
  IF COALESCE(get_user_rol()::TEXT, '') NOT IN ('owner', 'admin', 'compras') THEN
    RAISE EXCEPTION 'No tienes permiso para esto.';
  END IF;
  IF NOT es_categoria_presupuesto(p_categoria) THEN
    RAISE EXCEPTION 'La categoría % no está en la lista del presupuesto.', p_categoria;
  END IF;
  UPDATE productos SET categoria_presupuesto = p_categoria WHERE id = p_producto;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Una sola vez: cada producto sin categoría toma la que más se usó en las compras donde
-- apareció (la que eligió el administrador al cerrar la rendición). Nunca pisa una que exista.
UPDATE productos p SET categoria_presupuesto = x.cat
FROM (
  SELECT DISTINCT ON (ci.producto_id) ci.producto_id, cat.categoria_presupuesto AS cat
  FROM compra_items ci
  JOIN compras k ON k.id = ci.compra_id
  JOIN categorias cat ON cat.id = k.categoria_id
  WHERE cat.categoria_presupuesto IS NOT NULL
  GROUP BY ci.producto_id, cat.categoria_presupuesto
  ORDER BY ci.producto_id, count(*) DESC
) x
WHERE p.id = x.producto_id AND p.categoria_presupuesto IS NULL;

-- 3. TOPES DEL MES (los manda Cash Control) ------------------------------------------
CREATE TABLE IF NOT EXISTS presupuesto_caja (
  sede_id UUID NOT NULL REFERENCES sedes(id),
  mes TEXT NOT NULL CHECK (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  categoria TEXT NOT NULL CHECK (es_categoria_presupuesto(categoria) AND categoria IS NOT NULL),
  tope NUMERIC(12,2) NOT NULL CHECK (tope > 0),               -- la parte que maneja el administrador
  presupuesto_total NUMERIC(12,2) CHECK (presupuesto_total >= 0), -- el presupuesto de toda la categoría (referencia)
  enviado_el TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (sede_id, mes, categoria)
);
ALTER TABLE presupuesto_caja ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "presupuesto_caja_select" ON presupuesto_caja;
CREATE POLICY "presupuesto_caja_select" ON presupuesto_caja
  FOR SELECT USING (COALESCE(puede_ver_sede(sede_id), false));
-- Sin políticas de escritura: solo se escribe con sincronizar_presupuesto_caja.

-- La clave de Cash Control. Se guarda solo su huella (hash), nunca la clave.
-- Sin políticas: nadie la puede leer por la API.
CREATE TABLE IF NOT EXISTS sync_secretos (nombre TEXT PRIMARY KEY, hash TEXT NOT NULL);
ALTER TABLE sync_secretos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON sync_secretos FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.clave_cash_control_valida(p_token TEXT)
RETURNS BOOLEAN AS $$
  SELECT COALESCE(length(p_token) >= 32, false) AND EXISTS (
    SELECT 1 FROM sync_secretos
    WHERE nombre = 'cash-control' AND hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.clave_cash_control_valida(TEXT) FROM PUBLIC, anon, authenticated;

-- Reemplaza los topes de una sede para un mes. p_topes = [{"categoria": "INSUMOS", "tope": 2000, "total": 3750}, ...]
CREATE OR REPLACE FUNCTION public.sincronizar_presupuesto_caja(p_token TEXT, p_sede TEXT, p_mes TEXT, p_topes JSONB)
RETURNS INTEGER AS $$
DECLARE
  v_sede UUID;
  v_n INTEGER;
BEGIN
  IF NOT clave_cash_control_valida(p_token) THEN
    RAISE EXCEPTION 'Clave de sincronización inválida.';
  END IF;
  IF p_mes IS NULL OR p_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Mes inválido: %', p_mes;
  END IF;
  SELECT id INTO v_sede FROM sedes WHERE lower(nombre) = lower(p_sede);
  IF v_sede IS NULL THEN
    RAISE EXCEPTION 'No existe la sede %.', p_sede;
  END IF;
  DELETE FROM presupuesto_caja WHERE sede_id = v_sede AND mes = p_mes;
  INSERT INTO presupuesto_caja (sede_id, mes, categoria, tope, presupuesto_total)
  SELECT v_sede, p_mes, x->>'categoria', round((x->>'tope')::NUMERIC, 2), round(NULLIF(x->>'total', '')::NUMERIC, 2)
  FROM jsonb_array_elements(COALESCE(p_topes, '[]'::JSONB)) x
  WHERE COALESCE((x->>'tope')::NUMERIC, 0) > 0;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.sincronizar_presupuesto_caja(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sincronizar_presupuesto_caja(TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

-- 4. CUÁNTO SE GASTÓ POR CATEGORÍA (una sola regla) -----------------------------------
--   · Gastos de caja del administrador, por la categoría emparejada. Los gastos que nacen de
--     una compra de Fabio (cerrar_entrega) NO se cuentan aquí: se cuentan como compra.
--   · Compras de Fabio (al contado y a crédito), repartidas por producto según la categoría
--     que recuerda cada producto; si el producto no tiene, la que eligió el administrador al
--     cerrar la rendición. Es la misma regla de la Vista general: cada compra cuenta UNA vez.
--   · Lo que no tiene categoría del presupuesto sale como «SIN EMPAREJAR» / «SIN CATEGORÍA».
CREATE OR REPLACE FUNCTION public.gastado_caja_por_categoria(p_mes TEXT)
RETURNS TABLE (sede_id UUID, categoria TEXT, monto NUMERIC) AS $$
  WITH r AS (
    SELECT to_date(p_mes || '-01', 'YYYY-MM-DD') AS d0,
           (to_date(p_mes || '-01', 'YYYY-MM-DD') + INTERVAL '1 month')::DATE AS d1
  ),
  gastos_caja AS (
    SELECT g.sede_id, COALESCE(c.categoria_presupuesto, 'SIN EMPAREJAR') AS categoria, g.monto
    FROM gastos g
    JOIN categorias c ON c.id = g.categoria_id
    CROSS JOIN r
    WHERE g.fecha >= r.d0 AND g.fecha < r.d1
      AND NOT EXISTS (SELECT 1 FROM compras k WHERE k.gasto_id = g.id)
  ),
  lineas AS (
    SELECT k.sede_id, k.total, ci.precio_total,
           COALESCE(p.categoria_presupuesto, cat.categoria_presupuesto, 'SIN CATEGORÍA') AS categoria,
           SUM(ci.precio_total) OVER (PARTITION BY k.id) AS suma
    FROM compras k
    JOIN compra_items ci ON ci.compra_id = k.id
    JOIN productos p ON p.id = ci.producto_id
    LEFT JOIN categorias cat ON cat.id = k.categoria_id
    CROSS JOIN r
    WHERE k.fecha >= r.d0 AND k.fecha < r.d1
  ),
  compras_sin_detalle AS (
    SELECT k.sede_id, COALESCE(cat.categoria_presupuesto, 'SIN CATEGORÍA') AS categoria, k.total AS monto
    FROM compras k
    LEFT JOIN categorias cat ON cat.id = k.categoria_id
    CROSS JOIN r
    WHERE k.fecha >= r.d0 AND k.fecha < r.d1
      AND NOT EXISTS (SELECT 1 FROM compra_items ci WHERE ci.compra_id = k.id)
  )
  SELECT x.sede_id, x.categoria, round(SUM(x.monto), 2)
  FROM (
    SELECT sede_id, categoria, monto FROM gastos_caja
    UNION ALL
    SELECT sede_id, categoria, CASE WHEN suma > 0 THEN precio_total * total / suma ELSE 0 END FROM lineas
    UNION ALL
    SELECT sede_id, categoria, monto FROM compras_sin_detalle
  ) x
  GROUP BY x.sede_id, x.categoria;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.gastado_caja_por_categoria(TEXT) FROM PUBLIC, anon, authenticated;

-- Para la app: topes y gastado de una sede en un mes. Solo quien puede ver la sede.
CREATE OR REPLACE FUNCTION public.uso_presupuesto_caja(p_sede UUID, p_mes TEXT)
RETURNS TABLE (categoria TEXT, tope NUMERIC, presupuesto_total NUMERIC, gastado NUMERIC, enviado_el TIMESTAMPTZ) AS $$
BEGIN
  IF NOT COALESCE(puede_ver_sede(p_sede), false) THEN
    RAISE EXCEPTION 'No tienes acceso a esta sede.';
  END IF;
  IF p_mes IS NULL OR p_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Mes inválido: %', p_mes;
  END IF;
  RETURN QUERY
    SELECT COALESCE(pc.categoria, g.categoria), pc.tope, pc.presupuesto_total, COALESCE(g.monto, 0), pc.enviado_el
    FROM (SELECT * FROM presupuesto_caja WHERE sede_id = p_sede AND mes = p_mes) pc
    FULL OUTER JOIN (SELECT * FROM gastado_caja_por_categoria(p_mes) WHERE sede_id = p_sede) g
      ON g.categoria = pc.categoria;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.uso_presupuesto_caja(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.uso_presupuesto_caja(UUID, TEXT) TO authenticated;

-- Para Cash Control (con su clave): lo gastado por sede, mes y categoría, para proponer la
-- parte de cada administrador con lo que de verdad pasó por esta app.
CREATE OR REPLACE FUNCTION public.gasto_caja_mensual(p_token TEXT, p_desde TEXT, p_hasta TEXT)
RETURNS TABLE (sede TEXT, mes TEXT, categoria TEXT, monto NUMERIC) AS $$
BEGIN
  IF NOT clave_cash_control_valida(p_token) THEN
    RAISE EXCEPTION 'Clave de sincronización inválida.';
  END IF;
  IF p_desde !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' OR p_hasta !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' OR p_desde > p_hasta THEN
    RAISE EXCEPTION 'Rango de meses inválido.';
  END IF;
  RETURN QUERY
    SELECT s.nombre, to_char(m, 'YYYY-MM'), g.categoria, g.monto
    FROM generate_series(to_date(p_desde || '-01', 'YYYY-MM-DD'), to_date(p_hasta || '-01', 'YYYY-MM-DD'), INTERVAL '1 month') m
    CROSS JOIN LATERAL gastado_caja_por_categoria(to_char(m, 'YYYY-MM')) g
    JOIN sedes s ON s.id = g.sede_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.gasto_caja_mensual(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gasto_caja_mensual(TEXT, TEXT, TEXT) TO anon, authenticated;

-- 5. MOTIVO CUANDO SE PASA EL TOPE ---------------------------------------------------
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS motivo_sobre_tope TEXT;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS motivo_sobre_tope TEXT;

-- Verificación: cómo quedaron emparejadas las categorías y qué hay creado.
SELECT nombre AS categoria_de_esta_app,
       COALESCE(categoria_presupuesto, '— sin emparejar —') AS en_el_presupuesto,
       count(*) AS sedes
FROM categorias
GROUP BY nombre, categoria_presupuesto
ORDER BY categoria_presupuesto NULLS FIRST, nombre;
