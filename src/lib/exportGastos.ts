import { formatMonto, roundTwo } from '@/lib/utils';

// Las librerias de exportacion (exceljs, jspdf) son pesadas; se cargan
// dinamicamente solo al exportar para no inflar el bundle inicial de la app.

// ====== Tipos del reporte ======
export type ExportGastoItem = {
  descripcion: string;
  monto: number;
  fecha: string;
  metodo: string; // 'efectivo' | 'cuentas'
};

export type ExportCategoria = {
  categoria: string;
  total: number;
  items: ExportGastoItem[];
};

export type ExportMeta = {
  periodoLabel: string;     // ej. "Mayo 2026 - Semana 5"
  fechaGeneracion: string;  // YYYY-MM-DD (Lima)
};

const NOMBRE_EMPRESA = "Yayi's";
const TITULO_REPORTE = 'Gastos Pendientes por Reponer';

// Colores de marca (RGB)
const YAYIS_GREEN = '098B5F';
const YAYIS_DARK = '004C40';

function metodoLabel(metodo: string): string {
  return metodo === 'efectivo' ? 'Efectivo' : 'Cuentas';
}

function nombreArchivo(fecha: string, ext: 'xlsx' | 'pdf'): string {
  return `Gastos-Pendientes-Yayis-${fecha}.${ext}`;
}

function totalGeneral(categorias: ExportCategoria[]): number {
  return categorias.reduce((acc, c) => roundTwo(acc + c.total), 0);
}

function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ====== Exportar a Excel (exceljs) ======
export async function exportarGastosExcel(categorias: ExportCategoria[], meta: ExportMeta) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Gastos Pendientes');

  // Anchos de columna: N°, Descripcion, Fecha, Metodo, Monto
  ws.columns = [
    { width: 6 },
    { width: 40 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
  ];

  // --- Encabezado del documento ---
  const rEmpresa = ws.addRow([NOMBRE_EMPRESA]);
  rEmpresa.font = { bold: true, size: 16, color: { argb: `FF${YAYIS_DARK}` } };
  const rTitulo = ws.addRow([TITULO_REPORTE]);
  rTitulo.font = { bold: true, size: 12 };
  ws.addRow([`Periodo: ${meta.periodoLabel}`]);
  ws.addRow([`Generado: ${meta.fechaGeneracion}`]);
  ws.addRow([]); // fila en blanco

  // --- Encabezados de la tabla ---
  const headerRow = ws.addRow(['N°', 'Descripcion', 'Fecha', 'Metodo de pago', 'Monto']);
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${YAYIS_GREEN}` } };
  });

  // --- Cuerpo agrupado por categoria ---
  for (const cat of categorias) {
    // Encabezado de categoria
    const catRow = ws.addRow([cat.categoria]);
    catRow.font = { bold: true, color: { argb: `FF${YAYIS_DARK}` } };

    // Filas de gastos
    cat.items.forEach((it, i) => {
      const row = ws.addRow([i + 1, it.descripcion, it.fecha, metodoLabel(it.metodo), it.monto]);
      const montoCell = row.getCell(5);
      montoCell.numFmt = '#,##0.00';
    });

    // Subtotal de la categoria (en negrita)
    const subtotalRow = ws.addRow(['', '', '', `Subtotal ${cat.categoria}`, cat.total]);
    subtotalRow.font = { bold: true };
    subtotalRow.getCell(5).numFmt = '#,##0.00';
    subtotalRow.getCell(5).font = { bold: true };
  }

  // --- Total general (en negrita) ---
  ws.addRow([]);
  const totalRow = ws.addRow(['', '', '', 'TOTAL GENERAL', totalGeneral(categorias)]);
  totalRow.font = { bold: true };
  totalRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${YAYIS_DARK}` } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });
  totalRow.getCell(5).numFmt = '#,##0.00';

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  descargarBlob(blob, nombreArchivo(meta.fechaGeneracion, 'xlsx'));
}

// ====== Exportar a PDF (jsPDF + autotable) ======
export async function exportarGastosPDF(categorias: ExportCategoria[], meta: ExportMeta) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // --- Encabezado del documento ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(0, 76, 64); // yayis-dark
  doc.text(NOMBRE_EMPRESA, 14, 18);

  doc.setFontSize(13);
  doc.setTextColor(40, 40, 40);
  doc.text(TITULO_REPORTE, 14, 26);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(`Periodo: ${meta.periodoLabel}`, 14, 33);
  doc.text(`Generado: ${meta.fechaGeneracion}`, pageWidth - 14, 33, { align: 'right' });

  // --- Construir el cuerpo agrupado ---
  type Row = (string | { content: string; colSpan?: number; styles?: Record<string, unknown> })[];
  const body: Row[] = [];

  for (const cat of categorias) {
    // Encabezado de categoria (fila que abarca todas las columnas)
    body.push([
      {
        content: cat.categoria,
        colSpan: 5,
        styles: { fontStyle: 'bold', fillColor: [9, 139, 95], textColor: 255 },
      },
    ]);
    // Filas de gastos
    cat.items.forEach((it, i) => {
      body.push([
        String(i + 1),
        it.descripcion,
        it.fecha,
        metodoLabel(it.metodo),
        formatMonto(it.monto),
      ]);
    });
    // Subtotal
    body.push([
      { content: `Subtotal ${cat.categoria}`, colSpan: 4, styles: { fontStyle: 'bold', halign: 'right' } },
      { content: formatMonto(cat.total), styles: { fontStyle: 'bold', halign: 'right' } },
    ]);
  }

  // Total general
  body.push([
    {
      content: 'TOTAL GENERAL',
      colSpan: 4,
      styles: { fontStyle: 'bold', halign: 'right', fillColor: [0, 76, 64], textColor: 255 },
    },
    {
      content: formatMonto(totalGeneral(categorias)),
      styles: { fontStyle: 'bold', halign: 'right', fillColor: [0, 76, 64], textColor: 255 },
    },
  ]);

  autoTable(doc, {
    startY: 39,
    head: [['N°', 'Descripcion', 'Fecha', 'Metodo', 'Monto']],
    body: body as never,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [0, 76, 64], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 12 },
      2: { cellWidth: 24 },
      3: { cellWidth: 24 },
      4: { halign: 'right', cellWidth: 28 },
    },
    margin: { left: 14, right: 14 },
  });

  doc.save(nombreArchivo(meta.fechaGeneracion, 'pdf'));
}
