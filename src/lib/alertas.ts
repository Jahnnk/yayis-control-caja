import { formatMonto, roundTwo } from '@/lib/utils';
import { precioMostrado } from '@/lib/precio-linea';
import { diferenciaDeCierre, fechaCorta, formatCantidad, sumarDias } from '@/lib/compras';
import { calcularCambiosPrecio, formatPorcentaje, type CompraDePrecio } from '@/lib/precios';
import { DIAS_PARA_ENTREGAR_EFECTIVO, esEfectivoPendiente } from '@/lib/deliverys';
import type { CompraControl, CompraFinanzas, DiferenciaRecepcion, EntregaFinanzas, ItemPrecio, PedidoFinanzas } from '@/hooks/useFinanzas';
import type { DeliveryDetalle, LiquidacionDetalle } from '@/hooks/useDeliverys';
import type { SobreTopeGasto, SobreTopePedido, UsoSede } from '@/hooks/useAlertasPresupuesto';
import { nombreCategoria } from '@/lib/presupuesto';

// Umbrales de control. Están aquí, a la vista, para poder explicar cada alerta.
// Precios: +15% sobre el precio habitual → alerta; +30% → alerta roja (reglas en src/lib/precios.ts).
export const DIAS_PARA_RENDIR = 8;         // dinero entregado sin rendir: Compras rinde una vez por semana, se alerta pasada una semana
export const DIAS_AVISO_VENCIMIENTO = 3;   // facturas que vencen en 3 días o menos

export type NivelAlerta = 'alta' | 'media';

export interface Alerta {
  clave: string;
  nivel: NivelAlerta;
  tipo: string;
  sedeId: string;
  sedeNombre: string;
  titulo: string;
  detalle: string;
  /** Pantalla donde se resuelve (se abre con la sede de la alerta ya elegida). */
  ir?: '/recepcion' | '/pedidos' | '/deliverys' | '/presupuesto' | '/gastos';
}

const diasEntre = (desde: string, hasta: string) =>
  Math.round((new Date(`${hasta}T12:00:00`).getTime() - new Date(`${desde}T12:00:00`).getTime()) / 86_400_000);

const fechaLima = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

export function gastadoEntrega(e: EntregaFinanzas): number {
  return e.compras.reduce((s, c) => roundTwo(s + Number(c.total)), 0);
}

/** Convierte una línea de compra del panel en el formato que usa el seguimiento de precios. */
export function itemACompraDePrecio(it: ItemPrecio): CompraDePrecio | null {
  if (!it.compras) return null;
  return {
    producto_id: it.producto_id,
    unidad: it.unidad,
    cantidad: Number(it.cantidad),
    precio_total: Number(it.precio_total),
    fecha: it.compras.fecha,
    proveedor: it.compras.proveedores?.nombre ?? '—',
  };
}

/** Compras de las últimas 2 semanas que salieron 15% o más caras que el precio habitual del producto. */
export function alertasDePrecio(items: ItemPrecio[], hoy: string): Alerta[] {
  return calcularCambiosPrecio(items, itemACompraDePrecio, sumarDias(hoy, -14))
    .filter(c => c.variacion.tipo === 'sube')
    .map(({ item: it, unitario, habitual, variacion }) => ({
      clave: `precio-${it.id}`,
      nivel: variacion.fuerte ? 'alta' as const : 'media' as const,
      tipo: 'Precio alto',
      sedeId: it.compras!.sede_id,
      sedeNombre: it.compras!.sedes?.nombre ?? '',
      titulo: `${it.productos?.nombre ?? 'Producto'}: ${formatPorcentaje(variacion.porcentaje)} sobre su precio habitual`,
      detalle: `${formatMonto(precioMostrado(unitario, it.unidad).valor)} por ${precioMostrado(unitario, it.unidad).etiqueta} (${formatCantidad(Number(it.cantidad))} ${it.unidad} a ${it.compras!.proveedores?.nombre ?? '—'}, ${fechaCorta(it.compras!.fecha)}). Habitual: ${formatMonto(precioMostrado(habitual.unitario, it.unidad).valor)} por ${precioMostrado(habitual.unitario, it.unidad).etiqueta}. Se pagaron ${formatMonto(variacion.diferencia)} de más.`,
    }));
}

