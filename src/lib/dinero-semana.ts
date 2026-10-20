import { diaSemanaDe, diferenciaDeCierre, sumarDias } from '@/lib/compras';
import { roundTwo } from '@/lib/utils';
import type { EntregaDetalle } from '@/hooks/useEntregas';

// ====== El dinero de Compras de toda la semana, no solo de la última entrega ======
// Antes cada pantalla mostraba una sola entrega y, con varias entregas chicas en la semana,
// ni el administrador ni Compras veían el total (ej. «le di S/ 712.50 y dice S/ 400»).

/** Lunes de la semana de una fecha (la semana va de lunes a domingo). */
export function lunesDe(fecha: string): string {
  return sumarDias(fecha, -((diaSemanaDe(fecha) + 6) % 7));
}

/** La entrega que abre el sistema solo con el saldo que pasó de la semana anterior (no es dinero nuevo). */
export function esArrastre(e: Pick<EntregaDetalle, 'notas'>): boolean {
  return (e.notas ?? '').startsWith('Saldo que continúa');
}

const gastado = (e: EntregaDetalle) => e.compras.reduce((t, c) => roundTwo(t + Number(c.total)), 0);

export interface SemanaSede {
  sedeId: string;
  sede: string;
  /** Entregas de dinero nuevo de esta semana. */
  entregas: number;
  entregado: number;
  /** Saldo que venía de la semana anterior. */
  arrastre: number;
  gastado: number;
  /** Vuelto que Compras entregó en mano (rendiciones de esta semana ya cerradas). */
  vuelto: number;
  /** Lo que Compras tiene ahora sin gastar (entregas abiertas o rendidas). */
  enManos: number;
  /** Lo que la sede le debe a Compras por lo que puso de su bolsillo y aún no le devolvió. */
  debeACompras: number;
}

/** Resume la semana por sede con todas las entregas (abiertas, rendidas y cerradas). */
export function resumenSemana(todas: EntregaDetalle[], lunes: string): SemanaSede[] {
  const porSede = new Map<string, SemanaSede>();
  const fila = (e: EntregaDetalle) => {
    let f = porSede.get(e.sede_id);
    if (!f) {
      f = { sedeId: e.sede_id, sede: e.sedes?.nombre ?? 'Sede', entregas: 0, entregado: 0, arrastre: 0, gastado: 0, vuelto: 0, enManos: 0, debeACompras: 0 };
      porSede.set(e.sede_id, f);
    }
    return f;
  };

  for (const e of todas) {
    const f = fila(e);
    const g = gastado(e);
    if (e.fecha >= lunes) {
      if (esArrastre(e)) f.arrastre = roundTwo(f.arrastre + Number(e.monto));
      else { f.entregas += 1; f.entregado = roundTwo(f.entregado + Number(e.monto)); }
      f.gastado = roundTwo(f.gastado + g);
      if (e.estado === 'cerrada') f.vuelto = roundTwo(f.vuelto + Number(e.vuelto_recibido ?? 0));
    }
    if (e.estado !== 'cerrada') f.enManos = roundTwo(f.enManos + Number(e.monto) - g);
    else {
      const d = diferenciaDeCierre(e.monto, g, e.vuelto_recibido, e.saldo_continua, e.devuelto_a_compras);
      if (d < 0) f.debeACompras = roundTwo(f.debeACompras - d);
    }
  }
  return Array.from(porSede.values()).sort((a, b) => a.sede.localeCompare(b.sede));
}

/** Rendiciones cerradas en las que la sede le debe a Compras lo que puso de su bolsillo. */
export function deudasConCompras(cerradas: EntregaDetalle[]): { entrega: EntregaDetalle; monto: number }[] {
  return cerradas
    .map(e => ({ entrega: e, d: diferenciaDeCierre(e.monto, gastado(e), e.vuelto_recibido, e.saldo_continua, e.devuelto_a_compras) }))
    .filter(x => x.d < 0)
    .map(x => ({ entrega: x.entrega, monto: roundTwo(-x.d) }));
}
