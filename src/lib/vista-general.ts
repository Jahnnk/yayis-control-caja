import { roundTwo } from '@/lib/utils';
import { resumirDeliverys, sumarCobrado, type ResumenDeliverys } from '@/lib/deliverys';
import { diaSemanaDe, diferenciaDeCierre, sumarDias } from '@/lib/compras';
import type { DeliveryDetalle } from '@/hooks/useDeliverys';
import type { CompraVista, EntregaVista, GastoVista, PedidoVista } from '@/hooks/useVistaGeneral';

// Reglas de la Vista general. Están aquí, a la vista, para poder explicar cada número.
//
// - Una compra de Compras se cuenta UNA sola vez. Al cerrar la rendición, la compra al contado
//   pasa a ser un gasto de la caja de la sede (con la misma fecha); ese gasto NO se vuelve a sumar.
// - "Gastos de caja" = lo que registraron los administradores (sin las compras de Compras).
// - "Total gastado" = gastos de caja + compras de Compras (al contado y a crédito).
// - "Entregado a Compras" no cuenta el saldo que pasa de una semana a la otra (no es dinero nuevo).

export interface Periodo { desde: string; hasta: string }

export type ClavePeriodo = 'hoy' | 'ayer' | 'semana' | 'semana-pasada' | 'mes' | 'mes-pasado' | 'otro';

export const PERIODOS: { clave: Exclude<ClavePeriodo, 'otro'>; label: string }[] = [
  { clave: 'hoy', label: 'Hoy' },
  { clave: 'ayer', label: 'Ayer' },
  { clave: 'semana', label: 'Esta semana' },
  { clave: 'semana-pasada', label: 'Semana pasada' },
  { clave: 'mes', label: 'Este mes' },
  { clave: 'mes-pasado', label: 'Mes pasado' },
];

function lunesDe(fecha: string): string {
  return sumarDias(fecha, -((diaSemanaDe(fecha) + 6) % 7));
}

export function periodoDe(clave: Exclude<ClavePeriodo, 'otro'>, hoy: string): Periodo {
  switch (clave) {
    case 'hoy': return { desde: hoy, hasta: hoy };
    case 'ayer': { const a = sumarDias(hoy, -1); return { desde: a, hasta: a }; }
    case 'semana': return { desde: lunesDe(hoy), hasta: hoy };
    case 'semana-pasada': { const l = sumarDias(lunesDe(hoy), -7); return { desde: l, hasta: sumarDias(l, 6) }; }
    case 'mes': return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
    case 'mes-pasado': {
      const finAnterior = sumarDias(`${hoy.slice(0, 7)}-01`, -1);
      return { desde: `${finAnterior.slice(0, 7)}-01`, hasta: finAnterior };
    }
  }
}

export function diasDelPeriodo({ desde, hasta }: Periodo): string[] {
  const dias: string[] = [];
  for (let f = desde; f <= hasta && dias.length < 400; f = sumarDias(f, 1)) dias.push(f);
  return dias;
}

const suma = <T,>(lista: T[], valor: (x: T) => number) => lista.reduce((t, x) => roundTwo(t + Number(valor(x))), 0);
const esSaldoQueContinua = (e: EntregaVista) => (e.notas ?? '').startsWith('Saldo que continúa');

export interface ProductoSinComprar {
  id: string;
  sede: string;
  producto: string;
  cantidad: number;
  unidad: string;
  fechaLista: string;
  motivo: 'no_habia' | 'pendiente';
  proveedor: string | null;
}

export interface FilaSede {
  sedeId: string;
  nombre: string;
  gastosCaja: number;
  compras: number;
  total: number;
  entregado: number;
  deliverys: number;
  cobradoDeliverys: number;
}

export interface FilaDia {
  fecha: string;
  gastosCaja: number;
  compras: number;
  total: number;
  deliverys: number;
  cobradoDeliverys: number;
  listas: number;
  noHabia: number;
}

export interface FilaCategoria { nombre: string; monto: number; porcentaje: number }

export interface Rendicion {
  entrega: EntregaVista;
  gastado: number;
  /** Solo si está cerrada: 0 = cuadró, positivo = faltó dinero, negativo = sobró. */
  diferencia: number | null;
}

export interface VistaGeneral {
  gastosCaja: GastoVista[];
  compras: CompraVista[];
  totalCaja: number;
  totalCompras: number;
  totalGastado: number;
  comprasContado: number;
  comprasCredito: number;
  sinBoleta: number;
  fotosPendientes: number;
  entregado: number;
  entregas: EntregaVista[];
  rendiciones: Rendicion[];
  listas: PedidoVista[];
  listasAtrasadas: PedidoVista[];
  sinComprar: ProductoSinComprar[];
  deliverys: DeliveryDetalle[];
  resumenDeliverys: ResumenDeliverys;
  porSede: FilaSede[];
  porDia: FilaDia[];
  porCategoria: FilaCategoria[];
}

