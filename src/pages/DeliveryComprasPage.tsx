import { useState } from 'react';
import { Bike, ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dato } from '@/components/ui/dato';
import { Desplegable } from '@/components/ui/desplegable';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Loading } from '@/components/ui/loading';
import { useToast } from '@/components/ui/toast';
import { RegistrarTraido } from '@/components/delivery-compras/RegistrarTraido';
import { PagarDelivery } from '@/components/delivery-compras/PagarDelivery';
import { useDeliveryCompras, type EncargoDetalle } from '@/hooks/useDeliveryCompras';
import { usePedidos } from '@/hooks/usePedidos';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { fechaCorta } from '@/lib/compras';
import { getTodayLima } from '@/lib/dates';
import { formatMonto, roundTwo } from '@/lib/utils';
import { textoCarreras } from '@/lib/delivery-compras';

const totalDe = (e: EncargoDetalle) => roundTwo(Number(e.total_compras) + Number(e.total_carreras));
const sinComprobante = (e: EncargoDetalle) => roundTwo(e.compras.filter(c => c.tipo_comprobante === 'sin_comprobante').reduce((t, c) => t + Number(c.total), 0));

/**
 * Delivery de compras (24-nov-2026, pedido de Jahnn). El administrador gestiona las compras de su sede; el
 * delivery tercerizado compra con su plata y trae factura de lo que se puede. Aquí: lo que se le debe, registrar
 * lo que trajo y pagarle. Al pagarle nacen los gastos para la rendición.
 */
export default function DeliveryComprasPage() {
  const { sedeActiva } = useSedeActiva();
  const { addToast } = useToast();
  const { repartidores, encargos, loading, error, registrar, pagar, anular } = useDeliveryCompras();
  const { pedidos } = usePedidos();
  const [registrando, setRegistrando] = useState(false);
  const [pagando, setPagando] = useState<EncargoDetalle | null>(null);
  const [anulando, setAnulando] = useState<EncargoDetalle | null>(null);

  const porPagar = encargos.filter(e => e.estado === 'por_pagar');
  const pagados = encargos.filter(e => e.estado === 'pagado');
  const debe = roundTwo(porPagar.reduce((t, e) => t + totalDe(e), 0));
  const mes = getTodayLima().slice(0, 7);
  const delMes = encargos.filter(e => e.fecha.startsWith(mes));
  const nombre = repartidores.length === 1 ? repartidores[0]!.nombre : 'el delivery';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-yayis-dark"><Bike size={24} /> Delivery de compras</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {nombre === 'el delivery' ? 'El delivery' : nombre} compra con su plata y trae factura de lo que se puede. Cuando llega, registra qué trajo y a cuánto; luego devuélvele lo que pagó más sus carreras. Al pagarle, los gastos se crean solos para la rendición de {sedeActiva?.nombre ?? 'tu sede'}.
        </p>
      </div>

      {error && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
      {!error && !loading && repartidores.length === 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Todavía no hay un delivery registrado. Pídele a Gerencia que lo agregue.</p>
      )}

      <section className="grid grid-cols-2 gap-2">
        <Dato etiqueta={`Le debes a ${nombre}`} valor={formatMonto(debe)} nota={porPagar.length === 0 ? 'Todo pagado' : `${porPagar.length} compra${porPagar.length === 1 ? '' : 's'} por pagar`} alerta={debe > 0} />
        <Dato etiqueta="Este mes" valor={formatMonto(roundTwo(delMes.reduce((t, e) => t + totalDe(e), 0)))}
          nota={`${formatMonto(roundTwo(delMes.reduce((t, e) => t + Number(e.total_carreras), 0)))} en carreras · ${formatMonto(roundTwo(delMes.reduce((t, e) => t + sinComprobante(e), 0)))} sin comprobante`} />
      </section>

      <Button className="h-12 w-full text-base" disabled={repartidores.length === 0 || !!error} onClick={() => setRegistrando(true)}>
        <Plus size={18} className="mr-1.5" /> Registrar lo que trajo
      </Button>

      {loading && encargos.length === 0 ? <Loading /> : (
        <>
          {porPagar.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-yayis-dark">Por pagar</h2>
              {porPagar.map(e => (
                <TarjetaEncargo key={e.id} e={e}>
                  <div className="mt-3 flex gap-2">
                    <Button className="flex-1" onClick={() => setPagando(e)}>Pagar {formatMonto(totalDe(e))}</Button>
                    <Button variant="outline" onClick={() => setAnulando(e)}>Anular</Button>
                  </div>
                </TarjetaEncargo>
              ))}
            </section>
          )}
          {pagados.length > 0 && (
            <Desplegable titulo="Ya pagados" resumen={<span>{pagados.length} · último el {fechaCorta(pagados[0]!.fecha_pago ?? pagados[0]!.fecha)}</span>}>
              <div className="space-y-2">{pagados.map(e => <TarjetaEncargo key={e.id} e={e} />)}</div>
            </Desplegable>
          )}
        </>
      )}

      {registrando && (
        <RegistrarTraido open onClose={() => setRegistrando(false)} repartidores={repartidores} pedidos={pedidos} guardar={registrar} />
      )}
      <PagarDelivery encargo={pagando} onClose={() => setPagando(null)} pagar={pagar} />
      <ConfirmDialog open={!!anulando} title="Anular este registro" variant="destructive" confirmLabel="Anular"
        message={anulando ? `Se borra lo registrado el ${fechaCorta(anulando.fecha)} (${formatMonto(totalDe(anulando))}). Los productos de la lista vuelven a quedar por comprar. Úsalo solo si te equivocaste.` : ''}
        onCancel={() => setAnulando(null)}
        onConfirm={async () => {
          if (!anulando) return;
          const { error: e } = await anular(anulando);
          setAnulando(null);
          addToast(e ?? 'Registro anulado.', e ? 'error' : 'success');
        }} />
    </div>
  );
}

