-- =============================================================
-- Técnicos de emergencia (pedido de Jahnn, 21-nov-2026)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- 1. Los contactos de «Proveedores» pasan a tener un tipo: proveedor (por defecto, todos los de hoy)
--    o técnico (electricista, gasfitero, refrigeración, máquina de café…), con su oficio.
-- 2. Un técnico NO entra a compras, listas ni precios: la base lo rechaza. Sí se puede poner en
--    un gasto (por ejemplo, lo que se le pagó al electricista).
-- 3. Cash Control sigue leyendo los proveedores igual; ahora además recibe tipo y oficio al final.
-- No cambia ni borra ningún dato: todos los contactos actuales quedan como «proveedor».
-- =============================================================

-- 1. Tipo y oficio.
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'proveedor';
ALTER TABLE proveedores ADD COLUMN IF NOT EXISTS oficio TEXT;
ALTER TABLE proveedores DROP CONSTRAINT IF EXISTS proveedores_tipo_valido;
ALTER TABLE proveedores ADD CONSTRAINT proveedores_tipo_valido CHECK (tipo IN ('proveedor', 'tecnico'));

-- 2. Un técnico no se usa en compras, listas ni como proveedor habitual de un producto.
CREATE OR REPLACE FUNCTION public.proveedor_no_tecnico()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.proveedor_id IS NOT NULL AND EXISTS (SELECT 1 FROM proveedores WHERE id = NEW.proveedor_id AND tipo = 'tecnico') THEN
    RAISE EXCEPTION 'Ese contacto es un técnico: no se usa en compras, listas ni precios.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_proveedor_no_tecnico ON compras;
CREATE TRIGGER trg_proveedor_no_tecnico BEFORE INSERT OR UPDATE OF proveedor_id ON compras
  FOR EACH ROW EXECUTE FUNCTION proveedor_no_tecnico();
DROP TRIGGER IF EXISTS trg_proveedor_no_tecnico ON pedido_items;
CREATE TRIGGER trg_proveedor_no_tecnico BEFORE INSERT OR UPDATE OF proveedor_id ON pedido_items
  FOR EACH ROW EXECUTE FUNCTION proveedor_no_tecnico();
DROP TRIGGER IF EXISTS trg_proveedor_no_tecnico ON productos;
CREATE TRIGGER trg_proveedor_no_tecnico BEFORE INSERT OR UPDATE OF proveedor_id ON productos
  FOR EACH ROW EXECUTE FUNCTION proveedor_no_tecnico();

-- 3. Lectura para Cash Control: mismas columnas de siempre + tipo y oficio al final.
--    (Hay que borrarla y crearla de nuevo porque cambian las columnas que devuelve.)
DROP FUNCTION IF EXISTS public.proveedores_para_cash_control(TEXT);
CREATE FUNCTION public.proveedores_para_cash_control(p_token TEXT)
RETURNS TABLE (id UUID, nombre TEXT, telefono TEXT, direccion TEXT, condicion_pago TEXT, dias_credito INTEGER,
               notas TEXT, activo BOOLEAN, rubro TEXT, sedes TEXT[], tipo TEXT, oficio TEXT) AS $$
BEGIN
  IF NOT clave_cash_control_valida(p_token) THEN
    RAISE EXCEPTION 'Clave de sincronización inválida.';
  END IF;
  RETURN QUERY
    SELECT pr.id, pr.nombre, pr.telefono, pr.direccion, pr.condicion_pago, pr.dias_credito, pr.notas, pr.activo,
           (SELECT c.nombre FROM compras k JOIN categorias c ON c.id = k.categoria_id
             WHERE k.proveedor_id = pr.id GROUP BY c.nombre ORDER BY count(*) DESC LIMIT 1),
           COALESCE((SELECT array_agg(DISTINCT s.nombre) FROM compras k JOIN sedes s ON s.id = k.sede_id WHERE k.proveedor_id = pr.id), '{}'),
           pr.tipo, pr.oficio
    FROM proveedores pr;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.proveedores_para_cash_control(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proveedores_para_cash_control(TEXT) TO anon, authenticated;

-- Verificación: proveedores = todos los de hoy, tecnicos = 0 (todavía), funcion = 1.
SELECT
  (SELECT count(*) FROM proveedores WHERE tipo = 'proveedor') AS proveedores,
  (SELECT count(*) FROM proveedores WHERE tipo = 'tecnico') AS tecnicos,
  (SELECT count(*) FROM pg_proc WHERE proname = 'proveedores_para_cash_control') AS funcion;