/**
 * Deliverys de Compras:
 *  · efectivo cobrado que lleva más de DIAS_PARA_ENTREGAR_EFECTIVO días sin entregarse al administrador;
 *  · entregas de efectivo de las últimas 2 semanas donde el dinero no cuadró.
 */
export function alertasDeDeliverys(deliverys: DeliveryDetalle[], liquidaciones: LiquidacionDetalle[], hoy: string): Alerta[] {
  const alertas: Alerta[] = [];

  const porSede = new Map<string, DeliveryDetalle[]>();
  for (const d of deliverys.filter(esEfectivoPendiente)) (porSede.get(d.sede_id) ?? porSede.set(d.sede_id, []).get(d.sede_id)!).push(d);
  for (const [sedeId, lista] of porSede) {
    const masViejo = lista.reduce((min, d) => (d.fecha < min ? d.fecha : min), lista[0]!.fecha);
    const dias = diasEntre(masViejo, hoy);
    if (dias < DIAS_PARA_ENTREGAR_EFECTIVO) continue;
    const total = lista.reduce((s, d) => roundTwo(s + Number(d.cobrado)), 0);
    alertas.push({
      clave: `delivery-efectivo-${sedeId}`, nivel: dias > 5 ? 'alta' : 'media', tipo: 'Efectivo de delivery',
      sedeId, sedeNombre: lista[0]!.sedes?.nombre ?? '',
      titulo: `${formatMonto(total)} cobrados en deliverys sin entregar al administrador (desde hace ${dias} días)`,
      detalle: `${lista.length} delivery(s), el más antiguo del ${fechaCorta(masViejo)}. Compras debe entregarlo y el administrador confirmarlo.`,
      ir: '/deliverys',
    });
  }

  for (const l of liquidaciones) {
    const dif = roundTwo(Number(l.esperado) - Number(l.recibido));
    const dia = l.fecha_entrega ?? fechaLima(l.created_at);
    if (dif === 0 || diasEntre(dia, hoy) > 14) continue;
    alertas.push({
      clave: `delivery-descuadre-${l.id}`, nivel: dif > 0 ? 'alta' : 'media', tipo: 'Delivery descuadrado',
      sedeId: l.sede_id, sedeNombre: l.sedes?.nombre ?? '',
      titulo: dif > 0
        ? `Faltaron ${formatMonto(dif)} en el efectivo de deliverys del ${fechaCorta(dia)}`
        : `Sobraron ${formatMonto(-dif)} en el efectivo de deliverys del ${fechaCorta(dia)}`,
      detalle: `Esperado ${formatMonto(Number(l.esperado))} · recibido ${formatMonto(Number(l.recibido))}.${l.nota ? ` Nota: ${l.nota}` : ''}`,
      ir: '/deliverys',
    });
  }
  return alertas;
}

/** Compras guardadas sin alguna foto obligatoria que llevan un día o más sin completarse. */
export function alertasDeEvidencia(compras: CompraControl[], hoy: string): Alerta[] {
  return compras
    .filter(c => c.evidencia_pendiente && diasEntre(c.fecha, hoy) >= 1)
    .map(c => {
      const dias = diasEntre(c.fecha, hoy);
      return {
        clave: `evidencia-${c.id}`, nivel: dias >= 3 ? 'alta' as const : 'media' as const, tipo: 'Evidencia pendiente',
        sedeId: c.sede_id, sedeNombre: c.sedes?.nombre ?? '',
        titulo: `Compra a ${c.proveedores?.nombre ?? 'proveedor'} por ${formatMonto(Number(c.total))} (${fechaCorta(c.fecha)}) sin su foto desde hace ${dias} día(s)`,
        detalle: 'Compras debe subir la foto que falta (Mi dinero y rendición). Mientras tanto no se puede cerrar la rendición de esa entrega.',
        ir: '/recepcion' as const,
      };
    });
}

/**
 * Presupuesto (aprobado en Cash Control): categorías que ya pasaron su tope este mes (alta), y
 * gastos o listas que se registraron pasando el tope, con el motivo que escribió el administrador.
 */
