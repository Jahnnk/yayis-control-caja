import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { roundTwo } from '@/lib/utils';

export interface PrecioPagado {
  /** Lo que se pagó por esa línea del pedido. */
  total: number;
  cantidad: number;
  unidad: string;
}

/**
 * Lo que realmente se pagó por cada línea de los pedidos (compra_items ligados a la línea del pedido).
 * `clave` cambia cuando Compras compra algo, para volver a leerlo.
 */
export function usePreciosPagados(pedidoIds: string[], clave: string): Map<string, PrecioPagado> {
  const [precios, setPrecios] = useState<Map<string, PrecioPagado>>(new Map());
  const ids = pedidoIds.join(',');

  useEffect(() => {
    if (!ids) { setPrecios(new Map()); return; }
    let vigente = true;
    supabase
      .from('compras')
      .select('compra_items(pedido_item_id, cantidad, unidad, precio_total)')
      .in('pedido_id', ids.split(','))
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) { console.error('Error cargando precios pagados:', error); return; }
        const mapa = new Map<string, PrecioPagado>();
        for (const c of (data ?? []) as unknown as { compra_items: { pedido_item_id: string | null; cantidad: number; unidad: string; precio_total: number }[] }[]) {
          for (const i of c.compra_items) {
            if (!i.pedido_item_id) continue;
            const antes = mapa.get(i.pedido_item_id);
            mapa.set(i.pedido_item_id, {
              total: roundTwo((antes?.total ?? 0) + Number(i.precio_total)),
              cantidad: roundTwo((antes?.cantidad ?? 0) + Number(i.cantidad)),
              unidad: i.unidad,
            });
          }
        }
        setPrecios(mapa);
      });
    return () => { vigente = false; };
  }, [ids, clave]);

  return precios;
}
