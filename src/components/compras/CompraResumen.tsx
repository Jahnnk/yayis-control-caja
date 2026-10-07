import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { abrirEvidencia } from '@/lib/evidencias';
import { formatMonto } from '@/lib/utils';
import { fechaCorta, formatCantidad } from '@/lib/compras';
import { AlertTriangle, Camera, Receipt, Smartphone, Trash2 } from 'lucide-react';
import type { CompraDetalle } from '@/types';

interface Props {
  compra: CompraDetalle;
  onEliminar?: () => void;
  /** Para subir la foto de una compra con evidencia pendiente (solo lo ofrece quien la registró). */
  onCompletar?: () => void;
  /** Espacio extra a la derecha (p. ej. el selector de categoría al cerrar la rendición). */
  children?: ReactNode;
}

export function CompraResumen({ compra, onEliminar, onCompletar, children }: Props) {
  const { addToast } = useToast();

  async function ver(path: string | null) {
    if (!path) return;
    const error = await abrirEvidencia(path);
    if (error) addToast(error, 'error');
  }

  const recojo = Number(compra.total) === 0;
  const comprobante = recojo ? 'Recojo sin pago' : compra.tipo_comprobante === 'sin_comprobante'
    ? 'Sin comprobante'
    : `${compra.tipo_comprobante === 'boleta' ? 'Boleta' : 'Factura'}${compra.numero_comprobante ? ` ${compra.numero_comprobante}` : ''}`;
  const pago = recojo ? 'ya estaba pagado' : compra.condicion_pago === 'credito'
    ? `A crédito, vence ${compra.fecha_vencimiento ? fechaCorta(compra.fecha_vencimiento) : '—'}`
    : compra.metodo_pago === 'cuentas' ? 'Yape/transferencia' : 'Efectivo';

  return (
    <div className="rounded-md border bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Receipt size={14} className="text-yayis-green" />
        <span className="font-bold">{compra.proveedores?.nombre}</span>
        <span className="font-bold text-yayis-dark">{formatMonto(Number(compra.total))}</span>
        <span className="text-xs text-muted-foreground">{comprobante} · {pago}</span>
        {onEliminar && (
          <Button variant="ghost" size="icon" className="ml-auto h-7 w-7 text-red-500" onClick={onEliminar} aria-label="Eliminar compra">
            <Trash2 size={14} />
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {compra.compra_items.map(i => `${i.productos?.nombre} ${formatCantidad(i.cantidad)} ${i.unidad} (${i.precio_repartido ? '≈ ' : ''}${formatMonto(Number(i.precio_total))})`).join(' · ')}
      </p>
      {compra.observacion && <p className="mt-1 text-xs italic text-muted-foreground">"{compra.observacion}"</p>}
      {compra.evidencia_pendiente && (
        <p className="mt-1 flex flex-wrap items-center gap-2 rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900">
          <AlertTriangle size={13} /> Evidencia pendiente: falta subir una foto.
          {onCompletar && <Button size="sm" variant="outline" className="ml-auto h-6 border-amber-400 px-2 text-xs" onClick={onCompletar}>Subir foto</Button>}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {compra.evidencia_comprobante_path && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => ver(compra.evidencia_comprobante_path)}>
            <Receipt size={12} className="mr-1" /> Comprobante
          </Button>
        )}
        {compra.evidencia_producto_path && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => ver(compra.evidencia_producto_path)}>
            <Camera size={12} className="mr-1" /> Producto
          </Button>
        )}
        {compra.evidencia_pago_path && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => ver(compra.evidencia_pago_path)}>
            <Smartphone size={12} className="mr-1" /> Pago
          </Button>
        )}
        {children && <div className="ml-auto">{children}</div>}
      </div>
    </div>
  );
}
