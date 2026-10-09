import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { useVistaGeneral } from '@/hooks/useVistaGeneral';
import { useFinanzas } from '@/hooks/useFinanzas';
import { calcularAlertas } from '@/lib/alertas';
import { calcularVistaGeneral, PERIODOS, periodoDe, type ClavePeriodo, type Periodo } from '@/lib/vista-general';
import { ESTADO_PEDIDO, fechaCorta, fechaLarga, formatCantidad } from '@/lib/compras';
import { MODALIDAD_LABEL, esEfectivoPendiente } from '@/lib/deliverys';
import { getTodayLima } from '@/lib/dates';
import { formatMonto, roundTwo } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { Loading } from '@/components/ui/loading';
import { ArrowRight, BellRing, Bike, CalendarDays, ChevronDown, ClipboardList, Download, Loader2, PackageX, Receipt, ShoppingCart, Wallet } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { Desplegable } from '@/components/ui/desplegable';
import { SeguimientoMini, SeguimientoPedido } from '@/components/compras/SeguimientoPedido';
import { seguimientoDePedido } from '@/lib/seguimiento-pedido';
import type { PedidoVista } from '@/hooks/useVistaGeneral';

/** Sección plegada: el resumen siempre a la vista, el detalle al abrirla. */
function Cifra({ titulo, valor, detalle, alerta }: { titulo: string; valor: string; detalle: ReactNode; alerta?: boolean }) {
  return (
    <Card className={alerta ? 'border-amber-300 bg-amber-50/50' : ''}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{titulo}</p>
        <p className={`text-xl font-bold ${alerta ? 'text-amber-800' : 'text-yayis-dark'}`}>{valor}</p>
        <p className="text-xs text-muted-foreground">{detalle}</p>
      </CardContent>
    </Card>
  );
}

const Sede = ({ nombre }: { nombre: string | undefined }) => (
  <span className="rounded bg-yayis-cream px-2 py-0.5 text-xs font-bold text-yayis-dark">{nombre}</span>
);

