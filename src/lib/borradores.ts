// Borrador de una compra a medio llenar.
// En el celular, si Fabio sale a otra app (a ver un precio, a la cámara) el navegador puede cerrar y recargar
// la página, y todo lo escrito se perdía. Por eso el formulario se guarda solo, mientras se llena:
//  · los datos escritos van a localStorage (se leen al instante al volver);
//  · las fotos van a IndexedDB (los archivos no caben en localStorage).
// Todo es opcional: si el navegador no deja guardar (modo privado, sin espacio), el formulario funciona igual.

const PREFIJO = 'yayis.borrador-compra.';
const MARCA = 'yayis.compra-abierta';
const BD = 'yayis-borradores';
const TABLA = 'fotos';

export type RanuraFoto = 'comprobante' | 'producto' | 'pago';

export interface BorradorCompra {
  guardadoEn: number;
  lineas: Record<string, { incluir: boolean; cantidad: string; precio: string; unit: string; ultimo: 'unit' | 'total' | null }>;
  extras: { nombre: string; cantidad: string; unidad: string; precio: string; unit: string; ultimo: 'unit' | 'total' | null }[];
  entregaId: string;
  metodo: 'efectivo' | 'cuentas';
  comprobante: 'boleta' | 'factura' | 'sin_comprobante';
  numero: string;
  observacion: string;
  /** Fabio solo sabe el total de la compra y el sistema lo reparte. */
  soloTotal?: boolean;
  totalTexto?: string;
}

export const claveBorrador = (fecha: string, sedeId: string, proveedorId: string) => `${fecha}.${sedeId}.${proveedorId}`;

export function guardarBorrador(clave: string, borrador: Omit<BorradorCompra, 'guardadoEn'>) {
  try { localStorage.setItem(PREFIJO + clave, JSON.stringify({ ...borrador, guardadoEn: Date.now() })); } catch { /* sin almacenamiento */ }
}

export function leerBorrador(clave: string): BorradorCompra | null {
  try {
    const crudo = localStorage.getItem(PREFIJO + clave);
    return crudo ? (JSON.parse(crudo) as BorradorCompra) : null;
  } catch { return null; }
}

export function borrarBorrador(clave: string) {
  try { localStorage.removeItem(PREFIJO + clave); } catch { /* nada */ }
  void borrarFotos(clave);
}

/** Recuerda qué compra estaba abierta para volver a abrirla si la página se recarga. */
export function marcarCompraAbierta(m: { fecha: string; sedeId: string; proveedorId: string }) {
  try { localStorage.setItem(MARCA, JSON.stringify(m)); } catch { /* nada */ }
}
export function leerCompraAbierta(): { fecha: string; sedeId: string; proveedorId: string } | null {
  try {
    const crudo = localStorage.getItem(MARCA);
    return crudo ? JSON.parse(crudo) : null;
  } catch { return null; }
}
export function limpiarCompraAbierta() {
  try { localStorage.removeItem(MARCA); } catch { /* nada */ }
}

/** Borra borradores de días anteriores para que no se acumulen ni aparezcan datos viejos. */
export function limpiarBorradoresViejos(hoy: string) {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(PREFIJO) && !k.slice(PREFIJO.length).startsWith(hoy)) {
        localStorage.removeItem(k);
        void borrarFotos(k.slice(PREFIJO.length));
      }
    }
    const marca = leerCompraAbierta();
    if (marca && marca.fecha !== hoy) limpiarCompraAbierta();
  } catch { /* nada */ }
}

/* ───────── Fotos en IndexedDB ───────── */

function abrirBD(): Promise<IDBDatabase | null> {
  return new Promise(resolve => {
    try {
      if (!('indexedDB' in window)) return resolve(null);
      const pedido = indexedDB.open(BD, 1);
      pedido.onupgradeneeded = () => { pedido.result.createObjectStore(TABLA); };
      pedido.onsuccess = () => resolve(pedido.result);
      pedido.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

export async function guardarFoto(clave: string, ranura: RanuraFoto, archivo: File | null) {
  const bd = await abrirBD();
  if (!bd) return;
  try {
    const tx = bd.transaction(TABLA, 'readwrite');
    const tabla = tx.objectStore(TABLA);
    if (archivo) tabla.put({ blob: archivo, nombre: archivo.name, tipo: archivo.type }, `${clave}|${ranura}`);
    else tabla.delete(`${clave}|${ranura}`);
  } catch { /* nada */ } finally { bd.close(); }
}

export async function leerFotos(clave: string): Promise<Partial<Record<RanuraFoto, File>>> {
  const bd = await abrirBD();
  if (!bd) return {};
  const ranuras: RanuraFoto[] = ['comprobante', 'producto', 'pago'];
  const resultado: Partial<Record<RanuraFoto, File>> = {};
  await Promise.all(ranuras.map(r => new Promise<void>(resolve => {
    try {
      const pedido = bd.transaction(TABLA, 'readonly').objectStore(TABLA).get(`${clave}|${r}`);
      pedido.onsuccess = () => {
        const v = pedido.result as { blob: Blob; nombre: string; tipo: string } | undefined;
        if (v) resultado[r] = new File([v.blob], v.nombre, { type: v.tipo });
        resolve();
      };
      pedido.onerror = () => resolve();
    } catch { resolve(); }
  })));
  bd.close();
  return resultado;
}

export async function borrarFotos(clave: string) {
  const bd = await abrirBD();
  if (!bd) return;
  try {
    const tx = bd.transaction(TABLA, 'readwrite');
    for (const r of ['comprobante', 'producto', 'pago']) tx.objectStore(TABLA).delete(`${clave}|${r}`);
  } catch { /* nada */ } finally { bd.close(); }
}
