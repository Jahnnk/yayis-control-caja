import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { claveProducto } from '@/lib/precios';

export interface UltimoPrecio {
  /** Precio por unidad (la misma unidad de la línea: g, kg, lata…). */
  unitario: number;
  fecha: string;
}

interface Fila {
  producto_id: string;
  cantidad: number;
  unidad: string;
  precio_total: number;
  compras: { fecha: string; proveedor_id: string } | null;
}

/**
 * Lo último que se le pagó a ESTE proveedor por cada producto (clave "producto|unidad").
 * Con eso la compra se abre con los precios ya escritos y solo se corrige lo que cambió.
 * No cuenta lo repartido de un total ni los recojos sin pago.
 */
export function useUltimosPreciosProveedor(proveedorId: string | null, productoIds: string[]) {
  const [ultimos, setUltimos] = useState<Map<string, UltimoPrecio>>(new Map());
  const ultima = useRef('');
  const ids = Array.from(new Set(productoIds)).sort().join(',');
  const clave = proveedorId && ids ? `${proveedorId}|${ids}` : '';

  useEffect(() => {
    ultima.current = clave;
    if (!clave) { setUltimos(new Map()); return; }
    supabase
      .from('compra_items')
      .select('producto_id, cantidad, unidad, precio_total, compras(fecha, proveedor_id)')
      .in('producto_id', ids.split(','))
      .eq('precio_repartido', false)
      .gt('precio_total', 0)
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (ultima.current !== clave) return;
        if (error) { console.error('Error cargando los últimos precios del proveedor:', error); return; }
        const mapa = new Map<string, UltimoPrecio>();
        // Vienen de la más nueva a la más vieja: el primero de cada producto es el último precio pagado.
        for (const f of (data ?? []) as unknown as Fila[]) {
          if (!f.compras || f.compras.proveedor_id !== proveedorId || !(Number(f.cantidad) > 0)) continue;
          const k = claveProducto(f.producto_id, f.unidad);
          if (!mapa.has(k)) mapa.set(k, { unitario: Number(f.precio_total) / Number(f.cantidad), fecha: f.compras.fecha });
        }
        setUltimos(mapa);
      });
  }, [clave, ids, proveedorId]);

  return ultimos;
}
