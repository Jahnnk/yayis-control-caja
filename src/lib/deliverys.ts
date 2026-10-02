import { roundTwo } from '@/lib/utils';
import type { Delivery, ModalidadDelivery } from '@/types';

// Reglas del control de deliverys. Están aquí, a la vista, para poder explicar cada número.
// Un delivery con efectivo cobrado y sin entregar al administrador cuenta como "pendiente".
// Si pasan más de DIAS_PARA_ENTREGAR_EFECTIVO días, Finanzas recibe una alerta.
export const DIAS_PARA_ENTREGAR_EFECTIVO = 2;

export const MODALIDADES: { valor: ModalidadDelivery; titulo: string; ayuda: string }[] = [
  { valor: 'todo_prepagado', titulo: 'Ya pagó todo', ayuda: 'El cliente pagó producto y delivery a la sede. Yo no cobro nada.' },
  { valor: 'producto_prepagado', titulo: 'Pagó el producto, el delivery me lo paga a mí', ayuda: 'Cobro solo el delivery al entregar.' },
  { valor: 'todo_contra_entrega', titulo: 'Me paga todo al entregar', ayuda: 'Cobro producto + delivery al entregar.' },
];

export const MODALIDAD_LABEL: Record<ModalidadDelivery, string> = {
  todo_prepagado: 'Ya pagó todo',
  producto_prepagado: 'Pagó el producto',
  todo_contra_entrega: 'Pagó todo al entregar',
};

/** Lo que Fabio cobra en la puerta según cómo pagó el cliente (igual que la base de datos). */
export function cobradoSegunModalidad(modalidad: ModalidadDelivery, montoProducto: number, montoDelivery: number): number {
  if (modalidad === 'todo_prepagado') return 0;
  if (modalidad === 'producto_prepagado') return roundTwo(montoDelivery);
  return roundTwo(montoProducto + montoDelivery);
}

/** Efectivo que Fabio cobró y todavía no entregó al administrador. */
export function esEfectivoPendiente(d: Pick<Delivery, 'metodo_cobro' | 'liquidacion_id' | 'cobrado'>): boolean {
  return d.metodo_cobro === 'efectivo' && d.liquidacion_id === null && Number(d.cobrado) > 0;
}

export function sumarCobrado(deliverys: Pick<Delivery, 'cobrado'>[]): number {
  return deliverys.reduce((s, d) => roundTwo(s + Number(d.cobrado)), 0);
}

export interface ResumenDeliverys {
  cantidad: number;
  /** Suma del delivery de cada entrega (lo que se cobra por llevarlo). */
  totalDelivery: number;
  /** Suma del valor de los productos llevados. */
  totalProductos: number;
  efectivoPendiente: number;
  cantidadPendiente: number;
  /** Fecha del delivery pendiente más antiguo. */
  pendienteDesde: string | null;
}

export function resumirDeliverys(deliverys: Delivery[]): ResumenDeliverys {
  const pendientes = deliverys.filter(esEfectivoPendiente);
  return {
    cantidad: deliverys.length,
    totalDelivery: deliverys.reduce((s, d) => roundTwo(s + Number(d.monto_delivery)), 0),
    totalProductos: deliverys.reduce((s, d) => roundTwo(s + Number(d.monto_producto)), 0),
    efectivoPendiente: sumarCobrado(pendientes),
    cantidadPendiente: pendientes.length,
    pendienteDesde: pendientes.reduce<string | null>((min, d) => (min === null || d.fecha < min ? d.fecha : min), null),
  };
}

/** Estado de un delivery para mostrarlo en la lista. */
export function estadoDelivery(d: Delivery): { label: string; clase: string } {
  if (d.cobrado <= 0) return { label: 'Sin cobro', clase: 'bg-gray-100 text-gray-600' };
  if (d.metodo_cobro === 'cuentas') return { label: 'Cobrado por Yape/transferencia', clase: 'bg-blue-50 text-blue-700' };
  if (d.liquidacion_id) return { label: 'Efectivo entregado', clase: 'bg-emerald-50 text-emerald-700' };
  return { label: 'Efectivo por entregar', clase: 'bg-amber-100 text-amber-800' };
}
