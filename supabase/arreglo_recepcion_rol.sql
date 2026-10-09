-- =============================================================
-- Arreglo: «Conforme», «Problema» y «Marcar todo conforme» fallaban (9-oct-2026)
-- Error que veía el administrador: invalid input value for enum rol_usuario: ""
-- Causa: la regla que revisa quién registra la recepción comparaba el rol con un texto vacío
-- sin convertirlo a texto. Aquí se vuelve a crear la misma función, con ese único cambio (::TEXT).
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo. No cambia datos.
-- =============================================================

CREATE OR REPLACE FUNCTION public.proteger_entrega_item()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.entregado_at IS NOT DISTINCT FROM OLD.entregado_at
     AND NEW.recepcion_estado IS NOT DISTINCT FROM OLD.recepcion_estado
     AND NEW.cantidad_recibida IS NOT DISTINCT FROM OLD.cantidad_recibida
     AND NEW.recepcion_nota IS NOT DISTINCT FROM OLD.recepcion_nota THEN
    -- Si Compras corrige un producto y deja de estar «comprado», ya no puede figurar como revisado.
    IF NEW.estado <> 'comprado' AND NEW.entregado_at IS NOT NULL THEN
      NEW.entregado_at := NULL;
      NEW.entregado_por := NULL;
      NEW.recepcion_estado := NULL;
      NEW.cantidad_recibida := NULL;
      NEW.recepcion_nota := NULL;
    END IF;
    RETURN NEW;
  END IF;
  -- Sin sesión (SQL Editor) se permite; con sesión, solo administrador o Gerencia.
  IF auth.uid() IS NOT NULL AND COALESCE(get_user_rol()::TEXT, '') NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Solo el administrador de la sede puede registrar la recepción de un producto.';
  END IF;
  IF NEW.entregado_at IS NOT NULL THEN
    IF NEW.estado <> 'comprado' THEN
      RAISE EXCEPTION 'Solo se puede revisar un producto que ya fue comprado.';
    END IF;
    NEW.recepcion_estado := COALESCE(NEW.recepcion_estado, 'conforme');
    IF NEW.recepcion_estado = 'conforme' THEN
      NEW.cantidad_recibida := NULL;
    ELSE
      IF COALESCE(trim(NEW.recepcion_nota), '') = '' THEN
        RAISE EXCEPTION 'Escribe una nota explicando el problema con este producto.';
      END IF;
      IF NEW.recepcion_estado = 'incompleto' THEN
        IF NEW.cantidad_recibida IS NULL OR NEW.cantidad_recibida < 0 OR NEW.cantidad_recibida >= NEW.cantidad THEN
          RAISE EXCEPTION 'Indica cuánto llegó (menos de lo comprado).';
        END IF;
      ELSIF NEW.recepcion_estado = 'no_llego' THEN
        NEW.cantidad_recibida := 0;
      END IF;
    END IF;
    NEW.entregado_por := auth.uid();
  ELSE
    NEW.entregado_por := NULL;
    NEW.recepcion_estado := NULL;
    NEW.cantidad_recibida := NULL;
    NEW.recepcion_nota := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Verificación: debe decir «arreglado».
SELECT CASE WHEN pg_get_functiondef('public.proteger_entrega_item'::regproc) LIKE '%get_user_rol()::TEXT%'
            THEN 'arreglado' ELSE 'todavía no' END AS estado;
