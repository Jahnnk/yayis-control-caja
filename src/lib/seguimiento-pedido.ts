import { fechaCorta } from '@/lib/compras';
import type { Pedido, PedidoItem } from '@/types';

// Seguimiento de una lista de compra, como el de un pedido de delivery:
//   Enviada → Comprando → En camino → Recibido
// Reglas (a la vista para poder explicarlas):
// - «Enviada»: el administrador envió la lista (enviado_at). Mientras es borrador, este es el paso actual.
// - «Comprando»: Compras ya tiene la lista. Avanza con los productos resueltos (comprados o «no había»).
// - «En camino»: Compras terminó (estado «comprado», comprado_at). Nadie ha revisado nada en la sede todavía.
// - «Recibido»: el administrador revisa producto por producto; la lista llega aquí sola cuando todo está revisado.
// Una lista vencida que sigue sin comprarse se marca «atrasada».

export type EstadoPaso = 'hecho' | 'actual' | 'pendiente';
export type Tono = 'normal' | 'alerta' | 'listo' | 'cancelado';
/** Quién mira: cambia el texto del mensaje («tu sede», «Atelier», «ya compraste»). */
export type Mirada = 'sede' | 'gerencia' | 'compras';

export interface PasoSeguimiento {
  clave: 'enviada' | 'comprando' | 'en_camino' | 'recibido';
  titulo: string;
  estado: EstadoPaso;
  /** Hora en que se cumplió (o empezó) el paso. */
  hora: string | null;
  /** Dato corto debajo del paso: «6 de 9», «Todo conforme». */
  detalle: string | null;
}

export interface Seguimiento {
  pasos: PasoSeguimiento[];
  /** Una frase que dice qué está pasando y qué sigue. */
  mensaje: string;
  tono: Tono;
  /** Avance de 0 a 1 para la barra (incluye la fracción del paso actual). */
  avance: number;
  /** Paso actual (0 a 3); 4 si todo terminó. */
  indiceActual: number;
}

type PedidoSeguible = Pick<Pedido, 'estado' | 'fecha_compra' | 'enviado_at' | 'comprado_at' | 'recibido_at'> & {
  pedido_items: Pick<PedidoItem, 'estado' | 'entregado_at' | 'recepcion_estado'>[];
};

/** «8:10 a. m.» si fue hoy; «jue 8 · 8:10 a. m.» si fue otro día (hora de Lima). */
export function horaCorta(iso: string | null | undefined, hoy: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dia = d.toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
  const hora = d.toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit' });
  return dia === hoy ? hora : `${fechaCorta(dia)} · ${hora}`;
}

const TITULOS: [PasoSeguimiento['clave'], string][] = [
  ['enviada', 'Enviada'],
  ['comprando', 'Comprando'],
  ['en_camino', 'En camino'],
  ['recibido', 'Recibido'],
];

