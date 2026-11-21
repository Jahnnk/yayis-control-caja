import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { sumarDias } from '@/lib/compras';
import { getTodayLima } from '@/lib/dates';
import { lunesDe } from '@/lib/dinero-semana';
import { DIAS_MEJOR_PROVEEDOR } from '@/lib/precios';
import { resumenAhorro, type CompraDeSede, type ResumenAhorro } from '@/lib/ahorro';

interface Fila {
  producto_id: string;
  cantidad: number;
  unidad: string;
  precio_total: number;
  productos: { nombre: string } | null;
  compras: { fecha: string; sede_id: string; proveedor_id: string; proveedores: { nombre: string } | null } | null;
}

/**
 * Cuánto ahorró y cuánto pagó de más la sede en la semana y en el mes, frente al precio habitual.
 * Lee las compras de los últimos 180 días (las mismas que usa el seguimiento de precios).
 */
export function useAhorroSede(sedeId: string | null | undefined) {
  const [resumen, setResumen] = useState<ResumenAhorro | null>(null);

  useEffect(() => {
    if (!sedeId) return;
    let vigente = true;
    const hoy = getTodayLima();
    supabase
      .from('compra_items')
      .select('producto_id, cantidad, unidad, precio_total, productos(nombre), compras(fecha, sede_id, proveedor_id, proveedores(nombre))')
      .gte('created_at', `${sumarDias(hoy, -180)}T00:00:00`)
      .eq('precio_repartido', false) // un total repartido no es un precio real
      .gt('precio_total', 0)         // un recojo sin pago tampoco
      .order('created_at', { ascending: false })
      .limit(1000)
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error) {
          console.error('Error cargando el resumen de ahorro:', error);
          return;
        }
        const compras: CompraDeSede[] = ((data ?? []) as unknown as Fila[])
          .filter(f => f.compras)
          .map(f => ({
            producto_id: f.producto_id,
            nombre: f.productos?.nombre ?? 'Producto',
            unidad: f.unidad,
            cantidad: Number(f.cantidad),
            precio_total: Number(f.precio_total),
            fecha: f.compras!.fecha,
            sede_id: f.compras!.sede_id,
            proveedor: f.compras!.proveedores?.nombre ?? '—',
            proveedor_id: f.compras!.proveedor_id,
          }));
        setResumen(resumenAhorro(compras, sedeId, lunesDe(hoy), `${hoy.slice(0, 7)}-01`, sumarDias(hoy, -DIAS_MEJOR_PROVEEDOR)));
      });
    return () => { vigente = false; };
  }, [sedeId]);

  return resumen;
}
