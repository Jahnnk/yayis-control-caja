-- =============================================================
-- Proveedores y precios reales para Yayi's Cash Control (pedido de Jahnn, 21-nov-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- Cash Control tiene una pestaña «Proveedores» que compara precios entre proveedores. Para no
-- llenarla a mano, lee de aquí los proveedores y lo que REALMENTE se pagó en cada compra.
-- Son dos funciones de SOLO LECTURA protegidas con la misma clave que ya usa el presupuesto
-- (clave_cash_control_valida). No cambian ningún dato de Control de Caja.
-- =============================================================

-- 1. Los proveedores, con el rubro que más se les compra y las sedes que les compran.
CREATE OR REPLACE FUNCTION public.proveedores_para_cash_control(p_token TEXT)
RETURNS TABLE (id UUID, nombre TEXT, telefono TEXT, direccion TEXT, condicion_pago TEXT, dias_credito INTEGER,
               notas TEXT, activo BOOLEAN, rubro TEXT, sedes TEXT[]) AS $$
BEGIN
  IF NOT clave_cash_control_valida(p_token) THEN
    RAISE EXCEPTION 'Clave de sincronización inválida.';
  END IF;
  RETURN QUERY
    SELECT pr.id, pr.nombre, pr.telefono, pr.direccion, pr.condicion_pago, pr.dias_credito, pr.notas, pr.activo,
           (SELECT c.nombre FROM compras k JOIN categorias c ON c.id = k.categoria_id
             WHERE k.proveedor_id = pr.id GROUP BY c.nombre ORDER BY count(*) DESC LIMIT 1),
           COALESCE((SELECT array_agg(DISTINCT s.nombre) FROM compras k JOIN sedes s ON s.id = k.sede_id WHERE k.proveedor_id = pr.id), '{}')
    FROM proveedores pr;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.proveedores_para_cash_control(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proveedores_para_cash_control(TEXT) TO anon, authenticated;

-- 2. Cada producto comprado desde una fecha: proveedor, cantidad y lo que se pagó.
--    Fuera: recojos sin pago (S/ 0) y líneas con el total repartido (no son el precio real del producto).
CREATE OR REPLACE FUNCTION public.compras_para_cash_control(p_token TEXT, p_desde DATE)
RETURNS TABLE (item_id UUID, fecha DATE, sede TEXT, proveedor_id UUID, producto TEXT, unidad TEXT,
               cantidad NUMERIC, precio_total NUMERIC) AS $$
BEGIN
  IF NOT clave_cash_control_valida(p_token) THEN
    RAISE EXCEPTION 'Clave de sincronización inválida.';
  END IF;
  RETURN QUERY
    SELECT ci.id, k.fecha, s.nombre, k.proveedor_id, p.nombre, ci.unidad, ci.cantidad, ci.precio_total
    FROM compra_items ci
    JOIN compras k ON k.id = ci.compra_id
    JOIN sedes s ON s.id = k.sede_id
    JOIN productos p ON p.id = ci.producto_id
    WHERE k.fecha >= p_desde
      AND ci.precio_total > 0
      AND ci.cantidad > 0
      AND NOT COALESCE(ci.precio_repartido, false)
    ORDER BY k.fecha, ci.created_at;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.compras_para_cash_control(TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compras_para_cash_control(TEXT, DATE) TO anon, authenticated;

-- Verificación: deben salir las 2 funciones, y cuántos proveedores y compras hay.
SELECT 'funciones' AS pieza, count(*)::TEXT AS valor FROM pg_proc WHERE proname IN ('proveedores_para_cash_control', 'compras_para_cash_control')
UNION ALL SELECT 'proveedores', count(*)::TEXT FROM proveedores
UNION ALL SELECT 'productos comprados (con precio real)', count(*)::TEXT FROM compra_items WHERE precio_total > 0 AND NOT COALESCE(precio_repartido, false);
