import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import type { PedidoConItems } from '@/types';

const SELECT_PEDIDO = '*, pedido_items(*, productos(nombre), proveedores(nombre))';

export interface NuevoItem {
  producto_id: string;
  cantidad: number;
  unidad: string;
  nota: string | null;
  proveedor_id: string | null;
  urgente?: boolean;
  /** Precio de referencia (S/ por kg / litro / unidad); opcional. */
  precio_referencia?: number | null;
}

function mensajeError(message: string): string {
  if (message.includes('pedidos_uno_por_dia')) return 'Ya existe una lista para ese día. Recarga la página.';
  if (message.includes('pedidos_urgente_con_motivo')) return 'Escribe el motivo del pedido urgente.';
  return message;
}

/** Pedidos de compra de la sede activa (vista del administrador y de Gerencia). */
export function usePedidos() {
  const { profile } = useAuth();
  const { sedeId } = useSedeActiva();
  const [pedidos, setPedidos] = useState<PedidoConItems[]>([]);
  const [loading, setLoading] = useState(false);
  const ultimaSede = useRef<string | null>(null);

  const fetchPedidos = useCallback(async () => {
    if (!sedeId) { setPedidos([]); return; }
    ultimaSede.current = sedeId;
    setLoading(true);
    const { data, error } = await supabase
      .from('pedidos')
      .select(SELECT_PEDIDO)
      .eq('sede_id', sedeId)
      .order('fecha_compra', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(30);
    if (ultimaSede.current !== sedeId) return;
    if (error) console.error('Error cargando pedidos:', error);
    else setPedidos((data ?? []) as PedidoConItems[]);
    setLoading(false);
  }, [sedeId]);

  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);

  const crearPedido = useCallback(async (fechaCompra: string, urgente = false, motivoUrgente: string | null = null) => {
    if (!profile || !sedeId) return { pedido: null, error: 'Sin sede' };
    const { data, error } = await supabase
      .from('pedidos')
      .insert({
        sede_id: sedeId,
        fecha_compra: fechaCompra,
        urgente,
        motivo_urgente: urgente ? motivoUrgente?.trim() || null : null,
        creado_por: profile.id,
      })
      .select(SELECT_PEDIDO)
      .single();
    if (error) return { pedido: null, error: mensajeError(error.message) };
    await fetchPedidos();
    return { pedido: data as PedidoConItems, error: null };
  }, [profile, sedeId, fetchPedidos]);

  const agregarItem = useCallback(async (pedidoId: string, item: NuevoItem) => {
    const { error } = await supabase.from('pedido_items').insert({ pedido_id: pedidoId, ...item });
    if (error) return { error: error.message };
    await fetchPedidos();
    return { error: null };
  }, [fetchPedidos]);

  const actualizarItem = useCallback(async (itemId: string, cambios: { cantidad?: number; unidad?: string; nota?: string | null; proveedor_id?: string | null; urgente?: boolean; precio_referencia?: number | null }) => {
    const { error } = await supabase.from('pedido_items').update(cambios).eq('id', itemId);
    if (error) return { error: error.message };
    await fetchPedidos();
    return { error: null };
  }, [fetchPedidos]);

  const eliminarItem = useCallback(async (itemId: string) => {
    const { error } = await supabase.from('pedido_items').delete().eq('id', itemId);
    if (error) return { error: error.message };
    await fetchPedidos();
    return { error: null };
  }, [fetchPedidos]);

  /** motivoSobreTope: por qué se envía aunque la lista pase el tope del presupuesto (le llega a Finanzas). */
  const enviarPedido = useCallback(async (pedidoId: string, motivoSobreTope?: string) => {
    const { error } = await supabase
      .from('pedidos')
      .update({
        estado: 'enviado',
        enviado_at: new Date().toISOString(),
        ...(motivoSobreTope?.trim() ? { motivo_sobre_tope: motivoSobreTope.trim() } : {}),
      })
      .eq('id', pedidoId)
      .eq('estado', 'borrador');
    if (error) return { error: error.message };
    await fetchPedidos();
    return { error: null };
  }, [fetchPedidos]);

  /** Una lista sin enviar se borra; una ya enviada queda como cancelada (Compras deja de verla). */
  const cancelarPedido = useCallback(async (pedido: PedidoConItems) => {
    if (pedido.pedido_items.some(i => i.estado !== 'pendiente')) {
      return { error: 'Compras ya empezó a comprar esta lista; no se puede cancelar.' };
    }
    const { error } = pedido.estado === 'borrador'
      ? await supabase.from('pedidos').delete().eq('id', pedido.id)
      : await supabase.from('pedidos').update({ estado: 'cancelado' }).eq('id', pedido.id);
    if (error) return { error: error.message };
    await fetchPedidos();
    return { error: null };
  }, [fetchPedidos]);

  /** El admin confirma que la mercadería llegó (conforme o con observaciones). */
  const confirmarRecepcion = useCallback(async (pedidoId: string, observacion: string | null) => {
    if (!profile) return { error: 'Sin sesión' };
    const { error } = await supabase
      .from('pedidos')
      .update({
        estado: 'recibido',
        recibido_at: new Date().toISOString(),
        recibido_por: profile.id,
        observacion_recepcion: observacion?.trim() || null,
      })
      .eq('id', pedidoId)
      .eq('estado', 'comprado');
    if (error) return { error: error.message };
    // «Recibido conforme» de toda la lista = todos sus productos comprados quedan entregados.
    await supabase.from('pedido_items')
      .update({ entregado_at: new Date().toISOString() })
      .eq('pedido_id', pedidoId).eq('estado', 'comprado').is('entregado_at', null);
    await fetchPedidos();
    return { error: null };
  }, [profile, fetchPedidos]);

  /**
   * El administrador marca (o desmarca) que un producto ya llegó a su sede y lo verificó.
   * La base hace cumplir que solo lo haga el administrador y que el producto ya esté comprado;
   * y cuando todo lo comprado de la lista está entregado, la lista pasa sola a «recibido».
   */
  const marcarEntregado = useCallback(async (itemId: string, entregado: boolean) => {
    const { data, error } = await supabase
      .from('pedido_items')
      .update({ entregado_at: entregado ? new Date().toISOString() : null })
      .eq('id', itemId)
      .eq('estado', 'comprado')
      .select('id');
    if (error) return { error: error.message };
    if (!data || data.length === 0) return { error: 'Ese producto ya no está comprado. Recarga la pantalla.' };
    await fetchPedidos();
    return { error: null };
  }, [fetchPedidos]);

  return { pedidos, loading, fetchPedidos, crearPedido, agregarItem, actualizarItem, eliminarItem, enviarPedido, cancelarPedido, confirmarRecepcion, marcarEntregado };
}
