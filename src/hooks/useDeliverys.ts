import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { borrarEvidencias, subirEvidencia } from '@/lib/evidencias';
import { sumarDias } from '@/lib/compras';
import { getTodayLima } from '@/lib/dates';
import type { Delivery, LiquidacionDelivery, MetodoPago, ModalidadDelivery } from '@/types';

export interface DeliveryDetalle extends Delivery {
  sedes: { nombre: string } | null;
}

export interface LiquidacionDetalle extends LiquidacionDelivery {
  sedes: { nombre: string } | null;
}

export interface NuevoDelivery {
  sede_id: string;
  fecha: string;
  cliente: string;
  detalle: string | null;
  monto_producto: number;
  monto_delivery: number;
  modalidad: ModalidadDelivery;
  metodo_cobro: MetodoPago | null;
}

const SELECT_DELIVERY = '*, sedes(nombre)';

/**
 * Deliverys con el detalle de lo que se cobró.
 *  - 'mios': los que registró quien usa Compras (la base solo le deja ver los suyos).
 *  - 'sede': los de la sede activa (vista del administrador y de Gerencia).
 * Trae los del mes anterior en adelante y, aparte, TODO el efectivo pendiente (sin importar la fecha).
 */
export function useDeliverys(modo: 'mios' | 'sede') {
  const { profile } = useAuth();
  const { sedeId } = useSedeActiva();
  const [deliverys, setDeliverys] = useState<DeliveryDetalle[]>([]);
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionDetalle[]>([]);
  const [loading, setLoading] = useState(false);
  const ultimaClave = useRef('');

  const fetchDeliverys = useCallback(async () => {
    if (!profile) return;
    if (modo === 'sede' && !sedeId) { setDeliverys([]); setLiquidaciones([]); return; }
    const clave = `${modo}:${sedeId}`;
    ultimaClave.current = clave;
    setLoading(true);

    const hoy = getTodayLima();
    const inicioMesAnterior = `${sumarDias(`${hoy.slice(0, 7)}-01`, -1).slice(0, 7)}-01`;

    let recientes = supabase.from('deliverys').select(SELECT_DELIVERY)
      .gte('fecha', inicioMesAnterior)
      .order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(500);
    let pendientes = supabase.from('deliverys').select(SELECT_DELIVERY)
      .eq('metodo_cobro', 'efectivo').is('liquidacion_id', null)
      .order('fecha', { ascending: true });
    let historial = supabase.from('liquidaciones_delivery').select('*, sedes(nombre)')
      .order('created_at', { ascending: false }).limit(15);
    if (modo === 'sede') {
      recientes = recientes.eq('sede_id', sedeId!);
      pendientes = pendientes.eq('sede_id', sedeId!);
      historial = historial.eq('sede_id', sedeId!);
    }

    const [r, p, h] = await Promise.all([recientes, pendientes, historial]);
    if (ultimaClave.current !== clave) return;
    for (const res of [r, p, h]) if (res.error) console.error('Error cargando deliverys:', res.error);

    // Los pendientes pueden ser más viejos que el rango: se mezclan sin duplicar.
    const porId = new Map<string, DeliveryDetalle>();
    for (const d of [...((r.data ?? []) as DeliveryDetalle[]), ...((p.data ?? []) as DeliveryDetalle[])]) porId.set(d.id, d);
    setDeliverys(Array.from(porId.values()).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.created_at.localeCompare(a.created_at)));
    setLiquidaciones((h.data ?? []) as LiquidacionDetalle[]);
    setLoading(false);
  }, [modo, sedeId, profile]);

  useEffect(() => { fetchDeliverys(); }, [fetchDeliverys]);

  /** Registra un delivery; si se cobró por Yape/transferencia sube la captura primero. */
  const crearDelivery = useCallback(async (datos: NuevoDelivery, captura: File | null) => {
    if (!profile) return { error: 'Sin sesión' };
    let path: string | null = null;
    if (datos.metodo_cobro === 'cuentas') {
      if (!captura) return { error: 'Sube la captura del Yape o transferencia.' };
      const subida = await subirEvidencia(captura, datos.sede_id, profile.id, 'delivery');
      if (subida.error || !subida.path) return { error: subida.error ?? 'No se pudo subir la captura' };
      path = subida.path;
    }
    const { error } = await supabase.from('deliverys').insert({
      ...datos,
      evidencia_cobro_path: path,
      registrado_por: profile.id,
    });
    if (error) {
      await borrarEvidencias([path]);
      return { error: error.message };
    }
    await fetchDeliverys();
    return { error: null };
  }, [profile, fetchDeliverys]);

  /** Borra un delivery mal registrado (la base solo lo permite si aún no se liquidó su efectivo). */
  const eliminarDelivery = useCallback(async (delivery: DeliveryDetalle) => {
    const { error, count } = await supabase.from('deliverys').delete({ count: 'exact' }).eq('id', delivery.id);
    if (error) return { error: error.message };
    if (!count) return { error: 'Ya no se puede borrar: pasó el día en que lo registraste o su efectivo ya fue recibido.' };
    await borrarEvidencias([delivery.evidencia_cobro_path]);
    await fetchDeliverys();
    return { error: null };
  }, [fetchDeliverys]);

  /** El administrador cuenta el efectivo que le entregó Fabio y lo registra. */
  const recibirEfectivo = useCallback(async (ids: string[], recibido: number, nota: string) => {
    if (!sedeId) return { error: 'Sin sede', resultado: null };
    const { data, error } = await supabase.rpc('recibir_efectivo_delivery', {
      p_sede: sedeId, p_ids: ids, p_recibido: recibido, p_nota: nota.trim() || null,
    });
    if (error) return { error: error.message, resultado: null };
    await fetchDeliverys();
    return { error: null, resultado: data as { esperado: number; recibido: number; diferencia: number; deliverys: number } };
  }, [sedeId, fetchDeliverys]);

  return { deliverys, liquidaciones, loading, fetchDeliverys, crearDelivery, eliminarDelivery, recibirEfectivo };
}
