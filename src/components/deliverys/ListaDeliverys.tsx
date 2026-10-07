import { Button } from '@/components/ui/button';
import { estadoDelivery, MODALIDAD_LABEL } from '@/lib/deliverys';
import { fechaCorta } from '@/lib/compras';
import { formatMonto } from '@/lib/utils';
import { CalendarDays, Eye, Trash2 } from 'lucide-react';
import type { DeliveryDetalle } from '@/hooks/useDeliverys';

/** Fila por delivery: cliente, montos, cómo pagó y en qué estado está el dinero. */
export function ListaDeliverys({ deliverys, mostrarSede, puedeBorrar, onBorrar, puedeCambiarFecha, onCambiarFecha, onVerCaptura }: {
  deliverys: DeliveryDetalle[];
  mostrarSede?: boolean;
  puedeCambiarFecha?: (d: DeliveryDetalle) => boolean;
  onCambiarFecha?: (d: DeliveryDetalle) => void;
  puedeBorrar?: (d: DeliveryDetalle) => boolean;
  onBorrar?: (d: DeliveryDetalle) => void;
  onVerCaptura?: (path: string) => void;
}) {
  if (deliverys.length === 0) return <p className="px-4 py-6 text-center text-sm text-muted-foreground">No hay deliverys en este periodo.</p>;
  return (
    <div className="divide-y text-sm">
      {deliverys.map(d => {
        const estado = estadoDelivery(d);
        return (
          <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <span className="w-20 shrink-0 capitalize text-muted-foreground">{fechaCorta(d.fecha)}</span>
            {mostrarSede && <span className="rounded bg-yayis-cream px-2 py-0.5 text-xs font-bold text-yayis-dark">{d.sedes?.nombre}</span>}
            <div className="min-w-[10rem] flex-1">
              <p className="font-medium">{d.cliente}</p>
              <p className="text-xs text-muted-foreground">
                {d.detalle ? `${d.detalle} · ` : ''}producto {formatMonto(Number(d.monto_producto))} · delivery {formatMonto(Number(d.monto_delivery))} · {MODALIDAD_LABEL[d.modalidad]}
              </p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${estado.clase}`}>{estado.label}</span>
            <span className="w-24 text-right font-bold">{d.cobrado > 0 ? formatMonto(Number(d.cobrado)) : '—'}</span>
            <span className="flex w-24 justify-end gap-1">
              {puedeCambiarFecha?.(d) && onCambiarFecha && (
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => onCambiarFecha(d)} aria-label="Corregir el delivery" title="Corregir fecha o forma de pago"><CalendarDays size={14} /></Button>
              )}
              {d.evidencia_cobro_path && onVerCaptura && (
                <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => onVerCaptura(d.evidencia_cobro_path!)} aria-label="Ver captura"><Eye size={14} /></Button>
              )}
              {puedeBorrar?.(d) && onBorrar && (
                <Button variant="ghost" size="sm" className="h-8 px-2 text-red-600" onClick={() => onBorrar(d)} aria-label="Borrar delivery"><Trash2 size={14} /></Button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
