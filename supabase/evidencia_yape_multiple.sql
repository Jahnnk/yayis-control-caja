-- =============================================================
-- Compras sin boleta por Yape: varias capturas y foto del producto opcional hasta el tope
-- (pedido de Fabio, decisión de Jahnn, 7-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- 1. VARIAS capturas de pago: a veces se paga a varios puestos por Yape y cada pago es una captura.
--    La primera sigue en evidencia_pago_path; las demás van en la nueva columna evidencias_pago_extra.
-- 2. Sin boleta por Yape/transferencia: la captura del pago sigue siendo obligatoria, pero la FOTO DEL
--    PRODUCTO deja de serlo hasta el tope sin boleta de la sede. Por encima del tope la app la pide y,
--    si falta, la compra queda con «evidencia pendiente» (igual que antes).
-- 3. Esas compras (sin boleta por Yape) piden observación: dónde y a quién se compró (compras nuevas).
-- 4. Las compras sin boleta por Yape que estaban «pendientes» solo por la foto del producto y no pasan el
--    tope de su sede dejan de estar pendientes (así Fabio puede rendir).
-- No cambia montos ni fotos ya subidas.
-- =============================================================

ALTER TABLE compras ADD COLUMN IF NOT EXISTS evidencias_pago_extra TEXT[] NOT NULL DEFAULT '{}';

-- 2. Regla de evidencia: sin boleta por Yape ya no exige la foto del producto en la base.
ALTER TABLE compras DROP CONSTRAINT IF EXISTS compras_evidencia_obligatoria;
ALTER TABLE compras ADD CONSTRAINT compras_evidencia_obligatoria CHECK (
  evidencia_pendiente
  OR total = 0
  OR CASE
       WHEN tipo_comprobante = 'sin_comprobante' THEN
         metodo_pago = 'efectivo'
         OR (metodo_pago = 'cuentas' AND evidencia_pago_path IS NOT NULL)
       ELSE
         evidencia_comprobante_path IS NOT NULL
         AND (condicion_pago = 'credito' OR metodo_pago = 'efectivo' OR evidencia_pago_path IS NOT NULL)
     END
);

-- 3. Observación obligatoria al REGISTRAR una compra sin boleta por Yape (solo compras nuevas).
CREATE OR REPLACE FUNCTION public.observacion_sin_boleta_yape()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tipo_comprobante = 'sin_comprobante' AND NEW.metodo_pago = 'cuentas' AND NEW.total > 0
     AND COALESCE(trim(NEW.observacion), '') = '' THEN
    RAISE EXCEPTION 'Sin boleta por Yape/transferencia: escribe en Observación dónde y a quién le compraste.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_observacion_sin_boleta_yape ON compras;
CREATE TRIGGER trg_observacion_sin_boleta_yape BEFORE INSERT ON compras
  FOR EACH ROW EXECUTE FUNCTION observacion_sin_boleta_yape();

-- 4. Las pendientes solo por la foto del producto y dentro del tope de su sede ya no están pendientes.
UPDATE compras c SET evidencia_pendiente = false
FROM sedes s
WHERE s.id = c.sede_id
  AND c.evidencia_pendiente
  AND c.tipo_comprobante = 'sin_comprobante' AND c.metodo_pago = 'cuentas'
  AND c.evidencia_pago_path IS NOT NULL
  AND c.total <= COALESCE(s.tope_sin_comprobante, 50);

-- Verificación: columna creada (1) y compras que siguen pendientes.
SELECT
  (SELECT count(*) FROM information_schema.columns WHERE table_name = 'compras' AND column_name = 'evidencias_pago_extra') AS columna,
  (SELECT count(*) FROM compras WHERE evidencia_pendiente) AS siguen_pendientes;
