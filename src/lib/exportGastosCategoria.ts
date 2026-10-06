import { roundTwo } from '@/lib/utils';
import type { Movimiento } from '@/lib/vista-general';
import type { TipoGasto } from '@/types';
import type { Worksheet, Row } from 'exceljs';

// Excel de gastos por categoría para Gerencia de Finanzas. Sale de la misma lista de
// movimientos que la Vista general, así que los totales cuadran con la pantalla.
// Hojas: Resumen (categoría × sede, con fijo/variable) · una por sede (detalle agrupado
// por categoría) · Detalle (todo en una tabla con filtros, para tablas dinámicas).

const VERDE = 'FF098B5F';
const OSCURO = 'FF004C40';
const CREMA = 'FFF9F6EB';
const SOLES = '"S/ "#,##0.00';

export const TIPO_LABEL = (t: TipoGasto | null) => (t === 'fijo' ? 'Fijo' : t === 'variable' ? 'Variable' : 'Por definir');
const TIPOS: (TipoGasto | null)[] = ['fijo', 'variable', null];

export interface MetaExcel {
  periodo: string;   // "del lun 28 sep al vie 2 oct"
  sedes: { id: string; nombre: string }[];
  desde: string;
  hasta: string;
  generado: string;  // YYYY-MM-DD
}

const suma = (lista: Movimiento[]) => lista.reduce((t, m) => roundTwo(t + m.monto), 0);

function encabezado(ws: Worksheet, titulo: string, meta: MetaExcel, columnas: number) {
  const r1 = ws.addRow([`Yayi's · ${titulo}`]);
  r1.font = { bold: true, size: 14, color: { argb: OSCURO } };
  ws.addRow([`Periodo: ${meta.periodo} · Sedes: ${meta.sedes.map(s => s.nombre).join(', ')}`]);
  ws.addRow([`Generado: ${meta.generado}`]).font = { color: { argb: 'FF5C5C5C' } };
  ws.addRow([]);
  for (let i = 1; i <= 3; i++) ws.mergeCells(i, 1, i, columnas);
}

function cabecera(row: Row) {
  row.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    c.alignment = { vertical: 'middle', wrapText: true };
  });
}

function resaltar(row: Row, fondo = CREMA, colorTexto = OSCURO) {
  row.eachCell({ includeEmpty: true }, c => {
    c.font = { bold: true, color: { argb: colorTexto } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fondo } };
  });
}

function porCategoria(movs: Movimiento[]) {
  const mapa = new Map<string, { tipo: TipoGasto | null; movs: Movimiento[] }>();
  for (const m of movs) {
    const g = mapa.get(m.categoria) ?? { tipo: m.tipo, movs: [] };
    g.movs.push(m);
    g.tipo = g.tipo ?? m.tipo;
    mapa.set(m.categoria, g);
  }
  // Primero las fijas, luego las variables y al final las por definir; dentro, de mayor a menor.
  const orden = (t: TipoGasto | null) => (t === 'fijo' ? 0 : t === 'variable' ? 1 : 2);
  return Array.from(mapa.entries())
    .map(([nombre, g]) => ({ nombre, tipo: g.tipo, movs: g.movs, total: suma(g.movs) }))
    .sort((a, b) => orden(a.tipo) - orden(b.tipo) || b.total - a.total);
}

function hojaResumen(ws: Worksheet, movs: Movimiento[], meta: MetaExcel) {
  const sedes = meta.sedes;
  const columnas = 3 + sedes.length;
  ws.columns = [{ width: 32 }, { width: 13 }, ...sedes.map(() => ({ width: 15 })), { width: 15 }];
  encabezado(ws, 'Gastos por categoría', meta, columnas);

  cabecera(ws.addRow(['Categoría', 'Tipo', ...sedes.map(s => s.nombre), 'Total']));
  const totalDe = (lista: Movimiento[]) => [...sedes.map(s => suma(lista.filter(m => m.sedeId === s.id))), suma(lista)];
  const fila = (valores: (string | number)[]) => {
    const r = ws.addRow(valores);
    for (let c = 3; c <= columnas; c++) r.getCell(c).numFmt = SOLES;
    return r;
  };

  for (const cat of porCategoria(movs)) fila([cat.nombre, TIPO_LABEL(cat.tipo), ...totalDe(cat.movs)]);
  ws.addRow([]);
  for (const t of TIPOS) {
    const deTipo = movs.filter(m => m.tipo === t);
    if (deTipo.length) resaltar(fila([`Total gasto ${TIPO_LABEL(t).toLowerCase()}`, TIPO_LABEL(t), ...totalDe(deTipo)]));
  }
  resaltar(fila(['TOTAL GASTADO', '', ...totalDe(movs)]), OSCURO, 'FFFFFFFF');

  ws.addRow([]);
  const nota = ws.addRow(['Cada compra de Fabio se cuenta una sola vez. «Compras sin rendir aún» toma su categoría cuando el administrador cierra la rendición; «Compras a crédito» todavía no tiene categoría. El tipo (fijo/variable) se cambia en Configuración → Categorías.']);
  nota.font = { italic: true, color: { argb: 'FF5C5C5C' } };
  nota.alignment = { wrapText: true, vertical: 'top' };
  nota.height = 45;
  ws.mergeCells(nota.number, 1, nota.number, columnas);
  ws.views = [{ state: 'frozen', ySplit: 5 }];
}

