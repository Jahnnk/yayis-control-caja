-- =============================================================
-- Tipo de cada categoría de gasto: FIJO o VARIABLE (pedido de Gerencia de Finanzas, 5-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- Solo AGREGA una columna. No cambia ningún gasto ni ninguna categoría existente:
-- todas arrancan "por definir" (vacío) y Gerencia las marca en Configuración → Categorías.
-- Las mismas categorías de las 3 sedes llevan el mismo tipo (la app las cambia juntas).
-- =============================================================

ALTER TABLE categorias ADD COLUMN IF NOT EXISTS tipo_gasto TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categorias_tipo_gasto_valido') THEN
    ALTER TABLE categorias ADD CONSTRAINT categorias_tipo_gasto_valido
      CHECK (tipo_gasto IS NULL OR tipo_gasto IN ('fijo', 'variable'));
  END IF;
END $$;

-- Verificación: la lista de categorías, en cuántas sedes está cada una y su tipo.
SELECT nombre AS categoria,
       count(*) AS sedes,
       string_agg(DISTINCT COALESCE(tipo_gasto, 'por definir'), ', ') AS tipo
FROM categorias
GROUP BY nombre
ORDER BY nombre;
