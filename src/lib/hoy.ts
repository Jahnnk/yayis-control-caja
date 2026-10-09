import { DIAS_PARA_RENDIR, type Alerta } from '@/lib/alertas';
import { fechaCorta, proximasFechasCompra, sumarDias } from '@/lib/compras';
import { esEfectivoPendiente } from '@/lib/deliverys';
import { formatMonto, roundTwo } from '@/lib/utils';
import type { PedidoConItems } from '@/types';
import type { EntregaDetalle } from '@/hooks/useEntregas';
import type { DeliveryDetalle } from '@/hooks/useDeliverys';

// «Hoy»: lo que le toca hacer a cada quien al entrar, con un botón directo a la pantalla donde se hace.
// Reglas a la vista (una tarea solo aparece si hay algo que hacer; si no hay nada, la pantalla dice «todo al día»).
//
// Administrador (su sede):
//  - Recibir mercadería: listas que Compras ya compró (estado «comprado»).
//  - Cerrar la rendición: entregas que Compras ya rindió.
//  - Lista vencida sin enviar: borrador cuyo día de compra ya pasó.
//  - Armar / enviar la lista del próximo día de compra, si ese día es hoy o mañana.
//  - Entregar dinero a Compras: si hoy o mañana es día de compra y Compras no tiene dinero de la sede.
//  - Recibir el efectivo de deliverys que Compras tiene por entregar.
//  - Volver a pedir lo que no había (últimos 7 días, sin «Volver a pedir» aún).
// Compras:
//  - Salir a comprar: productos pendientes de listas enviadas para hoy o antes (atrasados aparte).
//  - Subir fotos pendientes (no se puede rendir sin ellas).
//  - Rendir cuentas: entregas abiertas con DIAS_PARA_RENDIR − 2 días o más.
//  - Entregar el efectivo de deliverys a cada sede.
// Gerencia:
//  - Las alertas del Panel de Finanzas, agrupadas por tipo (las «alta» primero).
//  - Reponer la caja de cada sede con gastos pendientes de reposición.

export type Urgencia = 'ahora' | 'hoy' | 'pronto';

export type IconoTarea =
  | 'recibir' | 'rendicion' | 'lista' | 'dinero' | 'delivery' | 'repedir'
  | 'ruta' | 'foto' | 'rendir' | 'alerta' | 'reponer';

export interface Tarea {
  clave: string;
  urgencia: Urgencia;
  icono: IconoTarea;
  titulo: string;
  detalle: string;
  /** Texto del botón. */
  boton: string;
  /** Pantalla donde se hace. */
  ir: string;
  /** Si la tarea es de una sede, Gerencia cambia a esa sede antes de ir. */
  sedeId?: string;
}

const ORDEN: Record<Urgencia, number> = { ahora: 0, hoy: 1, pronto: 2 };
export const ordenarTareas = (t: Tarea[]) => t.slice().sort((a, b) => ORDEN[a.urgencia] - ORDEN[b.urgencia]);

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
const gastado = (e: EntregaDetalle) => e.compras.reduce((s, c) => roundTwo(s + Number(c.total)), 0);
const diasEntre = (desde: string, hasta: string) =>
  Math.round((new Date(`${hasta}T12:00:00`).getTime() - new Date(`${desde}T12:00:00`).getTime()) / 86_400_000);

/** «hoy», «mañana» o «el jue 9 oct». */
function cuando(fecha: string, hoy: string) {
  if (fecha === hoy) return 'hoy';
  if (fecha === sumarDias(hoy, 1)) return 'mañana';
  return `el ${fechaCorta(fecha)}`;
}