export function alertasDePresupuesto(usoPorSede: UsoSede[], gastos: SobreTopeGasto[], pedidos: SobreTopePedido[]): Alerta[] {
  const alertas: Alerta[] = [];
  for (const s of usoPorSede) {
    for (const u of s.uso) {
      if (!u.tope || u.gastado <= u.tope) continue;
      alertas.push({
        clave: `tope-${s.sedeId}-${u.categoria}`, nivel: 'alta', tipo: 'Presupuesto pasado',
        sedeId: s.sedeId, sedeNombre: s.sedeNombre,
        titulo: `${nombreCategoria(u.categoria)}: ${formatMonto(u.gastado)} de un tope de ${formatMonto(u.tope)} (${Math.round((u.gastado / u.tope) * 100)}%)`,
        detalle: `Se pasó por ${formatMonto(roundTwo(u.gastado - u.tope))} este mes. Revisa con el administrador o ajusta el presupuesto en Cash Control.`,
        ir: '/presupuesto',
      });
    }
  }
  for (const g of gastos) {
    alertas.push({
      clave: `tope-gasto-${g.id}`, nivel: 'media', tipo: 'Gasto sobre el tope',
      sedeId: g.sede_id, sedeNombre: g.sedes?.nombre ?? '',
      titulo: `${g.descripcion} · ${formatMonto(Number(g.monto))} (${fechaCorta(g.fecha)}, ${g.categorias?.nombre ?? 'sin categoría'})`,
      detalle: `Motivo: ${g.motivo_sobre_tope}`,
      ir: '/gastos',
    });
  }
  for (const p of pedidos) {
    alertas.push({
      clave: `tope-pedido-${p.id}`, nivel: 'media', tipo: 'Lista sobre el tope',
      sedeId: p.sede_id, sedeNombre: p.sedes?.nombre ?? '',
      titulo: `Lista del ${fechaCorta(p.fecha_compra)} enviada pasando el tope`,
      detalle: `Motivo: ${p.motivo_sobre_tope}`,
      ir: '/pedidos',
    });
  }
  return alertas;
}

/** Mercadería que llegó con diferencias (incompleta, no llegó o llegó mal): una alerta por sede, con el detalle por producto. */
export function alertasDeRecepcion(diferencias: DiferenciaRecepcion[]): Alerta[] {
  const porSede = new Map<string, DiferenciaRecepcion[]>();
  for (const d of diferencias) (porSede.get(d.sede_id) ?? porSede.set(d.sede_id, []).get(d.sede_id)!).push(d);
  const texto = (d: DiferenciaRecepcion) =>
    `${d.producto}: ${d.estado === 'no_llego' ? 'no llegó' : d.estado === 'llego_mal' ? 'llegó mal' : `llegaron ${formatCantidad(d.cantidadRecibida ?? 0)} de ${formatCantidad(d.cantidad)} ${d.unidad}`}${d.nota ? ` (${d.nota})` : ''}`;
  return Array.from(porSede.entries()).map(([sedeId, lista]) => ({
    clave: `recepcion-${sedeId}`, nivel: lista.some(d => d.estado === 'no_llego') ? 'alta' as const : 'media' as const, tipo: 'Mercadería con diferencias',
    sedeId, sedeNombre: lista[0]!.sedeNombre,
    titulo: `${lista.length} producto(s) llegaron con diferencias en los últimos 14 días`,
    detalle: lista.slice(0, 4).map(texto).join(' · ') + (lista.length > 4 ? ` · y ${lista.length - 4} más` : ''),
    ir: '/pedidos' as const,
  }));
}

