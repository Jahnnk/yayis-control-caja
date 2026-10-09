import { DIAS_PARA_RENDIR } from '@/lib/alertas';
import { diferenciaDeCierre, sumarDias } from '@/lib/compras';
import { horaCorta, type Mirada, type PasoSeguimiento, type Seguimiento, type Tono } from '@/lib/seguimiento-pedido';
import { formatMonto, roundTwo } from '@/lib/utils';
import type { Compra, Entrega } from '@/types';

// Seguimiento del dinero de una entrega, como el de un pedido de delivery:
//   Entregado → Compras → Rendido → Cerrado → Repuesto
// Reglas (a la vista para poder explicarlas):
// - «Entregado»: el administrador le dio el dinero a Compras (la entrega).
// - «Compras»: Compras registra lo que compra con ese dinero. Avanza con lo gastado frente a lo entregado.
//   Ámbar si falta subir fotos, si gastó más de lo que recibió o si pasan DIAS_PARA_RENDIR días sin rendir.
// - «Rendido»: Compras rindió cuentas e informó su vuelto (rendida_at).
// - «Cerrado»: el administrador revisó y cerró la rendición (cerrada_at); cada compra pasó a ser gasto de su caja.
// - «Repuesto»: Gerencia ya repuso esos gastos (todos los gastos que nacieron de la entrega están «pagado»).
//   Compras no ve este paso: su parte termina cuando el administrador cierra.

export interface EstadoReposicion {
  /** Gastos que nacieron de la entrega al cerrarla. */
  gastos: number;
  /** De esos, cuántos ya repuso Gerencia. */
  repuestos: number;
}

type EntregaSeguible = Pick<Entrega, 'monto' | 'estado' | 'fecha' | 'created_at' | 'rendida_at' | 'cerrada_at' | 'vuelto' | 'vuelto_recibido' | 'saldo_continua'> & {
  compras: Pick<Compra, 'total' | 'created_at' | 'evidencia_pendiente'>[];
};

const TITULOS: [string, string][] = [
  ['entregado', 'Entregado'],
  ['compras', 'Compras'],
  ['rendido', 'Rendido'],
  ['cerrado', 'Cerrado'],
  ['repuesto', 'Repuesto'],
];

function diasDesde(fecha: string, hoy: string): number {
  let n = 0;
  while (n < 400 && sumarDias(fecha, n) < hoy) n++;
  return n;
}

