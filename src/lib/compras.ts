import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { roundTwo } from '@/lib/utils';
import type { EstadoItemPedido, EstadoPedido } from '@/types';

/**
 * Diferencia de una rendición cerrada: > 0 faltó dinero · < 0 Compras puso de su bolsillo.
 * Lo que sigue con Compras para la semana siguiente NO es faltante.
 */
export function diferenciaDeCierre(monto: number, gastado: number, vueltoRecibido: number | null, saldoContinua: number | null, devueltoACompras: number | null = 0): number {
  // Lo que la sede ya le devolvió a Compras (por lo que puso de su bolsillo) salda la diferencia negativa.
  return roundTwo(Number(monto) - gastado - Number(vueltoRecibido ?? 0) - Number(saldoContinua ?? 0) + Number(devueltoACompras ?? 0));
}

/** Tope por defecto para compras en efectivo SIN boleta (mercado): cada sede puede tener el suyo (Configuración). */
export const TOPE_SIN_COMPROBANTE_EFECTIVO = 50;

export type RanuraEvidencia = 'comprobante' | 'producto' | 'pago';

/** Fotos que exige una compra según su comprobante y su forma de pago (efectivo sin boleta no exige fotos). */
export function fotosExigidas(
  c: { tipo_comprobante: string; metodo_pago: string | null; condicion_pago: string },
  /** Total de la compra y tope sin boleta de la sede: la foto del producto solo es obligatoria por encima del tope. */
  limite?: { total: number; tope: number },
): RanuraEvidencia[] {
  if (c.tipo_comprobante === 'sin_comprobante') {
    if (c.metodo_pago !== 'cuentas') return [];
    return limite && limite.total > limite.tope ? ['producto', 'pago'] : ['pago'];
  }
  const r: RanuraEvidencia[] = ['comprobante'];
  if (c.condicion_pago === 'contado' && c.metodo_pago === 'cuentas') r.push('pago');
  return r;
}

export const NOMBRE_FOTO: Record<RanuraEvidencia, string> = {
  comprobante: 'foto de la boleta o factura',
  producto: 'foto del producto',
  pago: 'captura del Yape o transferencia',
};

/**
 * Lista ÚNICA de unidades (pedido de Jahnn, 21-nov-2026). Es la misma con la que Cash Control compara precios
 * (yayis-cash-control/src/lib/proveedores.ts → unidadCanonica). Nunca texto libre: así el catálogo no se fragmenta
 * («und», «unidades», «pqte», «litros»…). Ya no existe «sol»: se anota la cantidad real (atado, kg, unidad).
 * La base de datos también la hace cumplir (supabase/unidades_y_productos_unicos.sql).
 */
export const UNIDADES = [
  'unidad', 'kg', 'g', 'litro', 'ml', 'paquete', 'galón', 'caja', 'frasco', 'bolsa', 'atado', 'juego', 'balde', 'ciento', 'arroba', 'docena', 'rollo',
] as const;
export type Unidad = typeof UNIDADES[number];

export function esUnidadValida(u: string | null | undefined): u is Unidad {
  return !!u && (UNIDADES as readonly string[]).includes(u);
}

/** Formas viejas o mal escritas → la unidad de la lista. «sol/soles» → null (no dice cuánto se compró). */
const VARIANTES: [RegExp, Unidad | null][] = [
  [/^(sol|soles|s\/\.?)$/, null],
  [/^(u|und|unds|unid|unids|unidad|unidades)$/, 'unidad'],
  [/^(kg|kgs|kilo|kilos|kilogramo|kilogramos)$/, 'kg'],
  [/^(g|gr|grs|gramo|gramos)$/, 'g'],
  [/^(l|lt|lts|litro|litros)$/, 'litro'],
  [/^(ml|mililitro|mililitros)$/, 'ml'],
  [/^(paquete|paquetes|pqte|pqtes|paq|paqs)$/, 'paquete'],
  [/^(galon|galones)$/, 'galón'],
  [/^(caja|cajas)$/, 'caja'],
  [/^(frasco|frascos)$/, 'frasco'],
  [/^(bolsa|bolsas)$/, 'bolsa'],
  [/^(atado|atados|manojo|manojos)$/, 'atado'],
  [/^(juego|juegos)$/, 'juego'],
  [/^(balde|baldes)$/, 'balde'],
  [/^(ciento|cientos)$/, 'ciento'],
  [/^(arroba|arrobas)$/, 'arroba'],
  [/^(docena|docenas)$/, 'docena'],
  [/^(rollo|rollos)$/, 'rollo'],
];

/** La unidad de la lista que corresponde a lo escrito (datos viejos), o null si no hay una clara (p. ej. «sol»). */
export function unidadDeLista(u: string | null | undefined): Unidad | null {
  const t = claveNombre(u ?? '');
  for (const [re, canon] of VARIANTES) if (re.test(t)) return canon;
  return null;
}

/** Clave para reconocer el mismo nombre escrito distinto: sin tildes, sin mayúsculas, sin espacios dobles. */
export function claveNombre(nombre: string): string {
  return nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

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

/** Primera letra en mayúscula (para una fecha que empieza la frase: "Jueves 2 de octubre"). */
export function conMayuscula(texto: string): string {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/** "jueves 2 de octubre" */
export function fechaLarga(fecha: string): string {
  const f = aFecha(fecha);
  // Una fecha vacía o mal escrita no debe romper la pantalla.
  return Number.isNaN(f.getTime()) ? '' : format(f, "EEEE d 'de' MMMM", { locale: es });
}

/** "jue 2 oct" */
export function fechaCorta(fecha: string): string {
  const f = aFecha(fecha);
  return Number.isNaN(f.getTime()) ? '' : format(f, 'EEE d MMM', { locale: es });
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
