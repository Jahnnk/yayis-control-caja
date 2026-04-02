-- =============================================================
-- Yayi's Control de Caja - Migraciones Supabase
-- Ejecutar este archivo COMPLETO en el SQL Editor de Supabase
-- =============================================================

-- 1. Tipos ENUM
CREATE TYPE rol_usuario AS ENUM ('owner', 'admin', 'viewer');
CREATE TYPE metodo_pago_tipo AS ENUM ('efectivo', 'cuentas');
CREATE TYPE estado_gasto_tipo AS ENUM ('pagado', 'pendiente');

-- 2. Tabla: sedes
CREATE TABLE sedes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL UNIQUE,
  activa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabla: profiles (extiende auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL,
  rol rol_usuario NOT NULL DEFAULT 'viewer',
  sede_id UUID REFERENCES sedes(id),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tabla: categorias
CREATE TABLE categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  sede_id UUID NOT NULL REFERENCES sedes(id),
  activa BOOLEAN NOT NULL DEFAULT true,
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(nombre, sede_id)
);

-- 5. Tabla: gastos
CREATE TABLE gastos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_registro INTEGER NOT NULL,
  fecha DATE NOT NULL,
  descripcion TEXT NOT NULL,
  categoria_id UUID NOT NULL REFERENCES categorias(id),
  metodo_pago metodo_pago_tipo NOT NULL,
  monto NUMERIC(10,2) NOT NULL CHECK (monto >= 0),
  estado estado_gasto_tipo NOT NULL DEFAULT 'pagado',
  notas TEXT,
  semana INTEGER NOT NULL,
  mes TEXT NOT NULL,
  sede_id UUID NOT NULL REFERENCES sedes(id),
  registrado_por UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Tabla: configuracion_fondos
CREATE TABLE configuracion_fondos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id UUID NOT NULL REFERENCES sedes(id),
  fondo_efectivo NUMERIC(10,2) NOT NULL DEFAULT 500.00,
  fondo_cuentas NUMERIC(10,2) NOT NULL DEFAULT 500.00,
  vigente_desde DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Tabla: arqueos_semanales
CREATE TABLE arqueos_semanales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id UUID NOT NULL REFERENCES sedes(id),
  semana INTEGER NOT NULL,
  mes TEXT NOT NULL,
  anio INTEGER NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  fondo_inicial_efectivo NUMERIC(10,2) NOT NULL DEFAULT 0,
  fondo_inicial_cuentas NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_gastado_efectivo NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_gastado_cuentas NUMERIC(10,2) NOT NULL DEFAULT 0,
  ventas_efectivo_pos NUMERIC(10,2) NOT NULL DEFAULT 0,
  efectivo_entregado_luis NUMERIC(10,2) NOT NULL DEFAULT 0,
  monto_reponer_efectivo NUMERIC(10,2) NOT NULL DEFAULT 0,
  monto_reponer_cuentas NUMERIC(10,2) NOT NULL DEFAULT 0,
  diferencia_caja NUMERIC(10,2) NOT NULL DEFAULT 0,
  cerrado BOOLEAN NOT NULL DEFAULT false,
  cerrado_por UUID REFERENCES profiles(id),
  cerrado_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(sede_id, semana, anio, mes)
);

-- 8. Índices
CREATE INDEX idx_gastos_fecha ON gastos(fecha);
CREATE INDEX idx_gastos_sede ON gastos(sede_id);
CREATE INDEX idx_gastos_semana ON gastos(semana, mes, sede_id);
CREATE INDEX idx_gastos_categoria ON gastos(categoria_id);
CREATE INDEX idx_gastos_registrado_por ON gastos(registrado_por);
CREATE INDEX idx_categorias_sede ON categorias(sede_id);
CREATE INDEX idx_configuracion_fondos_sede ON configuracion_fondos(sede_id, vigente_desde);
CREATE INDEX idx_arqueos_sede_semana ON arqueos_semanales(sede_id, semana, anio);

