-- =============================================================
-- Checklist de recepción por producto (pedido de Jahnn, 8-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- El administrador revisa cada producto que le llega y marca:
--   conforme · incompleto (cuánto llegó) · no llegó · llegó mal   (los problemas piden una nota)
-- «Entregado» (entregado_at) pasa a significar «el administrador ya revisó este producto» y recepcion_estado
-- dice cómo salió la revisión. Lo ya marcado como entregado antes queda como «conforme».
-- Reglas que hace cumplir la base:
--   · solo el administrador de la sede (o Gerencia) registra la recepción; Compras no
--   · un problema (incompleto / no llegó / llegó mal) exige una nota
--   · «incompleto» exige cuánto llegó, y debe ser menos de lo comprado
--   · si se deshace la revisión, se borra el resultado
-- La lista sigue pasando sola a «recibido» cuando todos los productos comprados están revisados.
-- No cambia ninguna compra ni dinero.
-- =============================================================

ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS recepcion_estado TEXT;
ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS cantidad_recibida NUMERIC(10,2);
ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS recepcion_nota TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pedido_items_recepcion_valida') THEN
    ALTER TABLE pedido_items ADD CONSTRAINT pedido_items_recepcion_valida
      CHECK (recepcion_estado IS NULL OR recepcion_estado IN ('conforme', 'incompleto', 'no_llego', 'llego_mal'));
  END IF;
END $$;

-- Lo que ya se había marcado como entregado queda como «conforme».
UPDATE pedido_items SET recepcion_estado = 'conforme' WHERE entregado_at IS NOT NULL AND recepcion_estado IS NULL;

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
  IF auth.uid() IS NOT NULL AND COALESCE(get_user_rol(), '') NOT IN ('admin', 'owner') THEN
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

-- (el disparador trg_proteger_entrega_item ya existe y usa esta función)

-- Verificación: las 3 columnas nuevas (3) y cuántos productos quedaron como «conforme».
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'pedido_items' AND column_name IN ('recepcion_estado', 'cantidad_recibida', 'recepcion_nota')) AS columnas,
  (SELECT count(*) FROM pedido_items WHERE recepcion_estado = 'conforme') AS ya_conformes;
