import { formatMonto, roundTwo } from '@/lib/utils';

// Las librerias de exportacion (exceljs, jspdf) son pesadas; se cargan
// dinamicamente solo al exportar para no inflar el bundle inicial de la app.

// ====== Tipos del reporte ======
export type ExportGastoItem = {
  descripcion: string;
  monto: number;
  fecha: string;
  metodo: string; // 'efectivo' | 'cuentas'
  /** Quién lo originó: «Administrador» o «Compras». */
  origen?: string;
  /** Solo en compras de Compras: los productos comprados. */
  productos?: string;
  /** «Boleta», «Factura» o «Sin comprobante» (vacío si el gasto no viene de una compra). */
  comprobante?: string;
  numeroComprobante?: string;
  /** Solo en la descarga de todo el periodo: «Por reponer» o «Repuesto el 26/10». */
  estado?: string;
};

export type ExportCategoria = {
  categoria: string;
  total: number;
  items: ExportGastoItem[];
};

export type ExportMeta = {
  periodoLabel: string;     // ej. "Mayo 2026 - Semana 5"
  fechaGeneracion: string;  // YYYY-MM-DD (Lima)
  /** Título del reporte (por defecto «Gastos Pendientes por Reponer»). */
  titulo?: string;
  /** Inicio del nombre del archivo (por defecto «Gastos-Pendientes-Yayis»). */
  archivo?: string;
  sede?: string;
};

const NOMBRE_EMPRESA = "Yayi's";
const TITULO_REPORTE = 'Gastos Pendientes por Reponer';

// Colores de marca (RGB)
const YAYIS_GREEN = '098B5F';
const YAYIS_DARK = '004C40';

function metodoLabel(metodo: string): string {
  return metodo === 'efectivo' ? 'Efectivo' : 'Cuentas';
}

function nombreArchivo(fecha: string, ext: 'xlsx' | 'pdf', archivo = 'Gastos-Pendientes-Yayis'): string {
  return `${archivo}-${fecha}.${ext}`;
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
  const ws = wb.addWorksheet(meta.titulo ? 'Gastos del periodo' : 'Gastos Pendientes');
  // La descarga de todo el periodo agrega una columna «Estado» (por reponer / repuesto).
  const conEstado = categorias.some(c => c.items.some(i => i.estado));
  const colMonto = conEstado ? 11 : 10;

  // Anchos de columna: N°, Categoria, Fecha, Origen, Descripcion, Productos, Comprobante, N° comprobante, Metodo, [Estado], Monto
  ws.columns = [
    { width: 6 },
    { width: 22 },
    { width: 12 },
    { width: 14 },
    { width: 30 },
    { width: 50 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    ...(conEstado ? [{ width: 18 }] : []),
    { width: 14 },
  ];

  // --- Encabezado del documento ---
  const rEmpresa = ws.addRow([NOMBRE_EMPRESA]);
  rEmpresa.font = { bold: true, size: 16, color: { argb: `FF${YAYIS_DARK}` } };
  const rTitulo = ws.addRow([meta.titulo ?? TITULO_REPORTE]);
  rTitulo.font = { bold: true, size: 12 };
  if (meta.sede) ws.addRow([`Sede: ${meta.sede}`]);
  ws.addRow([`Periodo: ${meta.periodoLabel}`]);
  ws.addRow([`Generado: ${meta.fechaGeneracion}`]);
  ws.addRow([]); // fila en blanco

  // --- Encabezados de la tabla ---
  const headerRow = ws.addRow(['N°', 'Categoría', 'Fecha', 'Origen', 'Descripción', 'Productos comprados', 'Comprobante', 'N° de comprobante', 'Método de pago', ...(conEstado ? ['Estado'] : []), 'Monto']);
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
      const row = ws.addRow([i + 1, cat.categoria, it.fecha, it.origen ?? '', it.descripcion, it.productos ?? '', it.comprobante ?? '', it.numeroComprobante ?? '', metodoLabel(it.metodo), ...(conEstado ? [it.estado ?? ''] : []), it.monto]);
      row.getCell(6).alignment = { wrapText: true, vertical: 'top' };
      if (it.comprobante === 'Sin comprobante') row.getCell(7).font = { color: { argb: 'FFC0392B' }, bold: true };
      row.getCell(colMonto).numFmt = '#,##0.00';
    });

    // Subtotal de la categoria (en negrita)
    const subtotalRow = ws.addRow(['', '', '', '', '', '', '', '', ...(conEstado ? [''] : []), `Subtotal ${cat.categoria}`, cat.total]);
    subtotalRow.font = { bold: true };
    subtotalRow.getCell(colMonto).numFmt = '#,##0.00';
    subtotalRow.getCell(colMonto).font = { bold: true };
  }

  // --- Total general (en negrita) ---
  ws.addRow([]);
  const totalRow = ws.addRow(['', '', '', '', '', '', '', '', ...(conEstado ? [''] : []), 'TOTAL GENERAL', totalGeneral(categorias)]);
  totalRow.font = { bold: true };
  totalRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${YAYIS_DARK}` } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });
  totalRow.getCell(colMonto).numFmt = '#,##0.00';

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  descargarBlob(blob, nombreArchivo(meta.fechaGeneracion, 'xlsx', meta.archivo));
}

// ====== Exportar a PDF (jsPDF + autotable) ======
export async function exportarGastosPDF(categorias: ExportCategoria[], meta: ExportMeta) {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
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
        colSpan: 7,
        styles: { fontStyle: 'bold', fillColor: [9, 139, 95], textColor: 255 },
      },
    ]);
    // Filas de gastos
    cat.items.forEach((it, i) => {
      body.push([
        String(i + 1),
        it.fecha,
        it.descripcion,
        it.productos ?? '',
        [it.comprobante, it.numeroComprobante].filter(Boolean).join(' '),
        metodoLabel(it.metodo),
        formatMonto(it.monto),
      ]);
    });
    // Subtotal
    body.push([
      { content: `Subtotal ${cat.categoria}`, colSpan: 6, styles: { fontStyle: 'bold', halign: 'right' } },
      { content: formatMonto(cat.total), styles: { fontStyle: 'bold', halign: 'right' } },
    ]);
  }

  // Total general
  body.push([
    {
      content: 'TOTAL GENERAL',
      colSpan: 6,
      styles: { fontStyle: 'bold', halign: 'right', fillColor: [0, 76, 64], textColor: 255 },
    },
    {
      content: formatMonto(totalGeneral(categorias)),
      styles: { fontStyle: 'bold', halign: 'right', fillColor: [0, 76, 64], textColor: 255 },
    },
  ]);

  autoTable(doc, {
    startY: 39,
    head: [['N°', 'Fecha', 'Descripción', 'Productos comprados', 'Comprobante', 'Método', 'Monto']],
    body: body as never,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [0, 76, 64], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { cellWidth: 22 },
      2: { cellWidth: 42 },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 34 },
      5: { cellWidth: 20 },
      6: { halign: 'right', cellWidth: 24 },
    },
    margin: { left: 14, right: 14 },
  });

  doc.save(nombreArchivo(meta.fechaGeneracion, 'pdf'));
}
