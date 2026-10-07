import { roundTwo } from '@/lib/utils';
import { claveProducto, type PrecioHabitual } from '@/lib/precios';
import { referenciaPorUnidadLinea } from '@/lib/precio-linea';

// Presupuesto por categoría (pedido de Jahnn, 6-oct-2026). El presupuesto del mes se arma y se
// aprueba en Cash Control; ahí se marca cuánto de cada categoría maneja el administrador de la
// sede («su parte»). Esa parte llega aquí como el TOPE de cada barra, que se llena con sus gastos
// y con las compras de Fabio (regla en la función gastado_caja_por_categoria de la base).
//
// Reglas a la vista:
//   · Desde 80% del tope la barra se pone en «ojo» (ámbar).
//   · Si un gasto o una lista lo pasan del 100%, se puede seguir, pero hay que escribir el
//     motivo y a Finanzas le llega una alerta (decisión de Jahnn: una urgencia no puede esperar).
export const UMBRAL_OJO = 0.8;

/** Las categorías de la lista única de Cash Control que se pueden presupuestar. */
export const CATEGORIAS_PRESUPUESTO = [
  'INSUMOS', 'PRODUCTOS ATELIER', 'PACKAGING', 'DELIVERY Y FLETES',
  'PLANILLA', 'PERSONAL',
  'ALQUILER', 'SERVICIOS', 'MANTENIMIENTO', 'LIMPIEZA', 'MENAJE Y UTENSILIOS',
  'MARKETING',
  'CONTABILIDAD Y ASESORÍAS', 'OFICINA Y SISTEMAS', 'SS BANCARIOS', 'IMPUESTOS', 'CAJA CHICA',
  'PRÉSTAMOS Y TARJETAS', 'EQUIPOS', 'REMODELACIÓN', 'AHORRO', 'UTILIDADES A SOCIOS',
] as const;

/** Las que suelen pasar por manos del administrador (se ofrecen primero en las listas). */
export const CATEGORIAS_DEL_ADMIN = [
  'INSUMOS', 'PACKAGING', 'LIMPIEZA', 'MENAJE Y UTENSILIOS', 'MANTENIMIENTO',
  'DELIVERY Y FLETES', 'OFICINA Y SISTEMAS', 'PERSONAL', 'MARKETING', 'SERVICIOS', 'EQUIPOS',
] as const;

/** Lo que se gastó sin categoría del presupuesto (se muestra, pero no consume ningún tope). */
export const SIN_EMPAREJAR = 'SIN EMPAREJAR';
export const SIN_CATEGORIA = 'SIN CATEGORÍA';

export type EstadoBarra = 'ok' | 'ojo' | 'pasado' | 'sin-tope';

export interface UsoCategoria {
  categoria: string;
  /** La parte que maneja el administrador. null = esta categoría no tiene tope este mes. */
  tope: number | null;
  /** El presupuesto de toda la categoría en la sede (referencia). */
  presupuestoTotal: number | null;
  gastado: number;
  enviadoEl: string | null;
}

/** «PRODUCTOS ATELIER» → «Productos atelier». */
export const nombreCategoria = (c: string) => c.charAt(0) + c.slice(1).toLocaleLowerCase('es-PE');

export function estadoBarra(gastado: number, tope: number | null): EstadoBarra {
  if (!tope || tope <= 0) return 'sin-tope';
  const r = gastado / tope;
  return r > 1 ? 'pasado' : r >= UMBRAL_OJO ? 'ojo' : 'ok';
}

export function porcentaje(gastado: number, tope: number | null): number | null {
  return tope && tope > 0 ? Math.round((gastado / tope) * 1000) / 10 : null;
}

export const quedan = (gastado: number, tope: number | null) => (tope ? roundTwo(tope - gastado) : null);

/** El mes calendario (YYYY-MM) de una fecha YYYY-MM-DD. */
export const mesDe = (fecha: string) => fecha.slice(0, 7);

/**
 * ¿Este monto nuevo pasa el tope de su categoría? Devuelve cuánto quedaría (negativo = pasado)
 * o null si la categoría no tiene tope este mes.
 */
export function pasaElTope(uso: UsoCategoria | undefined, montoNuevo: number): { quedaria: number; pasa: boolean } | null {
  if (!uso?.tope) return null;
  const quedaria = roundTwo(uso.tope - uso.gastado - montoNuevo);
  return { quedaria, pasa: quedaria < 0 };
}

export interface EstimadoLinea {
  categoria: string | null;
  /** Costo estimado con el precio habitual. null = el producto todavía no tiene precio conocido. */
  monto: number | null;
}

/** Suma lo estimado de una lista por categoría (y cuenta lo que no tiene precio o categoría). */
export function estimarPorCategoria(lineas: EstimadoLinea[]) {
  const porCategoria = new Map<string, number>();
  let sinPrecio = 0;
  let sinCategoria = 0;
  for (const l of lineas) {
    if (!l.categoria) { sinCategoria += 1; continue; }
    if (l.monto === null) { sinPrecio += 1; continue; }
    porCategoria.set(l.categoria, roundTwo((porCategoria.get(l.categoria) ?? 0) + l.monto));
  }
  return { porCategoria, sinPrecio, sinCategoria };
}

/** Ordena las barras: primero las que tienen tope (de más a menos llenas), luego lo gastado sin tope. */
export function ordenarUso(uso: UsoCategoria[]): UsoCategoria[] {
  const peso = (u: UsoCategoria) => (u.tope ? u.gastado / u.tope : -1);
  return [...uso].sort((a, b) => peso(b) - peso(a) || b.gastado - a.gastado);
}

/**
 * Lo que costaría lo PENDIENTE de una lista: cantidad × precio habitual del producto (en la misma
 * unidad). La categoría es la que recuerda el producto.
 */
export function estimarLineasPedido(
  items: { producto_id: string; cantidad: number; unidad: string; estado: string; precio_referencia?: number | null }[],
  categoriaDe: (productoId: string) => string | null | undefined,
  habituales: Map<string, PrecioHabitual>,
): EstimadoLinea[] {
  return items
    .filter(i => i.estado === 'pendiente')
    .map(i => {
      // Si el administrador escribió un precio de referencia, la lista se estima con ese; si no, con el precio habitual.
      const ref = referenciaPorUnidadLinea(i.precio_referencia, i.unidad);
      const h = habituales.get(claveProducto(i.producto_id, i.unidad));
      return { categoria: categoriaDe(i.producto_id) ?? null, monto: ref !== undefined ? roundTwo(ref * Number(i.cantidad)) : h ? roundTwo(h.unitario * Number(i.cantidad)) : null };
    });
}
