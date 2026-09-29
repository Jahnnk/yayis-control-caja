import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CompraDetalle, EstadoItemPedido, Pedido, PedidoItem, Proveedor, Sede } from '@/types';

export interface ItemRuta extends PedidoItem {
  productos: { nombre: string; unidad: string; proveedor_id: string | null } | null;
  proveedores: Pick<Proveedor, 'id' | 'nombre' | 'telefono' | 'direccion' | 'condicion_pago' | 'dias_credito'> | null;
}

export interface PedidoRuta extends Pedido {
  sedes: Pick<Sede, 'nombre'> | null;
  pedido_items: ItemRuta[];
}

const SELECT_RUTA =
  '*, sedes(nombre), pedido_items(*, productos(nombre, unidad, proveedor_id), proveedores(id, nombre, telefono, direccion, condicion_pago, dias_credito))';

/**
 * Lo que Compras tiene que comprar en una fecha: las listas enviadas para ese dia,
 * las urgentes y las atrasadas (enviadas para un dia anterior y aun sin comprar),
 * mas las ya compradas ese dia para ver el avance.
 */
export function useRutaCompras(fecha: string) {
  const [pedidos, setPedidos] = useState<PedidoRuta[]>([]);
  const [borradores, setBorradores] = useState<Pick<Pedido, 'id' | 'sede_id' | 'fecha_compra'>[]>([]);
  const [compras, setCompras] = useState<CompraDetalle[]>([]);
  const [loading, setLoading] = useState(false);
  const ultimaFecha = useRef(fecha);

  const fetchRuta = useCallback(async () => {
    ultimaFecha.current = fecha;
    setLoading(true);
    const [ruta, prep] = await Promise.all([
      supabase
        .from('pedidos')
        .select(SELECT_RUTA)
        .or(`and(estado.eq.enviado,fecha_compra.lte.${fecha}),and(estado.eq.comprado,fecha_compra.eq.${fecha})`)
        .order('fecha_compra', { ascending: true }),
      supabase
        .from('pedidos')
        .select('id, sede_id, fecha_compra')
        .eq('estado', 'borrador')
        .eq('fecha_compra', fecha),
    ]);
    if (ultimaFecha.current !== fecha) return;
    if (ruta.error) console.error('Error cargando ruta:', ruta.error);
    const lista = (ruta.data ?? []) as PedidoRuta[];

    // Compras ya registradas contra estos pedidos (para no registrar dos veces lo mismo).
    let registradas: CompraDetalle[] = [];
    if (lista.length > 0) {
      const { data } = await supabase
        .from('compras')
        .select('*, proveedores(nombre), compra_items(*, productos(nombre))')
        .in('pedido_id', lista.map(p => p.id))
        .order('created_at', { ascending: true });
      registradas = (data ?? []) as CompraDetalle[];
    }
    if (ultimaFecha.current !== fecha) return;
    if (!ruta.error) setPedidos(lista);
    setCompras(registradas);
    setBorradores(prep.data ?? []);
    setLoading(false);
  }, [fecha]);

  useEffect(() => { fetchRuta(); }, [fetchRuta]);

  /** Cambia el estado de un producto y, si la lista de esa sede quedo sin pendientes, la da por comprada. */
  const marcarItem = useCallback(async (item: ItemRuta, estado: EstadoItemPedido) => {
    const { error } = await supabase.from('pedido_items').update({ estado }).eq('id', item.id);
    if (error) return { error: error.message };

    const { data: items, error: errItems } = await supabase
      .from('pedido_items')
      .select('estado')
      .eq('pedido_id', item.pedido_id);
    if (!errItems && items) {
      const todoResuelto = items.every(i => i.estado !== 'pendiente');
      await supabase
        .from('pedidos')
        .update(todoResuelto
          ? { estado: 'comprado', comprado_at: new Date().toISOString() }
          : { estado: 'enviado', comprado_at: null })
        .eq('id', item.pedido_id)
        .in('estado', ['enviado', 'comprado']);
    }
    await fetchRuta();
    return { error: null };
  }, [fetchRuta]);

  /** Asigna a quién se le compra un producto; opcionalmente lo guarda como su proveedor habitual. */
  const asignarProveedor = useCallback(async (item: ItemRuta, proveedorId: string, guardarHabitual: boolean) => {
    const { error } = await supabase.from('pedido_items').update({ proveedor_id: proveedorId }).eq('id', item.id);
    if (error) return { error: error.message };
    if (guardarHabitual) {
      const { error: errProd } = await supabase.from('productos').update({ proveedor_id: proveedorId }).eq('id', item.producto_id);
      if (errProd) return { error: `Se asignó, pero no se guardó como habitual: ${errProd.message}` };
      // Los demas pendientes del mismo producto sin proveedor toman el mismo.
      await supabase
        .from('pedido_items')
        .update({ proveedor_id: proveedorId })
        .eq('producto_id', item.producto_id)
        .eq('estado', 'pendiente')
        .is('proveedor_id', null);
    }
    await fetchRuta();
    return { error: null };
  }, [fetchRuta]);

  return { pedidos, borradores, compras, loading, fetchRuta, marcarItem, asignarProveedor };
}