function TarjetaEncargo({ e, children }: { e: EncargoDetalle; children?: React.ReactNode }) {
  const [ver, setVer] = useState(false);
  const productos = e.compras.reduce((n, c) => n + c.compra_items.length, 0);
  return (
    <div className="rounded-lg border bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{fechaCorta(e.fecha)} · {e.repartidores?.nombre ?? 'Delivery'}</p>
          <p className="text-xs text-muted-foreground">
            {productos} producto{productos === 1 ? '' : 's'} de {e.compras.length} proveedor{e.compras.length === 1 ? '' : 'es'}
            {Number(e.total_carreras) > 0 ? ` · ${e.carreras} carreras` : ''}
            {e.estado === 'pagado' && e.fecha_pago ? ` · pagado el ${fechaCorta(e.fecha_pago)} por ${e.metodo_pago === 'cuentas' ? 'Yape/transferencia' : 'efectivo'}` : ''}
          </p>
        </div>
        <span className="text-base font-bold tabular-nums text-yayis-dark">{formatMonto(totalDe(e))}</span>
      </div>
      <button type="button" onClick={() => setVer(!ver)} className="mt-1 flex items-center gap-1 text-xs text-yayis-green">
        {ver ? 'Ocultar detalle' : 'Ver detalle'} <ChevronDown size={14} className={ver ? 'rotate-180' : ''} />
      </button>
      {ver && (
        <div className="mt-2 space-y-2 text-xs">
          {e.compras.map(c => (
            <div key={c.id} className="rounded-md bg-gray-50 p-2">
              <div className="flex justify-between font-medium">
                <span>{c.proveedores?.nombre ?? 'Proveedor'} · {c.tipo_comprobante === 'sin_comprobante' ? 'sin comprobante' : `${c.tipo_comprobante}${c.numero_comprobante ? ` ${c.numero_comprobante}` : ''}`}</span>
                <span className="tabular-nums">{formatMonto(Number(c.total))}</span>
              </div>
              {c.observacion && <p className="text-muted-foreground">{c.observacion}</p>}
              <ul className="mt-1 space-y-0.5">
                {c.compra_items.map((it, k) => (
                  <li key={k} className="flex justify-between gap-2">
                    <span>{it.productos?.nombre ?? 'Producto'} · {Number(it.cantidad)} {it.unidad}</span>
                    <span className="tabular-nums">{formatMonto(Number(it.precio_total))}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-muted-foreground">Categoría: {c.categorias?.nombre ?? '—'}</p>
            </div>
          ))}
          {Number(e.total_carreras) > 0 && <p className="flex justify-between"><span>{textoCarreras(e.carreras, Number(e.precio_carrera), e.detalle_carreras)}</span><span className="tabular-nums">{formatMonto(Number(e.total_carreras))}</span></p>}
          {e.notas && <p className="text-muted-foreground">Nota: {e.notas}</p>}
        </div>
      )}
      {children}
    </div>
  );
}
