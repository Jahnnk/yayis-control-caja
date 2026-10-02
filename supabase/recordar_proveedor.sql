-- =============================================================
-- Recordar el proveedor de cada producto
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- Cuando un administrador elige el proveedor de un producto en su lista, el sistema lo
-- recuerda (proveedor habitual del producto) y la próxima vez que se pida ese producto
-- sale ya con su proveedor. Solo se puede cambiar ESE dato: el administrador no puede
-- renombrar productos ni tocar nada más del catálogo.
-- =============================================================

-- 1. Función: guarda el proveedor habitual de un producto.
CREATE OR REPLACE FUNCTION public.recordar_proveedor_producto(p_producto UUID, p_proveedor UUID)
RETURNS VOID AS $$
BEGIN
  IF COALESCE(get_user_rol()::TEXT, '') NOT IN ('owner', 'admin', 'compras') THEN
    RAISE EXCEPTION 'No tienes permiso para esto.';
  END IF;
  UPDATE productos SET proveedor_id = p_proveedor WHERE id = p_producto;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Una sola vez: los productos que hoy NO tienen proveedor habitual toman el último
--    proveedor con el que se pidieron en alguna lista. Nunca pisa uno que ya exista.
UPDATE productos p
SET proveedor_id = x.proveedor_id
FROM (
  SELECT DISTINCT ON (producto_id) producto_id, proveedor_id
  FROM pedido_items
  WHERE proveedor_id IS NOT NULL
  ORDER BY producto_id, created_at DESC
) x
WHERE p.id = x.producto_id AND p.proveedor_id IS NULL;

-- 3. Verificación: la función existe y cuántos productos ya tienen proveedor recordado.
SELECT 'funcion recordar_proveedor_producto' AS pieza, count(*)::TEXT AS valor
FROM pg_proc WHERE proname = 'recordar_proveedor_producto'
UNION ALL
SELECT 'productos con proveedor recordado', count(*)::TEXT FROM productos WHERE proveedor_id IS NOT NULL
UNION ALL
SELECT 'productos sin proveedor recordado', count(*)::TEXT FROM productos WHERE proveedor_id IS NULL;
