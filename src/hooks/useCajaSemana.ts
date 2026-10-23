import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { armarCajaSemana, semanaDe, type CajaSemana } from '@/lib/caja-semana';

/**
 * La caja chica de la semana de una sede (la semana de `fecha`, de lunes a domingo): su fondo como tope, los gastos
 * del administrador y las compras al contado de Fabio. Reglas en lib/caja-semana.ts. `version` vuelve a calcular.
 */
export function useCajaSemana(sedeId: string | null, fecha: string, version = 0) {
  const [caja, setCaja] = useState<CajaSemana | null>(null);
  const { desde, hasta } = semanaDe(fecha);

  const calcular = useCallback(async () => {
    if (!sedeId || !fecha) { setCaja(null); return; }
    const [fondo, gastos, compras] = await Promise.all([
      supabase.from('configuracion_fondos').select('fondo_efectivo, fondo_cuentas').eq('sede_id', sedeId)
        .lte('vigente_desde', hasta).order('vigente_desde', { ascending: false }).limit(1).maybeSingle(),
      // Los gastos que nacen de una compra (origen «compras») ya están en las compras: no se suman otra vez.
      supabase.from('gastos').select('monto, origen').eq('sede_id', sedeId).gte('fecha', desde).lte('fecha', hasta),
      supabase.from('compras').select('total, condicion_pago').eq('sede_id', sedeId).gte('fecha', desde).lte('fecha', hasta),
    ]);
    if (gastos.error || compras.error) { console.error('Error cargando la caja de la semana:', gastos.error ?? compras.error); setCaja(null); return; }
    const tope = fondo.data ? Number(fondo.data.fondo_efectivo ?? 0) + Number(fondo.data.fondo_cuentas ?? 0) : null;
    const gastosAdmin = (gastos.data ?? []).filter(g => g.origen !== 'compras').reduce((t, g) => t + Number(g.monto), 0);
    const comprasContado = (compras.data ?? []).filter(c => c.condicion_pago !== 'credito').reduce((t, c) => t + Number(c.total), 0);
    setCaja(armarCajaSemana({ fecha, tope, gastosAdmin, comprasContado }));
  }, [sedeId, fecha, desde, hasta]);

  useEffect(() => { calcular(); }, [calcular, version]);
  return { caja, recargar: calcular };
}
