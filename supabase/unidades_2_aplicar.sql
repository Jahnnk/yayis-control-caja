-- =============================================================
-- Unidades y productos únicos — PASO 2: APLICAR (pedido de Jahnn, 21-nov-2026)
-- Ejecutar SOLO después de revisar el PASO 1 (unidades_1_ver_cambios.sql) y dar el OK.
-- Pegar TODO en el SQL Editor de Supabase y pulsar «Run». Es seguro volver a correrlo si algo falla.
-- (Arreglo 21-nov-2026: ya no usa tablas temporales; el editor las borraba antes de tiempo.)
--
-- Qué hace:
--   1. Une las unidades a UNA sola lista (la misma de Cash Control):
--      unidad, kg, g, litro, ml, paquete, galón, caja, frasco, bolsa, atado, juego, balde,
--      ciento, arroba, docena, rollo  + «sol» (lo que se compra por monto en el mercado).
--      («und» → unidad, «L» → litro, «pqte» → paquete, «soles» → sol…)
--   2. Cada producto queda o «en soles» (hierbas y flores) o «por cantidad» (lo demás), nunca las dos.
--   3. Fusiona productos repetidos por tildes (LIMON + LIMÓN → LIMÓN). Sus listas y compras
--      pasan al que se queda. NO se borra ninguna compra ni ninguna lista: solo el producto repetido.
--   4. Desde ahora la base RECHAZA unidades fuera de la lista, nombres repetidos sin tildes y
--      líneas en soles de un producto que va por cantidad (o al revés). Solo Gerencia cambia
--      un producto de «en soles» a «por cantidad».
--
-- Las compras viejas «en soles» de productos que ahora van por cantidad se quedan como están.
-- =============================================================

BEGIN;

