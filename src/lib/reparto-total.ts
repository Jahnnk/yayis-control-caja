import { roundTwo } from '@/lib/utils';

export interface LineaParaRepartir {
  clave: string;
  /** Lo que costaría la línea con su precio habitual (null si no se conoce). Solo sirve para repartir proporcionalmente. */
  estimado: number | null;
}

/**
 * Reparte el total de una compra entre sus productos cuando el vendedor solo dio el total:
 * en proporción a su precio habitual; los que no tienen precio conocido reciben el promedio de los demás
 * (o partes iguales si ninguno tiene). Los centavos que sobran se asignan para que la suma sea exacta.
 */
export function repartirTotal(total: number, lineas: LineaParaRepartir[]): Map<string, number> {
  const resultado = new Map<string, number>();
  if (lineas.length === 0 || !(total > 0)) return resultado;

  const conocidos = lineas.filter(l => l.estimado !== null && l.estimado > 0).map(l => l.estimado as number);
  const promedio = conocidos.length > 0 ? conocidos.reduce((s, x) => s + x, 0) / conocidos.length : 1;
  const pesos = lineas.map(l => (l.estimado !== null && l.estimado > 0 ? l.estimado : promedio));
  const sumaPesos = pesos.reduce((s, x) => s + x, 0);

  const centavosTotal = Math.round(total * 100);
  const exactos = pesos.map(p => (p / sumaPesos) * centavosTotal);
  const base = exactos.map(Math.floor);
  let sobran = centavosTotal - base.reduce((s, x) => s + x, 0);
  // Los centavos que faltan van a quienes tienen mayor parte decimal.
  const orden = exactos.map((x, i) => ({ i, resto: x - Math.floor(x) })).sort((a, b) => b.resto - a.resto);
  for (const { i } of orden) {
    if (sobran <= 0) break;
    base[i] = (base[i] ?? 0) + 1;
    sobran -= 1;
  }
  lineas.forEach((l, i) => resultado.set(l.clave, roundTwo((base[i] ?? 0) / 100)));
  return resultado;
}
