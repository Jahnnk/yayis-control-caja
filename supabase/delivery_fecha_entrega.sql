-- =============================================================
-- Deliverys: fecha propia de la entrega del efectivo y nota siempre disponible (pedido de Jahnn, 8-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- Cuando el administrador confirma el efectivo que le entregó Fabio, ahora puede indicar el DÍA en que
-- Fabio se lo entregó (por ejemplo, ayer a caja) y escribir una nota aunque el dinero cuadre.
--   · liquidaciones_delivery.fecha_entrega: el día en que Fabio entregó el efectivo (si no se indica, hoy).
--   · La fecha no puede ser futura ni anterior al delivery más reciente que se está entregando.
-- No cambia ninguna liquidación ni delivery existente (las viejas usan su fecha de registro).
-- =============================================================

ALTER TABLE liquidaciones_delivery ADD COLUMN IF NOT EXISTS fecha_entrega DATE;

-- La función ahora recibe también la fecha (opcional). Se reemplaza la versión anterior.
DROP FUNCTION IF EXISTS public.recibir_efectivo_delivery(UUID, UUID[], NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.recibir_efectivo_delivery(p_sede UUID, p_ids UUID[], p_recibido NUMERIC, p_nota TEXT, p_fecha DATE DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE
  v_esperado NUMERIC;
  v_cantidad INTEGER;
  v_personas INTEGER;
  v_fabio UUID;
  v_ultimo DATE;
  v_hoy DATE := (now() AT TIME ZONE 'America/Lima')::DATE;
  v_fecha DATE;
  v_liq UUID;
BEGIN
  -- IS NOT TRUE (y no NOT ...): sin sesión el permiso da NULL y debe rechazarse igual.
  IF puede_pedir_en_sede(p_sede) IS NOT TRUE THEN
    RAISE EXCEPTION 'No tienes permiso para recibir dinero de esta sede.';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Elige al menos un delivery.';
  END IF;
  IF p_recibido IS NULL OR p_recibido < 0 THEN
    RAISE EXCEPTION 'Indica cuánto dinero recibiste.';
  END IF;

  -- Se bloquean las filas para que dos personas no liquiden lo mismo a la vez.
  SELECT COALESCE(SUM(cobrado), 0), COUNT(*), COUNT(DISTINCT registrado_por), MIN(registrado_por::TEXT)::UUID, MAX(fecha)
    INTO v_esperado, v_cantidad, v_personas, v_fabio, v_ultimo
  FROM (
    SELECT cobrado, registrado_por, fecha FROM deliverys
    WHERE id = ANY (p_ids) AND sede_id = p_sede AND metodo_cobro = 'efectivo' AND liquidacion_id IS NULL
    FOR UPDATE
  ) d;

  IF v_cantidad <> array_length(p_ids, 1) THEN
    RAISE EXCEPTION 'Algún delivery ya no está pendiente (otra persona pudo recibirlo). Recarga la pantalla.';
  END IF;
  IF v_personas <> 1 THEN
    RAISE EXCEPTION 'Recibe el efectivo de una persona a la vez.';
  END IF;
  IF p_recibido <> v_esperado AND COALESCE(trim(p_nota), '') = '' THEN
    RAISE EXCEPTION 'El dinero no cuadra con lo cobrado: escribe una nota explicando la diferencia.';
  END IF;

  v_fecha := COALESCE(p_fecha, v_hoy);
  IF v_fecha > v_hoy THEN
    RAISE EXCEPTION 'La fecha de entrega del efectivo no puede ser futura.';
  END IF;
  IF v_fecha < v_ultimo THEN
    RAISE EXCEPTION 'Fabio no pudo entregar el efectivo antes de hacer el delivery (el más reciente es del %).', to_char(v_ultimo, 'DD/MM');
  END IF;

  INSERT INTO liquidaciones_delivery (sede_id, entregado_por, recibido_por, esperado, recibido, nota, fecha_entrega)
  VALUES (p_sede, v_fabio, auth.uid(), v_esperado, p_recibido, NULLIF(trim(p_nota), ''), v_fecha)
  RETURNING id INTO v_liq;

  UPDATE deliverys SET liquidacion_id = v_liq WHERE id = ANY (p_ids);

  RETURN jsonb_build_object('liquidacion_id', v_liq, 'esperado', v_esperado, 'recibido', p_recibido,
                            'diferencia', v_esperado - p_recibido, 'deliverys', v_cantidad, 'fecha_entrega', v_fecha);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Verificación: la columna (1) y una sola versión de la función (1).
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'liquidaciones_delivery' AND column_name = 'fecha_entrega') AS columna,
  (SELECT count(*) FROM pg_proc WHERE proname = 'recibir_efectivo_delivery') AS versiones_funcion;
