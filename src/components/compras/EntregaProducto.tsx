import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { precioMostrado } from '@/lib/precio-linea';
import { formatCantidad } from '@/lib/compras';
import { formatPorcentaje } from '@/lib/precios';
import { formatMonto, roundTwo } from '@/lib/utils';
import type { PrecioPagado } from '@/hooks/usePreciosPagados';
import type { PedidoItem } from '@/types';
import { Check, Loader2 } from 'lucide-react';

/** Lo que se pagó por la línea y, debajo, el precio por unidad (por kg / litro si se pidió en g / ml). */
export function PrecioPagadoCelda({ pago, referencia }: { pago: PrecioPagado | undefined; referencia?: number | null }) {
  if (!pago || pago.cantidad <= 0) return <span className="text-muted-foreground">—</span>;
  const p = precioMostrado(pago.total / pago.cantidad, pago.unidad);
  // Frente al precio de referencia que escribió el administrador (ambos por kg / litro / unidad).
  const ref = referencia !== null && referencia !== undefined ? Number(referencia) : null;
  const variacion = ref !== null && ref > 0 && !pago.repartido ? p.valor / ref - 1 : null;
  return (
    <span className="whitespace-nowrap">
      <strong className="text-yayis-dark">{pago.repartido ? '≈ ' : ''}{formatMonto(pago.total)}</strong>
      <span className="block text-[11px] text-muted-foreground">
        {pago.repartido ? 'repartido del total' : `${formatMonto(roundTwo(p.valor))} por ${p.etiqueta}`}
      </span>
      {variacion !== null && ref !== null && (
        <span className={`block text-[11px] font-medium ${variacion >= 0.005 ? 'text-red-600' : variacion <= -0.005 ? 'text-emerald-700' : 'text-muted-foreground'}`}>
          {Math.abs(variacion) < 0.005 ? `igual a la ref. (${formatMonto(ref)})` : `${variacion > 0 ? '▲' : '▼'} ${formatPorcentaje(variacion)} vs ref. ${formatMonto(ref)}`}
        </span>
      )}
    </span>
  );
}

/**
 * Cantidad de una línea del pedido. Si Compras compró una cantidad distinta de la pedida
 * (por ejemplo había menos stock), se ve lo que realmente llegó y, debajo, lo que se pidió.
 */
export function CantidadCelda({ item, pago }: { item: Pick<PedidoItem, 'cantidad' | 'unidad' | 'estado'>; pago: PrecioPagado | undefined }) {
  const comprada = item.estado === 'comprado' && pago ? pago.cantidad : null;
  if (comprada === null || Math.abs(comprada - Number(item.cantidad)) < 0.005) {
    return <span className="whitespace-nowrap">{formatCantidad(item.cantidad)} {item.unidad}</span>;
  }
  return (
    <span className="whitespace-nowrap">
      <strong className="text-amber-800">{formatCantidad(comprada)} {item.unidad}</strong>
      <span className="block text-[11px] text-amber-700">se pidieron {formatCantidad(item.cantidad)}</span>
    </span>
  );
}

/** Estado de un producto ya comprado: «Entregado ✓» o el botón para confirmarlo. */
export function EntregaCelda({ item, puedeMarcar, onCambiar }: {
  item: Pick<PedidoItem, 'id' | 'estado' | 'entregado_at'>;
  puedeMarcar: boolean;
  onCambiar: (itemId: string, entregado: boolean) => Promise<{ error: string | null }>;
}) {
  const { addToast } = useToast();
  const [trabajando, setTrabajando] = useState(false);

  if (item.estado === 'no_habia') return <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">No había</span>;
  if (item.estado === 'pendiente') return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">Por comprar</span>;

  async function cambiar(entregado: boolean) {
    setTrabajando(true);
    const { error } = await onCambiar(item.id, entregado);
    setTrabajando(false);
    if (error) addToast(error, 'error');
  }

  if (item.entregado_at) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
          <Check size={12} /> Entregado
        </span>
        {puedeMarcar && (
          <button type="button" className="text-[11px] text-muted-foreground underline disabled:opacity-50" disabled={trabajando} onClick={() => cambiar(false)}>
            Deshacer
          </button>
        )}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Comprado</span>
      {puedeMarcar && (
        <Button type="button" size="sm" variant="outline" className="h-7 border-emerald-500 px-2 text-xs text-emerald-700" disabled={trabajando} onClick={() => cambiar(true)}>
          {trabajando ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Check size={12} className="mr-1" />} Marcar entregado
        </Button>
      )}
    </span>
  );
}
