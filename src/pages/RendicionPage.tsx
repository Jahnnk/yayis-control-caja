import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useEntregas, gastadoDe, type EntregaDetalle } from '@/hooks/useEntregas';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Loading } from '@/components/ui/loading';
import { CompraResumen } from '@/components/compras/CompraResumen';
import { formatMonto, roundTwo } from '@/lib/utils';
import { diferenciaDeCierre, fechaCorta } from '@/lib/compras';
import { ChevronDown, Clock, Wallet } from 'lucide-react';

function TarjetaEntrega({ entrega, puedeRendir, onRendir, onEliminarCompra }: {
  entrega: EntregaDetalle;
  puedeRendir: boolean;
  onRendir: (entrega: EntregaDetalle, vuelto: number) => void;
  onEliminarCompra: (entrega: EntregaDetalle, compraId: string) => void;
}) {
  const gastado = gastadoDe(entrega);
  const saldo = roundTwo(Number(entrega.monto) - gastado);
  const [vuelto, setVuelto] = useState(String(Math.max(saldo, 0)));
  const abierta = entrega.estado === 'abierta';

  return (
    <Card className={abierta ? '' : 'border-blue-200 bg-blue-50/30'}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{entrega.sedes?.nombre} · entrega del <span className="capitalize">{fechaCorta(entrega.fecha)}</span></CardTitle>
          <span className="text-sm">Recibiste <strong>{formatMonto(Number(entrega.monto))}</strong> <span className="text-xs text-muted-foreground">({entrega.metodo_pago === 'efectivo' ? 'efectivo' : 'cuentas'})</span></span>
        </div>
        {entrega.notas && <p className="text-xs text-muted-foreground">Nota: {entrega.notas}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        {entrega.compras.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no registraste compras con este dinero.</p>
        ) : (
          <div className="space-y-2">
            {entrega.compras.map(c => (
              <CompraResumen key={c.id} compra={c} onEliminar={abierta && puedeRendir ? () => onEliminarCompra(entrega, c.id) : undefined} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 rounded-md bg-gray-50 p-3 text-center text-sm">
          <div><p className="text-xs text-muted-foreground">Recibiste</p><p className="font-bold">{formatMonto(Number(entrega.monto))}</p></div>
          <div><p className="text-xs text-muted-foreground">Gastaste</p><p className="font-bold">{formatMonto(gastado)}</p></div>
          <div>
            <p className="text-xs text-muted-foreground">{saldo >= 0 ? 'Te queda' : 'Pusiste tú'}</p>
            <p className={`font-bold ${saldo < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatMonto(Math.abs(saldo))}</p>
          </div>
        </div>

        {abierta && puedeRendir && (
          <div className="flex flex-wrap items-end gap-3 border-t pt-3">
            <div>
              <label className="text-xs font-medium" htmlFor={`vuelto-${entrega.id}`}>Vuelto que devuelves (S/)</label>
              <Input id={`vuelto-${entrega.id}`} type="number" inputMode="decimal" min="0" step="0.01" className="mt-1 w-32" value={vuelto} onChange={e => setVuelto(e.target.value)} />
            </div>
            <Button onClick={() => onRendir(entrega, parseFloat(vuelto))}>Rendir cuentas</Button>
            {saldo < 0 && <p className="w-full text-xs text-red-600">Gastaste {formatMonto(-saldo)} más de lo que recibiste: el administrador de {entrega.sedes?.nombre} te lo devolverá.</p>}
          </div>
        )}
        {!abierta && (
          <p className="flex items-center gap-1.5 border-t pt-3 text-sm text-blue-800">
            <Clock size={14} /> Rendida: informaste {formatMonto(Number(entrega.vuelto ?? 0))} de vuelto. Falta que {entrega.sedes?.nombre} lo confirme.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function RendicionPage() {
  const { profile } = useAuth();
  const esCompras = profile?.rol === 'compras';
  const { entregas, cerradas, loading, rendirEntrega, eliminarCompra } = useEntregas('mias');
  const { addToast } = useToast();
  const [porRendir, setPorRendir] = useState<{ entrega: EntregaDetalle; vuelto: number } | null>(null);
  const [porEliminar, setPorEliminar] = useState<{ entrega: EntregaDetalle; compraId: string } | null>(null);

  function pedirRendir(entrega: EntregaDetalle, vuelto: number) {
    if (!(vuelto >= 0)) return addToast('Escribe el vuelto (0 si no sobró nada)', 'error');
    setPorRendir({ entrega, vuelto });
  }

  async function confirmarRendir() {
    if (!porRendir) return;
    const { error } = await rendirEntrega(porRendir.entrega.id, porRendir.vuelto);
    setPorRendir(null);
    if (error) addToast(`Error: ${error}`, 'error');
    else addToast('Rendición enviada. El administrador la confirmará.', 'success');
  }

  async function confirmarEliminar() {
    if (!porEliminar) return;
    const compra = porEliminar.entrega.compras.find(c => c.id === porEliminar.compraId);
    setPorEliminar(null);
    if (!compra) return;
    const { error } = await eliminarCompra(compra);
    if (error) addToast(`Error: ${error}`, 'error');
    else addToast('Compra eliminada. Puedes volver a registrarla desde la ruta.', 'success');
  }

  if (loading && entregas.length === 0) return <Loading text="Cargando tu dinero..." />;

  const abiertas = entregas.filter(e => e.estado === 'abierta');
  const rendidas = entregas.filter(e => e.estado === 'rendida');
  const enMano = abiertas.reduce((s, e) => roundTwo(s + Number(e.monto) - gastadoDe(e)), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-yayis-dark">{esCompras ? 'Mi dinero y rendición' : 'Dinero en manos de Compras'}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Wallet size={15} /> {esCompras ? 'Tienes' : 'Compras tiene'} <strong className="text-yayis-dark">{formatMonto(enMano)}</strong> por gastar o devolver.
        </p>
      </div>

      {abiertas.length === 0 && rendidas.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {esCompras ? 'No tienes dinero entregado por ninguna sede en este momento.' : 'No hay dinero entregado a Compras sin rendir.'}
        </p>
      )}

      {abiertas.map(e => (
        <TarjetaEntrega key={e.id} entrega={e} puedeRendir={esCompras} onRendir={pedirRendir} onEliminarCompra={(ent, compraId) => setPorEliminar({ entrega: ent, compraId })} />
      ))}
      {rendidas.map(e => (
        <TarjetaEntrega key={e.id} entrega={e} puedeRendir={false} onRendir={pedirRendir} onEliminarCompra={() => {}} />
      ))}

      {cerradas.length > 0 && (
        <details className="group rounded-lg border bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-bold text-yayis-dark">
            <span>Rendiciones cerradas ({cerradas.length})</span>
            <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="divide-y border-t text-sm">
            {cerradas.map(e => {
              const diferencia = diferenciaDeCierre(e.monto, gastadoDe(e), e.vuelto_recibido, e.saldo_continua);
              return (
                <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                  <span className="font-medium">{e.sedes?.nombre}</span>
                  <span className="capitalize text-muted-foreground">{fechaCorta(e.fecha)}</span>
                  <span>Recibido {formatMonto(Number(e.monto))} · gastado {formatMonto(gastadoDe(e))} · vuelto {formatMonto(Number(e.vuelto_recibido ?? 0))}{Number(e.saldo_continua) > 0 ? ` · sigue contigo ${formatMonto(Number(e.saldo_continua))}` : ''}</span>
                  <span className={`ml-auto text-xs font-bold ${diferencia === 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {diferencia === 0 ? 'Cuadró' : diferencia > 0 ? `Faltaron ${formatMonto(diferencia)}` : `Sobraron ${formatMonto(-diferencia)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      )}

      <ConfirmDialog
        open={porRendir !== null}
        title="¿Rendir cuentas de esta entrega?"
        message={porRendir
          ? `Informas que devuelves ${formatMonto(porRendir.vuelto)} de vuelto a ${porRendir.entrega.sedes?.nombre}. Después ya no podrás agregar ni cambiar compras de esta entrega.`
          : ''}
        confirmLabel="Sí, rendir"
        onConfirm={confirmarRendir}
        onCancel={() => setPorRendir(null)}
      />
      <ConfirmDialog
        open={porEliminar !== null}
        title="¿Eliminar esta compra?"
        message="Se borrará la compra con sus fotos. Úsalo solo si la registraste mal."
        confirmLabel="Sí, eliminar"
        variant="destructive"
        onConfirm={confirmarEliminar}
        onCancel={() => setPorEliminar(null)}
      />
    </div>
  );
}
