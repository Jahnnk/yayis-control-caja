-- =============================================================
-- Yayi's Control de Caja - Tabla de Reposiciones
-- Ejecutar en el SQL Editor de Supabase
-- NO afecta datos existentes
-- =============================================================

-- 1. Tabla reposiciones
CREATE TABLE reposiciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sede_id UUID NOT NULL REFERENCES sedes(id),
  fecha DATE NOT NULL,
  metodo_pago metodo_pago_tipo NOT NULL,
  monto NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  notas TEXT,
  registrado_por UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Indice
CREATE INDEX idx_reposiciones_sede ON reposiciones(sede_id);

-- 3. RLS
ALTER TABLE reposiciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reposiciones_select" ON reposiciones
  FOR SELECT USING (
    get_user_rol() = 'owner'
    OR sede_id = get_user_sede_id()
  );

CREATE POLICY "reposiciones_insert_owner" ON reposiciones
  FOR INSERT WITH CHECK (get_user_rol() = 'owner');

CREATE POLICY "reposiciones_delete_owner" ON reposiciones
  FOR DELETE USING (get_user_rol() = 'owner');
