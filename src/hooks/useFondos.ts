import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { ConfiguracionFondos } from '@/types';

export function useFondos() {
  const { profile } = useAuth();
  const [fondos, setFondos] = useState<ConfiguracionFondos | null>(null);
  const [historialFondos, setHistorialFondos] = useState<ConfiguracionFondos[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFondosVigentes = useCallback(async (sedeId?: string) => {
    const sid = sedeId ?? profile?.sede_id;
    if (!sid) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('configuracion_fondos')
      .select('*')
      .eq('sede_id', sid)
      .lte('vigente_desde', new Date().toISOString().split('T')[0])
      .order('vigente_desde', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching fondos:', error);
    }
    setFondos(data as ConfiguracionFondos | null);
    setLoading(false);
  }, [profile]);

  const fetchFondosParaFecha = useCallback(async (sedeId: string, fecha: string) => {
    const { data } = await supabase
      .from('configuracion_fondos')
      .select('*')
      .eq('sede_id', sedeId)
      .lte('vigente_desde', fecha)
      .order('vigente_desde', { ascending: false })
      .limit(1)
      .single();

    return data as ConfiguracionFondos | null;
  }, []);

  const fetchHistorial = useCallback(async (sedeId?: string) => {
    const sid = sedeId ?? profile?.sede_id;
    if (!sid) return;

    const { data } = await supabase
      .from('configuracion_fondos')
      .select('*')
      .eq('sede_id', sid)
      .order('vigente_desde', { ascending: false });

    setHistorialFondos((data ?? []) as ConfiguracionFondos[]);
  }, [profile]);

  useEffect(() => {
    if (profile) fetchFondosVigentes();
  }, [profile, fetchFondosVigentes]);

  const updateFondos = useCallback(async (sedeId: string, efectivo: number, cuentas: number, vigente: string) => {
    const { error } = await supabase.from('configuracion_fondos').insert({
      sede_id: sedeId,
      fondo_efectivo: efectivo,
      fondo_cuentas: cuentas,
      vigente_desde: vigente,
    });
    if (error) return { error: error.message };
    await fetchFondosVigentes(sedeId);
    return { error: null };
  }, [fetchFondosVigentes]);

  return { fondos, historialFondos, loading, fetchFondosVigentes, fetchFondosParaFecha, fetchHistorial, updateFondos };
}
