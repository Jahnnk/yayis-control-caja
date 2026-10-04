-- =============================================================
-- Tope configurable para compras en efectivo SIN boleta (por sede)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- Antes el tope era S/ 50 fijo para todas las sedes. Ahora cada sede tiene el suyo
-- (Gerencia lo cambia en Configuración → Sedes). Todas arrancan en S/ 50.
-- La observación obligatoria se mantiene como regla de base de datos; el tope pasa a un control
-- que lee el valor de la sede. No cambia ni borra compras existentes.
-- =============================================================

ALTER TABLE sedes ADD COLUMN IF NOT EXISTS tope_sin_comprobante NUMERIC(10,2) NOT NULL DEFAULT 50
  CHECK (tope_sin_comprobante >= 0);

-- La regla fija de S/ 50 se reemplaza: queda solo la observación obligatoria.
ALTER TABLE compras DROP CONSTRAINT IF EXISTS compras_sin_comprobante_efectivo;
ALTER TABLE compras ADD CONSTRAINT compras_sin_comprobante_efectivo CHECK (
  NOT (tipo_comprobante = 'sin_comprobante' AND metodo_pago = 'efectivo')
  OR COALESCE(trim(observacion), '') <> ''
);

-- El tope lo lee de la sede de la compra.
CREATE OR REPLACE FUNCTION public.validar_tope_sin_comprobante()
RETURNS TRIGGER AS $$
DECLARE
  v_tope NUMERIC;
BEGIN
  IF NEW.tipo_comprobante = 'sin_comprobante' AND NEW.metodo_pago = 'efectivo' THEN
    SELECT tope_sin_comprobante INTO v_tope FROM sedes WHERE id = NEW.sede_id;
    IF NEW.total > COALESCE(v_tope, 50) THEN
      RAISE EXCEPTION 'Sin boleta en efectivo solo hasta S/ % por compra en esta sede. Para más, paga por Yape/transferencia o pide boleta.', COALESCE(v_tope, 50);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_tope_sin_comprobante ON compras;
CREATE TRIGGER trg_tope_sin_comprobante
  BEFORE INSERT OR UPDATE OF total, tipo_comprobante, metodo_pago ON compras
  FOR EACH ROW EXECUTE FUNCTION public.validar_tope_sin_comprobante();

-- Verificación: el tope de cada sede y el control activo.
SELECT 'tope ' || nombre AS pieza, 'S/ ' || tope_sin_comprobante::TEXT AS valor FROM sedes WHERE activa
UNION ALL
SELECT 'control del tope', count(*)::TEXT FROM pg_trigger WHERE tgname = 'trg_tope_sin_comprobante'
ORDER BY 1;
