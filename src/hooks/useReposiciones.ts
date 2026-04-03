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

    // 1. Total deuda: suma de gastos con estado 'pendiente' por metodo
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

    // 3. Si saldo <= 0, marcar gastos pendientes como pagados
    if (deudaEf > 0 && repEf >= deudaEf) {
      await supabase
        .from('gastos')
        .update({ estado: 'pagado' })
        .eq('sede_id', sid)
        .eq('estado', 'pendiente')
        .eq('metodo_pago', 'efectivo');
    }

    if (deudaCt > 0 && repCt >= deudaCt) {
      await supabase
        .from('gastos')
        .update({ estado: 'pagado' })
        .eq('sede_id', sid)
        .eq('estado', 'pendiente')
        .eq('metodo_pago', 'cuentas');
    }

    setLoading(false);
  }, [profile]);

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

    // Recalcular saldo despues de insertar
    await fetchSaldo(profile.sede_id);
    return { error: null };
  }, [profile, fetchSaldo]);

  const deleteReposicion = useCallback(async (id: string) => {
    const { error } = await supabase.from('reposiciones').delete().eq('id', id);
    if (error) return { error: error.message };
    await fetchSaldo(profile?.sede_id ?? undefined);
    return { error: null };
  }, [profile, fetchSaldo]);

  return { reposiciones, saldo, loading, fetchSaldo, createReposicion, deleteReposicion };
}
