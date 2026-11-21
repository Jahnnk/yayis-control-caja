import { claveNombre } from '@/lib/compras';

/** Lo mínimo de un producto del catálogo para buscar parecidos. */
interface ConNombre { id: string; nombre: string; activo?: boolean }

/** Sin plural al final: «limones» y «limón» se reconocen como el mismo producto. */
function raiz(clave: string): string {
  return clave.replace(/(es|s)$/, '');
}

/** Letras que hay que cambiar para pasar de una palabra a otra (para atrapar «HARIAN» vs «HARINA»). */
function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}

/**
 * Antes de crear un producto: ¿ya existe con otra forma de escribirlo?
 * · `igual`: el mismo nombre sin tildes ni mayúsculas («LIMON» = «LIMÓN»). Se usa ese, nunca se crea otro.
 * · `parecidos`: casi igual (plural o una letra distinta). Se pregunta «¿Quisiste decir…?».
 */
export function buscarParecidos<T extends ConNombre>(nombre: string, productos: T[]): { igual: T | null; parecidos: T[] } {
  const clave = claveNombre(nombre);
  if (clave.length < 3) return { igual: null, parecidos: [] };
  const igual = productos.find(p => claveNombre(p.nombre) === clave) ?? null;
  if (igual) return { igual, parecidos: [] };
  const r = raiz(clave);
  const parecidos = productos
    .filter(p => p.activo !== false)
    .map(p => ({ p, k: claveNombre(p.nombre) }))
    .filter(({ k }) => raiz(k) === r || (Math.min(k.length, clave.length) >= 5 && distancia(k, clave) <= 1))
    .slice(0, 3)
    .map(({ p }) => p);
  return { igual: null, parecidos };
}
