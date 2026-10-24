import { diaSemanaDe, sumarDias } from '@/lib/compras';
import { roundTwo } from '@/lib/utils';
import type { MotivoViaje, TipoViaje, Viaje, CargaCombustible } from '@/types';

// ====== Reglas de los viajes de Compras (Fase 1: medir) ======
// - El primer viaje de COMPRAS del día es el planificado; desde el segundo es «extra» y lleva motivo.
// - Los viajes de deliverys (por la tarde) se cuentan aparte y no llevan motivo.
// - Las compras y deliverys se asocian a un viaje por la hora en que se registraron.
// - Una lista es «tardía» si se envió el mismo día de la compra (o después): Compras debe tenerla al empezar el día.

/** Lo que Gerencia de Finanzas le da cada lunes para gasolina. */
export const GASOLINA_SEMANAL = 20;

/** Más de esto en un solo viaje probablemente es un error al anotar el km. */
export const KM_SOSPECHOSO = 80;

export const MOTIVOS_VIAJE: { valor: MotivoViaje; texto: string; ayuda: string }[] = [
  { valor: 'lista_tardia', texto: 'Lista tardía o urgente', ayuda: 'Una sede pidió algo después' },
  { valor: 'no_habia', texto: 'No había y volví', ayuda: 'Tuve que ir a otro lugar' },
  { valor: 'no_cabia', texto: 'No cabía en la mochila', ayuda: 'Era demasiado para un viaje' },
  { valor: 'olvido', texto: 'Me olvidé algo', ayuda: '' },
  { valor: 'otro', texto: 'Otro motivo', ayuda: 'Escribe cuál' },
];

export const MOTIVO_LABEL: Record<MotivoViaje, string> = Object.fromEntries(
  MOTIVOS_VIAJE.map(m => [m.valor, m.texto]),
) as Record<MotivoViaje, string>;

/** Hora de Lima (0-23). */
export function horaLima(fecha = new Date()): number {
  return Number(fecha.toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hourCycle: 'h23' }));
}

/** Compras por la mañana, deliverys por la tarde: se propone solo y se puede cambiar. */
export function tipoSugerido(hora = horaLima()): TipoViaje {
  return hora < 13 ? 'compras' : 'deliverys';
}

/** ¿Este viaje nuevo es extra? Solo los de compras, si ya hubo otro de compras ese día. */
export function esViajeExtra(tipo: TipoViaje, viajesDelDia: Pick<Viaje, 'tipo'>[]): boolean {
  return tipo === 'compras' && viajesDelDia.some(v => v.tipo === 'compras');
}

export function kmRecorridos(v: Pick<Viaje, 'km_salida' | 'km_regreso'>): number | null {
  return v.km_regreso === null ? null : roundTwo(Number(v.km_regreso) - Number(v.km_salida));
}

export function minutosDeViaje(v: Pick<Viaje, 'salida_at' | 'regreso_at'>): number | null {
  if (!v.regreso_at) return null;
  return Math.round((new Date(v.regreso_at).getTime() - new Date(v.salida_at).getTime()) / 60000);
}

export function duracionTexto(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
}

/** Día de Lima de una marca de tiempo. */
export function diaLima(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

/** Lunes que caen en el periodo: cada lunes son S/ 20 de gasolina. */
export function lunesEnPeriodo(desde: string, hasta: string): number {
  let n = 0;
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) if (diaSemanaDe(f) === 1) n += 1;
  return n;
}

// ====== Indicadores para Gerencia ======

export interface CompraParaViaje { created_at: string; total: number; registrado_por: string; proveedor: string | null }
export interface DeliveryParaViaje { created_at: string; registrado_por: string }
export interface ListaParaViaje { sede_id: string; sede: string; fecha_compra: string; enviado_at: string | null; urgente: boolean; estado: string }

export interface DetalleViaje {
  viaje: Viaje;
  km: number | null;
  minutos: number | null;
  proveedores: string[];
  compras: number;
  comprado: number;
  deliverys: number;
}