export function calcularAlertas(
  { porPagar, entregas, pedidos, items, deliverys = [], liquidaciones = [], comprasControl = [], diferencias = [], presupuesto }: {
    porPagar: CompraFinanzas[]; entregas: EntregaFinanzas[]; pedidos: PedidoFinanzas[]; items: ItemPrecio[];
    deliverys?: DeliveryDetalle[]; liquidaciones?: LiquidacionDetalle[]; comprasControl?: CompraControl[]; diferencias?: DiferenciaRecepcion[];
    presupuesto?: { usoPorSede: UsoSede[]; gastos: SobreTopeGasto[]; pedidos: SobreTopePedido[] };
  },
  hoy: string,
): Alerta[] {
  const alertas: Alerta[] = [];

  for (const c of porPagar) {
    if (c.fecha_vencimiento && c.fecha_vencimiento < hoy) {
      alertas.push({
        clave: `vencida-${c.id}`, nivel: 'alta', tipo: 'Factura vencida',
        sedeId: c.sede_id, sedeNombre: c.sedes?.nombre ?? '',
        titulo: `${c.proveedores?.nombre}: ${formatMonto(Number(c.total))} vencida hace ${diasEntre(c.fecha_vencimiento, hoy)} día(s)`,
        detalle: `Venció el ${fechaCorta(c.fecha_vencimiento)}. Regístrala como pagada en "Cuentas por pagar" cuando la pagues.`,
      });
    }
  }

  for (const e of entregas) {
    const sede = e.sedes?.nombre ?? '';
    if (e.estado === 'cerrada') {
      const diferencia = diferenciaDeCierre(e.monto, gastadoEntrega(e), e.vuelto_recibido, e.saldo_continua);
      if (diferencia !== 0) {
        alertas.push({
          clave: `descuadre-${e.id}`, nivel: diferencia > 0 ? 'alta' : 'media', tipo: 'Rendición descuadrada',
          sedeId: e.sede_id, sedeNombre: sede,
          titulo: diferencia > 0
            ? `Faltaron ${formatMonto(diferencia)} en la rendición del ${fechaCorta(e.fecha)}`
            : `La sede le debía ${formatMonto(-diferencia)} a Compras (entrega del ${fechaCorta(e.fecha)})`,
          detalle: `Entregado ${formatMonto(Number(e.monto))} · gastado ${formatMonto(gastadoEntrega(e))} · vuelto recibido ${formatMonto(Number(e.vuelto_recibido ?? 0))}.`,
        });
      }
    } else if (e.estado === 'abierta' && diasEntre(e.fecha, hoy) >= DIAS_PARA_RENDIR) {
      alertas.push({
        clave: `sinrendir-${e.id}`, nivel: 'media', tipo: 'Dinero sin rendir',
        sedeId: e.sede_id, sedeNombre: sede,
        titulo: `${formatMonto(Number(e.monto))} entregados hace ${diasEntre(e.fecha, hoy)} días sin rendir`,
        detalle: `Gastado hasta ahora: ${formatMonto(gastadoEntrega(e))}. Compras debe rendir con su vuelto.`,
        ir: '/recepcion',
      });
    } else if (e.estado === 'rendida' && e.rendida_at && diasEntre(fechaLima(e.rendida_at), hoy) >= 1) {
      alertas.push({
        clave: `sincerrar-${e.id}`, nivel: 'media', tipo: 'Rendición sin cerrar',
        sedeId: e.sede_id, sedeNombre: sede,
        titulo: `Rendición esperando al administrador desde el ${fechaCorta(fechaLima(e.rendida_at))}`,
        detalle: 'Mientras no se cierre, esas compras no aparecen como gastos de la caja.',
        ir: '/recepcion',
      });
    }
  }

  for (const p of pedidos) {
    const sede = p.sedes?.nombre ?? '';
    if (p.estado === 'comprado' && p.comprado_at && diasEntre(fechaLima(p.comprado_at), hoy) >= 1) {
      alertas.push({
        clave: `recepcion-${p.id}`, nivel: 'media', tipo: 'Mercadería sin confirmar',
        sedeId: p.sede_id, sedeNombre: sede,
        titulo: `Compra del ${fechaCorta(p.fecha_compra)} sin confirmar que llegó`,
        detalle: 'El administrador debe confirmar la recepción (conforme o con observaciones).',
        ir: '/recepcion',
      });
    }
    if (p.urgente && p.fecha_compra >= sumarDias(hoy, -7)) {
      alertas.push({
        clave: `urgente-${p.id}`, nivel: 'media', tipo: 'Pedido urgente',
        sedeId: p.sede_id, sedeNombre: sede,
        titulo: `Pedido urgente del ${fechaCorta(p.fecha_compra)}`,
        detalle: p.motivo_urgente ? `Motivo: ${p.motivo_urgente}` : 'Fuera del día de compra programado.',
        ir: '/pedidos',
      });
    }
  }

  alertas.push(...alertasDePrecio(items, hoy));
  alertas.push(...alertasDeDeliverys(deliverys, liquidaciones, hoy));
  alertas.push(...alertasDeEvidencia(comprasControl, hoy));
  alertas.push(...alertasDeRecepcion(diferencias));
  if (presupuesto) alertas.push(...alertasDePresupuesto(presupuesto.usoPorSede, presupuesto.gastos, presupuesto.pedidos));
  return alertas.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'alta' ? -1 : 1));
}
