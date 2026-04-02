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
    // Create auth user via admin API (this requires service_role key in edge function)
    // For now, we create the user via signUp and then update the profile
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nombre, rol, sede_id: sedeId },
      },
    });

    if (error) return { error: error.message };
    if (!data.user) return { error: 'No se pudo crear el usuario' };

    return { error: null, userId: data.user.id };
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
