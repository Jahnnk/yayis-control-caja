-- =============================================================
-- Unidades y productos únicos — PASO 2: APLICAR (pedido de Jahnn, 21-nov-2026)
-- Ejecutar SOLO después de revisar el PASO 1 (unidades_1_ver_cambios.sql) y dar el OK.
-- Pegar TODO en el SQL Editor de Supabase y pulsar «Run». Si algo falla, no se cambia nada.
--
-- Qué hace:
--   1. Une las unidades a UNA sola lista (la misma de Cash Control):
--      unidad, kg, g, litro, ml, paquete, galón, caja, frasco, bolsa, atado, juego, balde,
--      ciento, arroba, docena, rollo.  («und» → unidad, «L» → litro, «pqte» → paquete…)
--   2. Los productos que se pedían «en soles» pasan a su unidad real (atado, kg, unidad).
--   3. Fusiona productos repetidos por tildes (LIMON + LIMÓN → LIMÓN). Sus listas y compras
--      pasan al que se queda. NO se borra ninguna compra ni ninguna lista: solo el producto repetido.
--   4. Desde ahora la base RECHAZA unidades fuera de la lista y nombres repetidos sin tildes.
--
-- Las compras viejas anotadas «en soles» se quedan como están (no se sabe cuánto se compró).
-- =============================================================

BEGIN;