function hojaSede(ws: Worksheet, movs: Movimiento[], meta: MetaExcel, sede: string) {
  ws.columns = [{ width: 12 }, { width: 17 }, { width: 30 }, { width: 46 }, { width: 18 }, { width: 18 }, { width: 14 }];
  encabezado(ws, `Gastos de ${sede} por categoría`, meta, 7);
  if (movs.length === 0) { ws.addRow(['No hubo gastos en este periodo.']); return; }

  cabecera(ws.addRow(['Fecha', 'Origen', 'Detalle / proveedor', 'Productos', 'Comprobante', 'Pago', 'Monto']));
  for (const cat of porCategoria(movs)) {
    resaltar(ws.addRow([`${cat.nombre} · Gasto ${TIPO_LABEL(cat.tipo).toLowerCase()}`, '', '', '', '', '', '']));
    for (const m of cat.movs) {
      const r = ws.addRow([m.fecha, m.origen, m.detalle, m.productos, m.comprobante, m.pago, m.monto]);
      r.getCell(7).numFmt = SOLES;
      r.getCell(4).alignment = { wrapText: true, vertical: 'top' };
    }
    const sub = ws.addRow(['', '', '', '', '', `Subtotal ${cat.nombre}`, cat.total]);
    sub.font = { bold: true };
    sub.getCell(7).numFmt = SOLES;
    ws.addRow([]);
  }
  for (const t of TIPOS) {
    const deTipo = movs.filter(m => m.tipo === t);
    if (!deTipo.length) continue;
    const r = ws.addRow(['', '', '', '', '', `Total gasto ${TIPO_LABEL(t).toLowerCase()}`, suma(deTipo)]);
    resaltar(r);
    r.getCell(7).numFmt = SOLES;
  }
  const total = ws.addRow(['', '', '', '', '', `TOTAL ${sede.toUpperCase()}`, suma(movs)]);
  resaltar(total, OSCURO, 'FFFFFFFF');
  total.getCell(7).numFmt = SOLES;
  ws.views = [{ state: 'frozen', ySplit: 5 }];
}

function hojaDetalle(ws: Worksheet, movs: Movimiento[], meta: MetaExcel) {
  ws.columns = [{ width: 12 }, { width: 11 }, { width: 26 }, { width: 12 }, { width: 17 }, { width: 30 }, { width: 46 }, { width: 18 }, { width: 18 }, { width: 14 }];
  encabezado(ws, 'Detalle de gastos', meta, 10);
  const nombreSede = new Map(meta.sedes.map(s => [s.id, s.nombre]));
  const cab = ws.addRow(['Fecha', 'Sede', 'Categoría', 'Tipo', 'Origen', 'Detalle / proveedor', 'Productos', 'Comprobante', 'Pago', 'Monto']);
  cabecera(cab);
  for (const m of movs) {
    const r = ws.addRow([m.fecha, nombreSede.get(m.sedeId) ?? '', m.categoria, TIPO_LABEL(m.tipo), m.origen, m.detalle, m.productos, m.comprobante, m.pago, m.monto]);
    r.getCell(10).numFmt = SOLES;
  }
  ws.autoFilter = { from: { row: cab.number, column: 1 }, to: { row: cab.number + movs.length, column: 10 } };
  ws.views = [{ state: 'frozen', ySplit: cab.number }];
}

/** Arma el libro (sin descargarlo). */
export async function construirLibroGastos(movimientos: Movimiento[], meta: MetaExcel) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = "Yayi's Control de Caja";

  hojaResumen(wb.addWorksheet('Resumen'), movimientos, meta);
  for (const s of meta.sedes) hojaSede(wb.addWorksheet(s.nombre), movimientos.filter(m => m.sedeId === s.id), meta, s.nombre);
  hojaDetalle(wb.addWorksheet('Detalle'), movimientos, meta);
  return wb;
}

export async function exportarGastosPorCategoria(movimientos: Movimiento[], meta: MetaExcel) {
  const wb = await construirLibroGastos(movimientos, meta);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${meta.generado}_Gastos_por_categoria_${meta.desde}_al_${meta.hasta}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
