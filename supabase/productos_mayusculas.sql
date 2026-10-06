-- =============================================================
-- Nombres de productos en MAYÚSCULAS (pedido de Jahnn, 5-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- 1. Pasa a mayúsculas el nombre de todos los productos del catálogo.
--    No se pierde ni se mezcla nada: el catálogo ya trataba "harina" y "HARINA"
--    como el mismo producto (índice productos_nombre_unico sobre lower(nombre)),
--    así que no pueden aparecer duplicados. Las listas y compras apuntan al producto
--    por su id, así que se ven con el nombre nuevo automáticamente.
-- 2. Desde ahora la base guarda siempre el nombre en mayúsculas, aunque alguien
--    lo escriba en minúsculas (la app también lo convierte mientras se escribe).
-- =============================================================

-- upper() según la configuración de la base puede no convertir tildes ni la ñ: se convierten aparte.
CREATE OR REPLACE FUNCTION public.nombre_en_mayusculas(p TEXT)
RETURNS TEXT AS $$
  SELECT translate(upper(regexp_replace(trim(p), '\s+', ' ', 'g')), 'áéíóúüñàèìòù', 'ÁÉÍÓÚÜÑÀÈÌÒÙ');
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.producto_nombre_mayusculas()
RETURNS TRIGGER AS $$
BEGIN
  NEW.nombre := nombre_en_mayusculas(NEW.nombre);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_producto_nombre_mayusculas ON productos;
CREATE TRIGGER trg_producto_nombre_mayusculas BEFORE INSERT OR UPDATE OF nombre ON productos
  FOR EACH ROW EXECUTE FUNCTION producto_nombre_mayusculas();

-- Pasa los existentes (el trigger de arriba hace el trabajo).
UPDATE productos SET nombre = nombre WHERE nombre <> nombre_en_mayusculas(nombre);

-- Verificación: "quedan_en_minuscula" debe ser 0.
SELECT count(*) AS productos,
       count(*) FILTER (WHERE nombre <> nombre_en_mayusculas(nombre)) AS quedan_en_minuscula
FROM productos;
