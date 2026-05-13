import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { TipoValorRevisado, ValorRevisadoConPerfil } from '@/types';

interface VerificarPayload {
  sedeId: string;
  tipo: TipoValorRevisado;
  gastoIds: string[]; // ordenados ascendente
  montoUnitario: number;
  descripcionPreview: string | null;
}

export function useValoresRevisados() {
  const { profile } = useAuth();
  const [valores, setValores] = useState<ValorRevisadoConPerfil[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchValoresRevisados = useCallback(async (sedeId?: string) => {
    setLoading(true);
    let query = supabase
      .from('valores_revisados')
      .select('*, profiles(nombre)')
      .order('verificado_en', { ascending: false });

    // Si el caller pasa una sede explicita, filtramos; si no, dejamos que RLS decida.
    // (RLS: owner ve todas; admin/viewer solo la suya.)
    if (sedeId) query = query.eq('sede_id', sedeId);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching valores_revisados:', error);
      setValores([]);
      setLoading(false);
      return { data: [] as ValorRevisadoConPerfil[], error: error.message };
    }
    const list = (data ?? []) as ValorRevisadoConPerfil[];
    setValores(list);
    setLoading(false);
    return { data: list, error: null };
  }, []);

  const verificarGrupo = useCallback(async (payload: VerificarPayload) => {
    if (!profile?.id) return { error: 'Sin usuario autenticado' };

    // gasto_ids debe ir ordenado ascendente para identidad estable del grupo
    const idsOrdenados = payload.gastoIds.slice().sort();

    const { error } = await supabase.from('valores_revisados').insert({
      sede_id: payload.sedeId,
      tipo: payload.tipo,
      gasto_ids: idsOrdenados,
      monto_unitario: payload.montoUnitario,
      descripcion_preview: payload.descripcionPreview,
      verificado_por: profile.id,
    });

    if (error) return { error: error.message };
    return { error: null };
  }, [profile]);

  const reabrirGrupo = useCallback(async (id: string) => {
    const { error } = await supabase.from('valores_revisados').delete().eq('id', id);
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  return { valores, loading, fetchValoresRevisados, verificarGrupo, reabrirGrupo };
}
