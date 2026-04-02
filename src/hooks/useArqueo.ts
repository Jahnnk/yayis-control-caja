import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { ArqueoSemanal } from '@/types';
import { roundTwo } from '@/lib/utils';

export function useArqueo() {
  const { profile } = useAuth();
  const [arqueo, setArqueo] = useState<ArqueoSemanal | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchArqueo = useCallback(async (semana: number, mes: string, anio: number, sedeId?: string) => {
    const sid = sedeId ?? profile?.sede_id;
    if (!sid) return null;
    setLoading(true);

    const { data, error } = await supabase
      .from('arqueos_semanales')
      .select('*')
      .eq('sede_id', sid)
      .eq('semana', semana)
      .eq('mes', mes)
      .eq('anio', anio)
      .maybeSingle();

    if (error) console.error('Error fetching arqueo:', error);
    setArqueo(data as ArqueoSemanal | null);
    setLoading(false);
    return data as ArqueoSemanal | null;
  }, [profile]);

  const saveArqueo = useCallback(async (data: Omit<ArqueoSemanal, 'id' | 'created_at'>) => {
    // Check if exists
    const { data: existing } = await supabase
      .from('arqueos_semanales')
      .select('id')
      .eq('sede_id', data.sede_id)
      .eq('semana', data.semana)
      .eq('mes', data.mes)
      .eq('anio', data.anio)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from('arqueos_semanales')
        .update(data)
        .eq('id', existing.id);
      if (error) return { error: error.message };
    } else {
      const { error } = await supabase
        .from('arqueos_semanales')
        .insert(data);
      if (error) return { error: error.message };
    }

    return { error: null };
  }, []);

  const cerrarSemana = useCallback(async (
    arqueoId: string,
    ventas: number,
    entregado: number,
    fondoInicialEfectivo: number,
    totalGastadoEfectivo: number,
  ) => {
    if (!profile) return { error: 'No autenticado' };

    const saldoRestante = roundTwo(fondoInicialEfectivo - totalGastadoEfectivo);
    const montoReponer = roundTwo(totalGastadoEfectivo - ventas);
    const diferencia = roundTwo(entregado - saldoRestante);

    const { error } = await supabase
      .from('arqueos_semanales')
      .update({
        ventas_efectivo_pos: ventas,
        efectivo_entregado_luis: entregado,
        monto_reponer_efectivo: montoReponer,
        diferencia_caja: diferencia,
        cerrado: true,
        cerrado_por: profile.id,
        cerrado_at: new Date().toISOString(),
      })
      .eq('id', arqueoId);

    if (error) return { error: error.message };
    return { error: null };
  }, [profile]);

  const fetchArqueosMes = useCallback(async (mes: string, anio: number, sedeId?: string) => {
    const sid = sedeId ?? profile?.sede_id;
    if (!sid) return [];

    const { data } = await supabase
      .from('arqueos_semanales')
      .select('*')
      .eq('sede_id', sid)
      .eq('mes', mes)
      .eq('anio', anio)
      .order('semana', { ascending: true });

    return (data ?? []) as ArqueoSemanal[];
  }, [profile]);

  return { arqueo, loading, fetchArqueo, saveArqueo, cerrarSemana, fetchArqueosMes };
}