export function seguimientoDeEntrega(e: EntregaSeguible, opciones: {
  hoy: string;
  mirada: Mirada;
  /** Nombre de la sede que entregó el dinero. */
  sede?: string | null;
  /** Cuánto de lo gastado ya repuso Gerencia (solo para entregas cerradas; null = todavía no se sabe). */
  reposicion?: EstadoReposicion | null;
}): Seguimiento {
  const { hoy, mirada } = opciones;
  const sede = opciones.sede || 'la sede';
  const titulos = mirada === 'compras' ? TITULOS.slice(0, 4) : TITULOS;
  const ultimo = titulos.length - 1;

  const monto = Number(e.monto);
  const gastado = e.compras.reduce((t, c) => roundTwo(t + Number(c.total)), 0);
  const queda = roundTwo(monto - gastado);
  const nCompras = e.compras.length;
  const fotos = e.compras.filter(c => c.evidencia_pendiente).length;
  const primeraCompra = e.compras.map(c => c.created_at).sort()[0] ?? null;

  const horas = [horaCorta(e.created_at, hoy), horaCorta(primeraCompra, hoy), horaCorta(e.rendida_at, hoy), horaCorta(e.cerrada_at, hoy), null];
  const detalles: (string | null)[] = [formatMonto(monto), null, null, null, null];

  let indiceActual: number;
  let fraccion = 0;
  let mensaje: string;
  let tono: Tono = 'normal';
  const avisos: string[] = [];

  if (e.estado === 'abierta') {
    indiceActual = 1;
    fraccion = monto > 0 ? Math.min(1, gastado / monto) : 0;
    detalles[1] = nCompras === 0 ? 'Sin compras' : `Gastó ${formatMonto(gastado)}`;
    const tu = mirada === 'compras';
    if (nCompras === 0) {
      mensaje = tu
        ? `Tienes ${formatMonto(monto)} de ${sede}: registra cada compra que hagas con este dinero.`
        : `Compras tiene ${formatMonto(monto)} y todavía no registra compras con este dinero.`;
    } else if (queda >= 0) {
      mensaje = tu
        ? `Llevas ${formatMonto(gastado)} en ${nCompras} compra${nCompras === 1 ? '' : 's'}; te quedan ${formatMonto(queda)}. Cuando termines, rinde cuentas.`
        : `Compras lleva ${formatMonto(gastado)} en ${nCompras} compra${nCompras === 1 ? '' : 's'}; le quedan ${formatMonto(queda)}.`;
    } else {
      tono = 'alerta';
      mensaje = tu
        ? `Gastaste ${formatMonto(-queda)} más de lo que recibiste: ${sede} te lo devolverá al cerrar.`
        : `Compras gastó ${formatMonto(-queda)} más de lo entregado: puso de su bolsillo.`;
    }
    if (fotos > 0) { tono = 'alerta'; avisos.push(`Falta subir ${fotos === 1 ? '1 foto' : `las fotos de ${fotos} compras`} antes de rendir.`); }
    const dias = diasDesde(e.fecha, hoy);
    if (dias >= DIAS_PARA_RENDIR) { tono = 'alerta'; avisos.push(`${tu ? 'Llevas' : 'Lleva'} ${dias} días sin rendir.`); }
  } else if (e.estado === 'rendida') {
    indiceActual = 3;
    detalles[1] = `Gastó ${formatMonto(gastado)}`;
    detalles[2] = `Vuelto ${formatMonto(Number(e.vuelto ?? 0))}`;
    mensaje = mirada === 'compras'
      ? `Ya rendiste (vuelto ${formatMonto(Number(e.vuelto ?? 0))}): falta que ${sede} lo confirme.`
      : mirada === 'sede'
        ? `Compras ya rindió (vuelto ${formatMonto(Number(e.vuelto ?? 0))}): revisa sus compras y cierra la rendición.`
        : `Compras ya rindió: falta que ${sede} cierre la rendición.`;
  } else {
    // cerrada
    detalles[1] = `Gastó ${formatMonto(gastado)}`;
    detalles[2] = `Vuelto ${formatMonto(Number(e.vuelto ?? 0))}`;
    const diferencia = diferenciaDeCierre(e.monto, gastado, e.vuelto_recibido, e.saldo_continua);
    detalles[3] = diferencia === 0 ? 'Cuadró' : diferencia > 0 ? `Faltaron ${formatMonto(diferencia)}` : `Se le debía ${formatMonto(-diferencia)}`;
    if (diferencia !== 0) tono = 'alerta';
    const sigue = Number(e.saldo_continua) > 0 ? ` ${formatMonto(Number(e.saldo_continua))} siguieron con Compras para la semana siguiente.` : '';

    if (mirada === 'compras') {
      indiceActual = titulos.length;
      if (tono === 'normal') tono = 'listo';
      mensaje = `Rendición cerrada por ${sede}: ${diferencia === 0 ? 'cuadró' : detalles[3]!.toLowerCase()}.${sigue}`;
    } else {
      const r = opciones.reposicion;
      if (gastado === 0) {
        indiceActual = titulos.length;
        detalles[4] = 'Nada que reponer';
        if (tono === 'normal') tono = 'listo';
        mensaje = `Cerrada sin compras: todo volvió como vuelto.${sigue}`;
      } else if (r && r.gastos > 0 && r.repuestos >= r.gastos) {
        indiceActual = titulos.length;
        detalles[4] = 'Completo';
        if (tono === 'normal') tono = 'listo';
        mensaje = `Gerencia ya repuso lo gastado (${formatMonto(gastado)}): ciclo completo.${sigue}`;
      } else {
        indiceActual = ultimo;
        detalles[4] = 'Pendiente';
        if (r && r.repuestos > 0) {
          fraccion = r.repuestos / r.gastos;
          detalles[4] = `${r.repuestos} de ${r.gastos}`;
        }
        const quien = mirada === 'sede' ? 'tu caja' : `la caja de ${sede}`;
        mensaje = r && r.repuestos > 0
          ? `Ya es gasto de ${quien}: Gerencia repuso ${r.repuestos} de ${r.gastos} compras; falta el resto.${sigue}`
          : `Ya es gasto de ${quien} (${formatMonto(gastado)}): falta que Gerencia lo reponga.${sigue}`;
      }
    }
  }

  if (avisos.length > 0) mensaje = `${mensaje} ${avisos.join(' ')}`;

  const pasos: PasoSeguimiento[] = titulos.map(([clave, titulo], i) => ({
    clave,
    titulo,
    estado: i < indiceActual ? 'hecho' : i === indiceActual ? 'actual' : 'pendiente',
    hora: i <= indiceActual ? horas[i] ?? null : null,
    detalle: i <= indiceActual ? detalles[i] ?? null : null,
  }));
  // La barra llega al punto del paso actual y avanza hacia el siguiente con la fracción
  // (Compras: lo gastado frente a lo entregado; en el último paso, avanza hacia él).
  const base = indiceActual > ultimo ? ultimo : indiceActual === ultimo ? ultimo - 1 : indiceActual;
  const avance = indiceActual > ultimo ? 1 : Math.min(1, (base + fraccion) / ultimo);
  return { pasos, mensaje, tono, avance, indiceActual };
}
