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
  /** Otros gastos del administrador esta semana que NO marcó como pagados con el monto semanal (por si sí lo fueron). */
  sinMarcar: { total: number; gastos: { id: string; fecha: string; descripcion: string; monto: number }[] };
  /** Lo que Compras ya registró (compras cargadas a las entregas de esta semana). */
  registradoCompras: number;
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
  const [sinMarcar, setSinMarcar] = useState<SaldoSemanal['sinMarcar']>({ total: 0, gastos: [] });
  const [registradoCompras, setRegistradoCompras] = useState(0);

  const calcular = useCallback(async () => {
    if (!sedeId) return;
    const hoy = getTodayLima();
    const lunes = sumarDias(hoy, -((diaSemanaDe(hoy) + 6) % 7));
    const [en, ga, otros] = await Promise.all([
      supabase.from('entregas').select('id, monto, notas').eq('sede_id', sedeId).gte('fecha', lunes),
      // Lo marcado como pagado con el monto semanal: lo de esta semana y lo de días anteriores que sigue pendiente de reposición
      // (ese dinero todavía no se repuso, así que sigue siendo parte del dinero que el administrador está manejando).
      supabase.from('gastos').select('monto').eq('sede_id', sedeId).eq('con_monto_semanal', true).or(`fecha.gte.${lunes},estado.eq.pendiente`),
      // Gastos propios del administrador de esta semana que no se marcaron (los que nacen de Compras no cuentan aquí).
      supabase.from('gastos').select('id, fecha, descripcion, monto, con_monto_semanal, origen').eq('sede_id', sedeId).gte('fecha', lunes).order('fecha', { ascending: false }),
    ]);
    const entregas = (en.data ?? []).filter(e => !((e.notas as string | null) ?? '').startsWith('Saldo que continúa'));
    setEntregado(entregas.reduce((t, e) => roundTwo(t + Number(e.monto)), 0));
    setPagadoDirecto((ga.data ?? []).reduce((t, g) => roundTwo(t + Number(g.monto)), 0));
    const sin = (otros.data ?? []).filter(g => g.origen !== 'compras' && !g.con_monto_semanal)
      .map(g => ({ id: g.id as string, fecha: g.fecha as string, descripcion: g.descripcion as string, monto: Number(g.monto) }));
    setSinMarcar({ total: sin.reduce((t, g) => roundTwo(t + g.monto), 0), gastos: sin });
    // Lo que Compras ya registró contra las entregas de esta semana.
    if (entregas.length > 0) {
      const { data: compras } = await supabase.from('compras').select('total').in('entrega_id', entregas.map(e => e.id as string));
      setRegistradoCompras((compras ?? []).reduce((t, c) => roundTwo(t + Number(c.total)), 0));
    } else {
      setRegistradoCompras(0);
    }
  }, [sedeId]);

  useEffect(() => { calcular(); }, [calcular, version]);

  return { montoSemanal, entregado, pagadoDirecto, queda: roundTwo(montoSemanal - entregado - pagadoDirecto), sinMarcar, registradoCompras };
}
