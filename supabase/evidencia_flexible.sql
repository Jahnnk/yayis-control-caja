-- =============================================================
-- Evidencia de compras más flexible (decisión de Gerencia, 3-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- 1) Efectivo SIN boleta (mercado): se permite hasta S/ 50 por compra y con una observación
--    obligatoria (dónde y a quién se compró). Pasado el tope, hay que pagar por Yape/transferencia o tener boleta.
-- 2) Fotos que faltan: la compra se puede guardar como "evidencia pendiente" y Compras sube la foto después.
--    Una rendición NO se puede cerrar mientras alguna compra tenga evidencia pendiente.
-- No cambia ni borra compras existentes (todas cumplen las reglas nuevas).
-- =============================================================

ALTER TABLE compras ADD COLUMN IF NOT EXISTS evidencia_pendiente BOOLEAN NOT NULL DEFAULT false;

-- Regla de evidencia: la misma de antes, salvo que una compra marcada como pendiente puede guardarse sin las fotos.
ALTER TABLE compras DROP CONSTRAINT IF EXISTS compras_evidencia_obligatoria;
ALTER TABLE compras ADD CONSTRAINT compras_evidencia_obligatoria CHECK (
  evidencia_pendiente
  OR CASE
       WHEN tipo_comprobante = 'sin_comprobante' THEN
         metodo_pago = 'efectivo'   -- en efectivo sin boleta lo regula compras_sin_comprobante_efectivo (tope + observación)
         OR (metodo_pago = 'cuentas' AND evidencia_producto_path IS NOT NULL AND evidencia_pago_path IS NOT NULL)
       ELSE
         evidencia_comprobante_path IS NOT NULL
         AND (condicion_pago = 'credito' OR metodo_pago = 'efectivo' OR evidencia_pago_path IS NOT NULL)
     END
);

-- Efectivo sin boleta: hasta S/ 50 por compra y con observación (esto rige siempre, también con evidencia pendiente).
ALTER TABLE compras DROP CONSTRAINT IF EXISTS compras_sin_comprobante_efectivo;
ALTER TABLE compras ADD CONSTRAINT compras_sin_comprobante_efectivo CHECK (
  NOT (tipo_comprobante = 'sin_comprobante' AND metodo_pago = 'efectivo')
  OR (total <= 50 AND COALESCE(trim(observacion), '') <> '')
);

-- No se cierra una rendición con compras de evidencia pendiente.
CREATE OR REPLACE FUNCTION public.no_cerrar_con_evidencia_pendiente()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'cerrada' AND OLD.estado <> 'cerrada'
     AND EXISTS (SELECT 1 FROM compras WHERE entrega_id = NEW.id AND evidencia_pendiente) THEN
    RAISE EXCEPTION 'Hay compras con evidencia pendiente: Compras debe subir las fotos que faltan antes de cerrar la rendición.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_entrega_evidencia_pendiente ON entregas;
CREATE TRIGGER trg_entrega_evidencia_pendiente
  BEFORE UPDATE ON entregas
  FOR EACH ROW EXECUTE FUNCTION public.no_cerrar_con_evidencia_pendiente();

-- Verificación: columna, 2 reglas y el control de cierre.
SELECT 'columna evidencia_pendiente' AS pieza, count(*)::TEXT AS valor FROM information_schema.columns WHERE table_name = 'compras' AND column_name = 'evidencia_pendiente'
UNION ALL
SELECT 'reglas de evidencia en compras', count(*)::TEXT FROM pg_constraint WHERE conrelid = 'compras'::regclass AND conname IN ('compras_evidencia_obligatoria', 'compras_sin_comprobante_efectivo')
UNION ALL
SELECT 'control al cerrar rendiciones', count(*)::TEXT FROM pg_trigger WHERE tgname = 'trg_entrega_evidencia_pendiente';
