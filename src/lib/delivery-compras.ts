import { roundTwo } from '@/lib/utils';
import type { TipoComprobante } from '@/types';

// ====== Delivery de compras (pedido de Jahnn, 24-nov-2026) ======
// El administrador GESTIONA las compras de su sede: coordina con los proveedores y con un delivery tercerizado
// que compra con su propia plata, saca factura de lo que se puede (en el mercado no siempre) y cobra carreras.
// Cuando llega, el administrador registra qué trajo y a cuánto (por producto), de qué proveedor y con qué
// comprobante, y las carreras. La sede le debe todo eso; al devolvérselo nacen los gastos para la rendición.
//
// Reglas (las mismas que valida la base en supabase/delivery_de_compras.sql):
//   · una compra por proveedor; cada una con su categoría de gasto y al menos un producto con precio;
//   · con factura o boleta: la foto del comprobante; sin comprobante (mercado): dónde y qué, por escrito;
//   · carreras = cantidad × precio por carrera.

export interface LineaTraida {
  clave: string;
  productoNombre: string;
  /** null = producto nuevo (se crea al guardar). */
  productoId: string | null;
  cantidad: string;
  unidad: string;
  /** Lo que pagó por esa línea (S/, total, no por unidad). */
  pagado: string;
  proveedorId: string;
  /** Producto de la lista del día que se está trayendo (para marcarlo comprado y recibido). */
  pedidoItemId: string | null;
}

export interface ComprobanteProveedor {
  tipo: TipoComprobante;
  numero: string;
  categoriaId: string;
  observacion: string;
  foto: File | null;
}

export const num = (s: string) => {
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export const lineaCompleta = (l: LineaTraida) => l.productoNombre.trim() !== '' && num(l.cantidad) > 0 && num(l.pagado) > 0 && !!l.unidad && !!l.proveedorId;

/** Las líneas agrupadas por proveedor (en el orden en que aparecen). */
export function porProveedor(lineas: LineaTraida[]): { proveedorId: string; lineas: LineaTraida[]; total: number }[] {
  const grupos = new Map<string, LineaTraida[]>();
  for (const l of lineas) {
    if (!l.proveedorId) continue;
    grupos.set(l.proveedorId, [...(grupos.get(l.proveedorId) ?? []), l]);
  }
  return Array.from(grupos.entries()).map(([proveedorId, ls]) => ({
    proveedorId, lineas: ls, total: roundTwo(ls.reduce((t, l) => t + num(l.pagado), 0)),
  }));
}

export interface CuentaDelivery {
  conComprobante: number;
  sinComprobante: number;
  carreras: number;
  /** Lo que la sede le debe al delivery. */
  total: number;
}

export function cuentaDelivery(
  grupos: { proveedorId: string; total: number }[],
  comprobantes: Record<string, Pick<ComprobanteProveedor, 'tipo'>>,
  carreras: number, precioCarrera: number,
): CuentaDelivery {
  let con = 0, sin = 0;
  for (const g of grupos) {
    if ((comprobantes[g.proveedorId]?.tipo ?? 'factura') === 'sin_comprobante') sin += g.total;
    else con += g.total;
  }
  const c = roundTwo(Math.max(0, Math.floor(carreras)) * Math.max(0, precioCarrera));
  return { conComprobante: roundTwo(con), sinComprobante: roundTwo(sin), carreras: c, total: roundTwo(con + sin + c) };
}

/** Lo que falta para poder guardar (mismas reglas que la base). null = listo. */
export function queFalta(
  lineas: LineaTraida[],
  comprobantes: Record<string, ComprobanteProveedor>,
): string | null {
  const usadas = lineas.filter(l => l.productoNombre.trim() !== '' || num(l.pagado) > 0);
  if (usadas.length === 0) return 'Agrega lo que trajo.';
  const incompleta = usadas.find(l => !lineaCompleta(l));
  if (incompleta) {
    const n = incompleta.productoNombre.trim() || 'un producto';
    if (!incompleta.proveedorId) return `Elige de qué proveedor es ${n}.`;
    if (!(num(incompleta.cantidad) > 0)) return `Escribe la cantidad de ${n}.`;
    if (!(num(incompleta.pagado) > 0)) return `Escribe cuánto pagó por ${n}.`;
    return `Completa ${n}.`;
  }
  for (const g of porProveedor(usadas)) {
    const c = comprobantes[g.proveedorId];
    if (!c?.categoriaId) return 'Elige la categoría de gasto de cada proveedor.';
    if (c.tipo === 'sin_comprobante' && c.observacion.trim() === '') return 'Sin comprobante: escribe dónde compró (ej. mercado, puesto de la Sra. …).';
    if (c.tipo !== 'sin_comprobante' && !c.foto) return `Falta la foto de la ${c.tipo === 'factura' ? 'factura' : 'boleta'}.`;
  }
  return null;
}

/** El último precio por unidad de un producto (de su historial), para proponerlo. */
export function precioSugerido(cantidad: number, ultimoUnitario: number | null | undefined): string {
  if (!ultimoUnitario || !(cantidad > 0)) return '';
  return roundTwo(cantidad * ultimoUnitario).toFixed(2);
}

/** ¿El precio pagado sube más de 10% contra el último? Devuelve el % (redondeado) o null. */
export function subida(cantidad: number, pagado: number, ultimoUnitario: number | null | undefined): number | null {
  if (!ultimoUnitario || !(cantidad > 0) || !(pagado > 0)) return null;
  const pct = Math.round(((pagado / cantidad) / ultimoUnitario - 1) * 100);
  return pct > 10 ? pct : null;
}