export function tareasDeAdministrador(d: {
  hoy: string;
  sede: { nombre: string; dias_compra: number[] } | null;
  pedidos: PedidoConItems[];
  entregas: EntregaDetalle[];
  deliverys: DeliveryDetalle[];
  /** Lo que le queda del monto semanal (para sugerir entregar dinero a Compras). */
  quedaSemanal: number;
}): Tarea[] {
  const { hoy, pedidos, entregas } = d;
  const t: Tarea[] = [];

  const porRecibir = pedidos.filter(p => p.estado === 'comprado');
  if (porRecibir.length > 0) {
    const productos = porRecibir.reduce((n, p) => n + p.pedido_items.filter(i => i.estado === 'comprado' && !i.entregado_at).length, 0);
    t.push({
      clave: 'recibir', urgencia: 'ahora', icono: 'recibir',
      titulo: 'Recibe la mercadería',
      detalle: `Compras ya compró ${plural(porRecibir.length, 'una lista', `${porRecibir.length} listas`)}: revisa ${productos} ${plural(productos, 'producto', 'productos')} cuando lleguen.`,
      boton: 'Recibir', ir: '/pedidos',
    });
  }

  for (const e of entregas.filter(x => x.estado === 'rendida')) {
    t.push({
      clave: `cerrar-${e.id}`, urgencia: 'ahora', icono: 'rendicion',
      titulo: 'Cierra la rendición de Compras',
      detalle: `Compras rindió la entrega del ${fechaCorta(e.fecha)}: gastó ${formatMonto(gastado(e))} y devuelve ${formatMonto(Number(e.vuelto ?? 0))}. Al cerrarla pasa a reposición.`,
      boton: 'Revisar y cerrar', ir: '/recepcion',
    });
  }

  for (const p of pedidos.filter(x => x.estado === 'borrador' && x.fecha_compra < hoy)) {
    const n = p.pedido_items.length;
    t.push({
      clave: `vencida-${p.id}`, urgencia: 'ahora', icono: 'lista',
      titulo: `Tu lista del ${fechaCorta(p.fecha_compra)} nunca se envió`,
      detalle: n === 0 ? 'Está vacía: descártala.' : `Tiene ${n} ${plural(n, 'producto', 'productos')} y Compras no la vio: envíala (le llega como atrasada) o descártala.`,
      boton: 'Ver la lista', ir: '/pedidos',
    });
  }

  // Próximo día de compra (hoy o mañana): la lista tiene que estar enviada.
  const proximo = proximasFechasCompra(d.sede?.dias_compra ?? [], hoy, 1)[0];
  if (proximo && proximo <= sumarDias(hoy, 1)) {
    const lista = pedidos.find(p => !p.urgente && p.fecha_compra === proximo && p.estado !== 'cancelado');
    if (!lista) {
      t.push({
        clave: 'armar', urgencia: proximo === hoy ? 'ahora' : 'hoy', icono: 'lista',
        titulo: `Arma tu lista para ${cuando(proximo, hoy)}`,
        detalle: `Compras sale a comprar para ${d.sede?.nombre ?? 'tu sede'} ${cuando(proximo, hoy)} y todavía no tienes lista.`,
        boton: 'Armar lista', ir: '/pedidos',
      });
    } else if (lista.estado === 'borrador') {
      const n = lista.pedido_items.length;
      t.push({
        clave: 'enviar', urgencia: proximo === hoy ? 'ahora' : 'hoy', icono: 'lista',
        titulo: `Envía tu lista de ${cuando(proximo, hoy)}`,
        detalle: n === 0 ? 'La lista está vacía: agrega los productos y envíala.' : `Tiene ${n} ${plural(n, 'producto', 'productos')}. Compras no la ve hasta que la envíes.`,
        boton: 'Ver y enviar', ir: '/pedidos',
      });
    }

    const enManos = roundTwo(entregas.filter(e => e.estado === 'abierta').reduce((s, e) => s + Number(e.monto) - gastado(e), 0));
    if (enManos <= 0 && d.quedaSemanal > 0) {
      t.push({
        clave: 'entregar', urgencia: 'hoy', icono: 'dinero',
        titulo: 'Entrega dinero a Compras',
        detalle: `Compras compra para tu sede ${cuando(proximo, hoy)} y no tiene dinero de ${d.sede?.nombre ?? 'tu sede'}. Te quedan ${formatMonto(d.quedaSemanal)} del monto semanal.`,
        boton: 'Entregar dinero', ir: '/recepcion',
      });
    }
  }

  const efectivo = d.deliverys.filter(esEfectivoPendiente);
  if (efectivo.length > 0) {
    const total = efectivo.reduce((s, x) => roundTwo(s + Number(x.cobrado)), 0);
    t.push({
      clave: 'delivery', urgencia: 'hoy', icono: 'delivery',
      titulo: 'Recibe el efectivo de deliverys',
      detalle: `Compras tiene ${formatMonto(total)} de ${efectivo.length} ${plural(efectivo.length, 'delivery', 'deliverys')}: cuéntalo y confírmalo.`,
      boton: 'Recibir efectivo', ir: '/deliverys',
    });
  }

  const desde = sumarDias(hoy, -7);
  const noHabia = pedidos.filter(p => p.fecha_compra >= desde).flatMap(p => p.pedido_items).filter(i => i.estado === 'no_habia' && !i.repedido_at);
  if (noHabia.length > 0) {
    t.push({
      clave: 'repedir', urgencia: 'pronto', icono: 'repedir',
      titulo: 'Vuelve a pedir lo que no había',
      detalle: `${noHabia.length} ${plural(noHabia.length, 'producto no se consiguió', 'productos no se consiguieron')} esta semana: ${noHabia.slice(0, 3).map(i => i.productos?.nombre ?? '').filter(Boolean).join(', ')}${noHabia.length > 3 ? '…' : ''}.`,
      boton: 'Volver a pedir', ir: '/pedidos',
    });
  }

  return ordenarTareas(t);
}

