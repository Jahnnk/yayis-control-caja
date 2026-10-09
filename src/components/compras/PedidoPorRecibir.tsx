import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CantidadCelda, EntregaCelda, PrecioPagadoCelda, type DatosProblema } from '@/components/compras/EntregaProducto';
import { Button } from '@/components/ui/button';
import { ESTADO_PEDIDO, fechaCorta, fechaLarga } from '@/lib/compras';
import { formatMonto, roundTwo } from '@/lib/utils';
import type { PrecioPagado } from '@/hooks/usePreciosPagados';
import type { PedidoConItems } from '@/types';
import { useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { AlertTriangle, Check, ChevronDown, PackageCheck } from 'lucide-react';

/**
 * Lista ya comprada por Compras: el administrador confirma producto por producto lo que llegó
 * a su sede. Cuando todo lo comprado está entregado, la lista pasa sola a «Recibido».
 */
export function PedidoPorRecibir({ pedido, pagos, onEntregado, onProblema, onTodoConforme, onVolverAPedir, children, seguimiento }: {
  pedido: PedidoConItems;
  pagos: Map<string, PrecioPagado>;
  onEntregado: (itemId: string, entregado: boolean) => Promise<{ error: string | null }>;
  onProblema?: (itemId: string, datos: DatosProblema) => Promise<{ error: string | null }>;
  /** «Marcar todo conforme»: deja conforme lo que aún no se revisó. */
  onTodoConforme?: (pedidoId: string) => Promise<{ error: string | null }>;
  onVolverAPedir?: (itemId: string) => Promise<{ error: string | null }>;
  /** Contenido extra al final (por ejemplo, los comprobantes de las compras). */
  children?: React.ReactNode;
  /** Seguimiento de la lista (Enviada → Comprando → En camino → Recibido). */
  seguimiento?: React.ReactNode;
}) {
  const items = pedido.pedido_items.slice().sort((a, b) => (a.productos?.nombre ?? '').localeCompare(b.productos?.nombre ?? ''));
  const comprados = items.filter(i => i.estado === 'comprado');
  const revisados = comprados.filter(i => i.entregado_at).length;
  const conDiferencias = comprados.filter(i => i.entregado_at && i.recepcion_estado && i.recepcion_estado !== 'conforme').length;
  const sinRevisar = comprados.length - revisados;
  const [trabajando, setTrabajando] = useState(false);
  const { addToast } = useToast();
  async function todoConforme() {
    if (!onTodoConforme) return;
    setTrabajando(true);
    const { error } = await onTodoConforme(pedido.id);
    setTrabajando(false);
    if (error) addToast(error, 'error');
  }
  const noHabia = items.filter(i => i.estado === 'no_habia').length;
  const pagado = comprados.reduce((t, i) => roundTwo(t + (pagos.get(i.id)?.total ?? 0)), 0);

  return (
    <Card className="border-emerald-200">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <PackageCheck size={18} className="text-emerald-700" />
            {pedido.urgente ? 'Pedido urgente' : 'Lista'} del {fechaLarga(pedido.fecha_compra)}
          </CardTitle>
          <div className="flex items-center gap-2">
            {pedido.urgente && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800"><AlertTriangle size={12} /> Urgente</span>
            )}
            {!seguimiento && <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_PEDIDO[pedido.estado].clase}`}>{ESTADO_PEDIDO[pedido.estado].label}</span>}
          </div>
        </div>
        {seguimiento ? <div className="pt-2">{seguimiento}</div> : <p className="text-sm">
          <strong className="text-yayis-dark">{revisados} de {comprados.length}</strong> productos revisados al recibirlos
          {conDiferencias > 0 && <span className="font-medium text-amber-700"> · {conDiferencias} con diferencias</span>}
          {noHabia > 0 && <span className="text-red-600"> · {noHabia} no había</span>}
        </p>}
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
                  <td className="py-2 pr-2 text-right text-xs tabular-nums">{i.estado === 'comprado' ? <PrecioPagadoCelda pago={pagos.get(i.id)} referencia={i.precio_referencia} /> : ''}</td>
                  <td className="py-2 pl-3"><EntregaCelda item={i} puedeMarcar onCambiar={onEntregado} onProblema={onProblema} onVolverAPedir={onVolverAPedir} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
          <span className="text-xs text-muted-foreground">Revisa cada producto cuando llegue: «Conforme» si está bien, «Problema» si llegó incompleto, no llegó o llegó mal (con una nota). Cuando todos estén revisados, la lista pasa a «Recibida».</span>
          <span className="flex flex-wrap items-center gap-3">
            <span>Pagado en esta lista: <strong className="text-yayis-dark">{formatMonto(pagado)}</strong></span>
            {onTodoConforme && sinRevisar > 0 && (
              <Button size="sm" onClick={todoConforme} disabled={trabajando}>
                <Check size={14} className="mr-1" /> Marcar todo conforme ({sinRevisar})
              </Button>
            )}
          </span>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * Lista ya recibida (todo lo comprado llegó a la sede), en una línea con su resumen y el detalle plegado.
 * Se ve unos días para poder cuadrar con Compras; después pasa a «Pedidos anteriores».
 */
export function PedidoRecibidoResumen({ pedido, pagos, onEntregado, onProblema, onVolverAPedir }: {
  pedido: PedidoConItems;
  pagos: Map<string, PrecioPagado>;
  onEntregado: (itemId: string, entregado: boolean) => Promise<{ error: string | null }>;
  onProblema?: (itemId: string, datos: DatosProblema) => Promise<{ error: string | null }>;
  onVolverAPedir?: (itemId: string) => Promise<{ error: string | null }>;
}) {
  const items = pedido.pedido_items.slice().sort((a, b) => (a.productos?.nombre ?? '').localeCompare(b.productos?.nombre ?? ''));
  const comprados = items.filter(i => i.estado === 'comprado');
  const noHabia = items.filter(i => i.estado === 'no_habia').length;
  const pagado = comprados.reduce((t, i) => roundTwo(t + (pagos.get(i.id)?.total ?? 0)), 0);

  return (
    <details className="group rounded-lg border bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
        <span className="font-bold text-yayis-dark">{pedido.urgente ? 'Urgente · ' : ''}{fechaCorta(pedido.fecha_compra)}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_PEDIDO[pedido.estado].clase}`}>{ESTADO_PEDIDO[pedido.estado].label}</span>
        <span className="text-xs text-muted-foreground">
          {comprados.length} producto(s) recibido(s)
          {comprados.some(i => i.recepcion_estado && i.recepcion_estado !== 'conforme') && <span className="font-medium text-amber-700"> · {comprados.filter(i => i.recepcion_estado && i.recepcion_estado !== 'conforme').length} con diferencias</span>}
          {noHabia > 0 && <span className="text-red-600"> · {noHabia} no había</span>} · pagado <strong className="text-yayis-dark">{formatMonto(pagado)}</strong>
        </span>
        <ChevronDown size={16} className="ml-auto transition-transform group-open:rotate-180" />
      </summary>
      <div className="overflow-x-auto border-t px-4 py-2">
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
                <td className="py-2 pr-2 font-medium">{i.productos?.nombre ?? '—'}</td>
                <td className="py-2 pr-2"><CantidadCelda item={i} pago={pagos.get(i.id)} /></td>
                <td className="py-2 pr-2 text-xs">{i.proveedores?.nombre ?? '—'}</td>
                <td className="py-2 pr-2 text-right text-xs tabular-nums">{i.estado === 'comprado' ? <PrecioPagadoCelda pago={pagos.get(i.id)} referencia={i.precio_referencia} /> : ''}</td>
                <td className="py-2 pl-3"><EntregaCelda item={i} puedeMarcar onCambiar={onEntregado} onProblema={onProblema} onVolverAPedir={onVolverAPedir} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
