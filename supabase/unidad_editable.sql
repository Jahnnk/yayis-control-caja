-- =============================================================
-- Unidad de medida editable por los administradores
-- Ejecutar UNA VEZ en el SQL Editor de Supabase. Es seguro volver a ejecutarlo.
--
-- Cuando un administrador cambia la unidad de un producto en su lista (por ejemplo la
-- albahaca, que se vende "por 1 sol" o "por 2 soles"), el sistema la recuerda como la
-- unidad habitual del producto. Solo se puede cambiar ESE dato del catálogo.
-- No modifica datos existentes: solo crea una función.
-- =============================================================

CREATE OR REPLACE FUNCTION public.recordar_unidad_producto(p_producto UUID, p_unidad TEXT)
RETURNS VOID AS $$
DECLARE
  v_unidad TEXT := trim(p_unidad);
BEGIN
  IF COALESCE(get_user_rol()::TEXT, '') NOT IN ('owner', 'admin', 'compras') THEN
    RAISE EXCEPTION 'No tienes permiso para esto.';
  END IF;
  IF v_unidad IS NULL OR v_unidad = '' OR length(v_unidad) > 20 THEN
    RAISE EXCEPTION 'La unidad debe tener entre 1 y 20 letras.';
  END IF;
  UPDATE productos SET unidad = v_unidad WHERE id = p_producto;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Verificación: debe mostrar 1 (la función existe).
SELECT count(*) AS funcion_creada FROM pg_proc WHERE proname = 'recordar_unidad_producto';
