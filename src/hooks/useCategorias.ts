import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import type { Categoria } from '@/types';

export function useCategorias() {
  const { sedeId } = useSedeActiva();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCategorias = useCallback(async (soloActivas = true) => {
    if (!sedeId) { setCategorias([]); return; }
    setLoading(true);

    let query = supabase
      .from('categorias')
      .select('*')
      .eq('sede_id', sedeId)
      .order('orden', { ascending: true });

    if (soloActivas) {
      query = query.eq('activa', true);
    }

    const { data, error } = await query;
    if (error) console.error('Error fetching categorias:', error);
    else setCategorias((data ?? []) as Categoria[]);
    setLoading(false);
  }, [sedeId]);

  useEffect(() => {
    fetchCategorias();
  }, [fetchCategorias]);

  const createCategoria = useCallback(async (nombre: string, sedeId: string) => {
    const maxOrden = categorias.reduce((max, c) => Math.max(max, c.orden), 0);
    const { error } = await supabase.from('categorias').insert({
      nombre: nombre.trim(),
      sede_id: sedeId,
      orden: maxOrden + 1,
    });
    if (error) return { error: error.message };
    await fetchCategorias(false);
    return { error: null };
  }, [categorias, fetchCategorias]);

  const updateCategoria = useCallback(async (id: string, updates: { nombre?: string; activa?: boolean; orden?: number }) => {
    const { error } = await supabase.from('categorias').update(updates).eq('id', id);
    if (error) return { error: error.message };
    await fetchCategorias(false);
    return { error: null };
  }, [fetchCategorias]);

  return { categorias, loading, fetchCategorias, createCategoria, updateCategoria };
}
