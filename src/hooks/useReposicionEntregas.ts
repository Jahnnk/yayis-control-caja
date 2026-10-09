import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { EstadoReposicion } from '@/lib/seguimiento-dinero';
import type { EntregaDetalle } from '@/hooks/useEntregas';

/**
 * Para cada entrega cerrada: cuántos de los gastos que nacieron de sus compras ya repuso Gerencia
 * (gasto en estado «pagado»). Es el último paso del seguimiento del dinero.
 * Compras no puede leer gastos: para ese rol se pasa `activo = false` y no se consulta nada.
 */
export function useReposicionEntregas(entregas: EntregaDetalle[], activo: boolean): Map<string, EstadoReposicion> {
  const [mapa, setMapa] = useState<Map<string, EstadoReposicion>>(new Map());
  const pares = entregas.flatMap(e => e.compras.filter(c => c.gasto_id).map(c => [e.id, c.gasto_id!] as const));
  const clave = entregas.map(e => e.id).join(',') + '|' + pares.map(p => p.join(':')).join(',');

  useEffect(() => {
    if (!activo) { setMapa(new Map()); return; }
    const sinGastos = new Map(entregas.map(e => [e.id, { gastos: 0, repuestos: 0 }]));
    if (pares.length === 0) { setMapa(sinGastos); return; }
    let vigente = true;
    supabase.from('gastos').select('id, estado').in('id', pares.map(p => p[1])).then(({ data, error }) => {
      if (!vigente) return;
      if (error) { console.error('Error leyendo reposiciones:', error); return; }
      const pagado = new Set((data ?? []).filter(g => g.estado === 'pagado').map(g => g.id as string));
      const resultado = new Map(sinGastos);
      for (const [entregaId, gastoId] of pares) {
        const r = resultado.get(entregaId)!;
        resultado.set(entregaId, { gastos: r.gastos + 1, repuestos: r.repuestos + (pagado.has(gastoId) ? 1 : 0) });
      }
      setMapa(resultado);
    });
    return () => { vigente = false; };
    // `clave` resume las entregas y sus gastos; `entregas` y `pares` cambian de identidad en cada lectura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, activo]);

  return mapa;
}
