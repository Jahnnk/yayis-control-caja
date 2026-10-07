import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { borrarEvidencias, subirEvidencia } from '@/lib/evidencias';
import { sumarDias } from '@/lib/compras';
import { getTodayLima } from '@/lib/dates';
import type { DeliveryDetalle, LiquidacionDetalle } from '@/hooks/useDeliverys';
import type { CompraDetalle, Entrega, Pedido } from '@/types';

export interface CompraFinanzas extends CompraDetalle {
  sedes: { nombre: string } | null;
  proveedores: { nombre: string; telefono?: string | null } | null;
  referencia_pago?: string | null;
  pagado_at?: string | null;
}

export interface EntregaFinanzas extends Entrega {
  sedes: { nombre: string } | null;
  compras: { total: number }[];
}

/** Lo mínimo de cada compra para vigilar comprobantes y evidencia pendiente. */
export interface CompraControl {
  id: string;
  sede_id: string;
  fecha: string;
  total: number;
  tipo_comprobante: string;
  evidencia_pendiente: boolean;
  sedes: { nombre: string } | null;
  proveedores: { nombre: string } | null;
}

/** Productos con diferencias al recibirlos (incompleto / no llegó / llegó mal), de las últimas semanas. */
export interface DiferenciaRecepcion {
  id: string;
  sede_id: string;
  sedeNombre: string;
  producto: string;
  cantidad: number;
  unidad: string;
  estado: 'incompleto' | 'no_llego' | 'llego_mal';
  cantidadRecibida: number | null;
  nota: string | null;
  fecha: string;
}

export interface PedidoFinanzas extends Pick<Pedido, 'id' | 'sede_id' | 'fecha_compra' | 'urgente' | 'motivo_urgente' | 'estado' | 'comprado_at' | 'created_at'> {
  sedes: { nombre: string } | null;
}

export interface ItemPrecio {
  id: string;
  producto_id: string;
  cantidad: number;
  unidad: string;
  precio_total: number;
  created_at: string;
  productos: { nombre: string } | null;
  compras: {
    fecha: string;
    sede_id: string;
    condicion_pago: string;
    sedes: { nombre: string } | null;
    proveedores: { nombre: string } | null;
  } | null;
}

