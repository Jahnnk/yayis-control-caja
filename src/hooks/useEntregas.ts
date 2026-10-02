import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { borrarEvidencias } from '@/lib/evidencias';
import { roundTwo } from '@/lib/utils';
import type { CompraDetalle, Entrega, MetodoPago } from '@/types';

export interface EntregaDetalle extends Entrega {
  sedes: { nombre: string } | null;
  compras: CompraDetalle[];
}

const SELECT_ENTREGA =
  '*, sedes(nombre), compras(*, proveedores(nombre), compra_items(*, productos(nombre)))';

/** Lo gastado de una entrega = suma de sus compras al contado. */
export function gastadoDe(entrega: EntregaDetalle): number {
  return entrega.compras.reduce((s, c) => roundTwo(s + Number(c.total)), 0);
}

/**
 * Entregas de dinero a rendir.
 *  - 'sede': las de la sede activa (vista del administrador y de Gerencia).
 *  - 'mias': las que tiene en su poder quien usa Compras (Gerencia ve las de todas las sedes).
 */
export function useEntregas(modo: 'sede' | 'mias') {
  const { profile } = useAuth();
  const { sedeId } = useSedeActiva();
  const [entregas, setEntregas] = useState<EntregaDetalle[]>([]);
  const [cerradas, setCerradas] = useState<EntregaDetalle[]>([]);
  const [loading, setLoading] = useState(false);
  const ultimaClave = useRef('');

  const fetchEntregas = useCallback(async () => {
    if (!profile) return;
    if (modo === 'sede' && !sedeId) { setEntregas([]); setCerradas([]); return; }
    const clave = `${modo}:${sedeId}`;
    ultimaClave.current = clave;
    setLoading(true);

    let abiertas = supabase.from('entregas').select(SELECT_ENTREGA).in('estado', ['abierta', 'rendida']).order('fecha', { ascending: true });
    let historial = supabase.from('entregas').select(SELECT_ENTREGA).eq('estado', 'cerrada').order('cerrada_at', { ascending: false }).limit(15);
    if (modo === 'sede') {
      abiertas = abiertas.eq('sede_id', sedeId!);
      historial = historial.eq('sede_id', sedeId!);
    } else if (profile.rol === 'compras') {
      abiertas = abiertas.eq('receptor_id', profile.id);
      historial = historial.eq('receptor_id', profile.id);
    }

    const [a, h] = await Promise.all([abiertas, historial]);
    if (ultimaClave.current !== clave) return;
    if (a.error) console.error('Error cargando entregas:', a.error);
    setEntregas((a.data ?? []) as EntregaDetalle[]);
    setCerradas((h.data ?? []) as EntregaDetalle[]);
    setLoading(false);
  }, [modo, sedeId, profile]);

  useEffect(() => { fetchEntregas(); }, [fetchEntregas]);

  const crearEntrega = useCallback(async (datos: { receptor_id: string; monto: number; metodo_pago: MetodoPago; fecha: string; notas: string | null }) => {
    if (!profile || !sedeId) return { error: 'Sin sede' };
    const { error } = await supabase.from('entregas').insert({ ...datos, sede_id: sedeId, entregado_por: profile.id });
    if (error) return { error: error.message };
    await fetchEntregas();
    return { error: null };
  }, [profile, sedeId, fetchEntregas]);

  const anularEntrega = useCallback(async (entrega: EntregaDetalle) => {
    if (entrega.compras.length > 0) return { error: 'Ya tiene compras registradas: no se puede anular.' };
    const { error } = await supabase.from('entregas').delete().eq('id', entrega.id);
    if (error) return { error: error.message };
    await fetchEntregas();
    return { error: null };
  }, [fetchEntregas]);

  /** Compras informa cuánto vuelto devuelve y da la entrega por rendida. */
  const rendirEntrega = useCallback(async (entregaId: string, vuelto: number) => {
    const { error } = await supabase
      .from('entregas')
      .update({ estado: 'rendida', vuelto, rendida_at: new Date().toISOString() })
      .eq('id', entregaId)
      .eq('estado', 'abierta');
    if (error) return { error: error.message };
    await fetchEntregas();
    return { error: null };
  }, [fetchEntregas]);

  /** El admin la devuelve a Compras para que corrija algo antes de cerrarla. */
  const devolverACompras = useCallback(async (entregaId: string) => {
    const { error } = await supabase
      .from('entregas')
      .update({ estado: 'abierta', vuelto: null, rendida_at: null })
      .eq('id', entregaId)
      .eq('estado', 'rendida');
    if (error) return { error: error.message };
    await fetchEntregas();
    return { error: null };
  }, [fetchEntregas]);

  /**
   * Cierra la rendición: guarda la categoría de cada compra y la base de datos, en un solo
   * paso, convierte las compras en gastos pendientes de la sede y cierra la entrega.
   */
  const cerrarEntrega = useCallback(async (entrega: EntregaDetalle, vueltoRecibido: number, categorias: Record<string, string>, saldoContinua = 0) => {
    for (const compra of entrega.compras) {
      const categoria = categorias[compra.id];
      if (!categoria) return { error: 'Elige la categoría de cada compra.', resultado: null };
      if (categoria !== compra.categoria_id) {
        const { error } = await supabase.from('compras').update({ categoria_id: categoria }).eq('id', compra.id);
        if (error) return { error: error.message, resultado: null };
      }
    }
    // Con saldo que sigue con Compras: se cierra y se abre una entrega nueva con ese saldo, todo en un solo paso.
    const { data, error } = saldoContinua > 0
      ? await supabase.rpc('cerrar_entrega_con_saldo', { p_entrega: entrega.id, p_vuelto_recibido: vueltoRecibido, p_saldo_continua: saldoContinua })
      : await supabase.rpc('cerrar_entrega', { p_entrega: entrega.id, p_vuelto_recibido: vueltoRecibido });
    if (error) return { error: error.message, resultado: null };
    await fetchEntregas();
    return { error: null, resultado: data as { gastos_creados: number; total_gastado: number; diferencia: number } };
  }, [fetchEntregas]);

  /** Borra una compra mal registrada (solo mientras la entrega sigue abierta). */
  const eliminarCompra = useCallback(async (compra: CompraDetalle) => {
    const { error } = await supabase.from('compras').delete().eq('id', compra.id);
    if (error) return { error: error.message };
    await borrarEvidencias([compra.evidencia_comprobante_path, compra.evidencia_producto_path, compra.evidencia_pago_path]);
    await fetchEntregas();
    return { error: null };
  }, [fetchEntregas]);

  return { entregas, cerradas, loading, fetchEntregas, crearEntrega, anularEntrega, rendirEntrega, devolverACompras, cerrarEntrega, eliminarCompra };
}

/** Quienes pueden recibir dinero para comprar (usuarios con rol Compras). */
export async function fetchUsuariosCompras(): Promise<{ id: string; nombre: string }[]> {
  const { data, error } = await supabase.rpc('usuarios_compras');
  if (error) {
    console.error('Error cargando usuarios de Compras:', error);
    return [];
  }
  return (data ?? []) as { id: string; nombre: string }[];
}
