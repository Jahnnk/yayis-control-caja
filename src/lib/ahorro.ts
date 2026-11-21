import { roundTwo } from '@/lib/utils';
import { calcularCambiosPrecio, claveProducto, ofertasPorProveedor, precioUnitario, type CompraDePrecio, type OfertaProveedor } from '@/lib/precios';

/**
 * Resumen de ahorro del administrador (pedido de Jahnn, 21-nov-2026).
 * Mismas reglas que el seguimiento de precios (src/lib/precios.ts): cada compra se compara con el precio habitual
 * que había ANTES de ella; solo cuentan las que se movieron ±15% o más. La diferencia es en soles:
 * (precio pagado − habitual) × cantidad. Positivo = pagó de más; negativo = ahorró.
 */
export interface CompraDeSede extends CompraDePrecio {
  sede_id: string;
  nombre: string;
}

export interface PagoDeMas {
  compra: CompraDeSede;
  unitario: number;
  habitual: number;
  porcentaje: number;
  /** Soles pagados de más frente al habitual. */
  deMas: number;
  /** El que dio el último precio más bajo en los últimos 90 días, si no fue a quien se le compró y es más barato. */
  mejor: OfertaProveedor | null;
}

export interface Periodo { ahorro: number; deMas: number; compras: number }

export interface ResumenAhorro {
  semana: Periodo;
  mes: Periodo;
  /** Las 3 compras del mes que más se pagaron de más. */
  peores: PagoDeMas[];
}

function sumar(cambios: { diferencia: number }[]): Periodo {
  return {
    ahorro: roundTwo(cambios.filter(c => c.diferencia < 0).reduce((s, c) => s - c.diferencia, 0)),
    deMas: roundTwo(cambios.filter(c => c.diferencia > 0).reduce((s, c) => s + c.diferencia, 0)),
    compras: cambios.length,
  };
}

/**
 * `compras`: todas las líneas con precio real que se pueden ver (de la más vieja a la más nueva o en cualquier orden).
 * El precio habitual y el mejor proveedor usan todas; el resumen cuenta solo las de `sedeId`.
 */
export function resumenAhorro(compras: CompraDeSede[], sedeId: string, desdeSemana: string, desdeMes: string, desdeMejor: string): ResumenAhorro {
  const desde = desdeSemana < desdeMes ? desdeSemana : desdeMes;
  const cambios = calcularCambiosPrecio(compras, c => c, desde).filter(c => c.item.sede_id === sedeId);
  const delMes = cambios.filter(c => c.item.fecha >= desdeMes);
  const deSemana = cambios.filter(c => c.item.fecha >= desdeSemana);

  // Para el mejor proveedor: compras del mismo producto y unidad, de la más vieja a la más nueva.
  const porProducto = new Map<string, CompraDeSede[]>();
  for (const c of [...compras].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const k = claveProducto(c.producto_id, c.unidad);
    (porProducto.get(k) ?? porProducto.set(k, []).get(k)!).push(c);
  }

  const peores = delMes
    .filter(c => c.variacion.diferencia > 0)
    .sort((a, b) => b.variacion.diferencia - a.variacion.diferencia)
    .slice(0, 3)
    .map(c => {
      const ofertas = ofertasPorProveedor(porProducto.get(claveProducto(c.item.producto_id, c.item.unidad)) ?? [], desdeMejor);
      const primera = ofertas[0];
      const pagado = precioUnitario(c.item.precio_total, c.item.cantidad) ?? c.unitario;
      const otro = primera && (primera.proveedor_id ?? primera.proveedor) !== (c.item.proveedor_id ?? c.item.proveedor);
      return {
        compra: c.item,
        unitario: c.unitario,
        habitual: c.habitual.unitario,
        porcentaje: c.variacion.porcentaje,
        deMas: c.variacion.diferencia,
        mejor: otro && primera.unitario < pagado ? primera : null,
      };
    });

  return {
    semana: sumar(deSemana.map(c => c.variacion)),
    mes: sumar(delMes.map(c => c.variacion)),
    peores,
  };
}
