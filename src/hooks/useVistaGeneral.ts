import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { DeliveryDetalle } from '@/hooks/useDeliverys';
import type { CompraDetalle, Entrega, Gasto, PedidoConItems, TipoGasto } from '@/types';

export interface GastoVista extends Pick<Gasto, 'id' | 'fecha' | 'monto' | 'metodo_pago' | 'descripcion' | 'sede_id' | 'categoria_id' | 'estado'> {
  categorias: { nombre: string; tipo_gasto?: TipoGasto | null } | null;
}

export interface CompraVista extends CompraDetalle {
  sedes: { nombre: string } | null;
}

export interface PedidoVista extends PedidoConItems {
  sedes: { nombre: string } | null;
}

export interface EntregaVista extends Entrega {
  sedes: { nombre: string } | null;
  compras: { total: number }[];
}

const PAGINA = 1000;

/** Supabase entrega como máximo 1000 filas por consulta: los gastos de un mes de 3 sedes pueden pasar ese número. */
async function gastosDelRango(desde: string, hasta: string) {
  const filas: GastoVista[] = [];
  for (let desdeFila = 0; ; desdeFila += PAGINA) {
    const { data, error } = await supabase
      .from('gastos')
      .select('id, fecha, monto, metodo_pago, descripcion, sede_id, categoria_id, estado, categorias(nombre, tipo_gasto)')
      .gte('fecha', desde).lte('fecha', hasta)
      .order('fecha', { ascending: true }).order('id', { ascending: true })
      .range(desdeFila, desdeFila + PAGINA - 1);
    if (error) return { data: filas, error };
    filas.push(...((data ?? []) as unknown as GastoVista[]));
    if (!data || data.length < PAGINA) return { data: filas, error: null };
  }
}

/**
 * Todo lo que pasó en las 3 sedes entre dos fechas (vista de Gerencia):
 * gastos de caja chica, compras de Compras, listas de los administradores,
 * entregas de dinero y rendiciones, y deliverys.
 */
export function useVistaGeneral(desde: string, hasta: string) {
  const [gastos, setGastos] = useState<GastoVista[]>([]);
  const [compras, setCompras] = useState<CompraVista[]>([]);
  const [pedidos, setPedidos] = useState<PedidoVista[]>([]);
  const [entregas, setEntregas] = useState<EntregaVista[]>([]);
  const [deliverys, setDeliverys] = useState<DeliveryDetalle[]>([]);
  const [loading, setLoading] = useState(false);
  const ultima = useRef('');

  const fetchTodo = useCallback(async () => {
    const clave = `${desde}|${hasta}`;
    ultima.current = clave;
    setLoading(true);
    const inicio = `${desde}T00:00:00-05:00`;
    const fin = `${hasta}T23:59:59-05:00`;
    const [g, c, p, e, d] = await Promise.all([
      gastosDelRango(desde, hasta),
      supabase.from('compras').select('*, sedes(nombre), proveedores(nombre), compra_items(*, productos(nombre))')
        .gte('fecha', desde).lte('fecha', hasta)
        .order('fecha', { ascending: true }).order('created_at', { ascending: true }),
      // Listas del periodo y, además, las enviadas antes que todavía siguen sin comprar (atrasadas).
      supabase.from('pedidos').select('*, sedes(nombre), pedido_items(*, productos(nombre), proveedores(nombre))')
        .or(`and(fecha_compra.gte.${desde},fecha_compra.lte.${hasta}),and(estado.eq.enviado,fecha_compra.lt.${desde})`)
        .order('fecha_compra', { ascending: true }),
      // Dinero entregado en el periodo y rendiciones que se rindieron o cerraron en el periodo.
      supabase.from('entregas').select('*, sedes(nombre), compras(total)')
        .or(`and(fecha.gte.${desde},fecha.lte.${hasta}),and(rendida_at.gte.${inicio},rendida_at.lte.${fin}),and(cerrada_at.gte.${inicio},cerrada_at.lte.${fin})`)
        .order('fecha', { ascending: true }),
      supabase.from('deliverys').select('*, sedes(nombre)')
        .gte('fecha', desde).lte('fecha', hasta)
        .order('fecha', { ascending: true }),
    ]);
    if (ultima.current !== clave) return;
    for (const r of [g, c, p, e, d]) if (r.error) console.error('Error en la vista general:', r.error);
    setGastos(g.data);
    setCompras((c.data ?? []) as unknown as CompraVista[]);
    setPedidos((p.data ?? []) as unknown as PedidoVista[]);
    setEntregas((e.data ?? []) as unknown as EntregaVista[]);
    setDeliverys((d.data ?? []) as unknown as DeliveryDetalle[]);
    setLoading(false);
  }, [desde, hasta]);

  useEffect(() => { fetchTodo(); }, [fetchTodo]);

  return { gastos, compras, pedidos, entregas, deliverys, loading, fetchTodo };
}
