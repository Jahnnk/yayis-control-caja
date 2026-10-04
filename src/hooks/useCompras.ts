import { useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { borrarEvidencias, subirEvidencia } from '@/lib/evidencias';
import { NOMBRE_FOTO, TOPE_SIN_COMPROBANTE_EFECTIVO, fotosExigidas, sumarDias, type RanuraEvidencia } from '@/lib/compras';
import { formatMonto, roundTwo } from '@/lib/utils';
import type { CondicionPago, MetodoPago, TipoComprobante } from '@/types';

export interface LineaCompra {
  pedido_item_id: string | null;
  producto_id: string;
  cantidad: number;
  unidad: string;
  precio_total: number;
}

export interface NuevaCompra {
  sede_id: string;
  proveedor_id: string;
  pedido_id: string | null;
  fecha: string;
  condicion_pago: CondicionPago;
  dias_credito: number;
  entrega_id: string | null;
  metodo_pago: MetodoPago | null;
  tipo_comprobante: TipoComprobante;
  numero_comprobante: string | null;
  observacion: string | null;
  lineas: LineaCompra[];
  /** Pedidos a los que pertenecen las líneas (para darlos por comprados si ya no les falta nada). */
  pedidoIds: string[];
  fotoComprobante: File | null;
  fotoProducto: File | null;
  fotoPago: File | null;
  /** Fabio no pudo tomar alguna foto: se guarda igual y la sube después (antes de rendir). */
  evidenciaPendiente?: boolean;
}

/** Fotos obligatorias que todavía faltan en esta compra. */
export function fotosQueFaltan(c: NuevaCompra): RanuraEvidencia[] {
  const archivos: Record<RanuraEvidencia, File | null> = { comprobante: c.fotoComprobante, producto: c.fotoProducto, pago: c.fotoPago };
  return fotosExigidas({ tipo_comprobante: c.tipo_comprobante, metodo_pago: c.metodo_pago, condicion_pago: c.condicion_pago }).filter(r => !archivos[r]);
}

/** Revisa las reglas de evidencia antes de subir nada (la base de datos las vuelve a exigir). */
export function validarCompra(c: NuevaCompra): string | null {
  if (c.lineas.length === 0) return 'Incluye al menos un producto.';
  if (c.lineas.some(l => !(l.cantidad > 0))) return 'Cada producto debe tener una cantidad mayor a 0.';
  if (c.lineas.some(l => !(l.precio_total >= 0))) return 'Pon el precio de cada producto.';
  if (roundTwo(c.lineas.reduce((s, l) => s + l.precio_total, 0)) <= 0) return 'El total de la compra debe ser mayor a 0.';
  if (c.condicion_pago === 'contado') {
    if (!c.entrega_id) return 'Elige de qué dinero entregado sale esta compra.';
    if (!c.metodo_pago) return 'Indica si pagaste en efectivo o por Yape/transferencia.';
  }
  if (c.tipo_comprobante === 'sin_comprobante') {
    if (c.condicion_pago === 'credito') return 'Una compra a crédito necesita factura o boleta.';
    if (c.metodo_pago === 'efectivo') {
      // Compras del mercado sin boleta: se permite en efectivo con tope y con observación.
      const total = roundTwo(c.lineas.reduce((t, l) => t + l.precio_total, 0));
      if (total > TOPE_SIN_COMPROBANTE_EFECTIVO) return `Sin boleta en efectivo solo hasta ${formatMonto(TOPE_SIN_COMPROBANTE_EFECTIVO)} por compra. Para más, paga por Yape/transferencia o pide boleta.`;
      if (!c.observacion?.trim()) return 'Sin boleta en efectivo: escribe en Observación dónde y a quién le compraste.';
    }
  }
  // Las fotos que falten solo se aceptan si Fabio eligió guardar con evidencia pendiente.
  const faltan = fotosQueFaltan(c);
  if (faltan.length > 0 && !c.evidenciaPendiente) return `Falta la ${NOMBRE_FOTO[faltan[0]!]}. Súbela o guarda la compra con evidencia pendiente.`;
  return null;
}

export function useCompras() {
  const { profile } = useAuth();

  const registrarCompra = useCallback(async (c: NuevaCompra) => {
    if (!profile) return { error: 'Sin sesión' };
    const invalida = validarCompra(c);
    if (invalida) return { error: invalida };

    // 1. Fotos
    const subidas: string[] = [];
    const subir = async (file: File | null, tipo: string) => {
      if (!file) return null;
      const { path, error } = await subirEvidencia(file, c.sede_id, profile.id, tipo);
      if (error) throw new Error(error);
      subidas.push(path!);
      return path;
    };
    let comprobantePath: string | null = null;
    let productoPath: string | null = null;
    let pagoPath: string | null = null;
    try {
      comprobantePath = c.tipo_comprobante === 'sin_comprobante' ? null : await subir(c.fotoComprobante, 'comprobante');
      productoPath = c.tipo_comprobante === 'sin_comprobante' ? await subir(c.fotoProducto, 'producto') : null;
      pagoPath = c.metodo_pago === 'cuentas' ? await subir(c.fotoPago, 'pago') : null;
      // (las fotos que no estén quedan sin ruta; si eran obligatorias, la compra queda como evidencia pendiente)
    } catch (e) {
      await borrarEvidencias(subidas);
      return { error: (e as Error).message };
    }

    // 2. Compra
    const credito = c.condicion_pago === 'credito';
    const total = roundTwo(c.lineas.reduce((s, l) => s + l.precio_total, 0));
    const { data: compra, error: errCompra } = await supabase
      .from('compras')
      .insert({
        sede_id: c.sede_id,
        proveedor_id: c.proveedor_id,
        pedido_id: c.pedido_id,
        entrega_id: credito ? null : c.entrega_id,
        fecha: c.fecha,
        total,
        condicion_pago: c.condicion_pago,
        metodo_pago: credito ? null : c.metodo_pago,
        tipo_comprobante: c.tipo_comprobante,
        numero_comprobante: c.numero_comprobante?.trim() || null,
        fecha_vencimiento: credito ? sumarDias(c.fecha, c.dias_credito) : null,
        estado_pago: credito ? 'por_pagar' : 'pagado',
        evidencia_comprobante_path: comprobantePath,
        evidencia_producto_path: productoPath,
        evidencia_pago_path: pagoPath,
        registrado_por: profile.id,
        observacion: c.observacion?.trim() || null,
        evidencia_pendiente: fotosQueFaltan(c).length > 0,
      })
      .select('id')
      .single();
    if (errCompra || !compra) {
      await borrarEvidencias(subidas);
      return { error: errCompra?.message ?? 'No se pudo guardar la compra' };
    }

    // 3. Detalle con precios
    const { error: errItems } = await supabase
      .from('compra_items')
      .insert(c.lineas.map(l => ({ ...l, compra_id: compra.id })));
    if (errItems) {
      await supabase.from('compras').delete().eq('id', compra.id);
      await borrarEvidencias(subidas);
      return { error: `No se pudo guardar el detalle: ${errItems.message}` };
    }

    // 4. Las líneas del pedido incluidas quedan como compradas (y el pedido, si ya no le falta nada).
    const idsPedido = c.lineas.map(l => l.pedido_item_id).filter((id): id is string => !!id);
    if (idsPedido.length > 0) {
      await supabase.from('pedido_items').update({ estado: 'comprado' }).in('id', idsPedido).eq('estado', 'pendiente');
      for (const pedidoId of c.pedidoIds) {
        const { data: items } = await supabase.from('pedido_items').select('estado').eq('pedido_id', pedidoId);
        if (items && items.every(i => i.estado !== 'pendiente')) {
          await supabase
            .from('pedidos')
            .update({ estado: 'comprado', comprado_at: new Date().toISOString() })
            .eq('id', pedidoId)
            .eq('estado', 'enviado');
        }
      }
    }
    return { error: null };
  }, [profile]);

  return { registrarCompra };
}
