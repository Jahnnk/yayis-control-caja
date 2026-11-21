import { buscarParecidos } from '@/lib/productos-parecidos';
import type { Producto } from '@/types';

/**
 * «¿Quisiste decir LIMÓN?» mientras se escribe un producto nuevo. Evita crear «LIMON» si ya existe «LIMÓN».
 * Si es el mismo nombre sin tildes, el sistema usará el que ya existe; si solo se parece, la persona decide.
 */
export function AvisoParecido({ nombre, productos, descartado, onUsar, onDescartar }: {
  nombre: string;
  productos: Producto[];
  /** La persona ya dijo «No, es otro producto» para este nombre. */
  descartado: boolean;
  onUsar: (nombreExistente: string) => void;
  onDescartar: () => void;
}) {
  const { igual, parecidos } = buscarParecidos(nombre, productos);
  const limpio = nombre.trim().replace(/\s+/g, ' ').toLocaleUpperCase('es-PE');
  if (igual) {
    if (igual.nombre === limpio) return null;
    return (
      <span className="flex w-full flex-wrap items-center gap-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
        ¿Quisiste decir <strong>{igual.nombre}</strong>? Ya existe: se usará ese.
        <button type="button" onClick={() => onUsar(igual.nombre)} className="font-semibold text-yayis-green underline">Usar {igual.nombre}</button>
      </span>
    );
  }
  if (parecidos.length === 0 || descartado) return null;
  return (
    <span className="flex w-full flex-wrap items-center gap-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
      ¿Quisiste decir {parecidos.map((p, i) => (
        <span key={p.id}>{i > 0 && ' o '}<button type="button" onClick={() => onUsar(p.nombre)} className="font-semibold text-yayis-green underline">{p.nombre}</button></span>
      ))}?
      <button type="button" onClick={onDescartar} className="text-muted-foreground underline">No, es otro producto</button>
    </span>
  );
}

/** ¿Falta que la persona responda «¿Quisiste decir…?» antes de crear el producto? */
export function faltaResponderParecido(nombre: string, productos: Producto[], descartado: boolean): string | null {
  const { igual, parecidos } = buscarParecidos(nombre, productos);
  if (igual || descartado || parecidos.length === 0) return null;
  return `¿Quisiste decir ${parecidos.map(p => p.nombre).join(' o ')}? Elige uno o pulsa «No, es otro producto».`;
}