export function seguimientoDePedido(p: PedidoSeguible, opciones: {
  hoy: string;
  mirada: Mirada;
  /** Nombre de la sede (para los mensajes que no ve la propia sede). */
  sede?: string | null;
  /** Hora de la primera compra registrada para esta lista, si se conoce. */
  primeraCompra?: string | null;
}): Seguimiento {
  const { hoy, mirada } = opciones;
  const laSede = mirada === 'sede' ? 'tu sede' : (opciones.sede || 'la sede');
  const items = p.pedido_items;
  const total = items.length;
  const comprados = items.filter(i => i.estado === 'comprado');
  const noHabia = items.filter(i => i.estado === 'no_habia').length;
  const resueltos = comprados.length + noHabia;
  const faltan = total - resueltos;
  const revisados = comprados.filter(i => i.entregado_at).length;
  const diferencias = comprados.filter(i => i.entregado_at && i.recepcion_estado && i.recepcion_estado !== 'conforme').length;
  const atrasada = p.fecha_compra < hoy;
  const extraNoHabia = noHabia > 0 ? ` · ${noHabia} no había` : '';
  const entreParentesis = noHabia > 0 ? ` (${noHabia} no había)` : '';

  const horas = [
    horaCorta(p.enviado_at, hoy),
    horaCorta(opciones.primeraCompra, hoy),
    horaCorta(p.comprado_at, hoy),
    horaCorta(p.recibido_at, hoy),
  ];
  const detalles: (string | null)[] = [null, null, null, null];

  let indiceActual: number;
  let fraccion = 0;
  let mensaje: string;
  let tono: Tono = 'normal';

  if (p.estado === 'cancelado') {
    return {
      pasos: TITULOS.map(([clave, titulo]) => ({ clave, titulo, estado: 'pendiente', hora: null, detalle: null })),
      mensaje: 'Lista cancelada: no se compra nada de aquí.',
      tono: 'cancelado',
      avance: 0,
      indiceActual: -1,
    };
  }

  if (p.estado === 'borrador') {
    indiceActual = 0;
    mensaje = mirada === 'sede'
      ? `Lista en preparación (${total} producto${total === 1 ? '' : 's'}). Compras no la ve hasta que pulses «Enviar a Compras».`
      : `${laSede} todavía arma su lista: Compras aún no la ve.`;
  } else if (p.estado === 'enviado') {
    indiceActual = 1;
    fraccion = total > 0 ? resueltos / total : 0;
    detalles[1] = resueltos > 0 ? `${resueltos} de ${total}` : 'Esperando';
    if (resueltos === 0) {
      if (atrasada) {
        tono = 'alerta';
        mensaje = `Atrasada: era para el ${fechaCorta(p.fecha_compra)} y todavía no se compra nada.`;
      } else if (p.fecha_compra === hoy) {
        mensaje = mirada === 'compras' ? `Lista de ${laSede} lista para comprar hoy.` : 'Compras sale a comprar hoy.';
      } else {
        mensaje = `Compras la comprará el ${fechaCorta(p.fecha_compra)}.`;
      }
    } else {
      tono = atrasada ? 'alerta' : 'normal';
      const va = mirada === 'compras' ? 'Vas comprando' : 'Compras va comprando';
      mensaje = `${va}: ${comprados.length} listo${comprados.length === 1 ? '' : 's'}${extraNoHabia}, falta${faltan === 1 ? '' : 'n'} ${faltan}${atrasada ? ' (atrasada)' : ''}.`;
    }
  } else if (p.estado === 'comprado') {
    detalles[1] = `${comprados.length} de ${total}`;
    if (comprados.length === 0) {
      indiceActual = 2;
      tono = 'alerta';
      mensaje = 'No se consiguió ningún producto de esta lista.';
    } else if (revisados === 0) {
      indiceActual = 2;
      detalles[2] = 'Va a la sede';
      mensaje = mirada === 'sede'
        ? `Compras ya compró todo${entreParentesis}: va camino a tu sede. Revisa cada producto cuando llegue.`
        : mirada === 'compras'
          ? `Ya compraste todo${entreParentesis}: falta que ${laSede} lo reciba.`
          : `Compras ya compró todo${entreParentesis}: va camino a ${laSede}.`;
    } else {
      indiceActual = 3;
      fraccion = revisados / comprados.length;
      detalles[3] = `${revisados} de ${comprados.length}`;
      if (diferencias > 0) tono = 'alerta';
      const quien = mirada === 'sede' ? 'Vas revisando' : `${laSede.charAt(0).toUpperCase()}${laSede.slice(1)} va revisando`;
      mensaje = `${quien}: ${revisados} de ${comprados.length} producto${comprados.length === 1 ? '' : 's'}${diferencias > 0 ? ` · ${diferencias} con diferencias` : ''}.`;
    }
  } else {
    // recibido
    indiceActual = 4;
    detalles[1] = `${comprados.length} de ${total}`;
    detalles[3] = diferencias > 0 ? `${diferencias} con diferencias` : 'Todo conforme';
    tono = diferencias > 0 ? 'alerta' : 'listo';
    mensaje = diferencias > 0
      ? `Recibido con ${diferencias} diferencia${diferencias === 1 ? '' : 's'}${entreParentesis}. Finanzas ya lo ve.`
      : `Recibido y revisado: todo conforme${entreParentesis}.`;
  }

  const pasos: PasoSeguimiento[] = TITULOS.map(([clave, titulo], i) => ({
    clave,
    // Mientras la lista no se envía, el primer paso dice lo que falta hacer.
    titulo: i === 0 && p.estado === 'borrador' ? 'Por enviar' : titulo,
    estado: i < indiceActual ? 'hecho' : i === indiceActual ? 'actual' : 'pendiente',
    hora: i <= indiceActual ? horas[i] ?? null : null,
    detalle: detalles[i] ?? null,
  }));
  // La barra llega al punto del paso actual y avanza hacia el siguiente con la fracción
  // (comprando 6 de 9 → entre «Comprando» y «En camino»; revisando → entre «En camino» y «Recibido»).
  const base = indiceActual >= 4 ? 3 : indiceActual === 3 ? 2 : indiceActual;
  const avance = Math.min(1, (base + fraccion) / 3);
  return { pasos, mensaje, tono, avance, indiceActual };
}
