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
  /** Solo para mensajes: nombre del producto. No se guarda. */
  nombre?: string;
  /** El precio salió de repartir el total de la compra (no es el precio real del producto). */
  precio_repartido?: boolean;
  /** Cantidad que se había pedido en la línea del pedido; si se compró menos, el resto se separa en otra línea. */
  cantidad_pedida?: number;
  /** Qué pasa con lo que falta de lo pedido: se compra otro día (pendiente) o ya no se compra (no había). */
  resto?: 'pendiente' | 'no_habia';
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
  /** Otras capturas de pago (cuando pagó a varios puestos por Yape): la compra tiene una constancia por pago. */
  fotosPagoExtra?: File[];
  /** Fabio no pudo tomar alguna foto: se guarda igual y la sube después (antes de rendir). */
  evidenciaPendiente?: boolean;
  /** Tope de la sede para efectivo sin boleta (si no viene, el tope por defecto). */
  topeSinComprobante?: number;
}

/** Fotos obligatorias que todavía faltan en esta compra. */
export function fotosQueFaltan(c: NuevaCompra): RanuraEvidencia[] {
  const archivos: Record<RanuraEvidencia, File | null> = { comprobante: c.fotoComprobante, producto: c.fotoProducto, pago: c.fotoPago };
  const total = roundTwo(c.lineas.reduce((t, l) => t + l.precio_total, 0));
  return fotosExigidas(
    { tipo_comprobante: c.tipo_comprobante, metodo_pago: c.metodo_pago, condicion_pago: c.condicion_pago },
    { total, tope: c.topeSinComprobante ?? TOPE_SIN_COMPROBANTE_EFECTIVO },
  ).filter(r => !archivos[r]);
}

/** Revisa las reglas de evidencia antes de subir nada (la base de datos las vuelve a exigir). */
export function validarCompra(c: NuevaCompra): string | null {
  if (c.lineas.length === 0) return 'Incluye al menos un producto.';
  if (c.lineas.some(l => !(l.cantidad > 0))) return 'Cada producto debe tener una cantidad mayor a 0.';
  const sinPrecio = c.lineas.find(l => !(l.precio_total >= 0));
  if (sinPrecio) return `Falta el precio de ${sinPrecio.nombre ?? 'un producto'}. Si no pagaste nada por él, pulsa «Sin costo».`;
  // Recojo sin pago (total S/ 0): productos que ya estaban pagados. No sale dinero: no pide entrega, forma de pago, boleta ni fotos.
  if (roundTwo(c.lineas.reduce((s, l) => s + l.precio_total, 0)) === 0) return null;
  if (c.condicion_pago === 'contado') {
    if (!c.entrega_id) return 'Elige de qué dinero entregado sale esta compra.';
    if (!c.metodo_pago) return 'Indica si pagaste en efectivo o por Yape/transferencia.';
  }
  if (c.tipo_comprobante === 'sin_comprobante') {
    if (c.condicion_pago === 'credito') return 'Una compra a crédito necesita factura o boleta.';
    if (c.metodo_pago === 'efectivo') {
      // Compras del mercado sin boleta: se permite en efectivo con tope y con observación.
      const total = roundTwo(c.lineas.reduce((t, l) => t + l.precio_total, 0));
      const tope = c.topeSinComprobante ?? TOPE_SIN_COMPROBANTE_EFECTIVO;
      if (total > tope) return `Sin boleta en efectivo solo hasta ${formatMonto(tope)} por compra. Para más, paga por Yape/transferencia o pide boleta.`;
      if (!c.observacion?.trim()) return 'Sin boleta en efectivo: escribe en Observación dónde y a quién le compraste.';
    }
    if (c.metodo_pago === 'cuentas' && !c.observacion?.trim()) return 'Sin boleta por Yape/transferencia: escribe en Observación dónde y a quién le compraste.';
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
    const pagosExtraPaths: string[] = [];
    try {
      comprobantePath = c.tipo_comprobante === 'sin_comprobante' ? null : await subir(c.fotoComprobante, 'comprobante');
      productoPath = c.tipo_comprobante === 'sin_comprobante' ? await subir(c.fotoProducto, 'producto') : null;
      pagoPath = c.metodo_pago === 'cuentas' ? await subir(c.fotoPago, 'pago') : null;
      if (c.metodo_pago === 'cuentas') {
        for (const f of c.fotosPagoExtra ?? []) {
          const p = await subir(f, 'pago');
          if (p) pagosExtraPaths.push(p);
        }
      }
      // (las fotos que no estén quedan sin ruta; si eran obligatorias, la compra queda como evidencia pendiente)
    } catch (e) {
      await borrarEvidencias(subidas);
      return { error: (e as Error).message };
    }

    // 2. Compra
    const total = roundTwo(c.lineas.reduce((s, l) => s + l.precio_total, 0));
    const recojo = total === 0;
    const credito = !recojo && c.condicion_pago === 'credito';
    const { data: compra, error: errCompra } = await supabase
      .from('compras')
      .insert({
        sede_id: c.sede_id,
        proveedor_id: c.proveedor_id,
        pedido_id: c.pedido_id,
        entrega_id: credito || recojo ? null : c.entrega_id,
        fecha: c.fecha,
        total,
        condicion_pago: recojo ? 'contado' : c.condicion_pago,
        metodo_pago: credito || recojo ? null : c.metodo_pago,
        tipo_comprobante: recojo ? 'sin_comprobante' : c.tipo_comprobante,
        numero_comprobante: c.numero_comprobante?.trim() || null,
        fecha_vencimiento: credito ? sumarDias(c.fecha, c.dias_credito) : null,
        estado_pago: credito ? 'por_pagar' : 'pagado',
        evidencia_comprobante_path: comprobantePath,
        evidencia_producto_path: productoPath,
        evidencia_pago_path: pagoPath,
        // La columna solo se envía si hay más de una captura de pago.
        ...(pagosExtraPaths.length > 0 ? { evidencias_pago_extra: pagosExtraPaths } : {}),
        registrado_por: profile.id,
        observacion: c.observacion?.trim() || null,
        evidencia_pendiente: !recojo && fotosQueFaltan(c).length > 0,
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
      .insert(c.lineas.map(l => ({
        pedido_item_id: l.pedido_item_id,
        producto_id: l.producto_id,
        cantidad: l.cantidad,
        unidad: l.unidad,
        precio_total: l.precio_total,
        // La columna solo se envía cuando el precio salió de repartir un total.
        ...(l.precio_repartido ? { precio_repartido: true } : {}),
        compra_id: compra.id,
      })));
    if (errItems) {
      await supabase.from('compras').delete().eq('id', compra.id);
      await borrarEvidencias(subidas);
      return { error: `No se pudo guardar el detalle: ${errItems.message}` };
    }

    // 3b. Si se compró MENOS de lo pedido, lo que falta se separa en otra línea (pendiente o «no había») para no perderlo.
    let aviso: string | null = null;
    for (const l of c.lineas) {
      if (!l.pedido_item_id || l.cantidad_pedida === undefined || l.cantidad >= l.cantidad_pedida - 0.005) continue;
      const { error: errDividir } = await supabase.rpc('dividir_linea_pedido', {
        p_item: l.pedido_item_id, p_comprada: l.cantidad, p_resto_estado: l.resto ?? 'pendiente',
      });
      if (errDividir) aviso = `La compra se guardó, pero no se pudo separar lo que faltaba de ${l.nombre ?? 'un producto'}: ${errDividir.message}`;
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
    return { error: null, aviso };
  }, [profile]);

  return { registrarCompra };
}
