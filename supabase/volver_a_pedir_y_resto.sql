-- =============================================================
-- «Volver a pedir» y resto de una compra parcial (decisión de Jahnn, 8-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- 1. Cuando Fabio compra MENOS de lo pedido (pidieron 6, compró 4), la línea se divide:
--    la línea original queda con lo que se compró (4) y se crea una línea nueva con lo que falta (2),
--    que queda «pendiente» (Fabio la compra otro día) o «no había» (ya no se compra).
--    Así lo que falta no se pierde. La función la usa Compras al guardar la compra
--    (Compras no puede crear líneas por su cuenta, por eso es una función con permisos controlados).
-- 2. «Volver a pedir»: el administrador puede pasar a su próxima lista un producto que no había.
--    Esta marca (repedido_at) evita pedirlo dos veces.
-- No cambia ninguna lista ni compra existente.
-- =============================================================

ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS repedido_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.dividir_linea_pedido(p_item UUID, p_comprada NUMERIC, p_resto_estado TEXT)
RETURNS UUID AS $$
DECLARE
  v_item pedido_items%ROWTYPE;
  v_nuevo UUID;
BEGIN
  SELECT * INTO v_item FROM pedido_items WHERE id = p_item FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe esa línea del pedido.'; END IF;
  -- IS NOT TRUE: sin sesión el permiso da NULL y debe rechazarse igual.
  IF (get_user_rol() = 'compras' OR puede_pedir_en_sede(sede_del_pedido(v_item.pedido_id))) IS NOT TRUE THEN
    RAISE EXCEPTION 'No tienes permiso para cambiar esta lista.';
  END IF;
  IF v_item.estado <> 'pendiente' THEN RAISE EXCEPTION 'Esa línea ya no está pendiente.'; END IF;
  IF p_resto_estado NOT IN ('pendiente', 'no_habia') THEN RAISE EXCEPTION 'Estado del resto no válido.'; END IF;
  IF p_comprada IS NULL OR p_comprada <= 0 OR p_comprada >= v_item.cantidad THEN
    RAISE EXCEPTION 'La cantidad comprada debe ser mayor a 0 y menor a lo pedido.';
  END IF;

  UPDATE pedido_items SET cantidad = p_comprada WHERE id = p_item;

  INSERT INTO pedido_items (pedido_id, producto_id, cantidad, unidad, nota, proveedor_id, urgente, estado, precio_referencia)
  VALUES (v_item.pedido_id, v_item.producto_id, v_item.cantidad - p_comprada, v_item.unidad,
          concat_ws(' · ', NULLIF(trim(v_item.nota), ''), 'Resto de lo pedido (se pidieron ' || trim(trailing '.' FROM trim(trailing '0' FROM v_item.cantidad::TEXT)) || ')'),
          v_item.proveedor_id, v_item.urgente, p_resto_estado, v_item.precio_referencia)
  RETURNING id INTO v_nuevo;
  RETURN v_nuevo;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Verificación: la columna (1) y la función (1).
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'pedido_items' AND column_name = 'repedido_at') AS columna,
  (SELECT count(*) FROM pg_proc WHERE proname = 'dividir_linea_pedido') AS funcion;
