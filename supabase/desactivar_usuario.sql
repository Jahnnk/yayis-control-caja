-- =============================================================
-- Desactivar / activar usuarios DESDE LA APP (sin entrar a Supabase)
-- Ejecutar UNA VEZ en el SQL Editor de Supabase.
-- Es seguro volver a ejecutarlo: no duplica nada ni borra datos.
--
-- Hasta ahora el interruptor de «Usuarios» solo cambiaba una marca (profiles.activo) y la
-- persona seguía pudiendo entrar. Esta función, además de la marca:
--   · bloquea su inicio de sesión (auth.users.banned_until), y
--   · cierra las sesiones que tenga abiertas (no podrá renovarlas).
-- Solo Gerencia puede usarla, y nadie puede desactivarse a sí mismo.
-- NO borra al usuario: su historial (compras, entregas, deliverys) queda intacto.
-- =============================================================

CREATE OR REPLACE FUNCTION public.cambiar_estado_usuario(p_usuario UUID, p_activo BOOLEAN)
RETURNS VOID AS $$
BEGIN
  IF COALESCE(get_user_rol()::TEXT, '') <> 'owner' THEN
    RAISE EXCEPTION 'Solo Gerencia puede activar o desactivar usuarios.';
  END IF;
  IF p_usuario = auth.uid() THEN
    RAISE EXCEPTION 'No puedes desactivar tu propio usuario.';
  END IF;

  UPDATE profiles SET activo = p_activo WHERE id = p_usuario;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe ese usuario.';
  END IF;

  UPDATE auth.users
     SET banned_until = CASE WHEN p_activo THEN NULL ELSE 'infinity'::timestamptz END
   WHERE id = p_usuario;

  IF NOT p_activo THEN
    DELETE FROM auth.sessions WHERE user_id = p_usuario;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.cambiar_estado_usuario(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cambiar_estado_usuario(UUID, BOOLEAN) TO authenticated;
