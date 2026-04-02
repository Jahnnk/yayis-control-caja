import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Sede } from '@/types';

export function useSedes() {
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSedes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sedes')
      .select('*')
      .order('nombre');

    if (error) console.error('Error fetching sedes:', error);
    else setSedes((data ?? []) as Sede[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSedes();
  }, [fetchSedes]);

  const createSede = useCallback(async (nombre: string) => {
    const { error } = await supabase.from('sedes').insert({ nombre: nombre.trim() });
    if (error) return { error: error.message };
    await fetchSedes();
    return { error: null };
  }, [fetchSedes]);

  const updateSede = useCallback(async (id: string, updates: { nombre?: string; activa?: boolean }) => {
    const { error } = await supabase.from('sedes').update(updates).eq('id', id);
    if (error) return { error: error.message };
    await fetchSedes();
    return { error: null };
  }, [fetchSedes]);

  return { sedes, loading, fetchSedes, createSede, updateSede };
}
