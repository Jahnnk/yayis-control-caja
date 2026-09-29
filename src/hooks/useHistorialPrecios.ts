import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { sumarDias } from '@/lib/compras';
import { getTodayLima } from '@/lib/dates';
import { historialPorProducto, type CompraDePrecio } from '@/lib/precios';

interface FilaHistorial {
  producto_id: string;
  cantidad: number;
  unidad: string;
  precio_total: number;
  compras: { fecha: string; proveedor_id: string; proveedores: { nombre: string } | null } | null;
}

/** Compras de los últimos 180 días agrupadas por producto y unidad (clave "producto|unidad"), de la más vieja a la más nueva. */
export function useHistorialPrecios() {
  const [historial, setHistorial] = useState<Map<string, CompraDePrecio[]>>(new Map());

  useEffect(() => {
    let vigente = true;
    supabase
      .from('compra_items')
      .select('producto_id, cantidad, unidad, precio_total, compras(fecha, proveedor_id, proveedores(nombre))')
      .gte('created_at', `${sumarDias(getTodayLima(), -180)}T00:00:00`)
      .order('created_at', { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) {
          console.error('Error cargando historial de precios:', error);
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
            proveedor_id: f.compras!.proveedor_id,
          }));
        setHistorial(historialPorProducto(compras));
      });
    return () => { vigente = false; };
  }, []);

  return historial;
}
