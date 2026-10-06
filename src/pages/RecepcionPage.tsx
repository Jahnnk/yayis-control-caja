import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { useEntregas, fetchUsuariosCompras, gastadoDe, type EntregaDetalle } from '@/hooks/useEntregas';
import { usePedidos } from '@/hooks/usePedidos';
import { useCategorias } from '@/hooks/useCategorias';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Loading } from '@/components/ui/loading';
import { CompraResumen } from '@/components/compras/CompraResumen';
import { formatMonto, roundTwo } from '@/lib/utils';
import { getTodayLima } from '@/lib/dates';
import { useSaldoSemanal } from '@/hooks/useSaldoSemanal';
import { SaldoMontoSemanal } from '@/components/gastos/SaldoMontoSemanal';
import { ESTADO_ITEM, diaSemanaDe, diferenciaDeCierre, fechaCorta, formatCantidad, sumarDias } from '@/lib/compras';
import { CheckCircle2, ChevronDown, HandCoins, Loader2, PackageCheck, Undo2, Wallet } from 'lucide-react';
import type { CompraDetalle, MetodoPago } from '@/types';

function RendicionPorCerrar({ entrega, categoriasSede, onDevolver, onCerrar }: {
  entrega: EntregaDetalle;
  categoriasSede: { id: string; nombre: string }[];
  onDevolver: (e: EntregaDetalle) => void;
  onCerrar: (e: EntregaDetalle, vueltoRecibido: number, categorias: Record<string, string>, saldoContinua: number) => void;
}) {
  const porDefecto = categoriasSede.find(c => c.nombre.trim().toLowerCase() === 'insumos')?.id ?? categoriasSede[0]?.id ?? '';
  const [categorias, setCategorias] = useState<Record<string, string>>({});
  const [vueltoRecibido, setVueltoRecibido] = useState(String(Number(entrega.vuelto ?? 0)));
  // Lo que Fabio no devolvió puede seguir con él para la semana siguiente (no es un faltante).
  const [sigueConFabio, setSigueConFabio] = useState(false);

  useEffect(() => {
    setCategorias(Object.fromEntries(entrega.compras.map(c => [c.id, c.categoria_id ?? porDefecto])));
  }, [entrega.compras, porDefecto]);

  const gastado = gastadoDe(entrega);
  const fotosPendientes = entrega.compras.filter(c => c.evidencia_pendiente).length;
  const vueltoEsperado = roundTwo(Number(entrega.monto) - gastado);
  const recibido = parseFloat(vueltoRecibido);
  const diferenciaBruta = roundTwo(Number(entrega.monto) - gastado - (recibido || 0));
  const saldoContinua = sigueConFabio && diferenciaBruta > 0 ? diferenciaBruta : 0;
  const diferencia = roundTwo(diferenciaBruta - saldoContinua);

  return (
    <Card className="border-blue-300">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Rendición de la entrega del <span className="capitalize">{fechaCorta(entrega.fecha)}</span></CardTitle>
        <p className="text-xs text-muted-foreground">Revisa cada compra y sus fotos, elige su categoría de gasto y confirma el vuelto que te devolvieron.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {entrega.compras.length === 0 && <p className="text-sm text-muted-foreground">No registró compras con este dinero.</p>}
        {entrega.compras.map(c => (
          <CompraResumen key={c.id} compra={c}>
            <Select
              className="h-7 w-40 text-xs"
              value={categorias[c.id] ?? ''}
              onChange={e => setCategorias(prev => ({ ...prev, [c.id]: e.target.value }))}
              aria-label={`Categoría de gasto de la compra a ${c.proveedores?.nombre}`}
            >
              {categoriasSede.map(cat => <option key={cat.id} value={cat.id}>{cat.nombre}</option>)}
            </Select>
          </CompraResumen>
        ))}

        <div className="grid grid-cols-2 gap-2 rounded-md bg-gray-50 p-3 text-sm sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Entregaste</p><p className="font-bold">{formatMonto(Number(entrega.monto))}</p></div>
          <div><p className="text-xs text-muted-foreground">Gastó</p><p className="font-bold">{formatMonto(gastado)}</p></div>
          <div><p className="text-xs text-muted-foreground">Vuelto que corresponde</p><p className="font-bold">{formatMonto(Math.max(vueltoEsperado, 0))}</p></div>
          <div><p className="text-xs text-muted-foreground">Compras dice que devuelve</p><p className="font-bold">{formatMonto(Number(entrega.vuelto ?? 0))}</p></div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium" htmlFor={`recibido-${entrega.id}`}>Vuelto que recibiste de verdad (S/)</label>
            <Input id={`recibido-${entrega.id}`} type="number" inputMode="decimal" min="0" step="0.01" className="mt-1 w-36" value={vueltoRecibido} onChange={e => setVueltoRecibido(e.target.value)} />
          </div>
          <p className={`pb-2 text-sm font-bold ${diferencia === 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {diferencia === 0
              ? (saldoContinua > 0 ? `✓ Cuadra: ${formatMonto(saldoContinua)} siguen con Fabio` : '✓ Cuadra al céntimo')
              : diferencia > 0
                ? `Faltan ${formatMonto(diferencia)}`
                : `La sede le debe ${formatMonto(-diferencia)} a Compras (puso de su bolsillo)`}
          </p>
        </div>

        {fotosPendientes > 0 && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {fotosPendientes === 1 ? '1 compra tiene' : `${fotosPendientes} compras tienen`} <strong>evidencia pendiente</strong>: Fabio debe subir las fotos que faltan antes de que puedas cerrar. Si prefieres, devuélvela a Compras.
          </p>
        )}

        {diferenciaBruta > 0 && (
          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-blue-200 bg-blue-50/60 p-3 text-sm">
            <input type="checkbox" className="mt-1" checked={sigueConFabio} onChange={e => setSigueConFabio(e.target.checked)} />
            <span>
              <strong>Fabio se queda con {formatMonto(diferenciaBruta)} para la próxima semana.</strong>
              <span className="block text-xs text-muted-foreground">Marca esto si ese dinero no es un faltante: sigue con Fabio para sus próximas compras. Se abre una entrega nueva con ese saldo y la próxima semana solo le completas hasta el monto semanal.</span>
            </span>
          </label>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
          <Button variant="outline" size="sm" onClick={() => onDevolver(entrega)}>
            <Undo2 size={14} className="mr-1" /> Devolver a Compras para corregir
          </Button>
          <Button size="sm" onClick={() => onCerrar(entrega, recibido, categorias, saldoContinua)} disabled={!(recibido >= 0) || fotosPendientes > 0}>
            <CheckCircle2 size={14} className="mr-1" /> Confirmar y cerrar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function RecepcionPage() {
  const { sedeActiva, responsable } = useSedeActiva();
  const { entregas, cerradas, loading, crearEntrega, anularEntrega, devolverACompras, cerrarEntrega } = useEntregas('sede');
  const { pedidos, confirmarRecepcion } = usePedidos();
  const { categorias } = useCategorias();
  const { addToast } = useToast();
  const hoy = getTodayLima();
  const encargado = responsable ?? 'el administrador';

  // Formulario de entrega
  const [receptores, setReceptores] = useState<{ id: string; nombre: string }[]>([]);
  const [receptorId, setReceptorId] = useState('');
  const [monto, setMonto] = useState('');
  const [versionSaldo, setVersionSaldo] = useState(0);
  const [fechaEntrega, setFechaEntrega] = useState(getTodayLima());
  // El dinero para compras se transfiere por Yape/Plin: «Cuentas» sale por defecto.
  const [metodo, setMetodo] = useState<MetodoPago>('cuentas');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    fetchUsuariosCompras().then(lista => {
      setReceptores(lista);
      setReceptorId(actual => actual || lista[0]?.id || '');
    });
  }, []);

  // Pedidos ya comprados, esperando que el admin confirme que llegaron
  const porRecibir = pedidos.filter(p => p.estado === 'comprado');
  const [comprasPorPedido, setComprasPorPedido] = useState<Record<string, CompraDetalle[]>>({});
  const idsPorRecibir = porRecibir.map(p => p.id).join(',');
  useEffect(() => {
    if (!idsPorRecibir) { setComprasPorPedido({}); return; }
    supabase
      .from('compras')
      .select('*, proveedores(nombre), compra_items(*, productos(nombre))')
      .in('pedido_id', idsPorRecibir.split(','))
      .then(({ data }) => {
        const agrupadas: Record<string, CompraDetalle[]> = {};
        for (const c of (data ?? []) as CompraDetalle[]) (agrupadas[c.pedido_id!] ??= []).push(c);
        setComprasPorPedido(agrupadas);
      });
  }, [idsPorRecibir]);

  const [observaciones, setObservaciones] = useState<Record<string, string>>({});
  const [porCerrar, setPorCerrar] = useState<{ entrega: EntregaDetalle; vuelto: number; categorias: Record<string, string>; saldoContinua: number } | null>(null);
  const [cerrando, setCerrando] = useState(false);

  const categoriasSede = useMemo(() => categorias.filter(c => c.activa).map(c => ({ id: c.id, nombre: c.nombre })), [categorias]);
  const abiertas = entregas.filter(e => e.estado === 'abierta');
  // Monto semanal que el administrador recibe de Gerencia: lo reparte a Compras según necesidad y
  // con él paga directamente lo que marca «Se paga con el monto semanal» (ver useSaldoSemanal).
  const saldoSemanal = useSaldoSemanal(versionSaldo);
  const porEntregar = Math.max(saldoSemanal.queda, 0);
  const enManosDeFabio = abiertas.reduce((t, e) => roundTwo(t + Number(e.monto) - gastadoDe(e)), 0);
  const rendidas = entregas.filter(e => e.estado === 'rendida');

  async function handleEntregar() {
    const valor = parseFloat(monto);
    if (!receptorId) return addToast('No hay usuario de Compras para recibir el dinero', 'error');
    if (!(valor > 0)) return addToast('El monto debe ser mayor a 0', 'error');
    if (!fechaEntrega || fechaEntrega > hoy) return addToast('La fecha de la entrega no puede ser futura', 'error');
    setGuardando(true);
    const { error } = await crearEntrega({ receptor_id: receptorId, monto: valor, metodo_pago: metodo, fecha: fechaEntrega, notas: nota.trim() || null });
    setGuardando(false);
    if (error) return addToast(`Error: ${error}`, 'error');
    addToast(`Entrega de ${formatMonto(valor)} registrada`, 'success');
    setMonto('');
    setNota('');
    setFechaEntrega(hoy);
    setVersionSaldo(v => v + 1);
  }

  async function handleAnular(e: EntregaDetalle) {
    const { error } = await anularEntrega(e);
    if (error) addToast(error, 'error');
    else { addToast('Entrega anulada', 'success'); setVersionSaldo(v => v + 1); }
  }

  async function handleDevolver(e: EntregaDetalle) {
    const { error } = await devolverACompras(e.id);
    if (error) addToast(`Error: ${error}`, 'error');
    else addToast('Devuelta a Compras para que corrija', 'success');
  }

  async function confirmarCierre() {
    if (!porCerrar) return;
    setCerrando(true);
    const { error, resultado } = await cerrarEntrega(porCerrar.entrega, porCerrar.vuelto, porCerrar.categorias, porCerrar.saldoContinua);
    setCerrando(false);
    setPorCerrar(null);
    if (error) return addToast(`Error: ${error}`, 'error');
    addToast(`Rendición cerrada: ${resultado?.gastos_creados ?? 0} gasto(s) por ${formatMonto(Number(resultado?.total_gastado ?? 0))} pasaron a la caja de ${encargado}.`, 'success');
  }

  async function handleRecibido(pedidoId: string) {
    const { error } = await confirmarRecepcion(pedidoId, observaciones[pedidoId] ?? null);
    if (error) addToast(`Error: ${error}`, 'error');
    else addToast('Recepción confirmada', 'success');
  }

  if (loading && entregas.length === 0) return <Loading text="Cargando..." />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold text-yayis-dark">Entregas y recepción{sedeActiva ? ` — ${sedeActiva.nombre}` : ''}</h1>

      {/* 1. Entregar dinero */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><HandCoins size={18} /> Entregar dinero a Compras</CardTitle>
          <p className="text-xs text-muted-foreground">Sale de la caja de {encargado}. Compras lo rendirá con boletas y vuelto.</p>
          <div className="mt-2">
            <SaldoMontoSemanal saldo={saldoSemanal}>
              <span className="text-xs text-muted-foreground">Fabio tiene sin gastar: {formatMonto(enManosDeFabio)}</span>
              {porEntregar > 0 && (
                <Button type="button" size="sm" variant="outline" onClick={() => setMonto(String(porEntregar))}>Entregar todo lo que queda ({formatMonto(porEntregar)})</Button>
              )}
            </SaldoMontoSemanal>
          </div>
        </CardHeader>
        <CardContent>
          {receptores.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay un usuario con rol Compras. Gerencia lo crea en Usuarios.</p>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs font-medium" htmlFor="receptor">A quién</label>
                <Select id="receptor" value={receptorId} onChange={e => setReceptorId(e.target.value)} className="mt-1 w-40">
                  {receptores.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium" htmlFor="monto-entrega">Monto (S/)</label>
                <Input id="monto-entrega" type="number" inputMode="decimal" min="0" step="0.01" className="mt-1 w-32" value={monto} onChange={e => setMonto(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium" htmlFor="fecha-entrega">Fecha de la entrega</label>
                <Input id="fecha-entrega" type="date" className="mt-1 w-40" value={fechaEntrega} max={hoy} onChange={e => setFechaEntrega(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium" htmlFor="metodo-entrega">Sale de</label>
                <Select id="metodo-entrega" value={metodo} onChange={e => setMetodo(e.target.value as MetodoPago)} className="mt-1 w-36">
                  <option value="cuentas">Cuentas (Yape / Plin)</option>
                  <option value="efectivo">Efectivo</option>
                </Select>
              </div>
              <Input placeholder="Nota (opcional)" value={nota} onChange={e => setNota(e.target.value)} className="w-48" aria-label="Nota" />
              <Button onClick={handleEntregar} disabled={guardando}>
                {guardando ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
                Registrar entrega
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Dinero en manos de Compras */}
      {abiertas.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Wallet size={18} /> Dinero en manos de Compras</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {abiertas.map(e => {
              const gastado = gastadoDe(e);
              return (
                <div key={e.id} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium capitalize">{fechaCorta(e.fecha)}</span>
                    <span>Entregado <strong>{formatMonto(Number(e.monto))}</strong> · gastado <strong>{formatMonto(gastado)}</strong> · le quedan <strong className={Number(e.monto) - gastado < 0 ? 'text-red-600' : ''}>{formatMonto(roundTwo(Number(e.monto) - gastado))}</strong></span>
                    {e.compras.length === 0 && (
                      <Button variant="ghost" size="sm" className="ml-auto text-red-600" onClick={() => handleAnular(e)}>Anular</Button>
                    )}
                  </div>
                  {e.compras.map(c => <CompraResumen key={c.id} compra={c} />)}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* 3. Rendiciones por confirmar */}
      {rendidas.map(e => (
        <RendicionPorCerrar
          key={e.id}
          entrega={e}
          categoriasSede={categoriasSede}
          onDevolver={handleDevolver}
          onCerrar={(ent, vuelto, cats, saldoContinua) => {
            if (!(vuelto >= 0)) return addToast('Escribe el vuelto que recibiste (0 si no hubo)', 'error');
            if (ent.compras.some(c => !cats[c.id])) return addToast('Elige la categoría de cada compra', 'error');
            setPorCerrar({ entrega: ent, vuelto, categorias: cats, saldoContinua });
          }}
        />
      ))}

      {/* 4. Mercadería por recibir */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><PackageCheck size={18} /> Mercadería por recibir</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {porRecibir.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay compras terminadas esperando tu confirmación.</p>
          ) : porRecibir.map(p => (
            <div key={p.id} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-bold capitalize">{p.urgente ? 'Urgente · ' : ''}{fechaCorta(p.fecha_compra)}</span>
                <span className="text-xs text-muted-foreground">{p.pedido_items.length} productos</span>
              </div>
              <ul className="space-y-1 text-xs">
                {p.pedido_items.map(i => (
                  <li key={i.id} className="flex items-center gap-2">
                    <span className={`rounded-full px-1.5 py-0.5 ${ESTADO_ITEM[i.estado].clase}`}>{ESTADO_ITEM[i.estado].label}</span>
                    <span>{i.productos?.nombre}</span>
                    <span className="text-muted-foreground">{formatCantidad(i.cantidad)} {i.unidad}</span>
                  </li>
                ))}
              </ul>
              {(comprasPorPedido[p.id] ?? []).map(c => <CompraResumen key={c.id} compra={c} />)}
              <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                <Input
                  placeholder="¿Algo llegó mal o faltó? (opcional)"
                  value={observaciones[p.id] ?? ''}
                  onChange={e => setObservaciones(prev => ({ ...prev, [p.id]: e.target.value }))}
                  className="min-w-[14rem] flex-1"
                  aria-label="Observación de recepción"
                />
                <Button size="sm" onClick={() => handleRecibido(p.id)}>
                  <CheckCircle2 size={14} className="mr-1" /> {observaciones[p.id]?.trim() ? 'Recibido con observaciones' : 'Recibido conforme'}
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Historial plegado */}
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
                  <span className="capitalize">{fechaCorta(e.fecha)}</span>
                  <span>Entregado {formatMonto(Number(e.monto))} · gastado {formatMonto(gastadoDe(e))} · vuelto {formatMonto(Number(e.vuelto_recibido ?? 0))}{Number(e.saldo_continua) > 0 ? ` · siguió con Fabio ${formatMonto(Number(e.saldo_continua))}` : ''}</span>
                  <span className={`ml-auto text-xs font-bold ${diferencia === 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {diferencia === 0 ? 'Cuadró' : diferencia > 0 ? `Faltaron ${formatMonto(diferencia)}` : `Se le debía ${formatMonto(-diferencia)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      )}

      <ConfirmDialog
        open={porCerrar !== null}
        title="¿Confirmar y cerrar esta rendición?"
        message={porCerrar
          ? `Se crearán ${porCerrar.entrega.compras.length} gasto(s) por ${formatMonto(gastadoDe(porCerrar.entrega))} en la caja de ${encargado}, pendientes de reposición, y registras que recibiste ${formatMonto(porCerrar.vuelto)} de vuelto.${porCerrar.saldoContinua > 0 ? ` Además, ${formatMonto(porCerrar.saldoContinua)} siguen con Fabio: se abre una entrega nueva con ese saldo para la próxima semana.` : ''} Esto no se puede deshacer.`
          : ''}
        confirmLabel={cerrando ? 'Cerrando...' : 'Sí, cerrar'}
        onConfirm={confirmarCierre}
        onCancel={() => setPorCerrar(null)}
      />
    </div>
  );
}