export function VistaGeneralPage() {
  const hoy = getTodayLima();
  const { sedes } = useSedeActiva();
  const [clave, setClave] = useState<ClavePeriodo>('hoy');
  const [periodo, setPeriodo] = useState<Periodo>({ desde: hoy, hasta: hoy });
  const [sedeFiltro, setSedeFiltro] = useState('');
  const [exportando, setExportando] = useState(false);
  const { addToast } = useToast();
  const datos = useVistaGeneral(periodo.desde, periodo.hasta);
  const finanzas = useFinanzas();

  const v = useMemo(
    () => calcularVistaGeneral(datos, periodo, sedes, sedeFiltro, hoy),
    [datos, periodo, sedes, sedeFiltro, hoy],
  );
  // Las alertas son de "ahora", no del periodo elegido.
  const alertas = useMemo(() => calcularAlertas(finanzas, hoy).filter(a => !sedeFiltro || a.sedeId === sedeFiltro), [finanzas, hoy, sedeFiltro]);
  const alertasAltas = alertas.filter(a => a.nivel === 'alta').length;

  function elegir(c: Exclude<ClavePeriodo, 'otro'>) { setClave(c); setPeriodo(periodoDe(c, hoy)); }
  function cambiarFecha(campo: 'desde' | 'hasta', valor: string) {
    if (!valor) return;
    setClave('otro');
    setPeriodo(p => {
      const n = { ...p, [campo]: valor };
      return n.desde > n.hasta ? { desde: valor, hasta: valor } : n;
    });
  }

  const unDia = periodo.desde === periodo.hasta;
  const tituloPeriodo = unDia
    ? `${fechaLarga(periodo.desde)}${periodo.desde === hoy ? ' (hoy)' : ''}`
    : `del ${fechaCorta(periodo.desde)} al ${fechaCorta(periodo.hasta)}`;
  const noHabia = v.sinComprar.filter(p => p.motivo === 'no_habia').length;
  const pendientes = v.sinComprar.length - noHabia;
  const maxCategoria = v.porCategoria[0]?.monto ?? 0;
  const listasActivas = v.listas.filter(p => p.estado !== 'cancelado');
  // Seguimiento de cada lista: la primera compra registrada para sus productos marca cuándo empezó «Comprando».
  const primeraCompraDe = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of datos.compras) {
      for (const it of c.compra_items ?? []) {
        if (!it.pedido_item_id) continue;
        const antes = m.get(it.pedido_item_id);
        if (!antes || c.created_at < antes) m.set(it.pedido_item_id, c.created_at);
      }
    }
    return m;
  }, [datos.compras]);
  function seguimiento(p: PedidoVista) {
    const horas = p.pedido_items.map(i => primeraCompraDe.get(i.id)).filter((h): h is string => !!h).sort();
    return seguimientoDePedido(p, { hoy, mirada: 'gerencia', sede: p.sedes?.nombre, primeraCompra: horas[0] ?? null });
  }

  async function descargarExcel() {
    setExportando(true);
    try {
      const { exportarGastosPorCategoria } = await import('@/lib/exportGastosCategoria');
      await exportarGastosPorCategoria(v.movimientos, {
        periodo: tituloPeriodo,
        sedes: sedes.filter(s => !sedeFiltro || s.id === sedeFiltro).map(s => ({ id: s.id, nombre: s.nombre })),
        desde: periodo.desde,
        hasta: periodo.hasta,
        generado: hoy,
      });
    } catch (e) {
      console.error(e);
      addToast('No se pudo generar el Excel. Intenta de nuevo.', 'error');
    }
    setExportando(false);
  }

  if (datos.loading && datos.gastos.length === 0 && datos.compras.length === 0) return <Loading text="Cargando la vista general..." />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-yayis-dark">Vista general</h1>
          <p className="text-sm text-muted-foreground">{tituloPeriodo.charAt(0).toUpperCase() + tituloPeriodo.slice(1)} · {sedeFiltro ? sedes.find(s => s.id === sedeFiltro)?.nombre : 'las 3 sedes'}</p>
        </div>
        <Button variant="outline" onClick={descargarExcel} disabled={exportando || datos.loading} title="Gastos del periodo por sede y categoría, con gasto fijo o variable">
          {exportando ? <Loader2 size={16} className="mr-1 animate-spin" /> : <Download size={16} className="mr-1" />}
          Descargar Excel
        </Button>
      </div>

      {/* Filtros */}
      <div className="space-y-3 rounded-lg border bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Periodo">
          {PERIODOS.map(p => (
            <Button key={p.clave} type="button" size="sm" variant={clave === p.clave ? 'default' : 'outline'} aria-pressed={clave === p.clave} onClick={() => elegir(p.clave)}>
              {p.label}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-2 items-end gap-3 sm:flex sm:flex-wrap">
          <div>
            <label className="text-xs font-medium" htmlFor="vg-desde">Desde</label>
            <Input id="vg-desde" type="date" className="mt-1 w-full sm:w-40" value={periodo.desde} max={hoy} onChange={e => cambiarFecha('desde', e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium" htmlFor="vg-hasta">Hasta</label>
            <Input id="vg-hasta" type="date" className="mt-1 w-full sm:w-40" value={periodo.hasta} max={hoy} onChange={e => cambiarFecha('hasta', e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium" htmlFor="vg-sede">Sede</label>
            <Select id="vg-sede" value={sedeFiltro} onChange={e => setSedeFiltro(e.target.value)} className="mt-1 w-full sm:w-40">
              <option value="">Todas</option>
              {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </Select>
          </div>
        </div>
      </div>

      {/* Números clave del periodo */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Cifra titulo="Total gastado" valor={formatMonto(v.totalGastado)} detalle={<>Caja {formatMonto(v.totalCaja)} + compras {formatMonto(v.totalCompras)}</>} />
        <Cifra titulo="Gastos de caja (administradores)" valor={formatMonto(v.totalCaja)} detalle={`${v.gastosCaja.length} gasto(s) registrados`} />
        <Cifra
          titulo="Compras a proveedores"
          valor={formatMonto(v.totalCompras)}
          detalle={<>{v.compras.length} compra(s) · contado {formatMonto(v.comprasContado)} · crédito {formatMonto(v.comprasCredito)}{v.sinBoleta > 0 && <> · sin boleta {formatMonto(v.sinBoleta)}</>}{v.fotosPendientes > 0 && <> · <strong className="text-amber-700">{v.fotosPendientes} con foto pendiente</strong></>}</>}
          alerta={v.fotosPendientes > 0}
        />
        <Cifra titulo="Dinero entregado a Compras" valor={formatMonto(v.entregado)} detalle={`${v.entregas.length} entrega(s) de los administradores`} />
        <Cifra
          titulo="Deliverys"
          valor={String(v.resumenDeliverys.cantidad)}
          detalle={<>Cobrado {formatMonto(roundTwo(v.deliverys.reduce((t, d) => t + Number(d.cobrado), 0)))}{v.resumenDeliverys.efectivoPendiente > 0 && <> · <strong className="text-amber-700">{formatMonto(v.resumenDeliverys.efectivoPendiente)} sin entregar</strong></>}</>}
          alerta={v.resumenDeliverys.efectivoPendiente > 0}
        />
        <Cifra titulo="Productos sin comprar" valor={String(v.sinComprar.length)} detalle={`${noHabia} no había · ${pendientes} siguen pendientes`} alerta={v.sinComprar.length > 0} />
      </div>

      {/* Alertas de ahora */}
      <Link to="/finanzas" className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm shadow-sm ${alertasAltas > 0 ? 'border-red-300 bg-red-50/60' : alertas.length > 0 ? 'border-amber-200 bg-amber-50/50' : 'bg-white'}`}>
        <BellRing size={16} className={alertasAltas > 0 ? 'text-red-600' : 'text-muted-foreground'} />
        {alertas.length === 0
          ? <span className="text-emerald-700">Para revisar ahora: todo en orden.</span>
          : <span><strong>Para revisar ahora: {alertas.length} alerta(s)</strong>{alertasAltas > 0 && <span className="text-red-700"> · {alertasAltas} importante(s)</span>} <span className="text-xs text-muted-foreground">(facturas, rendiciones, fotos, efectivo de deliverys, precios)</span></span>}
        <span className="ml-auto flex items-center gap-1 text-xs font-medium text-yayis-green">Panel de Finanzas <ArrowRight size={14} /></span>
      </Link>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* Por sede */}
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Por sede</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground whitespace-nowrap">
                  <th className="py-2 font-medium">Sede</th>
                  <th className="py-2 text-right font-medium">Caja</th>
                  <th className="py-2 text-right font-medium">Compras</th>
                  <th className="py-2 text-right font-medium">Total</th>
                  <th className="py-2 text-right font-medium">A Compras</th>
                  <th className="py-2 text-right font-medium">Deliverys</th>
                </tr>
              </thead>
              <tbody>
                {v.porSede.map(s => (
                  <tr key={s.sedeId} className="border-b last:border-b-0">
                    <td className="py-2 font-medium">{s.nombre}</td>
                    <td className="py-2 text-right">{formatMonto(s.gastosCaja)}</td>
                    <td className="py-2 text-right">{formatMonto(s.compras)}</td>
                    <td className="py-2 text-right font-bold">{formatMonto(s.total)}</td>
                    <td className="py-2 text-right">{formatMonto(s.entregado)}</td>
                    <td className="py-2 text-right">{s.deliverys}{s.cobradoDeliverys > 0 && <span className="block text-xs text-muted-foreground">{formatMonto(s.cobradoDeliverys)}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* En qué se gastó */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">¿En qué se gastó?</CardTitle>
            <p className="text-xs text-muted-foreground">Gastos de caja y compras a proveedores, por categoría. Una compra toma la categoría al cerrarse su rendición.</p>
          </CardHeader>
          <CardContent>
            {v.porCategoria.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No hubo gastos en este periodo.</p>
            ) : (
              <div className="space-y-2">
                {v.porCategoria.map(c => (
                  <div key={c.nombre} title={`${c.nombre}: ${formatMonto(c.monto)} (${c.porcentaje}%)`}>
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="truncate">{c.nombre}{c.tipo && <span className="ml-1.5 text-xs text-muted-foreground">· {c.tipo === 'fijo' ? 'fijo' : 'variable'}</span>}</span>
                      <span className="shrink-0"><strong>{formatMonto(c.monto)}</strong> <span className="text-xs text-muted-foreground">{c.porcentaje}%</span></span>
                    </div>
                    <div className="mt-0.5 h-2 w-full rounded-full bg-gray-100">
                      <div className="h-2 rounded-full bg-yayis-green" style={{ width: `${maxCategoria > 0 ? Math.max((c.monto / maxCategoria) * 100, 1) : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Día por día */}
      {!unDia && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><CalendarDays size={18} /> Día por día</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground whitespace-nowrap">
                  <th className="py-2 font-medium">Día</th>
                  <th className="py-2 text-right font-medium">Caja</th>
                  <th className="py-2 text-right font-medium">Compras</th>
                  <th className="py-2 text-right font-medium">Total</th>
                  <th className="py-2 text-right font-medium">Listas</th>
                  <th className="py-2 text-right font-medium">No había</th>
                  <th className="py-2 text-right font-medium">Deliverys</th>
                </tr>
              </thead>
              <tbody>
                {v.porDia.map(d => {
                  const vacio = d.total === 0 && d.listas === 0 && d.deliverys === 0;
                  return (
                    <tr key={d.fecha} className={`border-b last:border-b-0 ${vacio ? 'text-muted-foreground' : ''}`}>
                      <td className="py-2 capitalize">{fechaCorta(d.fecha)}</td>
                      <td className="py-2 text-right">{d.gastosCaja ? formatMonto(d.gastosCaja) : '—'}</td>
                      <td className="py-2 text-right">{d.compras ? formatMonto(d.compras) : '—'}</td>
                      <td className="py-2 text-right font-bold">{d.total ? formatMonto(d.total) : '—'}</td>
                      <td className="py-2 text-right">{d.listas || '—'}</td>
                      <td className={`py-2 text-right ${d.noHabia ? 'font-bold text-red-600' : ''}`}>{d.noHabia || '—'}</td>
                      <td className="py-2 text-right">{d.deliverys || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Listas de los administradores */}
      <Desplegable
        icono={<ClipboardList size={16} />}
        titulo="Listas de los administradores"
        resumen={<>
          <span>{listasActivas.length} lista(s)</span>
          {v.listas.some(p => p.urgente) && <span className="font-bold text-amber-700">{v.listas.filter(p => p.urgente).length} urgente(s)</span>}
          {v.listasAtrasadas.length > 0 && <span className="font-bold text-red-600">{v.listasAtrasadas.length} atrasada(s) de antes</span>}
        </>}
      >
        {[...v.listasAtrasadas, ...v.listas].length === 0 ? (
          <p className="text-sm text-muted-foreground">No hubo listas en este periodo.</p>
        ) : (
          <div className="divide-y">
            {[...v.listasAtrasadas, ...v.listas].map(p => {
              const comprados = p.pedido_items.filter(i => i.estado === 'comprado').length;
              const nh = p.pedido_items.filter(i => i.estado === 'no_habia').length;
              const pend = p.pedido_items.length - comprados - nh;
              return (
                <details key={p.id} className="py-2">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm">
                    <Sede nombre={p.sedes?.nombre} />
                    <span className="capitalize">{fechaCorta(p.fecha_compra)}</span>
                    <SeguimientoMini seguimiento={seguimiento(p)} />
                    {p.urgente && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">Urgente</span>}
                    {p.estado === 'enviado' && p.fecha_compra < hoy && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">Atrasada</span>}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {p.pedido_items.length} producto(s) · <span className="text-emerald-700">{comprados} comprado(s)</span>
                      {nh > 0 && <> · <span className="text-red-600">{nh} no había</span></>}
                      {pend > 0 && <> · {pend} pendiente(s)</>}
                    </span>
                  </summary>
                  <div className="mt-2"><SeguimientoPedido seguimiento={seguimiento(p)} /></div>
                  <div className="mt-2 space-y-1 pl-2 text-sm">
                    {p.pedido_items.map(i => (
                      <div key={i.id} className="flex flex-wrap items-center gap-2">
                        <span>{i.productos?.nombre}</span>
                        <span className="font-medium">{formatCantidad(i.cantidad)} {i.unidad}</span>
                        <span className="text-xs text-muted-foreground">{i.proveedores?.nombre ?? ''}</span>
                        <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${i.estado === 'comprado' ? 'bg-emerald-50 text-emerald-700' : i.estado === 'no_habia' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                          {i.estado === 'comprado' ? 'Comprado' : i.estado === 'no_habia' ? 'No había' : 'Por comprar'}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </Desplegable>

      {/* Productos que no se compraron */}
      <Desplegable
        icono={<PackageX size={16} />}
        titulo="Productos que no se compraron"
        resumen={v.sinComprar.length === 0 ? <span className="text-emerald-700">Se compró todo</span> : <>
          {noHabia > 0 && <span className="font-bold text-red-600">{noHabia} no había</span>}
          {pendientes > 0 && <span className="font-bold text-amber-700">{pendientes} siguen pendientes</span>}
        </>}
      >
        {v.sinComprar.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada que reportar.</p>
        ) : (
          <div className="divide-y text-sm">
            {v.sinComprar.map(p => (
              <div key={p.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <Sede nombre={p.sede} />
                <span className="font-medium">{p.producto}</span>
                <span>{formatCantidad(p.cantidad)} {p.unidad}</span>
                <span className="text-xs text-muted-foreground">lista del {fechaCorta(p.fechaLista)}{p.proveedor ? ` · ${p.proveedor}` : ''}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-xs ${p.motivo === 'no_habia' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
                  {p.motivo === 'no_habia' ? 'No había' : 'Sigue pendiente'}
                </span>
              </div>
            ))}
          </div>
        )}
      </Desplegable>

      {/* Compras a proveedores */}
      <Desplegable
        icono={<ShoppingCart size={16} />}
        titulo="Compras a proveedores"
        resumen={<>
          <span>{v.compras.length} compra(s) · <strong className="text-yayis-dark">{formatMonto(v.totalCompras)}</strong></span>
          {v.sinBoleta > 0 && <span>sin boleta {formatMonto(v.sinBoleta)}</span>}
          {v.fotosPendientes > 0 && <span className="font-bold text-amber-700">{v.fotosPendientes} con foto pendiente</span>}
        </>}
      >
        {v.compras.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hubo compras en este periodo.</p>
        ) : (
          <div className="divide-y">
            {v.compras.map(c => (
              <details key={c.id} className="py-2">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm">
                  <Sede nombre={c.sedes?.nombre} />
                  <span className="capitalize text-muted-foreground">{fechaCorta(c.fecha)}</span>
                  <span className="font-medium">{c.proveedores?.nombre}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.tipo_comprobante === 'sin_comprobante' ? 'Sin boleta' : c.tipo_comprobante === 'boleta' ? 'Boleta' : 'Factura'}
                    {c.condicion_pago === 'credito' ? ' · a crédito' : c.metodo_pago === 'cuentas' ? ' · Yape/transf.' : ' · efectivo'}
                  </span>
                  {c.evidencia_pendiente && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">Foto pendiente</span>}
                  <span className="ml-auto font-bold">{formatMonto(Number(c.total))}</span>
                </summary>
                <div className="mt-1 space-y-0.5 pl-2 text-xs text-muted-foreground">
                  {c.compra_items.map(i => (
                    <p key={i.id}>{i.productos?.nombre ?? 'Producto'} · {formatCantidad(i.cantidad)} {i.unidad} · {formatMonto(Number(i.precio_total))}</p>
                  ))}
                  {c.observacion && <p className="italic">"{c.observacion}"</p>}
                </div>
              </details>
            ))}
          </div>
        )}
      </Desplegable>

      {/* Dinero y rendiciones */}
      <Desplegable
        icono={<Wallet size={16} />}
        titulo="Dinero entregado y rendiciones"
        resumen={<>
          <span>Entregado {formatMonto(v.entregado)}</span>
          <span>{v.rendiciones.filter(r => r.entrega.estado === 'cerrada').length} rendición(es) cerrada(s)</span>
          {v.rendiciones.some(r => r.diferencia !== null && r.diferencia !== 0) && <span className="font-bold text-red-600">alguna no cuadró</span>}
        </>}
      >
        {v.rendiciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hubo entregas ni rendiciones en este periodo.</p>
        ) : (
          <div className="divide-y text-sm">
            {v.rendiciones.map(({ entrega: e, gastado, diferencia }) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 py-2">
                <Sede nombre={e.sedes?.nombre} />
                <span className="text-muted-foreground">entrega del {fechaCorta(e.fecha)}</span>
                <span>Recibió <strong>{formatMonto(Number(e.monto))}</strong> · gastó <strong>{formatMonto(gastado)}</strong>{e.estado !== 'abierta' && <> · vuelto <strong>{formatMonto(Number(e.vuelto_recibido ?? e.vuelto ?? 0))}</strong></>}{Number(e.saldo_continua) > 0 && <> · sigue con Compras {formatMonto(Number(e.saldo_continua))}</>}</span>
                <span className={`ml-auto text-xs font-bold ${e.estado === 'abierta' ? 'text-blue-700' : e.estado === 'rendida' ? 'text-amber-700' : diferencia === 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {e.estado === 'abierta' ? 'Sin rendir' : e.estado === 'rendida' ? 'Rendida, falta cerrar' : diferencia === 0 ? 'Cuadró' : diferencia! > 0 ? `Faltaron ${formatMonto(diferencia!)}` : `Sobraron ${formatMonto(-diferencia!)}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </Desplegable>

      {/* Deliverys */}
      <Desplegable
        icono={<Bike size={16} />}
        titulo="Deliverys"
        resumen={<>
          <span>{v.resumenDeliverys.cantidad} delivery(s)</span>
          <span>productos {formatMonto(v.resumenDeliverys.totalProductos)} · delivery {formatMonto(v.resumenDeliverys.totalDelivery)}</span>
          {v.resumenDeliverys.efectivoPendiente > 0 && <span className="font-bold text-amber-700">{formatMonto(v.resumenDeliverys.efectivoPendiente)} en efectivo sin entregar</span>}
        </>}
      >
        {v.deliverys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hubo deliverys en este periodo.</p>
        ) : (
          <div className="divide-y text-sm">
            {v.deliverys.map(d => (
              <div key={d.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <Sede nombre={d.sedes?.nombre} />
                <span className="capitalize text-muted-foreground">{fechaCorta(d.fecha)}</span>
                <span className="font-medium">{d.cliente}</span>
                <span className="text-xs text-muted-foreground">{MODALIDAD_LABEL[d.modalidad]}{d.detalle ? ` · ${d.detalle}` : ''}</span>
                <span className="ml-auto">cobró <strong>{formatMonto(Number(d.cobrado))}</strong>{d.metodo_cobro && <span className="text-xs text-muted-foreground"> ({d.metodo_cobro === 'efectivo' ? 'efectivo' : 'Yape/transf.'})</span>}</span>
                {esEfectivoPendiente(d) && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">Sin entregar</span>}
              </div>
            ))}
          </div>
        )}
      </Desplegable>

      {/* Gastos de caja */}
      <Desplegable
        icono={<Receipt size={16} />}
        titulo="Gastos de caja de los administradores"
        resumen={<span>{v.gastosCaja.length} gasto(s) · <strong className="text-yayis-dark">{formatMonto(v.totalCaja)}</strong></span>}
      >
        {v.gastosCaja.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hubo gastos de caja en este periodo.</p>
        ) : (
          <div className="divide-y text-sm">
            {v.gastosCaja.map(g => (
              <div key={g.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <Sede nombre={sedes.find(s => s.id === g.sede_id)?.nombre} />
                <span className="capitalize text-muted-foreground">{fechaCorta(g.fecha)}</span>
                <span>{g.descripcion}</span>
                <span className="text-xs text-muted-foreground">{g.categorias?.nombre} · {g.metodo_pago === 'efectivo' ? 'efectivo' : 'cuentas'}</span>
                <span className="ml-auto font-bold">{formatMonto(Number(g.monto))}</span>
              </div>
            ))}
          </div>
        )}
      </Desplegable>
    </div>
  );
}
