-- =============================================================
-- «Se pagó junto con otra compra» (pedido de Fabio, 8-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- A veces Compras hace UN solo Yape/transferencia que cubre varias compras (varios puestos en una sola
-- transferencia). Hasta ahora el sistema pedía una captura por compra. Ahora una compra puede decir
-- «mi pago va incluido en esta otra compra» y no hace falta repetir la captura.
--   · compras.pago_con_compra_id → la compra cuya captura de pago incluye a esta.
--   · La compra a la que apunta debe ser de la misma sede, pagada por Yape/transferencia y tener su
--     propia captura de pago (no se encadenan).
--   · La regla de evidencia acepta este vínculo en lugar de la captura propia.
-- No cambia ninguna compra existente.
-- =============================================================

ALTER TABLE compras ADD COLUMN IF NOT EXISTS pago_con_compra_id UUID REFERENCES compras(id) ON DELETE RESTRICT;

-- Reglas del vínculo (misma sede, pagada por Yape con su propia captura, sin cadenas ni a sí misma).
CREATE OR REPLACE FUNCTION public.validar_pago_con_otra_compra()
RETURNS TRIGGER AS $$
DECLARE
  v_otra compras%ROWTYPE;
BEGIN
  IF NEW.pago_con_compra_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.pago_con_compra_id = NEW.id THEN
    RAISE EXCEPTION 'Una compra no puede estar pagada junto con ella misma.';
  END IF;
  SELECT * INTO v_otra FROM compras WHERE id = NEW.pago_con_compra_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe la compra con la que se pagó junto.'; END IF;
  IF v_otra.sede_id <> NEW.sede_id THEN RAISE EXCEPTION 'Las dos compras deben ser de la misma sede.'; END IF;
  IF v_otra.metodo_pago IS DISTINCT FROM 'cuentas' OR v_otra.evidencia_pago_path IS NULL OR v_otra.pago_con_compra_id IS NOT NULL THEN
    RAISE EXCEPTION 'La otra compra debe estar pagada por Yape/transferencia y tener su propia captura de pago.';
  END IF;
  IF NEW.metodo_pago IS DISTINCT FROM 'cuentas' THEN
    RAISE EXCEPTION 'Solo una compra pagada por Yape/transferencia puede pagarse junto con otra.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_validar_pago_con_otra_compra ON compras;
CREATE TRIGGER trg_validar_pago_con_otra_compra BEFORE INSERT OR UPDATE OF pago_con_compra_id ON compras
  FOR EACH ROW EXECUTE FUNCTION validar_pago_con_otra_compra();

-- La regla de evidencia acepta el vínculo en lugar de la captura propia.
ALTER TABLE compras DROP CONSTRAINT IF EXISTS compras_evidencia_obligatoria;
ALTER TABLE compras ADD CONSTRAINT compras_evidencia_obligatoria CHECK (
  evidencia_pendiente
  OR total = 0
  OR CASE
       WHEN tipo_comprobante = 'sin_comprobante' THEN
         metodo_pago = 'efectivo'
         OR (metodo_pago = 'cuentas' AND (evidencia_pago_path IS NOT NULL OR pago_con_compra_id IS NOT NULL))
       ELSE
         evidencia_comprobante_path IS NOT NULL
         AND (condicion_pago = 'credito' OR metodo_pago = 'efectivo' OR evidencia_pago_path IS NOT NULL OR pago_con_compra_id IS NOT NULL)
     END
);

-- Verificación: la columna (1) y el disparador (1).
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'compras' AND column_name = 'pago_con_compra_id') AS columna,
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_validar_pago_con_otra_compra') AS disparador;