export function tareasDeCompras(d: {
  hoy: string;
  /** Listas de la ruta: enviadas para hoy o antes. */
  ruta: PedidoConItems[];
  entregas: EntregaDetalle[];
  deliverys: DeliveryDetalle[];
}): Tarea[] {
  const { hoy } = d;
  const t: Tarea[] = [];

  const enviadas = d.ruta.filter(p => p.estado === 'enviado');
  const pendientes = enviadas.flatMap(p => p.pedido_items.filter(i => i.estado === 'pendiente').map(i => ({ i, p })));
  if (pendientes.length > 0) {
    const atrasados = pendientes.filter(x => x.p.fecha_compra < hoy).length;
    const urgentes = pendientes.filter(x => x.i.urgente).length;
    const sedes = Array.from(new Set(pendientes.map(x => (x.p as PedidoConItems & { sedes?: { nombre: string } | null }).sedes?.nombre).filter(Boolean)));
    t.push({
      clave: 'ruta', urgencia: 'ahora', icono: 'ruta',
      titulo: `Sal a comprar: ${pendientes.length} ${plural(pendientes.length, 'producto', 'productos')}`,
      detalle: [
        sedes.length > 0 ? `Para ${sedes.join(', ')}` : null,
        urgentes > 0 ? `${urgentes} ${plural(urgentes, 'urgente', 'urgentes')}` : null,
        atrasados > 0 ? `${atrasados} ${plural(atrasados, 'atrasado', 'atrasados')} de días anteriores` : null,
      ].filter(Boolean).join(' · ') + '.',
      boton: 'Ir a la ruta', ir: '/ruta',
    });
  }

  const abiertas = d.entregas.filter(e => e.estado === 'abierta');
  const conFoto = abiertas.flatMap(e => e.compras).filter(c => c.evidencia_pendiente);
  if (conFoto.length > 0) {
    t.push({
      clave: 'fotos', urgencia: 'ahora', icono: 'foto',
      titulo: `Sube ${plural(conFoto.length, 'la foto pendiente', `las fotos de ${conFoto.length} compras`)}`,
      detalle: 'Sin las fotos no puedes rendir cuentas ni el administrador puede cerrar.',
      boton: 'Subir fotos', ir: '/rendicion',
    });
  }

  // Rendir: una tarjeta por sede, con sus entregas que ya llevan varios días.
  const porRendir = new Map<string, EntregaDetalle[]>();
  for (const e of abiertas) {
    if (diasEntre(e.fecha, hoy) < DIAS_PARA_RENDIR - 2) continue;
    porRendir.set(e.sede_id, [...(porRendir.get(e.sede_id) ?? []), e]);
  }
  for (const [sedeId, lista] of porRendir) {
    const dias = Math.max(...lista.map(e => diasEntre(e.fecha, hoy)));
    const recibido = lista.reduce((s, e) => roundTwo(s + Number(e.monto)), 0);
    const gasto = lista.reduce((s, e) => roundTwo(s + gastado(e)), 0);
    t.push({
      clave: `rendir-${sedeId}`, urgencia: dias >= DIAS_PARA_RENDIR ? 'ahora' : 'hoy', icono: 'rendir',
      titulo: `Rinde cuentas a ${lista[0]!.sedes?.nombre ?? 'la sede'}`,
      detalle: lista.length === 1
        ? `La entrega del ${fechaCorta(lista[0]!.fecha)} lleva ${dias} días: recibiste ${formatMonto(recibido)} y gastaste ${formatMonto(gasto)}.`
        : `${lista.length} entregas, la más antigua de hace ${dias} días: recibiste ${formatMonto(recibido)} y gastaste ${formatMonto(gasto)}.`,
      boton: 'Rendir', ir: '/rendicion',
    });
  }

  const porSede = new Map<string, { nombre: string; total: number; n: number }>();
  for (const x of d.deliverys.filter(esEfectivoPendiente)) {
    const s = porSede.get(x.sede_id) ?? { nombre: x.sedes?.nombre ?? 'la sede', total: 0, n: 0 };
    porSede.set(x.sede_id, { ...s, total: roundTwo(s.total + Number(x.cobrado)), n: s.n + 1 });
  }
  for (const [sedeId, s] of porSede) {
    t.push({
      clave: `delivery-${sedeId}`, urgencia: 'hoy', icono: 'delivery',
      titulo: `Entrega ${formatMonto(s.total)} de deliverys a ${s.nombre}`,
      detalle: `Es el efectivo de ${s.n} ${plural(s.n, 'delivery', 'deliverys')}. El administrador lo cuenta y lo confirma.`,
      boton: 'Ver deliverys', ir: '/deliverys',
    });
  }

  return ordenarTareas(t);
}

