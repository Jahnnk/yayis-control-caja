import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { EstadoItemPedido, EstadoPedido } from '@/types';

export const UNIDADES = [
  'kg', 'g', 'L', 'ml', 'unidad', 'docena', 'paquete', 'bolsa', 'saco', 'caja', 'lata', 'botella', 'atado', 'rollo',
] as const;

export const ESTADO_PEDIDO: Record<EstadoPedido, { label: string; clase: string }> = {
  borrador: { label: 'En preparación', clase: 'bg-gray-100 text-gray-700' },
  enviado: { label: 'Enviado a Compras', clase: 'bg-blue-50 text-blue-700' },
  comprado: { label: 'Comprado', clase: 'bg-emerald-50 text-emerald-700' },
  recibido: { label: 'Recibido', clase: 'bg-emerald-100 text-emerald-800' },
  cancelado: { label: 'Cancelado', clase: 'bg-red-50 text-red-700' },
};

export const ESTADO_ITEM: Record<EstadoItemPedido, { label: string; clase: string }> = {
  pendiente: { label: 'Por comprar', clase: 'bg-gray-100 text-gray-600' },
  comprado: { label: 'Comprado', clase: 'bg-emerald-50 text-emerald-700' },
  no_habia: { label: 'No había', clase: 'bg-red-50 text-red-700' },
};

// Las fechas se manejan como texto 'YYYY-MM-DD' (dia de Lima) para no mezclar zonas horarias.
function aFecha(fecha: string): Date {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

export function sumarDias(fecha: string, dias: number): string {
  const f = aFecha(fecha);
  f.setDate(f.getDate() + dias);
  return format(f, 'yyyy-MM-dd');
}

/** 0 = domingo ... 6 = sabado */
export function diaSemanaDe(fecha: string): number {
  return aFecha(fecha).getDay();
}

/** "jueves 2 de octubre" */
export function fechaLarga(fecha: string): string {
  return format(aFecha(fecha), "EEEE d 'de' MMMM", { locale: es });
}

/** "jue 2 oct" */
export function fechaCorta(fecha: string): string {
  return format(aFecha(fecha), 'EEE d MMM', { locale: es });
}

/** Las proximas fechas (desde hoy inclusive) que caen en los dias de compra de la sede. */
export function proximasFechasCompra(diasCompra: number[], desde: string, cantidad = 3): string[] {
  const fechas: string[] = [];
  if (diasCompra.length === 0) return fechas;
  for (let i = 0; i < 21 && fechas.length < cantidad; i++) {
    const f = sumarDias(desde, i);
    if (diasCompra.includes(diaSemanaDe(f))) fechas.push(f);
  }
  return fechas;
}

export function formatCantidad(n: number): string {
  return Number(n).toLocaleString('es-PE', { maximumFractionDigits: 2 });
}