-- 9. Función para calcular número de registro autoincremental por mes y sede
CREATE OR REPLACE FUNCTION get_next_numero_registro(p_fecha DATE, p_sede_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_mes TEXT;
  v_max INTEGER;
BEGIN
  v_mes := TO_CHAR(p_fecha, 'TMMonth YYYY');
  SELECT COALESCE(MAX(numero_registro), 0) INTO v_max
  FROM gastos
  WHERE mes = v_mes AND sede_id = p_sede_id;
  RETURN v_max + 1;
END;
$$ LANGUAGE plpgsql;

-- 10. Función para calcular semana del mes
-- Semana 1: desde el primer día del mes hasta el primer domingo
-- Semana 2+: lunes a domingo
CREATE OR REPLACE FUNCTION calcular_semana_mes(p_fecha DATE)
RETURNS INTEGER AS $$
DECLARE
  v_primer_dia DATE;
  v_dow_primer_dia INTEGER;
  v_fin_semana1 DATE;
  v_dias_desde_semana2 INTEGER;
BEGIN
  v_primer_dia := DATE_TRUNC('month', p_fecha)::DATE;
  -- dow: 0=domingo, 1=lunes ... 6=sábado
  v_dow_primer_dia := EXTRACT(DOW FROM v_primer_dia)::INTEGER;

  IF v_dow_primer_dia = 0 THEN
    -- El mes empieza en domingo: semana 1 es solo ese día
    v_fin_semana1 := v_primer_dia;
  ELSE
    -- Semana 1 termina el primer domingo
    v_fin_semana1 := v_primer_dia + (7 - v_dow_primer_dia);
  END IF;

  IF p_fecha <= v_fin_semana1 THEN
    RETURN 1;
  ELSE
    v_dias_desde_semana2 := p_fecha - v_fin_semana1 - 1;
    RETURN 2 + (v_dias_desde_semana2 / 7);
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 11. Función para obtener inicio y fin de una semana del mes
CREATE OR REPLACE FUNCTION get_semana_rango(p_anio INTEGER, p_mes INTEGER, p_semana INTEGER)
RETURNS TABLE(fecha_inicio DATE, fecha_fin DATE) AS $$
DECLARE
  v_primer_dia DATE;
  v_ultimo_dia DATE;
  v_dow_primer_dia INTEGER;
  v_fin_semana1 DATE;
  v_inicio DATE;
  v_fin DATE;
BEGIN
  v_primer_dia := MAKE_DATE(p_anio, p_mes, 1);
  v_ultimo_dia := (v_primer_dia + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
  v_dow_primer_dia := EXTRACT(DOW FROM v_primer_dia)::INTEGER;

  IF v_dow_primer_dia = 0 THEN
    v_fin_semana1 := v_primer_dia;
  ELSE
    v_fin_semana1 := v_primer_dia + (7 - v_dow_primer_dia);
  END IF;

  IF p_semana = 1 THEN
    v_inicio := v_primer_dia;
    v_fin := LEAST(v_fin_semana1, v_ultimo_dia);
  ELSE
    v_inicio := v_fin_semana1 + 1 + ((p_semana - 2) * 7);
    v_fin := LEAST(v_inicio + 6, v_ultimo_dia);
  END IF;

  RETURN QUERY SELECT v_inicio, v_fin;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 12. Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER gastos_updated_at
  BEFORE UPDATE ON gastos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 13. Trigger para crear profile al registrar usuario
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, nombre, email, rol, sede_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'rol')::rol_usuario, 'viewer'),
    (NEW.raw_user_meta_data->>'sede_id')::UUID
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================

ALTER TABLE sedes ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion_fondos ENABLE ROW LEVEL SECURITY;
ALTER TABLE arqueos_semanales ENABLE ROW LEVEL SECURITY;

-- Helper: obtener rol del usuario actual
CREATE OR REPLACE FUNCTION get_user_rol()
RETURNS rol_usuario AS $$
  SELECT rol FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: obtener sede del usuario actual
CREATE OR REPLACE FUNCTION get_user_sede_id()
RETURNS UUID AS $$
  SELECT sede_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- === SEDES ===
CREATE POLICY "sedes_select_all" ON sedes
  FOR SELECT USING (true);

CREATE POLICY "sedes_insert_owner" ON sedes
  FOR INSERT WITH CHECK (get_user_rol() = 'owner');

CREATE POLICY "sedes_update_owner" ON sedes
  FOR UPDATE USING (get_user_rol() = 'owner');

-- === PROFILES ===
CREATE POLICY "profiles_select_own_or_owner" ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR get_user_rol() = 'owner'
    OR (get_user_rol() IN ('admin', 'viewer') AND sede_id = get_user_sede_id())
  );

CREATE POLICY "profiles_insert_owner" ON profiles
  FOR INSERT WITH CHECK (get_user_rol() = 'owner');

CREATE POLICY "profiles_update_owner" ON profiles
  FOR UPDATE USING (get_user_rol() = 'owner');

-- === CATEGORIAS ===
CREATE POLICY "categorias_select" ON categorias
  FOR SELECT USING (
    get_user_rol() = 'owner'
    OR sede_id = get_user_sede_id()
  );

CREATE POLICY "categorias_insert_owner" ON categorias
  FOR INSERT WITH CHECK (get_user_rol() = 'owner');

CREATE POLICY "categorias_update_owner" ON categorias
  FOR UPDATE USING (get_user_rol() = 'owner');

-- === GASTOS ===
CREATE POLICY "gastos_select" ON gastos
  FOR SELECT USING (
    get_user_rol() = 'owner'
    OR sede_id = get_user_sede_id()
  );

CREATE POLICY "gastos_insert" ON gastos
  FOR INSERT WITH CHECK (
    get_user_rol() IN ('owner', 'admin')
    AND (get_user_rol() = 'owner' OR sede_id = get_user_sede_id())
  );

CREATE POLICY "gastos_update" ON gastos
  FOR UPDATE USING (
    get_user_rol() = 'owner'
    OR (
      get_user_rol() = 'admin'
      AND registrado_por = auth.uid()
      AND fecha = CURRENT_DATE
    )
  );

CREATE POLICY "gastos_delete_owner" ON gastos
  FOR DELETE USING (get_user_rol() = 'owner');

-- === CONFIGURACION FONDOS ===
CREATE POLICY "fondos_select" ON configuracion_fondos
  FOR SELECT USING (
    get_user_rol() = 'owner'
    OR sede_id = get_user_sede_id()
  );

CREATE POLICY "fondos_insert_owner" ON configuracion_fondos
  FOR INSERT WITH CHECK (get_user_rol() = 'owner');

CREATE POLICY "fondos_update_owner" ON configuracion_fondos
  FOR UPDATE USING (get_user_rol() = 'owner');

-- === ARQUEOS SEMANALES ===
CREATE POLICY "arqueos_select" ON arqueos_semanales
  FOR SELECT USING (
    get_user_rol() = 'owner'
    OR sede_id = get_user_sede_id()
  );

CREATE POLICY "arqueos_insert_owner" ON arqueos_semanales
  FOR INSERT WITH CHECK (get_user_rol() = 'owner');

CREATE POLICY "arqueos_update_owner" ON arqueos_semanales
  FOR UPDATE USING (get_user_rol() = 'owner');
