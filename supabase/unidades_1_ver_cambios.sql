-- =============================================================
-- Unidades y productos únicos — PASO 1: SOLO MIRAR (pedido de Jahnn, 21-nov-2026)
-- Pegar en el SQL Editor de Supabase y pulsar «Run». NO cambia nada: solo muestra
-- la lista de cambios que hará el PASO 2 (unidades_2_aplicar.sql).
--
-- Sale UNA tabla con estas columnas:
--   que      → tipo de cambio (unidad, producto en soles, fusión, línea pendiente en soles, sin regla)
--   donde    → tabla o producto
--   antes    → cómo está hoy
--   despues  → cómo quedará
--   lineas   → cuántas filas toca
-- =============================================================

WITH variantes(patron, unidad) AS (VALUES
  ('^(sol|soles|s/\.?)$', NULL),
  ('^(u|und|unds|unid|unids|unidad|unidades)$', 'unidad'),
  ('^(kg|kgs|kilo|kilos|kilogramo|kilogramos)$', 'kg'),
  ('^(g|gr|grs|gramo|gramos)$', 'g'),
  ('^(l|lt|lts|litro|litros)$', 'litro'),
  ('^(ml|mililitro|mililitros)$', 'ml'),
  ('^(paquete|paquetes|pqte|pqtes|paq|paqs)$', 'paquete'),
  ('^(galon|galones)$', 'galón'),
  ('^(caja|cajas)$', 'caja'),
  ('^(frasco|frascos)$', 'frasco'),
  ('^(bolsa|bolsas)$', 'bolsa'),
  ('^(atado|atados|manojo|manojos)$', 'atado'),
  ('^(juego|juegos)$', 'juego'),
  ('^(balde|baldes)$', 'balde'),
  ('^(ciento|cientos)$', 'ciento'),
  ('^(arroba|arrobas)$', 'arroba'),
  ('^(docena|docenas)$', 'docena'),
  ('^(rollo|rollos)$', 'rollo')
),
-- Unidad propuesta para los productos que hoy se piden «en soles» (Jahnn la confirma).
propuesta_sol(clave, unidad) AS (VALUES
  ('albahaca', 'atado'), ('apio', 'atado'), ('perejil', 'atado'), ('culantro', 'atado'), ('poro', 'atado'),
  ('espinaca', 'kg'), ('aguaymanto con cascara', 'kg'), ('ajo molido', 'kg'), ('maracuya', 'unidad'),
  ('flores astromelias rosadas', 'atado'), ('flores astromelias fucsias', 'atado'),
  ('kion', 'kg'), ('zanahoria', 'kg'), ('limon', 'kg'), ('aji limo', 'kg')
),
clave_prod AS (
  SELECT p.*, lower(translate(regexp_replace(trim(p.nombre), '\s+', ' ', 'g'), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')) AS clave
  FROM productos p
),
unidades_hoy AS (
  SELECT 'productos' AS tabla, unidad, count(*) AS n FROM productos GROUP BY unidad
  UNION ALL SELECT 'pedido_items', unidad, count(*) FROM pedido_items GROUP BY unidad
  UNION ALL SELECT 'compra_items', unidad, count(*) FROM compra_items GROUP BY unidad
),
mapeo AS (
  SELECT u.tabla, u.unidad, u.n,
         (SELECT v.unidad FROM variantes v WHERE lower(translate(trim(u.unidad), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) ~ v.patron LIMIT 1) AS nueva,
         EXISTS (SELECT 1 FROM variantes v WHERE lower(translate(trim(u.unidad), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) ~ v.patron) AS conocida
  FROM unidades_hoy u
),
-- Uso de cada producto (para elegir con cuál nombre se queda en una fusión).
uso AS (
  SELECT producto_id, count(*) AS n FROM (
    SELECT producto_id FROM pedido_items UNION ALL SELECT producto_id FROM compra_items
  ) x GROUP BY producto_id
),
grupos AS (
  SELECT c.clave, c.id, c.nombre, COALESCE(uso.n, 0) AS usos,
         row_number() OVER (PARTITION BY c.clave
           ORDER BY (c.nombre <> translate(c.nombre, 'ÁÉÍÓÚÜÑ', 'AEIOUUN')) DESC, COALESCE(uso.n, 0) DESC, c.created_at) AS orden,
         count(*) OVER (PARTITION BY c.clave) AS tamano
  FROM clave_prod c LEFT JOIN uso ON uso.producto_id = c.id
)
-- 1. Unidades escritas de otra forma → la de la lista (no cambia cantidades ni montos).
SELECT '1. Unidad' AS que, tabla AS donde, unidad AS antes, nueva AS despues, n AS lineas
FROM mapeo WHERE conocida AND nueva IS NOT NULL AND nueva <> unidad

-- 2. Productos que hoy se piden «en soles» → su unidad real.
UNION ALL
SELECT '2. Producto en soles', c.nombre, c.unidad,
       COALESCE(ps.unidad, '(sin propuesta: unidad)'), 1
FROM clave_prod c LEFT JOIN propuesta_sol ps ON ps.clave = c.clave
WHERE lower(trim(c.unidad)) IN ('sol', 'soles', 's/', 's/.')

-- 3. Productos duplicados (mismo nombre sin tildes): se quedan con el nombre con tilde; sus listas y compras pasan a él.
UNION ALL
SELECT '3. Fusión', d.nombre, d.nombre || ' (' || d.usos || ' líneas)',
       'se une a ' || k.nombre, d.usos
FROM grupos d JOIN grupos k ON k.clave = d.clave AND k.orden = 1
WHERE d.tamano > 1 AND d.orden > 1

-- 4. Líneas de listas TODAVÍA POR COMPRAR anotadas en soles: pasan a la unidad real del producto (la cantidad no cambia: revisarla).
UNION ALL
SELECT '4. Línea pendiente en soles', p.nombre || ' · lista del ' || to_char(pe.fecha_compra, 'DD/MM'),
       pi.cantidad || ' ' || pi.unidad, pi.cantidad || ' ' || COALESCE(ps.unidad, 'unidad'), 1
FROM pedido_items pi
JOIN pedidos pe ON pe.id = pi.pedido_id
JOIN clave_prod p ON p.id = pi.producto_id
LEFT JOIN propuesta_sol ps ON ps.clave = p.clave
WHERE pi.estado = 'pendiente' AND lower(trim(pi.unidad)) IN ('sol', 'soles', 's/', 's/.')

-- 5. Compras ya hechas «en soles»: NO se tocan (no se sabe cuánto se compró). Solo para que lo sepas.
UNION ALL
SELECT '5. Compra vieja en soles (se queda igual)', 'compra_items', unidad, unidad, count(*)
FROM compra_items WHERE lower(trim(unidad)) IN ('sol', 'soles', 's/', 's/.') GROUP BY unidad
UNION ALL
SELECT '5. Compra vieja en soles (se queda igual)', 'pedido_items (ya comprados / no había)', unidad, unidad, count(*)
FROM pedido_items WHERE estado <> 'pendiente' AND lower(trim(unidad)) IN ('sol', 'soles', 's/', 's/.') GROUP BY unidad

-- 6. Unidades que no están en ninguna regla: se quedan igual y hay que decidirlas.
UNION ALL
SELECT '6. Sin regla (decidir)', tabla, unidad, '¿?', n
FROM mapeo WHERE NOT conocida

ORDER BY 1, 2, 3;
