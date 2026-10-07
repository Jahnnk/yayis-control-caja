import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CantidadCelda, EntregaCelda, PrecioPagadoCelda } from '@/components/compras/EntregaProducto';
import { ESTADO_PEDIDO, fechaLarga } from '@/lib/compras';
import { formatMonto, roundTwo } from '@/lib/utils';
import type { PrecioPagado } from '@/hooks/usePreciosPagados';
import type { PedidoConItems } from '@/types';
import { AlertTriangle, PackageCheck } from 'lucide-react';

/**
 * Lista ya comprada por Compras: el administrador confirma producto por producto lo que llegó
 * a su sede. Cuando todo lo comprado está entregado, la lista pasa sola a «Recibido».
 */
export function PedidoPorRecibir({ pedido, pagos, onEntregado }: {
  pedido: PedidoConItems;
  pagos: Map<string, PrecioPagado>;
  onEntregado: (itemId: string, entregado: boolean) => Promise<{ error: string | null }>;
}) {
  const items = pedido.pedido_items.slice().sort((a, b) => (a.productos?.nombre ?? '').localeCompare(b.productos?.nombre ?? ''));
  const comprados = items.filter(i => i.estado === 'comprado');
  const entregados = comprados.filter(i => i.entregado_at).length;
  const noHabia = items.filter(i => i.estado === 'no_habia').length;
  const pagado = comprados.reduce((t, i) => roundTwo(t + (pagos.get(i.id)?.total ?? 0)), 0);

  return (
    <Card className="border-emerald-200">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base capitalize">
            <PackageCheck size={18} className="text-emerald-700" />
            {pedido.urgente ? 'Pedido urgente' : 'Lista'} del {fechaLarga(pedido.fecha_compra)}
          </CardTitle>
          <div className="flex items-center gap-2">
            {pedido.urgente && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800"><AlertTriangle size={12} /> Urgente</span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_PEDIDO[pedido.estado].clase}`}>{ESTADO_PEDIDO[pedido.estado].label}</span>
          </div>
        </div>
        <p className="text-sm">
          <strong className="text-yayis-dark">{entregados} de {comprados.length}</strong> productos entregados a tu sede
          {noHabia > 0 && <span className="text-red-600"> · {noHabia} no había</span>}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Producto</th>
                <th className="py-2 font-medium">Cantidad</th>
                <th className="py-2 font-medium">Proveedor</th>
                <th className="py-2 text-right font-medium">Precio pagado</th>
                <th className="py-2 pl-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-2 font-medium">{i.productos?.nombre ?? '—'}{i.urgente && <span className="ml-1 text-xs font-bold text-red-700">⚡</span>}</td>
                  <td className="py-2 pr-2"><CantidadCelda item={i} pago={pagos.get(i.id)} /></td>
                  <td className="py-2 pr-2 text-xs">{i.proveedores?.nombre ?? '—'}</td>
                  <td className="py-2 pr-2 text-right text-xs tabular-nums">{i.estado === 'comprado' ? <PrecioPagadoCelda pago={pagos.get(i.id)} /> : ''}</td>
                  <td className="py-2 pl-3"><EntregaCelda item={i} puedeMarcar onCambiar={onEntregado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
          <span className="text-xs text-muted-foreground">Marca «Entregado» cuando el producto ya llegó a tu sede y lo verificaste. Al marcar todos, la lista pasa a «Recibido».</span>
          <span>Pagado en esta lista: <strong className="text-yayis-dark">{formatMonto(pagado)}</strong></span>
        </div>
      </CardContent>
    </Card>
  );
}
