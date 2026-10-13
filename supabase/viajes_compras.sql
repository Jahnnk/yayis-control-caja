-- =============================================================
-- Viajes de Compras (Fase 1: medir) — kilometraje, motivo de cada viaje extra y gasolina
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- Solo CREA tablas nuevas. No toca compras, deliverys, gastos ni la caja de ninguna sede:
-- las compras y deliverys se asocian a un viaje por la HORA en que se registraron.
-- =============================================================

-- 1. VIAJES ------------------------------------------------------------
--    Cada salida de Compras en su moto: km del tablero al salir y al volver.
--    El primer viaje de compras del día es el planificado; los siguientes son «extra» y llevan motivo.
CREATE TABLE IF NOT EXISTS viajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles(id),
  fecha DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima')::date,
  tipo TEXT NOT NULL CHECK (tipo IN ('compras', 'deliverys')),
  salida_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  km_salida NUMERIC(9,1) NOT NULL CHECK (km_salida >= 0),
  regreso_at TIMESTAMPTZ,
  km_regreso NUMERIC(9,1),
  es_extra BOOLEAN NOT NULL DEFAULT false,
  motivo TEXT CHECK (motivo IN ('lista_tardia', 'no_habia', 'no_cabia', 'olvido', 'otro')),
  motivo_sede_id UUID REFERENCES sedes(id),   -- qué sede causó el viaje (lista tardía o urgente)
  motivo_detalle TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT viaje_regreso_completo CHECK ((regreso_at IS NULL) = (km_regreso IS NULL)),
  CONSTRAINT viaje_km_coherente CHECK (km_regreso IS NULL OR km_regreso >= km_salida),
  CONSTRAINT viaje_extra_con_motivo CHECK (NOT es_extra OR motivo IS NOT NULL),
  CONSTRAINT viaje_otro_explicado CHECK (motivo IS DISTINCT FROM 'otro' OR COALESCE(trim(motivo_detalle), '') <> '')
);
CREATE INDEX IF NOT EXISTS idx_viajes_fecha ON viajes (fecha, conductor);
-- Un solo viaje abierto a la vez por persona.
CREATE UNIQUE INDEX IF NOT EXISTS viajes_uno_abierto ON viajes (conductor) WHERE regreso_at IS NULL;
ALTER TABLE viajes ENABLE ROW LEVEL SECURITY;

-- Gerencia ve todo; Compras ve y registra los suyos.
DROP POLICY IF EXISTS "viajes_select" ON viajes;
CREATE POLICY "viajes_select" ON viajes
  FOR SELECT USING (get_user_rol()::TEXT = 'owner' OR conductor = auth.uid());
DROP POLICY IF EXISTS "viajes_insert" ON viajes;
CREATE POLICY "viajes_insert" ON viajes
  FOR INSERT WITH CHECK (conductor = auth.uid() AND get_user_rol()::TEXT IN ('compras', 'owner'));
DROP POLICY IF EXISTS "viajes_update" ON viajes;
CREATE POLICY "viajes_update" ON viajes
  FOR UPDATE USING (conductor = auth.uid() OR get_user_rol()::TEXT = 'owner')
  WITH CHECK (conductor = auth.uid() OR get_user_rol()::TEXT = 'owner');
DROP POLICY IF EXISTS "viajes_delete" ON viajes;
CREATE POLICY "viajes_delete" ON viajes
  FOR DELETE USING (get_user_rol()::TEXT = 'owner');

-- 2. CARGAS DE GASOLINA ---------------------------------------------------
--    Gerencia de Finanzas le da S/ 20 cada lunes; esto mide si alcanzan y cuánto cuesta cada km.
--    No es un gasto de ninguna sede.
CREATE TABLE IF NOT EXISTS cargas_combustible (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conductor UUID NOT NULL DEFAULT auth.uid() REFERENCES profiles(id),
  fecha DATE NOT NULL DEFAULT (now() AT TIME ZONE 'America/Lima')::date,
  monto NUMERIC(8,2) NOT NULL CHECK (monto > 0),
  km NUMERIC(9,1) CHECK (km >= 0),
  foto_path TEXT,
  nota TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cargas_combustible_fecha ON cargas_combustible (fecha, conductor);
ALTER TABLE cargas_combustible ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cargas_combustible_select" ON cargas_combustible;
CREATE POLICY "cargas_combustible_select" ON cargas_combustible
  FOR SELECT USING (get_user_rol()::TEXT = 'owner' OR conductor = auth.uid());
DROP POLICY IF EXISTS "cargas_combustible_insert" ON cargas_combustible;
CREATE POLICY "cargas_combustible_insert" ON cargas_combustible
  FOR INSERT WITH CHECK (conductor = auth.uid() AND get_user_rol()::TEXT IN ('compras', 'owner'));
DROP POLICY IF EXISTS "cargas_combustible_delete" ON cargas_combustible;
CREATE POLICY "cargas_combustible_delete" ON cargas_combustible
  FOR DELETE USING (get_user_rol()::TEXT = 'owner');

-- 3. Verificación: 2 tablas nuevas con seguridad activa.
SELECT c.relname AS tabla, c.relrowsecurity AS seguridad_activa
FROM pg_class c
WHERE c.relname IN ('viajes', 'cargas_combustible') AND c.relkind = 'r'
ORDER BY 1;