-- 1. La regla de la lista, en la base (igual que src/lib/compras.ts → unidadDeLista).
CREATE OR REPLACE FUNCTION public.unidad_de_lista(p TEXT)
RETURNS TEXT AS $$
  SELECT CASE
    WHEN t ~ '^(u|und|unds|unid|unids|unidad|unidades)$' THEN 'unidad'
    WHEN t ~ '^(kg|kgs|kilo|kilos|kilogramo|kilogramos)$' THEN 'kg'
    WHEN t ~ '^(g|gr|grs|gramo|gramos)$' THEN 'g'
    WHEN t ~ '^(l|lt|lts|litro|litros)$' THEN 'litro'
    WHEN t ~ '^(ml|mililitro|mililitros)$' THEN 'ml'
    WHEN t ~ '^(paquete|paquetes|pqte|pqtes|paq|paqs)$' THEN 'paquete'
    WHEN t ~ '^(galon|galones)$' THEN 'galón'
    WHEN t ~ '^(caja|cajas)$' THEN 'caja'
    WHEN t ~ '^(frasco|frascos)$' THEN 'frasco'
    WHEN t ~ '^(bolsa|bolsas)$' THEN 'bolsa'
    WHEN t ~ '^(atado|atados|manojo|manojos)$' THEN 'atado'
    WHEN t ~ '^(juego|juegos)$' THEN 'juego'
    WHEN t ~ '^(balde|baldes)$' THEN 'balde'
    WHEN t ~ '^(ciento|cientos)$' THEN 'ciento'
    WHEN t ~ '^(arroba|arrobas)$' THEN 'arroba'
    WHEN t ~ '^(docena|docenas)$' THEN 'docena'
    WHEN t ~ '^(rollo|rollos)$' THEN 'rollo'
    ELSE NULL  -- «sol», «soles» o algo desconocido: no hay unidad clara
  END
  FROM (SELECT lower(translate(trim(COALESCE(p, '')), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) AS t) x;
$$ LANGUAGE sql IMMUTABLE;

-- Clave del nombre sin tildes ni mayúsculas (igual que claveNombre en la app).
CREATE OR REPLACE FUNCTION public.clave_producto(p TEXT)
RETURNS TEXT AS $$
  SELECT lower(translate(regexp_replace(trim(p), '\s+', ' ', 'g'), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));
$$ LANGUAGE sql IMMUTABLE;

-- 2. Productos «en soles» → su unidad real (la lista aprobada por Jahnn).
CREATE TEMP TABLE propuesta_sol(clave TEXT PRIMARY KEY, unidad TEXT) ON COMMIT DROP;
INSERT INTO propuesta_sol VALUES
  ('albahaca', 'atado'), ('apio', 'atado'), ('perejil', 'atado'), ('culantro', 'atado'), ('poro', 'atado'),
  ('espinaca', 'kg'), ('aguaymanto con cascara', 'kg'), ('ajo molido', 'kg'), ('maracuya', 'unidad'),
  ('flores astromelias rosadas', 'atado'), ('flores astromelias fucsias', 'atado'),
  ('kion', 'kg'), ('zanahoria', 'kg'), ('limon', 'kg'), ('aji limo', 'kg');

-- Líneas de listas todavía por comprar en soles → la unidad real (la cantidad se queda igual).
UPDATE pedido_items pi SET unidad = COALESCE(ps.unidad, 'unidad')
FROM productos p LEFT JOIN propuesta_sol ps ON ps.clave = clave_producto(p.nombre)
WHERE p.id = pi.producto_id AND pi.estado = 'pendiente' AND lower(trim(pi.unidad)) IN ('sol', 'soles', 's/', 's/.');

UPDATE productos p SET unidad = COALESCE(ps.unidad, 'unidad')
FROM (SELECT id, clave_producto(nombre) AS clave FROM productos) c LEFT JOIN propuesta_sol ps ON ps.clave = c.clave
WHERE c.id = p.id AND lower(trim(p.unidad)) IN ('sol', 'soles', 's/', 's/.');

-- 3. Unidades escritas de otra forma → la de la lista. Las compras viejas «en soles» no se tocan.
UPDATE productos    SET unidad = unidad_de_lista(unidad) WHERE unidad_de_lista(unidad) IS NOT NULL AND unidad <> unidad_de_lista(unidad);
UPDATE pedido_items SET unidad = unidad_de_lista(unidad) WHERE unidad_de_lista(unidad) IS NOT NULL AND unidad <> unidad_de_lista(unidad);
UPDATE compra_items SET unidad = unidad_de_lista(unidad) WHERE unidad_de_lista(unidad) IS NOT NULL AND unidad <> unidad_de_lista(unidad);

-- 4. Fusión de productos repetidos por tildes. Se queda el nombre CON tilde (el bien escrito);
--    si empatan, el más usado. Todo lo que apuntaba al repetido pasa al que se queda.
CREATE TEMP TABLE fusion ON COMMIT DROP AS
WITH uso AS (
  SELECT producto_id, count(*) AS n FROM (SELECT producto_id FROM pedido_items UNION ALL SELECT producto_id FROM compra_items) x GROUP BY producto_id
), g AS (
  SELECT p.id, clave_producto(p.nombre) AS clave,
         row_number() OVER (PARTITION BY clave_producto(p.nombre)
           ORDER BY (p.nombre <> translate(p.nombre, 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) DESC, COALESCE(uso.n, 0) DESC, p.created_at) AS orden
  FROM productos p LEFT JOIN uso ON uso.producto_id = p.id
)
SELECT d.id AS repetido, k.id AS queda
FROM g d JOIN g k ON k.clave = d.clave AND k.orden = 1
WHERE d.orden > 1;

-- Pasa TODAS las referencias (listas, compras y cualquier otra tabla que apunte a productos).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT cl.relname AS tabla, a.attname AS columna
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'public.productos'::regclass AND array_length(c.conkey, 1) = 1
  LOOP
    EXECUTE format('UPDATE public.%I t SET %I = f.queda FROM fusion f WHERE t.%I = f.repetido', r.tabla, r.columna, r.columna);
  END LOOP;
END $$;

-- El que se queda hereda proveedor y categoría si no los tenía.
UPDATE productos k SET
  proveedor_id = COALESCE(k.proveedor_id, d.proveedor_id),
  categoria_presupuesto = COALESCE(k.categoria_presupuesto, d.categoria_presupuesto)
FROM fusion f JOIN productos d ON d.id = f.repetido
WHERE k.id = f.queda;

-- Solo se borra el PRODUCTO repetido (ya no lo usa ninguna lista ni compra).
DELETE FROM productos WHERE id IN (SELECT repetido FROM fusion);

-- 5. Desde ahora: nunca dos productos con el mismo nombre sin tildes.
CREATE UNIQUE INDEX IF NOT EXISTS productos_clave_unica ON productos (clave_producto(nombre));

-- 6. Desde ahora: la base solo acepta unidades de la lista (y corrige «und» → unidad sola).
CREATE OR REPLACE FUNCTION public.exigir_unidad_de_lista()
RETURNS TRIGGER AS $$
DECLARE v TEXT := unidad_de_lista(NEW.unidad);
BEGIN
  IF v IS NULL THEN
    RAISE EXCEPTION 'La unidad «%» no está en la lista. Elige: unidad, kg, g, litro, ml, paquete, galón, caja, frasco, bolsa, atado, juego, balde, ciento, arroba, docena o rollo.', NEW.unidad;
  END IF;
  NEW.unidad := v;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_unidad_de_lista ON productos;
CREATE TRIGGER trg_unidad_de_lista BEFORE INSERT OR UPDATE OF unidad ON productos
  FOR EACH ROW EXECUTE FUNCTION exigir_unidad_de_lista();
DROP TRIGGER IF EXISTS trg_unidad_de_lista ON pedido_items;
CREATE TRIGGER trg_unidad_de_lista BEFORE INSERT OR UPDATE OF unidad ON pedido_items
  FOR EACH ROW EXECUTE FUNCTION exigir_unidad_de_lista();
DROP TRIGGER IF EXISTS trg_unidad_de_lista ON compra_items;
CREATE TRIGGER trg_unidad_de_lista BEFORE INSERT OR UPDATE OF unidad ON compra_items
  FOR EACH ROW EXECUTE FUNCTION exigir_unidad_de_lista();

-- «Recordar la unidad» del administrador: solo de la lista.
CREATE OR REPLACE FUNCTION public.recordar_unidad_producto(p_producto UUID, p_unidad TEXT)
RETURNS VOID AS $$
DECLARE
  v_unidad TEXT := unidad_de_lista(p_unidad);
BEGIN
  IF COALESCE(get_user_rol()::TEXT, '') NOT IN ('owner', 'admin', 'compras') THEN
    RAISE EXCEPTION 'No tienes permiso para esto.';
  END IF;
  IF v_unidad IS NULL THEN
    RAISE EXCEPTION 'Elige una unidad de la lista (kg, unidad, atado…).';
  END IF;
  UPDATE productos SET unidad = v_unidad WHERE id = p_producto;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;

-- Verificación: las 3 primeras cifras deben ser 0. La 4.ª son las compras viejas «en soles» (se quedan).
SELECT
  (SELECT count(*) FROM productos WHERE unidad_de_lista(unidad) IS DISTINCT FROM unidad) AS productos_fuera_de_lista,
  (SELECT count(*) FROM pedido_items WHERE estado = 'pendiente' AND unidad_de_lista(unidad) IS DISTINCT FROM unidad) AS lineas_pendientes_fuera_de_lista,
  (SELECT count(*) FROM (SELECT clave_producto(nombre) FROM productos GROUP BY 1 HAVING count(*) > 1) x) AS nombres_repetidos,
  (SELECT count(*) FROM compra_items WHERE unidad_de_lista(unidad) IS NULL) AS compras_viejas_en_soles;
