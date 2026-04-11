import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { roundTwo } from '@/lib/utils';
import type { Reposicion, SaldoReposicion } from '@/types';

export function useReposiciones() {
  const { profile } = useAuth();
  const [reposiciones, setReposiciones] = useState<Reposicion[]>([]);
  const [saldo, setSaldo] = useState<SaldoReposicion>({
    deudaEfectivo: 0, deudaCuentas: 0,
    repuestoEfectivo: 0, repuestoCuentas: 0,
    saldoEfectivo: 0, saldoCuentas: 0,
  });
  const [loading, setLoading] = useState(false);

  const fetchSaldo = useCallback(async (sedeId?: string) => {
    const sid = sedeId ?? profile?.sede_id;
    if (!sid) return;
    setLoading(true);

    // 1. Total deuda: suma de gastos PENDIENTES por metodo
    const { data: gastosPendientes } = await supabase
      .from('gastos')
      .select('metodo_pago, monto')
      .eq('sede_id', sid)
      .eq('estado', 'pendiente');

    let deudaEf = 0, deudaCt = 0;
    for (const g of gastosPendientes ?? []) {
      if (g.metodo_pago === 'efectivo') deudaEf = roundTwo(deudaEf + Number(g.monto));
      else deudaCt = roundTwo(deudaCt + Number(g.monto));
    }

    // 2. Total repuesto: suma de reposiciones por metodo
    const { data: reposData } = await supabase
      .from('reposiciones')
      .select('*')
      .eq('sede_id', sid)
      .order('fecha', { ascending: false });

    let repEf = 0, repCt = 0;
    for (const r of reposData ?? []) {
      if (r.metodo_pago === 'efectivo') repEf = roundTwo(repEf + Number(r.monto));
      else repCt = roundTwo(repCt + Number(r.monto));
    }

    setReposiciones((reposData ?? []) as Reposicion[]);
    setSaldo({
      deudaEfectivo: deudaEf,
      deudaCuentas: deudaCt,
      repuestoEfectivo: repEf,
      repuestoCuentas: repCt,
      saldoEfectivo: roundTwo(deudaEf - repEf),
      saldoCuentas: roundTwo(deudaCt - repCt),
    });

    setLoading(false);
  }, [profile]);

  /**
   * Marca como "pagado" los gastos pendientes mas antiguos cuya suma
   * sea exactamente igual al monto de la reposicion.
   * Va sumando gastos del mas viejo al mas nuevo hasta llegar al monto exacto.
   */
  const marcarGastosPagados = useCallback(async (
    sedeId: string,
    metodoPago: 'efectivo' | 'cuentas',
    montoReposicion: number,
  ) => {
    // Obtener gastos pendientes del metodo, ordenados por fecha (mas antiguos primero)
    const { data: pendientes } = await supabase
      .from('gastos')
      .select('id, monto')
      .eq('sede_id', sedeId)
      .eq('estado', 'pendiente')
      .eq('metodo_pago', metodoPago)
      .order('fecha', { ascending: true })
      .order('created_at', { ascending: true });

    if (!pendientes || pendientes.length === 0) return;

    let acumulado = 0;
    const idsParaMarcar: string[] = [];

    for (const g of pendientes) {
      const monto = Number(g.monto);
      const nuevoAcumulado = roundTwo(acumulado + monto);

      if (nuevoAcumulado <= montoReposicion) {
        idsParaMarcar.push(g.id as string);
        acumulado = nuevoAcumulado;
      }

      // Si ya llegamos al monto exacto, dejamos de buscar
      if (acumulado === montoReposicion) break;

      // Si nos pasamos, no incluimos este gasto
      if (nuevoAcumulado > montoReposicion) continue;
    }

    // Solo marcar si la suma coincide exactamente con el monto de reposicion
    if (idsParaMarcar.length > 0 && acumulado === montoReposicion) {
      await supabase
        .from('gastos')
        .update({ estado: 'pagado' })
        .in('id', idsParaMarcar);
    }
  }, []);

  const createReposicion = useCallback(async (
    fecha: string,
    metodoPago: 'efectivo' | 'cuentas',
    monto: number,
    notas: string,
  ) => {
    if (!profile?.sede_id) return { error: 'Sin sede' };

    const { error } = await supabase.from('reposiciones').insert({
      sede_id: profile.sede_id,
      fecha,
      metodo_pago: metodoPago,
      monto,
      notas: notas.trim() || null,
      registrado_por: profile.id,
    });

    if (error) return { error: error.message };

    // Marcar gastos como pagados si la suma coincide
    await marcarGastosPagados(profile.sede_id, metodoPago, monto);

    // Recalcular saldo
    await fetchSaldo(profile.sede_id);
    return { error: null };
  }, [profile, fetchSaldo, marcarGastosPagados]);

  const deleteReposicion = useCallback(async (id: string) => {
    const { error } = await supabase.from('reposiciones').delete().eq('id', id);
    if (error) return { error: error.message };
    await fetchSaldo(profile?.sede_id ?? undefined);
    return { error: null };
  }, [profile, fetchSaldo]);

  return { reposiciones, saldo, loading, fetchSaldo, createReposicion, deleteReposicion };
}
