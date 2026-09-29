import { roundTwo } from '@/lib/utils';

// Seguimiento de precios. Reglas a la vista para poder explicar cada aviso:
// · "Precio habitual" de un producto = el precio por unidad típico de sus últimas 3 compras
//   (el del medio, para que una compra rara no lo mueva). Se compara siempre en la misma unidad
//   (kg con kg, lata con lata) y sin importar la sede ni el proveedor.
// · Si una compra sale 15% o más por encima del habitual → aviso rojo (sube).
//   Si sale 15% o más por debajo → aviso verde (ahorro).
export const COMPRAS_PARA_HABITUAL = 3;
export const UMBRAL_VARIACION = 0.15;   // ±15%: se avisa
export const UMBRAL_VARIACION_FUERTE = 0.30; // ±30%: aviso fuerte
// "Mejor proveedor" = el que dio el último precio más bajo en los últimos 90 días
// (se usa el último precio de cada proveedor para que una oferta vieja no engañe).
export const DIAS_MEJOR_PROVEEDOR = 90;

export interface CompraDePrecio {
  producto_id: string;
  unidad: string;
  cantidad: number;
  precio_total: number;
  fecha: string;
  proveedor: string;
  proveedor_id?: string;
}

export interface PrecioHabitual {
  unitario: number;
  /** Cuántas compras anteriores se usaron (1 a 3). */
  compras: number;
  ultimaFecha: string;
  ultimoProveedor: string;
}

export interface Variacion {
  tipo: 'sube' | 'baja' | 'normal';
  /** +2 = +200%, -0.5 = -50% */
  porcentaje: number;
  fuerte: boolean;
  /** Soles de más (positivo) o de ahorro (negativo) frente a haber pagado el precio habitual. */
  diferencia: number;
}

export const claveProducto = (productoId: string, unidad: string) => `${productoId}|${unidad}`;

export function precioUnitario(precioTotal: number, cantidad: number): number | null {
  return cantidad > 0 && precioTotal >= 0 ? precioTotal / cantidad : null;
}

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

/** Precio habitual a partir de compras anteriores del mismo producto y unidad, de la más vieja a la más nueva. */
export function precioHabitual(anteriores: CompraDePrecio[]): PrecioHabitual | null {
  const validas = anteriores.filter(c => precioUnitario(c.precio_total, c.cantidad) !== null);
  if (validas.length === 0) return null;
  const ultimas = validas.slice(-COMPRAS_PARA_HABITUAL);
  const ultima = ultimas[ultimas.length - 1]!;
  return {
    unitario: mediana(ultimas.map(c => precioUnitario(c.precio_total, c.cantidad)!)),
    compras: ultimas.length,
    ultimaFecha: ultima.fecha,
    ultimoProveedor: ultima.proveedor,
  };
}

export function variacionPrecio(unitario: number, habitual: number, cantidad: number): Variacion | null {
  if (!(habitual > 0)) return null;
  const porcentaje = unitario / habitual - 1;
  const tipo = porcentaje >= UMBRAL_VARIACION ? 'sube' : porcentaje <= -UMBRAL_VARIACION ? 'baja' : 'normal';
  return {
    tipo,
    porcentaje,
    fuerte: Math.abs(porcentaje) >= UMBRAL_VARIACION_FUERTE,
    diferencia: roundTwo((unitario - habitual) * cantidad),
  };
}

/** "+200%" / "-50%" */
export function formatPorcentaje(p: number): string {
  const n = Math.round(p * 100);
  return `${n > 0 ? '+' : ''}${n}%`;
}

/** Agrupa compras por producto y unidad (ordenadas de la más vieja a la más nueva). */
export function historialPorProducto(compras: CompraDePrecio[]): Map<string, CompraDePrecio[]> {
  const mapa = new Map<string, CompraDePrecio[]>();
  const ordenadas = [...compras].sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const c of ordenadas) {
    const k = claveProducto(c.producto_id, c.unidad);
    (mapa.get(k) ?? mapa.set(k, []).get(k)!).push(c);
  }
  return mapa;
}

export interface CambioPrecio<T> {
  item: T;
  unitario: number;
  habitual: PrecioHabitual;
  variacion: Variacion;
}

/**
 * Recorre compras en orden y compara cada una con el precio habitual que había ANTES de ella.
 * Devuelve solo las que se movieron ±15% o más y cuya fecha es desde `desde`.
 */
export function calcularCambiosPrecio<T>(
  items: T[],
  aCompra: (item: T) => CompraDePrecio | null,
  desde: string,
): CambioPrecio<T>[] {
  const conDatos = items
    .map(item => ({ item, c: aCompra(item) }))
    .filter((x): x is { item: T; c: CompraDePrecio } => x.c !== null)
    .sort((a, b) => a.c.fecha.localeCompare(b.c.fecha));

  const previas = new Map<string, CompraDePrecio[]>();
  const cambios: CambioPrecio<T>[] = [];
  for (const { item, c } of conDatos) {
    const k = claveProducto(c.producto_id, c.unidad);
    const antes = previas.get(k) ?? [];
    const unitario = precioUnitario(c.precio_total, c.cantidad);
    const habitual = precioHabitual(antes);
    if (unitario !== null && habitual && c.fecha >= desde) {
      const variacion = variacionPrecio(unitario, habitual.unitario, c.cantidad);
      if (variacion && variacion.tipo !== 'normal') cambios.push({ item, unitario, habitual, variacion });
    }
    previas.set(k, [...antes, c]);
  }
  return cambios;
}

export interface OfertaProveedor {
  proveedor: string;
  proveedor_id?: string;
  unitario: number;
  fecha: string;
}

/**
 * Último precio de cada proveedor desde `desde` (compras de la más vieja a la más nueva, mismo producto y unidad),
 * ordenado del más barato al más caro. El primero es el mejor proveedor.
 */
export function ofertasPorProveedor(compras: CompraDePrecio[], desde: string): OfertaProveedor[] {
  const ultima = new Map<string, OfertaProveedor>();
  for (const c of compras) {
    const unitario = precioUnitario(c.precio_total, c.cantidad);
    if (unitario === null || c.fecha < desde) continue;
    ultima.set(c.proveedor_id ?? c.proveedor, { proveedor: c.proveedor, proveedor_id: c.proveedor_id, unitario, fecha: c.fecha });
  }
  return Array.from(ultima.values()).sort((a, b) => a.unitario - b.unitario);
}
