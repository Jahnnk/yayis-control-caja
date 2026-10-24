-- =============================================================
-- Motos de Compras (21-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase, ANTES de publicar el código. Es seguro volver a ejecutarlo.
--
-- Compras puede usar varias motos (la suya, una prestada), unas marcan km y otras millas.
-- Cada viaje y cada carga de gasolina dice en qué moto fue: la app convierte las millas sola
-- y compara el tablero solo con lo último anotado EN ESA MOTO.
-- Los km guardados siguen siendo km: no cambia ningún número ya registrado.
-- =============================================================

-- 1. MOTOS ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS motos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles(id),
  nombre TEXT NOT NULL CHECK (trim(nombre) <> ''),
  unidad TEXT NOT NULL CHECK (unidad IN ('km', 'millas')),
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_motos_conductor ON motos (conductor);
ALTER TABLE motos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "motos_select" ON motos;
CREATE POLICY "motos_select" ON motos
  FOR SELECT USING (get_user_rol()::TEXT = 'owner' OR conductor = auth.uid());
DROP POLICY IF EXISTS "motos_insert" ON motos;
CREATE POLICY "motos_insert" ON motos
  FOR INSERT WITH CHECK (conductor = auth.uid() AND get_user_rol()::TEXT IN ('compras', 'owner'));
DROP POLICY IF EXISTS "motos_update" ON motos;
CREATE POLICY "motos_update" ON motos
  FOR UPDATE USING (conductor = auth.uid() OR get_user_rol()::TEXT = 'owner')
  WITH CHECK (conductor = auth.uid() OR get_user_rol()::TEXT = 'owner');

-- 2. En qué moto fue cada viaje y cada carga --------------------------------
ALTER TABLE viajes ADD COLUMN IF NOT EXISTS moto_id UUID REFERENCES motos(id);
ALTER TABLE cargas_combustible ADD COLUMN IF NOT EXISTS moto_id UUID REFERENCES motos(id);

-- 3. Las dos motos que Fabio ya usó: la suya (millas) hasta el 18-oct y la prestada (km) desde el 19-oct.
DO $$
DECLARE v_fabio UUID; v_n INT; v_suya UUID; v_prestada UUID;
BEGIN
  SELECT count(*) INTO v_n FROM profiles WHERE rol::TEXT = 'compras' AND nombre ILIKE '%fabio%';
  IF v_n <> 1 THEN RAISE EXCEPTION 'Esperaba 1 usuario de Compras llamado Fabio y hay %. No cambié nada.', v_n; END IF;
  SELECT id INTO v_fabio FROM profiles WHERE rol::TEXT = 'compras' AND nombre ILIKE '%fabio%';

  SELECT id INTO v_suya FROM motos WHERE conductor = v_fabio AND nombre = 'Mi moto';
  IF v_suya IS NULL THEN
    INSERT INTO motos (conductor, nombre, unidad) VALUES (v_fabio, 'Mi moto', 'millas') RETURNING id INTO v_suya;
  END IF;
  SELECT id INTO v_prestada FROM motos WHERE conductor = v_fabio AND nombre = 'Moto prestada';
  IF v_prestada IS NULL THEN
    INSERT INTO motos (conductor, nombre, unidad) VALUES (v_fabio, 'Moto prestada', 'km') RETURNING id INTO v_prestada;
  END IF;

  UPDATE viajes SET moto_id = CASE WHEN fecha < '2026-10-19' THEN v_suya ELSE v_prestada END
   WHERE conductor = v_fabio AND moto_id IS NULL;
  UPDATE cargas_combustible SET moto_id = CASE WHEN fecha < '2026-10-19' THEN v_suya ELSE v_prestada END
   WHERE conductor = v_fabio AND moto_id IS NULL;
END $$;

-- 4. Verificación: cuántos viajes y cargas quedaron en cada moto.
SELECT m.nombre AS moto, m.unidad,
       (SELECT count(*) FROM viajes v WHERE v.moto_id = m.id) AS viajes,
       (SELECT count(*) FROM cargas_combustible c WHERE c.moto_id = m.id) AS cargas
FROM motos m ORDER BY m.created_at;
