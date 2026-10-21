import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { roundTwo } from '@/lib/utils';

export interface PrecioPagado {
  /** Lo que se pagó por esa línea del pedido. */
  total: number;
  cantidad: number;
  unidad: string;
  /** El precio salió de repartir el total de la compra (no es el precio real del producto). */
  repartido: boolean;
  /** Cuándo se registró la primera compra de esta línea (para el seguimiento de la lista). */
  registradaAt: string | null;
}

/** Algo que Compras compró para la sede sin que estuviera en la lista (ej. una bolsa). */
export interface PagoFueraDeLista {
  producto: string;
  cantidad: number;
  unidad: string;
  total: number;
}

type FilaCompra = {
  created_at: string;
  pedido_id: string | null;
  compra_items: { pedido_item_id: string | null; cantidad: number; unidad: string; precio_total: number; precio_repartido: boolean; productos: { nombre: string } | null }[];
};

/**
 * Lo que realmente se pagó por cada línea de los pedidos (compra_items ligados a la línea del pedido)
 * y, por lista, lo que se compró fuera de ella en esas mismas compras: así la recepción suma lo mismo que la rendición.
 * `clave` cambia cuando Compras compra algo, para volver a leerlo.
 */
export function usePreciosPagados(pedidoIds: string[], clave: string): { porItem: Map<string, PrecioPagado>; fueraDeLista: Map<string, PagoFueraDeLista[]> } {
  const [precios, setPrecios] = useState<Map<string, PrecioPagado>>(new Map());
  const [fuera, setFuera] = useState<Map<string, PagoFueraDeLista[]>>(new Map());
  const ids = pedidoIds.join(',');

  useEffect(() => {
    if (!ids) { setPrecios(new Map()); setFuera(new Map()); return; }
    let vigente = true;
    supabase
      .from('compras')
      .select('created_at, pedido_id, compra_items(pedido_item_id, cantidad, unidad, precio_total, precio_repartido, productos(nombre))')
      .in('pedido_id', ids.split(','))
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) { console.error('Error cargando precios pagados:', error); return; }
        const mapa = new Map<string, PrecioPagado>();
        const extras = new Map<string, PagoFueraDeLista[]>();
        for (const c of (data ?? []) as unknown as FilaCompra[]) {
          for (const i of c.compra_items) {
            if (!i.pedido_item_id) {
              if (c.pedido_id) {
                const lista = extras.get(c.pedido_id) ?? [];
                lista.push({ producto: i.productos?.nombre ?? 'Otro producto', cantidad: Number(i.cantidad), unidad: i.unidad, total: Number(i.precio_total) });
                extras.set(c.pedido_id, lista);
              }
              continue;
            }
            const antes = mapa.get(i.pedido_item_id);
            mapa.set(i.pedido_item_id, {
              total: roundTwo((antes?.total ?? 0) + Number(i.precio_total)),
              cantidad: roundTwo((antes?.cantidad ?? 0) + Number(i.cantidad)),
              unidad: i.unidad,
              repartido: (antes?.repartido ?? false) || i.precio_repartido,
              registradaAt: antes?.registradaAt && antes.registradaAt < c.created_at ? antes.registradaAt : c.created_at,
            });
          }
        }
        setPrecios(mapa);
        setFuera(extras);
      });
    return () => { vigente = false; };
  }, [ids, clave]);

  return { porItem: precios, fueraDeLista: fuera };
}
