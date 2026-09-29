-- =============================================================
-- Fase 3 — Panel de Finanzas: pago de compras a crédito
-- Ejecutar UNA VEZ en el SQL Editor de Supabase (DESPUÉS de fase2b_compras.sql).
-- Es seguro volver a ejecutarlo: no duplica nada ni borra datos.
-- =============================================================

-- 1. N° de operación del pago de una factura a crédito (transferencia, depósito...).
ALTER TABLE compras ADD COLUMN IF NOT EXISTS referencia_pago TEXT;

-- 2. Controles de las compras (reemplaza la versión de la Fase 2B, agregando las reglas de pago):
--    · Solo Gerencia marca una compra a crédito como pagada.
--    · Una compra a crédito ya pagada solo la puede tocar Gerencia (nadie le cambia el monto después).
CREATE OR REPLACE FUNCTION public.proteger_compra()
RETURNS TRIGGER AS $$
DECLARE
  v_ent entregas%ROWTYPE;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    IF OLD.entrega_id IS NOT NULL THEN
      SELECT * INTO v_ent FROM entregas WHERE id = OLD.entrega_id;
      IF v_ent.estado <> 'abierta' AND get_user_rol() = 'compras' THEN
        RAISE EXCEPTION 'Esa entrega ya fue rendida: sus compras no se pueden cambiar.';
      END IF;
    END IF;
    IF OLD.condicion_pago = 'credito' AND OLD.estado_pago = 'pagado' AND get_user_rol() <> 'owner' THEN
      RAISE EXCEPTION 'Esa factura ya fue pagada: solo Gerencia puede modificarla.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  IF (TG_OP = 'INSERT' AND NEW.estado_pago = 'pagado' AND NEW.condicion_pago = 'credito')
     OR (TG_OP = 'UPDATE' AND NEW.estado_pago IS DISTINCT FROM OLD.estado_pago) THEN
    IF get_user_rol() <> 'owner' THEN
      RAISE EXCEPTION 'Solo Gerencia registra el pago de una factura a crédito.';
    END IF;
  END IF;

  IF NEW.entrega_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.entrega_id IS DISTINCT FROM OLD.entrega_id OR NEW.sede_id IS DISTINCT FROM OLD.sede_id) THEN
    SELECT * INTO v_ent FROM entregas WHERE id = NEW.entrega_id;
    IF NOT FOUND OR v_ent.estado <> 'abierta' THEN
      RAISE EXCEPTION 'Esa entrega ya no está abierta.';
    END IF;
    IF v_ent.sede_id <> NEW.sede_id THEN
      RAISE EXCEPTION 'La compra y la entrega de dinero deben ser de la misma sede.';
    END IF;
    IF get_user_rol() = 'compras' AND v_ent.receptor_id <> auth.uid() THEN
      RAISE EXCEPTION 'Esa entrega de dinero no es tuya.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 3. Verificación: debe mostrar la columna nueva y el control actualizado.
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name = 'compras' AND column_name = 'referencia_pago') AS columna_referencia_pago,
  (SELECT count(*) FROM pg_proc
    WHERE proname = 'proteger_compra' AND prosrc LIKE '%Solo Gerencia registra el pago%') AS control_de_pagos;
