-- =============================================================
-- Revisión semanal de Cash Control (pedido de Jahnn, 6-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase, DESPUÉS de presupuesto_caja.sql.
-- Solo agrega dos funciones de LECTURA protegidas con la clave de Cash Control: no cambia datos.
--
--   · cuentas_por_pagar_caja: facturas a crédito que todavía no paga Finanzas (con su
--     vencimiento), para la tarjeta «saldo vs. compromisos de los próximos 7–14 días».
--   · sobre_tope_caja: gastos y listas que se registraron pasando el tope del presupuesto (con su
--     motivo), para la tarjeta «gastos no previstos».
-- =============================================================

CREATE OR REPLACE FUNCTION public.cuentas_por_pagar_caja(p_token TEXT)
RETURNS TABLE (sede TEXT, proveedor TEXT, fecha DATE, vencimiento DATE, total NUMERIC) AS $$
BEGIN
  IF NOT clave_cash_control_valida(p_token) THEN
    RAISE EXCEPTION 'Clave de sincronización inválida.';
  END IF;
  RETURN QUERY
    SELECT s.nombre, COALESCE(pr.nombre, 'Proveedor'), k.fecha, k.fecha_vencimiento, k.total
    FROM compras k
    JOIN sedes s ON s.id = k.sede_id
    LEFT JOIN proveedores pr ON pr.id = k.proveedor_id
    WHERE k.condicion_pago = 'credito' AND k.estado_pago = 'por_pagar'
    ORDER BY k.fecha_vencimiento NULLS LAST;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.cuentas_por_pagar_caja(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cuentas_por_pagar_caja(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.sobre_tope_caja(p_token TEXT, p_desde DATE)
RETURNS TABLE (tipo TEXT, sede TEXT, fecha DATE, descripcion TEXT, monto NUMERIC, motivo TEXT) AS $$
BEGIN
  IF NOT clave_cash_control_valida(p_token) THEN
    RAISE EXCEPTION 'Clave de sincronización inválida.';
  END IF;
  RETURN QUERY
    SELECT 'gasto'::TEXT, s.nombre, g.fecha, g.descripcion, g.monto, g.motivo_sobre_tope
    FROM gastos g JOIN sedes s ON s.id = g.sede_id
    WHERE g.motivo_sobre_tope IS NOT NULL AND g.fecha >= p_desde
    UNION ALL
    SELECT 'lista'::TEXT, s.nombre, p.fecha_compra, 'Lista de compras'::TEXT, NULL::NUMERIC, p.motivo_sobre_tope
    FROM pedidos p JOIN sedes s ON s.id = p.sede_id
    WHERE p.motivo_sobre_tope IS NOT NULL AND p.fecha_compra >= p_desde AND p.estado <> 'cancelado'
    ORDER BY 3 DESC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.sobre_tope_caja(TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sobre_tope_caja(TEXT, DATE) TO anon, authenticated;

-- Verificación: las dos funciones existen.
SELECT proname AS funcion FROM pg_proc WHERE proname IN ('cuentas_por_pagar_caja', 'sobre_tope_caja') ORDER BY 1;
