import { roundTwo } from '@/lib/utils';

/**
 * Una línea de compra se puede llenar de dos formas: escribiendo el precio de CADA unidad
 * o el TOTAL de la línea. Lo que se guarda siempre es el total; el otro campo se calcula solo.
 * `ultimo` recuerda cuál escribió la persona, para que al cambiar la cantidad se recalcule lo correcto:
 *  · si escribió el precio por unidad → cambia el total;
 *  · si escribió el total → cambia el precio por unidad.
 */
export interface CamposPrecio {
  cantidad: string;
  /** Total de la línea (es lo que se guarda). */
  precio: string;
  /** Precio por unidad que ve la persona. */
  unit: string;
  ultimo: 'unit' | 'total' | null;
}

/**
 * Los pesos pedidos en gramos se cotizan POR KG y los volúmenes en ml POR LITRO, como se compra en el mercado:
 * nadie sabe cuánto cuesta «un gramo». `factor` convierte entre la unidad pedida y la unidad del precio.
 */
export function baseDePrecio(unidad: string): { factor: number; etiqueta: string } {
  const u = unidad.trim().toLowerCase();
  if (u === 'g') return { factor: 1000, etiqueta: 'kg' };
  if (u === 'ml') return { factor: 1000, etiqueta: 'L' };
  return { factor: 1, etiqueta: unidad };
}

/** Precio por unidad pedida (g, ml…) -> precio por kg / litro para mostrarlo. */
export function precioMostrado(unitario: number, unidad: string): { valor: number; etiqueta: string } {
  const b = baseDePrecio(unidad);
  return { valor: unitario * b.factor, etiqueta: b.etiqueta };
}

const num = (s: string) => (s.trim() === '' ? NaN : parseFloat(s));
// Hasta 4 decimales, sin ceros de más: 1.6667, 5, 4.2.
const unitTexto = (n: number) => String(Math.round(n * 10000) / 10000);

export function alEscribirUnitario(c: CamposPrecio, unit: string, factor = 1): CamposPrecio {
  const q = num(c.cantidad);
  const u = num(unit);
  if (Number.isNaN(u)) return { ...c, unit, ultimo: 'unit', precio: '' };
  return { ...c, unit, ultimo: 'unit', precio: q > 0 ? String(roundTwo((q / factor) * u)) : c.precio };
}

export function alEscribirTotal(c: CamposPrecio, precio: string, factor = 1): CamposPrecio {
  const q = num(c.cantidad);
  const t = num(precio);
  if (Number.isNaN(t)) return { ...c, precio, ultimo: 'total', unit: '' };
  return { ...c, precio, ultimo: 'total', unit: q > 0 ? unitTexto((t * factor) / q) : '' };
}

export function alCambiarCantidad(c: CamposPrecio, cantidad: string, factor = 1): CamposPrecio {
  const q = num(cantidad);
  const siguiente = { ...c, cantidad };
  if (!(q > 0)) return siguiente;
  if (c.ultimo === 'unit' && !Number.isNaN(num(c.unit))) return { ...siguiente, precio: String(roundTwo((q / factor) * num(c.unit))) };
  if (c.ultimo === 'total' && !Number.isNaN(num(c.precio))) return { ...siguiente, unit: unitTexto((num(c.precio) * factor) / q) };
  return siguiente;
}

/** Al cambiar la unidad de una línea (por ejemplo de kg a g), se recalcula con el factor nuevo lo que no escribió la persona. */
export function alCambiarUnidad(c: CamposPrecio, factor: number): CamposPrecio {
  const q = num(c.cantidad);
  if (!(q > 0)) return c;
  if (c.ultimo === 'unit' && !Number.isNaN(num(c.unit))) return { ...c, precio: String(roundTwo((q / factor) * num(c.unit))) };
  if (c.ultimo === 'total' && !Number.isNaN(num(c.precio))) return { ...c, unit: unitTexto((num(c.precio) * factor) / q) };
  return c;
}