export function tareasDeGerencia(d: {
  alertas: Alerta[];
  /** Pendiente de reposición por sede. */
  porReponer: { sedeId: string; nombre: string; total: number; gastos: number }[];
}): Tarea[] {
  const t: Tarea[] = [];

  // Alertas agrupadas por tipo: una tarjeta por tipo, con las sedes involucradas.
  const porTipo = new Map<string, Alerta[]>();
  for (const a of d.alertas) porTipo.set(a.tipo, [...(porTipo.get(a.tipo) ?? []), a]);
  for (const [tipo, lista] of porTipo) {
    const alta = lista.some(a => a.nivel === 'alta');
    const sedes = Array.from(new Set(lista.map(a => a.sedeNombre)));
    const una = lista.length === 1 ? lista[0]! : null;
    const mismaSede = sedes.length === 1 && lista.every(a => a.ir && a.ir === lista[0]!.ir);
    t.push({
      clave: `alerta-${tipo}`, urgencia: alta ? 'ahora' : 'hoy', icono: 'alerta',
      titulo: una ? una.titulo : `${tipo} (${lista.length})`,
      detalle: una ? `${una.sedeNombre} · ${una.detalle}` : `${sedes.join(', ')}. ${lista[0]!.titulo}${lista.length > 1 ? ' y otras.' : '.'}`,
      boton: 'Ver',
      ir: mismaSede ? lista[0]!.ir! : '/finanzas',
      sedeId: mismaSede ? lista[0]!.sedeId : undefined,
    });
  }

  for (const s of d.porReponer.filter(x => x.total > 0)) {
    t.push({
      clave: `reponer-${s.sedeId}`, urgencia: 'pronto', icono: 'reponer',
      titulo: `Repón la caja de ${s.nombre}`,
      detalle: `${formatMonto(s.total)} en ${s.gastos} ${plural(s.gastos, 'gasto pendiente', 'gastos pendientes')} de reposición.`,
      boton: 'Reponer', ir: '/resumen', sedeId: s.sedeId,
    });
  }

  return ordenarTareas(t);
}