export function calcularVistaGeneral(
  datos: { gastos: GastoVista[]; compras: CompraVista[]; pedidos: PedidoVista[]; entregas: EntregaVista[]; deliverys: DeliveryDetalle[] },
  periodo: Periodo,
  sedes: { id: string; nombre: string }[],
  sedeFiltro: string,
  hoy: string,
): VistaGeneral {
  const deLaSede = <T extends { sede_id: string }>(x: T) => !sedeFiltro || x.sede_id === sedeFiltro;
  const enPeriodo = (fecha: string) => fecha >= periodo.desde && fecha <= periodo.hasta;

  // Gastos que nacieron de cerrar una rendición: ya se cuentan como compra, no se suman dos veces.
  const gastosDeCompras = new Set(datos.compras.map(c => c.gasto_id).filter(Boolean) as string[]);
  const gastoPorId = new Map(datos.gastos.map(g => [g.id, g]));

  const gastosCaja = datos.gastos.filter(g => deLaSede(g) && !gastosDeCompras.has(g.id));
  const compras = datos.compras.filter(deLaSede);
  const totalCaja = suma(gastosCaja, g => g.monto);
  const totalCompras = suma(compras, c => c.total);
  const credito = compras.filter(c => c.condicion_pago === 'credito');

  const entregas = datos.entregas.filter(deLaSede);
  const entregasNuevas = entregas.filter(e => enPeriodo(e.fecha) && !esSaldoQueContinua(e));
  // Se traen las entregas hechas en el periodo y las rendidas o cerradas en el periodo.
  const rendiciones: Rendicion[] = entregas.map(e => {
    const gastado = suma(e.compras, c => c.total);
    return { entrega: e, gastado, diferencia: e.estado === 'cerrada' ? diferenciaDeCierre(e.monto, gastado, e.vuelto_recibido, e.saldo_continua) : null };
  });

  const pedidos = datos.pedidos.filter(deLaSede);
  const listas = pedidos.filter(p => enPeriodo(p.fecha_compra));
  const listasAtrasadas = pedidos.filter(p => p.estado === 'enviado' && p.fecha_compra < periodo.desde);

  // No se compró: lo que "no había" en las listas del periodo, y lo que sigue pendiente en listas ya vencidas.
  const sinComprar: ProductoSinComprar[] = [];
  for (const p of pedidos) {
    const vencida = p.estado === 'enviado' && p.fecha_compra < hoy;
    for (const i of p.pedido_items) {
      const motivo = i.estado === 'no_habia' && enPeriodo(p.fecha_compra) ? 'no_habia' : i.estado === 'pendiente' && vencida ? 'pendiente' : null;
      if (!motivo) continue;
      sinComprar.push({
        id: i.id, sede: p.sedes?.nombre ?? '', producto: i.productos?.nombre ?? 'Producto', cantidad: Number(i.cantidad), unidad: i.unidad,
        fechaLista: p.fecha_compra, motivo, proveedor: i.proveedores?.nombre ?? null,
      });
    }
  }
  sinComprar.sort((a, b) => a.fechaLista.localeCompare(b.fechaLista) || a.sede.localeCompare(b.sede) || a.producto.localeCompare(b.producto));

  const deliverys = datos.deliverys.filter(deLaSede);

  const porSede: FilaSede[] = sedes.filter(s => !sedeFiltro || s.id === sedeFiltro).map(s => {
    const deS = <T extends { sede_id: string }>(x: T) => x.sede_id === s.id;
    const caja = suma(gastosCaja.filter(deS), g => g.monto);
    const comp = suma(compras.filter(deS), c => c.total);
    const dl = deliverys.filter(deS);
    return {
      sedeId: s.id, nombre: s.nombre, gastosCaja: caja, compras: comp, total: roundTwo(caja + comp),
      entregado: suma(entregasNuevas.filter(deS), e => e.monto), deliverys: dl.length, cobradoDeliverys: sumarCobrado(dl),
    };
  });

  const porDia: FilaDia[] = diasDelPeriodo(periodo).reverse().map(fecha => {
    const caja = suma(gastosCaja.filter(g => g.fecha === fecha), g => g.monto);
    const comp = suma(compras.filter(c => c.fecha === fecha), c => c.total);
    const dl = deliverys.filter(d => d.fecha === fecha);
    const listasDia = listas.filter(p => p.fecha_compra === fecha);
    return {
      fecha, gastosCaja: caja, compras: comp, total: roundTwo(caja + comp), deliverys: dl.length, cobradoDeliverys: sumarCobrado(dl),
      listas: listasDia.filter(p => p.estado !== 'cancelado').length,
      noHabia: listasDia.reduce((n, p) => n + p.pedido_items.filter(i => i.estado === 'no_habia').length, 0),
    };
  });

  // Categorías: gastos de caja por su categoría; cada compra por la categoría de su gasto (si ya se rindió).
  const porNombre = new Map<string, number>();
  const sumar = (nombre: string, monto: number) => porNombre.set(nombre, roundTwo((porNombre.get(nombre) ?? 0) + Number(monto)));
  for (const g of gastosCaja) sumar(g.categorias?.nombre ?? 'Sin categoría', g.monto);
  for (const c of compras) {
    const gasto = c.gasto_id ? gastoPorId.get(c.gasto_id) : undefined;
    if (gasto?.categorias?.nombre) sumar(gasto.categorias.nombre, c.total);
    else sumar(c.condicion_pago === 'credito' ? 'Compras a crédito' : 'Compras sin rendir aún', c.total);
  }
  const totalGastado = roundTwo(totalCaja + totalCompras);
  const porCategoria = Array.from(porNombre.entries())
    .map(([nombre, monto]) => ({ nombre, monto, porcentaje: totalGastado > 0 ? Math.round((monto / totalGastado) * 1000) / 10 : 0 }))
    .sort((a, b) => b.monto - a.monto);

  return {
    gastosCaja, compras, totalCaja, totalCompras, totalGastado,
    comprasContado: roundTwo(totalCompras - suma(credito, c => c.total)),
    comprasCredito: suma(credito, c => c.total),
    sinBoleta: suma(compras.filter(c => c.tipo_comprobante === 'sin_comprobante'), c => c.total),
    fotosPendientes: compras.filter(c => c.evidencia_pendiente).length,
    entregado: suma(entregasNuevas, e => e.monto),
    entregas: entregasNuevas,
    rendiciones,
    listas, listasAtrasadas, sinComprar,
    deliverys, resumenDeliverys: resumirDeliverys(deliverys),
    porSede, porDia, porCategoria,
  };
}
