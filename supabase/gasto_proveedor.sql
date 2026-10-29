-- =============================================================
-- Proveedor en los gastos del administrador (29-oct-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase, ANTES de publicar el código. Es seguro volver a ejecutarlo.
--
-- Al anotar un gasto, el administrador puede elegir el proveedor (opcional). Sirve para que el Excel de
-- «Descargar lo que falta reponer» tenga una columna Proveedor también en los gastos que no vienen de Compras.
-- Solo agrega una columna vacía: no cambia ningún gasto existente.
-- =============================================================

ALTER TABLE gastos ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_gastos_proveedor ON gastos (proveedor_id);

-- Verificación: debe decir 1.
SELECT count(*) AS columna_nueva FROM information_schema.columns
WHERE table_name = 'gastos' AND column_name = 'proveedor_id';