/** Todo lo que Gerencia de Finanzas vigila de las 3 sedes. */
export function useFinanzas() {
  const { profile } = useAuth();
  const [porPagar, setPorPagar] = useState<CompraFinanzas[]>([]);
  const [pagadas, setPagadas] = useState<CompraFinanzas[]>([]);
  const [entregas, setEntregas] = useState<EntregaFinanzas[]>([]);
  const [pedidos, setPedidos] = useState<PedidoFinanzas[]>([]);
  const [items, setItems] = useState<ItemPrecio[]>([]);
  const [comprasControl, setComprasControl] = useState<CompraControl[]>([]);
  const [diferencias, setDiferencias] = useState<DiferenciaRecepcion[]>([]);
  const [deliverys, setDeliverys] = useState<DeliveryDetalle[]>([]);
  const [liquidaciones, setLiquidaciones] = useState<LiquidacionDetalle[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTodo = useCallback(async () => {
    setLoading(true);
    const hoy = getTodayLima();
    const hace30 = sumarDias(hoy, -30);
    const hace180 = sumarDias(hoy, -180); // historial para el precio habitual de cada producto
    const SELECT_COMPRA = '*, sedes(nombre), proveedores(nombre, telefono), compra_items(*, productos(nombre))';

    const inicioMes = `${hoy.slice(0, 7)}-01`;

    const [pp, pg, en, pe, it, dl, lq, cc] = await Promise.all([
      supabase.from('compras').select(SELECT_COMPRA)
        .eq('condicion_pago', 'credito').eq('estado_pago', 'por_pagar')
        .order('fecha_vencimiento', { ascending: true }),
      supabase.from('compras').select(SELECT_COMPRA)
        .eq('condicion_pago', 'credito').eq('estado_pago', 'pagado')
        .order('pagado_at', { ascending: false }).limit(10),
      supabase.from('entregas').select('*, sedes(nombre), compras(total)')
        .or(`estado.in.(abierta,rendida),and(estado.eq.cerrada,fecha.gte.${hace30})`)
        .order('fecha', { ascending: true }),
      supabase.from('pedidos').select('id, sede_id, fecha_compra, urgente, motivo_urgente, estado, comprado_at, created_at, sedes(nombre)')
        .or(`estado.eq.comprado,and(urgente.eq.true,fecha_compra.gte.${hace30})`)
        .neq('estado', 'cancelado')
        .order('fecha_compra', { ascending: false }),
      supabase.from('compra_items')
        .select('id, producto_id, cantidad, unidad, precio_total, created_at, productos(nombre), compras(fecha, sede_id, condicion_pago, sedes(nombre), proveedores(nombre))')
        .gte('created_at', `${hace180}T00:00:00`)
        .eq('precio_repartido', false) // un total repartido no es un precio real
        .gt('precio_total', 0)         // un recojo sin pago tampoco
        .order('created_at', { ascending: false })
        .limit(1000),
      // Deliverys del mes y, aparte, todo el efectivo que Fabio aún no entregó (sin importar la fecha).
      supabase.from('deliverys').select('*, sedes(nombre)')
        .or(`fecha.gte.${inicioMes},and(metodo_cobro.eq.efectivo,liquidacion_id.is.null)`)
        .order('fecha', { ascending: true }),
      supabase.from('liquidaciones_delivery').select('*, sedes(nombre)')
        .gte('created_at', `${hace30}T00:00:00`)
        .order('created_at', { ascending: false }),
      // Compras del mes (para ver cuánto fue sin comprobante) y todas las que tienen evidencia pendiente.
      supabase.from('compras').select('id, sede_id, fecha, total, tipo_comprobante, evidencia_pendiente, sedes(nombre), proveedores(nombre)')
        .or(`fecha.gte.${inicioMes},evidencia_pendiente.eq.true`)
        .order('fecha', { ascending: true }),
    ]);
    for (const r of [pp, pg, en, pe, it, dl, lq, cc]) if (r.error) console.error('Error en el panel de Finanzas:', r.error);
    // Diferencias al recibir mercadería (últimos 14 días).
    const dif = await supabase.from('pedido_items')
      .select('id, cantidad, unidad, recepcion_estado, cantidad_recibida, recepcion_nota, entregado_at, productos(nombre), pedidos(sede_id, sedes(nombre))')
      .in('recepcion_estado', ['incompleto', 'no_llego', 'llego_mal'])
      .gte('entregado_at', `${sumarDias(hoy, -14)}T00:00:00`)
      .order('entregado_at', { ascending: false });
    if (dif.error) console.error('Error cargando las diferencias de recepción:', dif.error);
    setDiferencias(((dif.data ?? []) as unknown as {
      id: string; cantidad: number; unidad: string; recepcion_estado: DiferenciaRecepcion['estado']; cantidad_recibida: number | null;
      recepcion_nota: string | null; entregado_at: string; productos: { nombre: string } | null; pedidos: { sede_id: string; sedes: { nombre: string } | null } | null;
    }[]).filter(d => d.pedidos).map(d => ({
      id: d.id, sede_id: d.pedidos!.sede_id, sedeNombre: d.pedidos!.sedes?.nombre ?? '', producto: d.productos?.nombre ?? 'Producto',
      cantidad: Number(d.cantidad), unidad: d.unidad, estado: d.recepcion_estado,
      cantidadRecibida: d.cantidad_recibida === null ? null : Number(d.cantidad_recibida), nota: d.recepcion_nota, fecha: d.entregado_at.slice(0, 10),
    })));
    setPorPagar((pp.data ?? []) as CompraFinanzas[]);
    setPagadas((pg.data ?? []) as CompraFinanzas[]);
    setEntregas((en.data ?? []) as EntregaFinanzas[]);
    setPedidos((pe.data ?? []) as unknown as PedidoFinanzas[]);
    // Se piden de la más nueva a la más vieja (si hay más de 1000, se pierde lo más antiguo) y se voltean.
    setItems(((it.data ?? []) as unknown as ItemPrecio[]).reverse());
    setDeliverys((dl.data ?? []) as DeliveryDetalle[]);
    setLiquidaciones((lq.data ?? []) as LiquidacionDetalle[]);
    setComprasControl((cc.data ?? []) as unknown as CompraControl[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchTodo(); }, [fetchTodo]);

  /** Gerencia registra el pago de una factura a crédito con su constancia. */
  const pagarCompra = useCallback(async (compra: CompraFinanzas, datos: { fecha: string; referencia: string; constancia: File | null }) => {
    if (!profile) return { error: 'Sin sesión' };
    if (!datos.constancia) return { error: 'Sube la constancia de la transferencia o depósito.' };
    const { path, error: errSubida } = await subirEvidencia(datos.constancia, compra.sede_id, profile.id, 'pago-credito');
    if (errSubida || !path) return { error: errSubida ?? 'No se pudo subir la constancia' };

    const { error } = await supabase
      .from('compras')
      .update({
        estado_pago: 'pagado',
        pagado_at: `${datos.fecha}T12:00:00-05:00`,
        pagado_por: profile.id,
        metodo_pago: 'cuentas',
        referencia_pago: datos.referencia.trim() || null,
        evidencia_pago_path: path,
      })
      .eq('id', compra.id)
      .eq('estado_pago', 'por_pagar');
    if (error) {
      await borrarEvidencias([path]);
      return { error: error.message };
    }
    await fetchTodo();
    return { error: null };
  }, [profile, fetchTodo]);

  return { porPagar, pagadas, entregas, pedidos, items, deliverys, liquidaciones, comprasControl, diferencias, loading, fetchTodo, pagarCompra };
}
