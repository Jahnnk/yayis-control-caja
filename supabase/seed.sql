-- =============================================================
-- Yayi's Control de Caja - Seed Data
-- Ejecutar DESPUÉS de migrations.sql
-- =============================================================

-- 1. Insertar sede Fonavi
INSERT INTO sedes (id, nombre, activa)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Fonavi', true);

-- 2. Insertar categorías predeterminadas
INSERT INTO categorias (nombre, sede_id, orden) VALUES
  ('Insumos',                 'a0000000-0000-0000-0000-000000000001', 1),
  ('Deliverys',               'a0000000-0000-0000-0000-000000000001', 2),
  ('Delivery Cliente',        'a0000000-0000-0000-0000-000000000001', 3),
  ('Limpieza',                'a0000000-0000-0000-0000-000000000001', 4),
  ('Packaging',               'a0000000-0000-0000-0000-000000000001', 5),
  ('Marketing',               'a0000000-0000-0000-0000-000000000001', 6),
  ('Fletes',                  'a0000000-0000-0000-0000-000000000001', 7),
  ('Mantenimientos',          'a0000000-0000-0000-0000-000000000001', 8),
  ('Vueltos y devoluciones',  'a0000000-0000-0000-0000-000000000001', 9),
  ('Cuadre de Caja',          'a0000000-0000-0000-0000-000000000001', 10),
  ('Otros',                   'a0000000-0000-0000-0000-000000000001', 11);

-- 3. Configuración de fondos inicial
INSERT INTO configuracion_fondos (sede_id, fondo_efectivo, fondo_cuentas, vigente_desde)
VALUES ('a0000000-0000-0000-0000-000000000001', 500.00, 500.00, '2026-01-01');