export interface IndicadoresViajes {
  viajesCompras: number;
  viajesDeliverys: number;
  extras: number;
  porMotivo: { motivo: MotivoViaje; cantidad: number }[];
  sinCerrar: number;
  km: number;
  kmCompras: number;
  kmDeliverys: number;
  minutosPromedio: number | null;
  gasolinaCargada: number;
  gasolinaAsignada: number;
  solesPorKm: number | null;
  comprado: number;
  /** Cuánto de gasolina cuesta comprar S/ 100. */
  transportePor100: number | null;
  /** Por sede: listas tardías, urgentes y viajes extra que causó. */
  porSede: { sede: string; tardias: number; urgentes: number; extras: number }[];
  detalle: DetalleViaje[];
}

/** Junta viajes, gasolina, compras, deliverys y listas de un periodo en los indicadores de la semana. */
export function calcularIndicadoresViajes(
  viajes: Viaje[],
  cargas: CargaCombustible[],
  compras: CompraParaViaje[],
  deliverys: DeliveryParaViaje[],
  listas: ListaParaViaje[],
  sedes: { id: string; nombre: string }[],
  desde: string,
  hasta: string,
  hoy: string,
): IndicadoresViajes {
  const ordenados = [...viajes].sort((a, b) => a.salida_at.localeCompare(b.salida_at));
  const detalle: DetalleViaje[] = ordenados.map(v => {
    const fin = v.regreso_at ?? new Date().toISOString();
    const dentro = (x: { created_at: string; registrado_por: string }) =>
      x.registrado_por === v.conductor && x.created_at >= v.salida_at && x.created_at <= fin;
    const suyas = compras.filter(dentro);
    return {
      viaje: v,
      km: kmRecorridos(v),
      minutos: minutosDeViaje(v),
      proveedores: Array.from(new Set(suyas.map(c => c.proveedor).filter((p): p is string => !!p))),
      compras: suyas.length,
      comprado: suyas.reduce((t, c) => roundTwo(t + Number(c.total)), 0),
      deliverys: deliverys.filter(dentro).length,
    };
  });

  const cerrados = detalle.filter(d => d.km !== null);
  const km = cerrados.reduce((t, d) => roundTwo(t + (d.km ?? 0)), 0);
  const kmDe = (tipo: TipoViaje) => cerrados.filter(d => d.viaje.tipo === tipo).reduce((t, d) => roundTwo(t + (d.km ?? 0)), 0);
  const conTiempo = detalle.filter(d => d.minutos !== null);
  const extras = viajes.filter(v => v.es_extra);

  const motivos = new Map<MotivoViaje, number>();
  for (const v of extras) if (v.motivo) motivos.set(v.motivo, (motivos.get(v.motivo) ?? 0) + 1);

  const gasolinaCargada = cargas.reduce((t, c) => roundTwo(t + Number(c.monto)), 0);
  const comprado = compras.reduce((t, c) => roundTwo(t + Number(c.total)), 0);

  const nombreSede = new Map(sedes.map(s => [s.id, s.nombre]));
  const porSede = new Map<string, { sede: string; tardias: number; urgentes: number; extras: number }>();
  const filaSede = (id: string, nombre?: string) => {
    let f = porSede.get(id);
    if (!f) { f = { sede: nombre ?? nombreSede.get(id) ?? 'Sede', tardias: 0, urgentes: 0, extras: 0 }; porSede.set(id, f); }
    return f;
  };
  for (const l of listas) {
    if (l.estado === 'borrador' || l.estado === 'cancelado') continue;
    if (l.urgente) filaSede(l.sede_id, l.sede).urgentes += 1;
    else if (l.enviado_at && diaLima(l.enviado_at) >= l.fecha_compra) filaSede(l.sede_id, l.sede).tardias += 1;
  }
  for (const v of extras) if (v.motivo_sede_id) filaSede(v.motivo_sede_id).extras += 1;

  return {
    viajesCompras: viajes.filter(v => v.tipo === 'compras').length,
    viajesDeliverys: viajes.filter(v => v.tipo === 'deliverys').length,
    extras: extras.length,
    porMotivo: Array.from(motivos.entries()).map(([motivo, cantidad]) => ({ motivo, cantidad })).sort((a, b) => b.cantidad - a.cantidad),
    // Un viaje abierto hoy es normal (sigue en la calle); de días anteriores, se olvidó de marcar «Volví».
    sinCerrar: viajes.filter(v => !v.regreso_at && v.fecha < hoy).length,
    km,
    kmCompras: kmDe('compras'),
    kmDeliverys: kmDe('deliverys'),
    minutosPromedio: conTiempo.length ? Math.round(conTiempo.reduce((t, d) => t + (d.minutos ?? 0), 0) / conTiempo.length) : null,
    gasolinaCargada,
    gasolinaAsignada: GASOLINA_SEMANAL * lunesEnPeriodo(desde, hasta),
    solesPorKm: km > 0 && gasolinaCargada > 0 ? roundTwo(gasolinaCargada / km) : null,
    comprado,
    transportePor100: comprado > 0 && gasolinaCargada > 0 ? roundTwo((gasolinaCargada / comprado) * 100) : null,
    porSede: Array.from(porSede.values()).filter(f => f.tardias + f.urgentes + f.extras > 0).sort((a, b) => (b.tardias + b.urgentes + b.extras) - (a.tardias + a.urgentes + a.extras)),
    detalle: detalle.reverse(),
  };
}

