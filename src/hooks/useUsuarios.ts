import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile, Rol } from '@/types';

export function useUsuarios() {
  const [usuarios, setUsuarios] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUsuarios = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) console.error('Error fetching usuarios:', error);
    else setUsuarios((data ?? []) as Profile[]);
    setLoading(false);
  }, []);

  const createUsuario = useCallback(async (email: string, password: string, nombre: string, rol: Rol, sedeId: string) => {
    // Save current session before creating new user
    const { data: currentSession } = await supabase.auth.getSession();

    // Create auth user via signUp
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nombre, rol, sede_id: sedeId },
      },
    });

    if (error) return { error: error.message };
    if (!data.user) return { error: 'No se pudo crear el usuario' };

    const newUserId = data.user.id;

    // signUp may have switched our session to the new user.
    // Restore the owner session.
    if (currentSession.session) {
      await supabase.auth.setSession({
        access_token: currentSession.session.access_token,
        refresh_token: currentSession.session.refresh_token,
      });
    }

    // Check if the trigger created the profile
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', newUserId)
      .maybeSingle();

    // If trigger didn't create it, create manually
    if (!existingProfile) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: newUserId,
          nombre,
          email,
          rol,
          sede_id: sedeId,
          activo: true,
        });

      if (profileError) return { error: `Usuario creado pero error al crear perfil: ${profileError.message}` };
    }

    return { error: null, userId: newUserId };
  }, []);

  const updateUsuario = useCallback(async (id: string, updates: { nombre?: string; rol?: Rol; sede_id?: string; activo?: boolean }) => {
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', id);

    if (error) return { error: error.message };
    await fetchUsuarios();
    return { error: null };
  }, [fetchUsuarios]);

  return { usuarios, loading, fetchUsuarios, createUsuario, updateUsuario };
}