-- 1. La regla de la lista, en la base (igual que src/lib/compras.ts → unidadDeLista).
CREATE OR REPLACE FUNCTION public.unidad_de_lista(p TEXT)
RETURNS TEXT AS $$
  SELECT CASE
    WHEN t ~ '^(sol|soles|s/\.?)$' THEN 'sol'
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
    ELSE NULL  -- algo desconocido: no hay unidad clara
  END
  FROM (SELECT lower(translate(trim(COALESCE(p, '')), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) AS t) x;
$$ LANGUAGE sql IMMUTABLE;

-- Clave del nombre sin tildes ni mayúsculas (igual que claveNombre en la app).
CREATE OR REPLACE FUNCTION public.clave_producto(p TEXT)
RETURNS TEXT AS $$
  SELECT lower(translate(regexp_replace(trim(p), '\s+', ' ', 'g'), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));
$$ LANGUAGE sql IMMUTABLE;

-- 2. La unidad de cada producto decidida por Jahnn (21-nov-2026): hierbas y flores en soles, lo demás por cantidad.
-- (Sin tablas temporales: el SQL Editor de Supabase las borra antes de tiempo.)
UPDATE productos p SET unidad = ps.unidad
FROM (VALUES
  ('albahaca', 'sol'), ('apio', 'sol'), ('perejil', 'sol'), ('culantro', 'sol'), ('poro', 'sol'),
  ('flores astromelias rosadas', 'sol'), ('flores astromelias fucsias', 'sol'),
  ('espinaca', 'kg'), ('aguaymanto con cascara', 'kg'), ('ajo molido', 'kg'), ('maracuya', 'unidad'),
  ('kion', 'kg'), ('zanahoria', 'kg'), ('limon', 'kg'), ('aji limo', 'kg')
) AS ps(clave, unidad)
WHERE ps.clave = clave_producto(p.nombre) AND p.unidad <> ps.unidad;

-- 3. Unidades escritas de otra forma → la de la lista («soles» → sol, «und» → unidad…).
UPDATE productos    SET unidad = unidad_de_lista(unidad) WHERE unidad_de_lista(unidad) IS NOT NULL AND unidad <> unidad_de_lista(unidad);
UPDATE pedido_items SET unidad = unidad_de_lista(unidad) WHERE unidad_de_lista(unidad) IS NOT NULL AND unidad <> unidad_de_lista(unidad);
UPDATE compra_items SET unidad = unidad_de_lista(unidad) WHERE unidad_de_lista(unidad) IS NOT NULL AND unidad <> unidad_de_lista(unidad);

-- Líneas todavía por comprar que no calzan con su producto (en soles vs. por cantidad) → la unidad del producto.
-- La cantidad se queda igual (revisarla en la lista).
UPDATE pedido_items pi SET unidad = p.unidad
FROM productos p
WHERE p.id = pi.producto_id AND pi.estado = 'pendiente'
  AND unidad_de_lista(p.unidad) IS NOT NULL
  AND (pi.unidad = 'sol') <> (p.unidad = 'sol');

-- 4. Fusión de productos repetidos por tildes. Se queda el nombre CON tilde (el bien escrito);
--    si empatan, el más usado. Todo lo que apuntaba al repetido pasa al que se queda.
--    Todo en un solo bloque, producto por producto (sin tablas temporales).
DO $$
DECLARE
  f RECORD;
  r RECORD;
BEGIN
  FOR f IN
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
    WHERE d.orden > 1
  LOOP
    -- Pasa TODAS las referencias (listas, compras y cualquier otra tabla que apunte a productos).
    FOR r IN
      SELECT cl.relname AS tabla, a.attname AS columna
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND c.confrelid = 'public.productos'::regclass AND array_length(c.conkey, 1) = 1
    LOOP
      EXECUTE format('UPDATE public.%I SET %I = $1 WHERE %I = $2', r.tabla, r.columna, r.columna) USING f.queda, f.repetido;
    END LOOP;

    -- El que se queda hereda proveedor y categoría si no los tenía.
    UPDATE productos k SET
      proveedor_id = COALESCE(k.proveedor_id, d.proveedor_id),
      categoria_presupuesto = COALESCE(k.categoria_presupuesto, d.categoria_presupuesto)
    FROM productos d
    WHERE k.id = f.queda AND d.id = f.repetido;

    -- Solo se borra el PRODUCTO repetido (ya no lo usa ninguna lista ni compra).
    DELETE FROM productos WHERE id = f.repetido;
  END LOOP;
END $$;

-- 5. Desde ahora: nunca dos productos con el mismo nombre sin tildes.
CREATE UNIQUE INDEX IF NOT EXISTS productos_clave_unica ON productos (clave_producto(nombre));

-- 6. Desde ahora: la base solo acepta unidades de la lista (y corrige «und» → unidad sola).
--    Un producto en soles solo se pide/compra en soles; uno por cantidad, nunca en soles.
--    Pasar un producto de soles a cantidad (o al revés) solo lo hace Gerencia (o este SQL Editor).
CREATE OR REPLACE FUNCTION public.exigir_unidad_de_lista()
RETURNS TRIGGER AS $$
DECLARE
  v TEXT := unidad_de_lista(NEW.unidad);
  v_prod productos%ROWTYPE;
BEGIN
  IF v IS NULL THEN
    RAISE EXCEPTION 'La unidad «%» no está en la lista. Elige: unidad, kg, g, litro, ml, paquete, galón, caja, frasco, bolsa, atado, juego, balde, ciento, arroba, docena, rollo o soles.', NEW.unidad;
  END IF;
  NEW.unidad := v;
  IF TG_TABLE_NAME = 'productos' THEN
    IF TG_OP = 'UPDATE' AND (OLD.unidad = 'sol') <> (v = 'sol') AND auth.uid() IS NOT NULL
       AND COALESCE(get_user_rol()::TEXT, '') <> 'owner' THEN
      RAISE EXCEPTION 'Solo Gerencia puede pasar % entre «soles» y cantidad.', OLD.nombre;
    END IF;
  ELSE
    SELECT * INTO v_prod FROM productos WHERE id = NEW.producto_id;
    IF FOUND AND unidad_de_lista(v_prod.unidad) IS NOT NULL AND (v_prod.unidad = 'sol') <> (v = 'sol') THEN
      IF v_prod.unidad = 'sol' THEN
        RAISE EXCEPTION '% se compra en soles.', v_prod.nombre;
      ELSE
        RAISE EXCEPTION '% se compra por cantidad (%), no en soles.', v_prod.nombre, v_prod.unidad;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
  -- Entre «soles» y cantidad solo cambia Gerencia (el disparador de productos lo revisa con su rol).
  UPDATE productos SET unidad = v_unidad WHERE id = p_producto;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMIT;

-- Verificación: las 3 primeras cifras deben ser 0. La 4.ª son las compras viejas «en soles» de productos
-- que ahora van por cantidad (se quedan como estaban).
SELECT
  (SELECT count(*) FROM productos WHERE unidad_de_lista(unidad) IS DISTINCT FROM unidad) AS productos_fuera_de_lista,
  (SELECT count(*) FROM pedido_items WHERE estado = 'pendiente' AND unidad_de_lista(unidad) IS DISTINCT FROM unidad) AS lineas_pendientes_fuera_de_lista,
  (SELECT count(*) FROM (SELECT clave_producto(nombre) FROM productos GROUP BY 1 HAVING count(*) > 1) x) AS nombres_repetidos,
  (SELECT count(*) FROM compra_items ci JOIN productos p ON p.id = ci.producto_id WHERE ci.unidad = 'sol' AND p.unidad <> 'sol') AS compras_viejas_en_soles;
