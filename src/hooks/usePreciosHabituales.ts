import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { historialPorProducto, precioHabitual, type CompraDePrecio, type PrecioHabitual } from '@/lib/precios';

interface FilaHistorial {
  producto_id: string;
  cantidad: number;
  unidad: string;
  precio_total: number;
  compras: { fecha: string; proveedores: { nombre: string } | null } | null;
}

/** Precio habitual de cada producto (clave "producto|unidad") según sus compras anteriores. */
export function usePreciosHabituales(productoIds: string[]) {
  const [habituales, setHabituales] = useState<Map<string, PrecioHabitual>>(new Map());
  const ultimaConsulta = useRef('');
  const clave = Array.from(new Set(productoIds)).sort().join(',');

  useEffect(() => {
    ultimaConsulta.current = clave;
    if (!clave) {
      setHabituales(new Map());
      return;
    }
    supabase
      .from('compra_items')
      .select('producto_id, cantidad, unidad, precio_total, compras(fecha, proveedores(nombre))')
      .in('producto_id', clave.split(','))
      .eq('precio_repartido', false) // un total repartido no es un precio real
      .gt('precio_total', 0)         // un recojo sin pago tampoco
      .order('created_at', { ascending: false })
      .limit(300)
      .then(({ data, error }) => {
        if (ultimaConsulta.current !== clave) return; // llegó tarde: ya se pidió otra lista
        if (error) {
          console.error('Error cargando precios habituales:', error);
          return;
        }
        const compras: CompraDePrecio[] = ((data ?? []) as unknown as FilaHistorial[])
          .reverse()
          .filter(f => f.compras)
          .map(f => ({
            producto_id: f.producto_id,
            unidad: f.unidad,
            cantidad: Number(f.cantidad),
            precio_total: Number(f.precio_total),
            fecha: f.compras!.fecha,
            proveedor: f.compras!.proveedores?.nombre ?? '—',
          }));
        const mapa = new Map<string, PrecioHabitual>();
        for (const [k, lista] of historialPorProducto(compras)) {
          const h = precioHabitual(lista);
          if (h) mapa.set(k, h);
        }
        setHabituales(mapa);
      });
  }, [clave]);

  return habituales;
}