// ====== Recorrido de la semana (Resumen de Gerencia) ======

export interface DiaRecorrido {
  fecha: string;
  viajes: number;
  kmCompras: number;
  kmDeliverys: number;
  km: number;
}

export interface RecorridoSemana {
  dias: DiaRecorrido[];
  km: number;
  kmCompras: number;
  kmDeliverys: number;
  /** Lo que cargó de gasolina esta semana. */
  gasolinaCargada: number;
  /** Costo por km con las últimas semanas (una sola carga no dice cuánto se gastó: a veces llena el tanque). */
  costoPorKm: number | null;
  semanasDelCosto: number;
  /** Gasolina que necesitaron los km de esta semana, al costo por km de las últimas semanas. */
  gasolinaNecesaria: number | null;
}

/**
 * Km por día de la semana que empieza en `lunes` y si alcanzan los S/ 20 de gasolina.
 * `viajes` y `cargas` deben traer también las semanas anteriores (desde `desdeCosto`) para el costo por km.
 */
export function recorridoSemana(viajes: Viaje[], cargas: CargaCombustible[], lunes: string, desdeCosto: string): RecorridoSemana {
  const domingo = sumarDias(lunes, 6);
  const cerrados = viajes.filter(v => v.km_regreso !== null);
  const dias: DiaRecorrido[] = [];
  for (let f = lunes; f <= domingo; f = sumarDias(f, 1)) {
    const delDia = cerrados.filter(v => v.fecha === f);
    const kmTipo = (t: TipoViaje) => delDia.filter(v => v.tipo === t).reduce((s, v) => roundTwo(s + (kmRecorridos(v) ?? 0)), 0);
    const kmCompras = kmTipo('compras');
    const kmDeliverys = kmTipo('deliverys');
    dias.push({ fecha: f, viajes: delDia.length, kmCompras, kmDeliverys, km: roundTwo(kmCompras + kmDeliverys) });
  }
  const suma = (xs: number[]) => xs.reduce((s, x) => roundTwo(s + x), 0);
  const km = suma(dias.map(d => d.km));

  // Costo por km: toda la gasolina y todos los km desde `desdeCosto` hasta el domingo.
  const enRango = (fecha: string) => fecha >= desdeCosto && fecha <= domingo;
  const kmRango = suma(cerrados.filter(v => enRango(v.fecha)).map(v => kmRecorridos(v) ?? 0));
  const gasRango = suma(cargas.filter(c => enRango(c.fecha)).map(c => Number(c.monto)));
  const costoPorKm = kmRango > 0 && gasRango > 0 ? Math.round((gasRango / kmRango) * 1000) / 1000 : null;

  return {
    dias,
    km,
    kmCompras: suma(dias.map(d => d.kmCompras)),
    kmDeliverys: suma(dias.map(d => d.kmDeliverys)),
    gasolinaCargada: suma(cargas.filter(c => c.fecha >= lunes && c.fecha <= domingo).map(c => Number(c.monto))),
    costoPorKm,
    semanasDelCosto: Math.round((Date.parse(domingo) - Date.parse(desdeCosto)) / (7 * 86400000)),
    gasolinaNecesaria: costoPorKm === null ? null : roundTwo(km * costoPorKm),
  };
}
