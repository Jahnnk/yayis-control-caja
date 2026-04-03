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

  /**
   * Cerrar semana con la logica correcta del negocio:
   *
   * Ejemplo: Fondo=500, Gastos efectivo=1400, Ventas efectivo=1000
   *
   * - Luis usa sus 500 de caja + 900 de ventas para cubrir 1400 de gastos
   * - Efectivo usado de ventas = max(0, gastos - fondo) = 900
   * - Efectivo que Luis debe entregar = ventas - efectivo usado de ventas = 100
   * - Diferencia = entregado real - lo que debia entregar (>0 sobrante, <0 faltante)
   * - Reponer efectivo = siempre el fondo (500) para dejarlo completo
   * - Reponer cuentas = lo gastado en cuentas
   */
  const cerrarSemana = useCallback(async (
    arqueoId: string,
    ventasEfectivo: number,
    efectivoEntregado: number,
    fondoInicialEfectivo: number,
    gastadoEfectivo: number,
    gastadoCuentas: number,
    fondoInicialCuentas: number,
  ) => {
    if (!profile) return { error: 'No autenticado' };

    // Cuanto de las ventas uso Luis para cubrir gastos
    const efectivoUsadoDeVentas = roundTwo(Math.max(0, gastadoEfectivo - fondoInicialEfectivo));
    // Cuanto deberia entregar Luis (ventas menos lo que uso)
    const debiaEntregar = roundTwo(ventasEfectivo - efectivoUsadoDeVentas);
    // Diferencia: positivo=sobrante, negativo=faltante
    const diferencia = roundTwo(efectivoEntregado - debiaEntregar);
    // Reponer: siempre el fondo completo para la siguiente semana
    const reponerEfectivo = fondoInicialEfectivo;
    // Reponer cuentas: lo que se gasto de cuentas
    const reponerCuentas = gastadoCuentas;

    const { error } = await supabase
      .from('arqueos_semanales')
      .update({
        total_gastado_efectivo: gastadoEfectivo,
        total_gastado_cuentas: gastadoCuentas,
        ventas_efectivo_pos: ventasEfectivo,
        efectivo_entregado_luis: efectivoEntregado,
        monto_reponer_efectivo: reponerEfectivo,
        monto_reponer_cuentas: reponerCuentas,
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
