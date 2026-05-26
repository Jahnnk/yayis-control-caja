import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { roundTwo } from '@/lib/utils';
import type { DesgloseCategoria } from '@/types';

export function useDesgloseReposicion() {
  const fetchDesgloseReposicion = useCallback(async (
    reposicionId: string,
  ): Promise<{ data: DesgloseCategoria[]; error: string | null }> => {
    const { data, error } = await supabase
      .from('gastos')
      .select('categoria_id, monto, categorias(nombre)')
      .eq('reposicion_id', reposicionId);

    if (error) return { data: [], error: error.message };
    if (!data || data.length === 0) return { data: [], error: null };

    const map = new Map<string, { nombre: string; monto: number }>();
    let total = 0;
    for (const g of data as Array<Record<string, unknown>>) {
      const catId = (g.categoria_id as string) ?? 'sin-categoria';
      const nombre = ((g.categorias as { nombre: string } | null)?.nombre) ?? 'Otros';
      const monto = Number(g.monto);
      total = roundTwo(total + monto);
      const existing = map.get(catId);
      if (existing) {
        existing.monto = roundTwo(existing.monto + monto);
      } else {
        map.set(catId, { nombre, monto });
      }
    }

    const result: DesgloseCategoria[] = Array.from(map.entries())
      .map(([categoriaId, { nombre, monto }]) => ({
        categoriaId,
        categoriaNombre: nombre,
        monto,
        porcentaje: total > 0 ? roundTwo((monto / total) * 100) : 0,
      }))
      .sort((a, b) => b.monto - a.monto);

    return { data: result, error: null };
  }, []);

  return { fetchDesgloseReposicion };
}
