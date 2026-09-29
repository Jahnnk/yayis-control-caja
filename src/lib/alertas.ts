import { formatMonto, roundTwo } from '@/lib/utils';
import { fechaCorta, formatCantidad, sumarDias } from '@/lib/compras';
import type { CompraFinanzas, EntregaFinanzas, ItemPrecio, PedidoFinanzas } from '@/hooks/useFinanzas';

// Umbrales de control. Están aquí, a la vista, para poder explicar cada alerta.
export const UMBRAL_PRECIO_MEDIO = 0.15;   // +15% sobre la compra anterior del mismo producto
export const UMBRAL_PRECIO_ALTO = 0.30;    // +30%: alerta roja
export const DIAS_PARA_RENDIR = 2;         // dinero entregado sin rendir después de 2 días
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
  ir?: '/recepcion' | '/pedidos';
}

const diasEntre = (desde: string, hasta: string) =>
  Math.round((new Date(`${hasta}T12:00:00`).getTime() - new Date(`${desde}T12:00:00`).getTime()) / 86_400_000);

const fechaLima = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });

export function gastadoEntrega(e: EntregaFinanzas): number {
  return e.compras.reduce((s, c) => roundTwo(s + Number(c.total)), 0);
}

/** Precio por unidad de cada compra comparado con la compra anterior del mismo producto (misma unidad). */
export function alertasDePrecio(items: ItemPrecio[], hoy: string): Alerta[] {
  const alertas: Alerta[] = [];
  const ultimoPrecio = new Map<string, { unitario: number; fecha: string; proveedor: string }>();
  const desde = sumarDias(hoy, -14);

  for (const it of items) {
    const cantidad = Number(it.cantidad);
    if (!(cantidad > 0) || !it.compras) continue;
    const unitario = Number(it.precio_total) / cantidad;
    const clave = `${it.producto_id}|${it.unidad}`;
    const anterior = ultimoPrecio.get(clave);
    const fecha = it.compras.fecha;

    if (anterior && anterior.unitario > 0 && fecha >= desde) {
      const alza = unitario / anterior.unitario - 1;
      if (alza >= UMBRAL_PRECIO_MEDIO) {
        alertas.push({
          clave: `precio-${it.id}`,
          nivel: alza >= UMBRAL_PRECIO_ALTO ? 'alta' : 'media',
          tipo: 'Precio alto',
          sedeId: it.compras.sede_id,
          sedeNombre: it.compras.sedes?.nombre ?? '',
          titulo: `${it.productos?.nombre ?? 'Producto'}: +${Math.round(alza * 100)}% vs. la compra anterior`,
          detalle: `${formatMonto(unitario)} por ${it.unidad} (${formatCantidad(cantidad)} ${it.unidad} a ${it.compras.proveedores?.nombre ?? '—'}, ${fechaCorta(fecha)}). Antes: ${formatMonto(anterior.unitario)} a ${anterior.proveedor}, ${fechaCorta(anterior.fecha)}.`,
        });
      }
    }
    ultimoPrecio.set(clave, { unitario, fecha, proveedor: it.compras.proveedores?.nombre ?? '—' });
  }
  return alertas;
}

export function calcularAlertas(
  { porPagar, entregas, pedidos, items }: { porPagar: CompraFinanzas[]; entregas: EntregaFinanzas[]; pedidos: PedidoFinanzas[]; items: ItemPrecio[] },
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
      const diferencia = roundTwo(Number(e.monto) - gastadoEntrega(e) - Number(e.vuelto_recibido ?? 0));
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
  return alertas.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'alta' ? -1 : 1));
}
