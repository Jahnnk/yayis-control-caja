-- =============================================================
-- Unidades y productos únicos — PASO 1: SOLO MIRAR (pedido de Jahnn, 21-nov-2026)
-- Pegar en el SQL Editor de Supabase y pulsar «Run». NO cambia nada: solo muestra
-- la lista de cambios que hará el PASO 2 (unidades_2_aplicar.sql).
--
-- Sale UNA tabla con estas columnas:
--   que      → tipo de cambio (unidad, producto que deja los soles, fusión, línea pendiente, sin regla)
--   donde    → tabla o producto
--   antes    → cómo está hoy
--   despues  → cómo quedará
--   lineas   → cuántas filas toca
-- =============================================================

WITH variantes(patron, unidad) AS (VALUES
  ('^(sol|soles|s/\.?)$', 'sol'),
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
-- Unidad de cada producto que hoy está «en soles» o mezclado (decisión de Jahnn, 21-nov-2026).
-- Hierbas y flores se compran en soles en el mercado de Cajamarca; lo demás, por cantidad.
propuesta_sol(clave, unidad) AS (VALUES
  ('albahaca', 'sol'), ('apio', 'sol'), ('perejil', 'sol'), ('culantro', 'sol'), ('poro', 'sol'),
  ('flores astromelias rosadas', 'sol'), ('flores astromelias fucsias', 'sol'),
  ('espinaca', 'kg'), ('aguaymanto con cascara', 'kg'), ('ajo molido', 'kg'), ('maracuya', 'unidad'),
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

-- 2. Productos con unidad decidida por Jahnn (en soles o por cantidad), si hoy tienen otra.
UNION ALL
SELECT '2. Unidad del producto', c.nombre, c.unidad, ps.unidad, 1
FROM clave_prod c JOIN propuesta_sol ps ON ps.clave = c.clave
WHERE c.unidad <> ps.unidad

-- 3. Productos duplicados (mismo nombre sin tildes): se quedan con el nombre con tilde; sus listas y compras pasan a él.
UNION ALL
SELECT '3. Fusión', d.nombre, d.nombre || ' (' || d.usos || ' líneas)',
       'se une a ' || k.nombre, d.usos
FROM grupos d JOIN grupos k ON k.clave = d.clave AND k.orden = 1
WHERE d.tamano > 1 AND d.orden > 1

-- 4. Líneas de listas TODAVÍA POR COMPRAR que no calzan con su producto (en soles y el producto va por cantidad,
--    o al revés): pasan a la unidad del producto. La cantidad no cambia: revisarla.
UNION ALL
SELECT '4. Línea pendiente cambia', p.nombre || ' · lista del ' || to_char(pe.fecha_compra, 'DD/MM'),
       pi.cantidad || ' ' || pi.unidad, pi.cantidad || ' ' || COALESCE(ps.unidad, p.unidad), 1
FROM pedido_items pi
JOIN pedidos pe ON pe.id = pi.pedido_id
JOIN clave_prod p ON p.id = pi.producto_id
LEFT JOIN propuesta_sol ps ON ps.clave = p.clave
WHERE pi.estado = 'pendiente'
  AND (lower(trim(pi.unidad)) IN ('sol', 'soles', 's/', 's/.')) <> (lower(trim(COALESCE(ps.unidad, p.unidad))) IN ('sol', 'soles', 's/', 's/.'))

-- 5. Compras ya hechas «en soles» de productos que ahora van por cantidad (limón, zanahoria…): NO se tocan.
UNION ALL
SELECT '5. Compra vieja en soles (se queda igual)', p.nombre, ci.unidad, ci.unidad, count(*)
FROM compra_items ci JOIN clave_prod p ON p.id = ci.producto_id LEFT JOIN propuesta_sol ps ON ps.clave = p.clave
WHERE lower(trim(ci.unidad)) IN ('sol', 'soles', 's/', 's/.') AND COALESCE(ps.unidad, p.unidad) NOT IN ('sol', 'soles')
GROUP BY p.nombre, ci.unidad

-- 6. Unidades que no están en ninguna regla: se quedan igual y hay que decidirlas.
UNION ALL
SELECT '6. Sin regla (decidir)', tabla, unidad, '¿?', n
FROM mapeo WHERE NOT conocida

ORDER BY 1, 2, 3;
