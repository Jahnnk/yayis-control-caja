import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { diaSemanaDe, sumarDias } from '@/lib/compras';
import { getTodayLima } from '@/lib/dates';
import { roundTwo } from '@/lib/utils';

export interface SaldoSemanal {
  montoSemanal: number;
  /** Lo que el administrador le entregó a Fabio desde el lunes (el «saldo que continúa» no es dinero nuevo). */
  entregado: number;
  /** Lo que el administrador pagó él mismo con el monto semanal (gastos marcados). */
  pagadoDirecto: number;
  /** Lo que le queda del monto semanal. Puede ser negativo si se pasó. */
  queda: number;
}

/**
 * Saldo del monto semanal de la sede activa: monto − entregado a Compras − pagado directamente
 * por el administrador, de lunes a hoy. `version` sirve para volver a calcular tras registrar algo.
 */
export function useSaldoSemanal(version = 0): SaldoSemanal {
  const { sedeId, sedeActiva } = useSedeActiva();
  const montoSemanal = Number(sedeActiva?.monto_semanal_compras ?? 0);
  const [entregado, setEntregado] = useState(0);
  const [pagadoDirecto, setPagadoDirecto] = useState(0);

  const calcular = useCallback(async () => {
    if (!sedeId) return;
    const hoy = getTodayLima();
    const lunes = sumarDias(hoy, -((diaSemanaDe(hoy) + 6) % 7));
    const [en, ga] = await Promise.all([
      supabase.from('entregas').select('monto, notas').eq('sede_id', sedeId).gte('fecha', lunes),
      supabase.from('gastos').select('monto').eq('sede_id', sedeId).eq('con_monto_semanal', true).gte('fecha', lunes),
    ]);
    setEntregado((en.data ?? [])
      .filter(e => !((e.notas as string | null) ?? '').startsWith('Saldo que continúa'))
      .reduce((t, e) => roundTwo(t + Number(e.monto)), 0));
    setPagadoDirecto((ga.data ?? []).reduce((t, g) => roundTwo(t + Number(g.monto)), 0));
  }, [sedeId]);

  useEffect(() => { calcular(); }, [calcular, version]);

  return { montoSemanal, entregado, pagadoDirecto, queda: roundTwo(montoSemanal - entregado - pagadoDirecto) };
}
