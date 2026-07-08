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
   * Aplica una reposicion marcando como "pagados" los gastos pendientes del
   * metodo indicado, del mas antiguo al mas nuevo (FIFO), hasta donde alcance
   * el monto de la reposicion. NO exige que el monto calce exacto: toma todos
   * los gastos completos que quepan (si uno excede el monto restante lo salta y
   * sigue con el siguiente). Un gasto nunca se paga a medias, asi que puede
   * quedar un pequeño resto sin aplicar cuando ningun gasto restante cabe.
   */
  const marcarGastosPagados = useCallback(async (
    sedeId: string,
    metodoPago: 'efectivo' | 'cuentas',
    montoReposicion: number,
    reposicionId: string,
  ) => {
    // Obtener gastos pendientes del metodo, ordenados por fecha (mas antiguos primero)
    const { data: pendientes, error: fetchError } = await supabase
      .from('gastos')
      .select('id, monto')
      .eq('sede_id', sedeId)
      .eq('estado', 'pendiente')
      .eq('metodo_pago', metodoPago)
      .order('fecha', { ascending: true })
      .order('created_at', { ascending: true });

    if (fetchError) return { error: fetchError.message };
    if (!pendientes || pendientes.length === 0) return { error: null };

    let acumulado = 0;
    const idsParaMarcar: string[] = [];

    for (const g of pendientes) {
      const monto = Number(g.monto);
      const nuevoAcumulado = roundTwo(acumulado + monto);

      if (nuevoAcumulado <= montoReposicion) {
        idsParaMarcar.push(g.id as string);
        acumulado = nuevoAcumulado;
      }

      // Si ya consumimos todo el monto, no tiene sentido seguir
      if (acumulado === montoReposicion) break;

      // Si este gasto no cabe en el monto restante, lo saltamos y probamos el
      // siguiente (mas nuevo) por si es mas chico y todavia entra.
    }

    // Marcar todos los gastos que cupieron, aunque la suma no calce exacto.
    if (idsParaMarcar.length > 0) {
      const { error } = await supabase
        .from('gastos')
        .update({ estado: 'pagado', reposicion_id: reposicionId })
        .in('id', idsParaMarcar);
      if (error) return { error: error.message };
    }
    return { error: null };
  }, []);

  const createReposicion = useCallback(async (
    fecha: string,
    metodoPago: 'efectivo' | 'cuentas',
    monto: number,
    notas: string,
  ) => {
    if (!profile?.sede_id) return { error: 'Sin sede' };

    const { data: nuevaReposicion, error } = await supabase
      .from('reposiciones')
      .insert({
        sede_id: profile.sede_id,
        fecha,
        metodo_pago: metodoPago,
        monto,
        notas: notas.trim() || null,
        registrado_por: profile.id,
      })
      .select('id')
      .single();

    if (error) return { error: error.message };

    // Marcar gastos como pagados si la suma coincide.
    // Si este paso falla, la reposicion YA quedo guardada: avisamos con un
    // warning (no un error) para que el usuario no la registre dos veces.
    const { error: errorMarcado } = await marcarGastosPagados(profile.sede_id, metodoPago, monto, nuevaReposicion.id);

    // Recalcular saldo
    await fetchSaldo(profile.sede_id);
    return {
      error: null,
      warning: errorMarcado
        ? `La reposicion se guardo, pero no se pudieron marcar los gastos como pagados (${errorMarcado}). Recarga la pagina e intenta de nuevo.`
        : null,
    };
  }, [profile, fetchSaldo, marcarGastosPagados]);

  const deleteReposicion = useCallback(async (id: string) => {
    // Antes de borrar la reposicion, los gastos que ella pago vuelven a
    // "pendiente". Si no, quedarian como pagados sin reposicion que los
    // respalde y el saldo con Luis se descuadra.
    const { error: revertError } = await supabase
      .from('gastos')
      .update({ estado: 'pendiente', reposicion_id: null })
      .eq('reposicion_id', id);
    if (revertError) return { error: revertError.message };

    const { error } = await supabase.from('reposiciones').delete().eq('id', id);
    if (error) return { error: error.message };
    await fetchSaldo(profile?.sede_id ?? undefined);
    return { error: null };
  }, [profile, fetchSaldo]);

  return { reposiciones, saldo, loading, fetchSaldo, createReposicion, deleteReposicion };
}
