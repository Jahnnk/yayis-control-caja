-- =============================================================
-- Estado «Entregado» por producto (pedido de Jahnn, 6-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- El administrador marca cada producto como ENTREGADO cuando ya llegó a su sede y lo verificó.
-- No cambia el estado de compra (pendiente / comprado / no había): solo agrega
--   · entregado_at  → cuándo lo marcó
--   · entregado_por → quién lo marcó
-- Reglas que hace cumplir la base (no solo la pantalla):
--   · solo el administrador de la sede (o Gerencia) puede marcarlo; Compras no
--   · solo un producto ya COMPRADO se puede marcar
--   · cuando todos los productos comprados de una lista están entregados, la lista pasa sola
--     a «Recibido» (igual que «Recibido conforme» en Entregas y recepción)
--   · si se desmarca un producto de una lista ya recibida, la lista vuelve a «Comprado»
-- No toca ninguna compra, gasto ni dinero.
-- =============================================================

ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS entregado_at TIMESTAMPTZ;
ALTER TABLE pedido_items ADD COLUMN IF NOT EXISTS entregado_por UUID REFERENCES profiles(id);

-- 1. Reglas al marcar / desmarcar un producto.
CREATE OR REPLACE FUNCTION public.proteger_entrega_item()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.entregado_at IS NOT DISTINCT FROM OLD.entregado_at THEN
    -- Si Compras corrige un producto y deja de estar «comprado», ya no puede figurar como entregado.
    IF NEW.estado <> 'comprado' AND NEW.entregado_at IS NOT NULL THEN
      NEW.entregado_at := NULL;
      NEW.entregado_por := NULL;
    END IF;
    RETURN NEW;
  END IF;
  -- Sin sesión (SQL Editor) se permite; con sesión, solo administrador o Gerencia.
  IF auth.uid() IS NOT NULL AND COALESCE(get_user_rol()::TEXT, '') NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Solo el administrador de la sede puede confirmar que un producto fue entregado.';
  END IF;
  IF NEW.entregado_at IS NOT NULL THEN
    IF NEW.estado <> 'comprado' THEN
      RAISE EXCEPTION 'Solo se puede marcar como entregado un producto que ya fue comprado.';
    END IF;
    NEW.entregado_por := auth.uid();
  ELSE
    NEW.entregado_por := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_proteger_entrega_item ON pedido_items;
CREATE TRIGGER trg_proteger_entrega_item BEFORE UPDATE ON pedido_items
  FOR EACH ROW EXECUTE FUNCTION proteger_entrega_item();

-- 2. Después de marcar / desmarcar: la lista pasa a «recibido» cuando todo lo comprado llegó,
--    y vuelve a «comprado» si se desmarca algo.
CREATE OR REPLACE FUNCTION public.actualizar_pedido_por_entrega()
RETURNS TRIGGER AS $$
DECLARE
  v_estado TEXT;
  v_faltan INTEGER;
BEGIN
  IF NEW.entregado_at IS NOT DISTINCT FROM OLD.entregado_at THEN
    RETURN NEW;
  END IF;
  SELECT estado INTO v_estado FROM pedidos WHERE id = NEW.pedido_id;
  IF NEW.entregado_at IS NOT NULL THEN
    IF v_estado = 'comprado' THEN
      SELECT count(*) INTO v_faltan FROM pedido_items
        WHERE pedido_id = NEW.pedido_id AND estado = 'comprado' AND entregado_at IS NULL;
      IF v_faltan = 0 THEN
        UPDATE pedidos SET estado = 'recibido', recibido_at = now(), recibido_por = auth.uid()
          WHERE id = NEW.pedido_id AND estado = 'comprado';
      END IF;
    END IF;
  ELSIF v_estado = 'recibido' THEN
    UPDATE pedidos SET estado = 'comprado', recibido_at = NULL, recibido_por = NULL, observacion_recepcion = NULL
      WHERE id = NEW.pedido_id AND estado = 'recibido';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_actualizar_pedido_por_entrega ON pedido_items;
CREATE TRIGGER trg_actualizar_pedido_por_entrega AFTER UPDATE ON pedido_items
  FOR EACH ROW EXECUTE FUNCTION actualizar_pedido_por_entrega();

-- 3. Si una lista pasa a «comprado» y todo lo comprado ya estaba entregado, pasa directo a «recibido».
CREATE OR REPLACE FUNCTION public.pedido_comprado_ya_entregado()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'comprado' AND OLD.estado IS DISTINCT FROM 'comprado'
     AND EXISTS (SELECT 1 FROM pedido_items WHERE pedido_id = NEW.id AND estado = 'comprado')
     AND NOT EXISTS (SELECT 1 FROM pedido_items WHERE pedido_id = NEW.id AND estado = 'comprado' AND entregado_at IS NULL) THEN
    NEW.estado := 'recibido';
    NEW.recibido_at := now();
    NEW.recibido_por := (SELECT entregado_por FROM pedido_items
                          WHERE pedido_id = NEW.id AND entregado_por IS NOT NULL ORDER BY entregado_at DESC LIMIT 1);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_pedido_comprado_ya_entregado ON pedidos;
CREATE TRIGGER trg_pedido_comprado_ya_entregado BEFORE UPDATE OF estado ON pedidos
  FOR EACH ROW EXECUTE FUNCTION pedido_comprado_ya_entregado();

-- Verificación: las 2 columnas nuevas y los 3 triggers (debe salir 2 y 3).
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'pedido_items' AND column_name IN ('entregado_at', 'entregado_por')) AS columnas,
  (SELECT count(*) FROM pg_trigger
    WHERE tgname IN ('trg_proteger_entrega_item', 'trg_actualizar_pedido_por_entrega', 'trg_pedido_comprado_ya_entregado')) AS triggers;
