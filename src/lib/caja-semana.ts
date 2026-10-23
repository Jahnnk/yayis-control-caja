import { roundTwo } from '@/lib/utils';
import { lunesDe } from '@/lib/dinero-semana';
import { sumarDias } from '@/lib/compras';

// ====== La caja chica de la semana (pedido de Jahnn, 23-oct-2026) ======
// Lo que el administrador puede gastar por semana es su fondo de caja chica: S/ 700 en Fonavi y en
// Centro, S/ 1,000 en Atelier. Cuenta TODO lo que sale de la caja de la sede de lunes a domingo:
//   · los gastos que registra el administrador, y
//   · lo que Fabio compró al contado para la sede (cada compra una vez; el gasto que nace de una
//     compra al cerrar la rendición no se suma de nuevo).
// Lo comprado a crédito no cuenta: lo paga Gerencia, no sale de la caja.
// Pasarse se puede (una urgencia no espera), pero hay que escribir el motivo y le llega a Finanzas.

export interface CajaSemana {
  /** Lunes y domingo de la semana. */
  desde: string;
  hasta: string;
  /** El fondo de caja chica de la sede (tope de la semana). null = la sede no tiene fondo configurado. */
  tope: number | null;
  gastosAdmin: number;
  comprasContado: number;
  gastado: number;
}

export const semanaDe = (fecha: string) => {
  const desde = lunesDe(fecha);
  return { desde, hasta: sumarDias(desde, 6) };
};

export function armarCajaSemana(input: { fecha: string; tope: number | null; gastosAdmin: number; comprasContado: number }): CajaSemana {
  const { desde, hasta } = semanaDe(input.fecha);
  return {
    desde, hasta, tope: input.tope && input.tope > 0 ? input.tope : null,
    gastosAdmin: roundTwo(input.gastosAdmin), comprasContado: roundTwo(input.comprasContado),
    gastado: roundTwo(input.gastosAdmin + input.comprasContado),
  };
}

/** ¿Lo que se va a gastar pasa el tope de la semana? null = sin tope. */
export function pasaCajaSemana(c: CajaSemana | null, montoNuevo: number): { quedaria: number; pasa: boolean } | null {
  if (!c?.tope) return null;
  const quedaria = roundTwo(c.tope - c.gastado - montoNuevo);
  return { quedaria, pasa: quedaria < 0 && montoNuevo > 0 };
}

/** «lun 26/10 – dom 1/11». */
export function rangoSemana(c: Pick<CajaSemana, 'desde' | 'hasta'>): string {
  const dm = (f: string) => `${Number(f.slice(8, 10))}/${Number(f.slice(5, 7))}`;
  return `lun ${dm(c.desde)} – dom ${dm(c.hasta)}`;
}

/** El texto que se agrega al motivo para que Finanzas sepa que se pasó de la caja chica de la semana. */
export function notaSemana(c: CajaSemana, montoNuevo: number): string {
  return `pasa la caja chica de la semana (${rangoSemana(c)}): S/ ${roundTwo(c.gastado + montoNuevo).toFixed(2)} de S/ ${c.tope!.toFixed(2)}`;
}
