import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { useFinanzas, type CompraFinanzas } from '@/hooks/useFinanzas';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Loading } from '@/components/ui/loading';
import { EvidenciaInput } from '@/components/compras/EvidenciaInput';
import { abrirEvidencia } from '@/lib/evidencias';
import { useAlertasPresupuesto } from '@/hooks/useAlertasPresupuesto';
import { calcularAlertas, gastadoEntrega, itemACompraDePrecio, DIAS_AVISO_VENCIMIENTO } from '@/lib/alertas';
import { calcularCambiosPrecio, formatPorcentaje, UMBRAL_VARIACION } from '@/lib/precios';
import { fechaCorta, fechaLarga, formatCantidad, sumarDias } from '@/lib/compras';
import { precioMostrado } from '@/lib/precio-linea';
import { getTodayLima } from '@/lib/dates';
import { DIAS_PARA_ENTREGAR_EFECTIVO, esEfectivoPendiente, resumirDeliverys } from '@/lib/deliverys';
import { formatMonto, roundTwo } from '@/lib/utils';
import { AlertTriangle, ArrowRight, BellRing, Bike, CalendarClock, ChevronDown, CreditCard, Eye, Loader2, ShoppingBag, TrendingDown, TrendingUp, Wallet } from 'lucide-react';

function PagarFactura({ compra, onClose, onPagar }: {
  compra: CompraFinanzas;
  onClose: () => void;
  onPagar: (datos: { fecha: string; referencia: string; constancia: File | null }) => Promise<string | null>;
}) {
  const [fecha, setFecha] = useState(getTodayLima());
  const [referencia, setReferencia] = useState('');
  const [constancia, setConstancia] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function handlePagar() {
    setGuardando(true);
    const error = await onPagar({ fecha, referencia, constancia });
    setGuardando(false);
    if (!error) onClose();
  }

  return (
    <Modal open onClose={onClose} title={`Pagar a ${compra.proveedores?.nombre}`}>
      <div className="space-y-4">
        <p className="text-sm">
          Factura de <strong>{compra.sedes?.nombre}</strong> del {fechaCorta(compra.fecha)} por <strong className="text-lg">{formatMonto(Number(compra.total))}</strong>
          {compra.fecha_vencimiento && <> · vence el <strong className="capitalize">{fechaCorta(compra.fecha_vencimiento)}</strong></>}
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium" htmlFor="fecha-pago">Fecha del pago</label>
            <Input id="fecha-pago" type="date" className="mt-1" value={fecha} max={getTodayLima()} onChange={e => setFecha(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium" htmlFor="ref-pago">N° de operación (opcional)</label>
            <Input id="ref-pago" className="mt-1" value={referencia} onChange={e => setReferencia(e.target.value)} />
          </div>
        </div>
        <EvidenciaInput id="constancia-credito" label="Constancia de la transferencia o depósito" archivo={constancia} onChange={setConstancia} requerido />
        <p className="text-xs text-muted-foreground">Se paga desde la cuenta del negocio: no toca la caja chica de ninguna sede.</p>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={handlePagar} disabled={guardando || !constancia || !fecha}>
            {guardando ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
            Registrar pago
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function FinanzasPage() {
  const { porPagar, pagadas, entregas, pedidos, items, deliverys, liquidaciones, comprasControl, loading, pagarCompra } = useFinanzas();
  const { cambiarSede } = useSedeActiva();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [pagando, setPagando] = useState<CompraFinanzas | null>(null);
  const hoy = getTodayLima();

  const presupuesto = useAlertasPresupuesto(hoy);
  const alertas = useMemo(() => calcularAlertas({ porPagar, entregas, pedidos, items, deliverys, liquidaciones, comprasControl, presupuesto }, hoy), [porPagar, entregas, pedidos, items, deliverys, liquidaciones, comprasControl, presupuesto, hoy]);
  const altas = alertas.filter(a => a.nivel === 'alta').length;

  const totalPorPagar = porPagar.reduce((s, c) => roundTwo(s + Number(c.total)), 0);
  const totalVencido = porPagar.filter(c => c.fecha_vencimiento && c.fecha_vencimiento < hoy).reduce((s, c) => roundTwo(s + Number(c.total)), 0);
  const en7dias = sumarDias(hoy, 7);
  const venceSemana = porPagar.filter(c => c.fecha_vencimiento && c.fecha_vencimiento >= hoy && c.fecha_vencimiento <= en7dias).reduce((s, c) => roundTwo(s + Number(c.total)), 0);

  const abiertas = entregas.filter(e => e.estado !== 'cerrada');
  const enManos = abiertas.reduce((s, e) => roundTwo(s + Math.max(Number(e.monto) - gastadoEntrega(e), 0)), 0);

  // Calendario de pagos: vencidas juntas, luego día por día (para no juntar pagos grandes en un solo día).
  const calendario = useMemo(() => {
    const porDia = new Map<string, CompraFinanzas[]>();
    for (const c of porPagar) {
      const clave = !c.fecha_vencimiento ? 'sin-fecha' : c.fecha_vencimiento < hoy ? 'vencidas' : c.fecha_vencimiento;
      (porDia.get(clave) ?? porDia.set(clave, []).get(clave)!).push(c);
    }
    return Array.from(porDia.entries()).sort(([a], [b]) => (a === 'vencidas' ? -1 : b === 'vencidas' ? 1 : a.localeCompare(b)));
  }, [porPagar, hoy]);

  // Compras del mes en curso por sede (al contado y a crédito).
  const comprasMes = useMemo(() => {
    const inicioMes = `${hoy.slice(0, 7)}-01`;
    const porSede = new Map<string, { contado: number; credito: number }>();
    for (const it of items) {
      if (!it.compras || it.compras.fecha < inicioMes) continue;
      const nombre = it.compras.sedes?.nombre ?? '—';
      const acc = porSede.get(nombre) ?? { contado: 0, credito: 0 };
      if (it.compras.condicion_pago === 'credito') acc.credito = roundTwo(acc.credito + Number(it.precio_total));
      else acc.contado = roundTwo(acc.contado + Number(it.precio_total));
      porSede.set(nombre, acc);
    }
    return Array.from(porSede.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items, hoy]);

  // Compras del mes sin comprobante (mercado), por sede: cuánto es del total comprado.
  const sinComprobante = useMemo(() => {
    const inicioMes = `${hoy.slice(0, 7)}-01`;
    const porSede = new Map<string, { total: number; sin: number; cantidad: number }>();
    for (const c of comprasControl) {
      if (c.fecha < inicioMes) continue;
      const nombre = c.sedes?.nombre ?? '—';
      const acc = porSede.get(nombre) ?? { total: 0, sin: 0, cantidad: 0 };
      acc.total = roundTwo(acc.total + Number(c.total));
      if (c.tipo_comprobante === 'sin_comprobante') { acc.sin = roundTwo(acc.sin + Number(c.total)); acc.cantidad += 1; }
      porSede.set(nombre, acc);
    }
    return porSede;
  }, [comprasControl, hoy]);

  // Deliverys del mes por sede, y el efectivo que Fabio aún no entregó (de cualquier fecha).
  const deliverysPorSede = useMemo(() => {
    const inicioMes = `${hoy.slice(0, 7)}-01`;
    const sedes = new Map<string, { nombre: string; delMes: typeof deliverys; pendientes: typeof deliverys }>();
    for (const d of deliverys) {
      const acc = sedes.get(d.sede_id) ?? { nombre: d.sedes?.nombre ?? '—', delMes: [], pendientes: [] };
      if (d.fecha >= inicioMes) acc.delMes.push(d);
      if (esEfectivoPendiente(d)) acc.pendientes.push(d);
      sedes.set(d.sede_id, acc);
    }
    return Array.from(sedes.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map(s => ({ nombre: s.nombre, mes: resumirDeliverys(s.delMes), pendiente: resumirDeliverys(s.pendientes) }));
  }, [deliverys, hoy]);
  const totalDeliverysMes = deliverysPorSede.reduce((s, x) => s + x.mes.cantidad, 0);
  const totalEfectivoDelivery = deliverysPorSede.reduce((s, x) => roundTwo(s + x.pendiente.efectivoPendiente), 0);

  // Seguimiento de precios: compras del último mes que se movieron ±15% respecto al precio habitual.
  const cambiosPrecio = useMemo(
    () => calcularCambiosPrecio(items, itemACompraDePrecio, sumarDias(hoy, -30)).reverse(),
    [items, hoy],
  );
  const subieron = cambiosPrecio.filter(c => c.variacion.tipo === 'sube');
  const bajaron = cambiosPrecio.filter(c => c.variacion.tipo === 'baja');
  const pagadoDeMas = subieron.reduce((s, c) => roundTwo(s + c.variacion.diferencia), 0);
  const ahorro = bajaron.reduce((s, c) => roundTwo(s - c.variacion.diferencia), 0);

  function irA(sedeId: string, ruta: string) {
    cambiarSede(sedeId);
    navigate(ruta);
  }

  async function verFoto(path: string | null) {
    if (!path) return;
    const error = await abrirEvidencia(path);
    if (error) addToast(error, 'error');
  }

  async function handlePagar(datos: { fecha: string; referencia: string; constancia: File | null }) {
    if (!pagando) return 'Sin factura';
    const { error } = await pagarCompra(pagando, datos);
    if (error) {
      addToast(`Error: ${error}`, 'error');
      return error;
    }
    addToast(`Pago a ${pagando.proveedores?.nombre} registrado`, 'success');
    return null;
  }

  if (loading && porPagar.length === 0 && entregas.length === 0) return <Loading text="Cargando panel de Finanzas..." />;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-yayis-dark">Panel de Finanzas</h1>
        <p className="text-sm capitalize text-muted-foreground">{fechaLarga(hoy)} · las 3 sedes</p>
      </div>

      {/* Números clave */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card><CardContent className="p-4">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><CreditCard size={16} className="text-blue-600" /> Por pagar a crédito</div>
          <p className="text-xl font-bold text-blue-700">{formatMonto(totalPorPagar)}</p>
          <p className="text-xs text-muted-foreground">{porPagar.length} factura(s){totalVencido > 0 && <span className="font-bold text-red-600"> · {formatMonto(totalVencido)} vencido</span>}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><CalendarClock size={16} className="text-amber-600" /> Vence en 7 días</div>
          <p className="text-xl font-bold text-amber-700">{formatMonto(venceSemana)}</p>
          <p className="text-xs text-muted-foreground">Prepara el flujo de caja</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><Wallet size={16} className="text-yayis-green" /> Dinero en manos de Compras</div>
          <p className="text-xl font-bold text-yayis-dark">{formatMonto(enManos)}</p>
          <p className="text-xs text-muted-foreground">{abiertas.length} entrega(s) sin cerrar</p>
        </CardContent></Card>
        <Card className={altas > 0 ? 'border-red-300 bg-red-50/50' : ''}><CardContent className="p-4">
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><BellRing size={16} className={altas > 0 ? 'text-red-600' : 'text-muted-foreground'} /> Alertas</div>
          <p className={`text-xl font-bold ${altas > 0 ? 'text-red-700' : 'text-yayis-dark'}`}>{alertas.length}</p>
          <p className="text-xs text-muted-foreground">{altas} importante(s)</p>
        </CardContent></Card>
      </div>

      {/* Alertas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle size={18} className="text-orange-600" /> Para revisar</CardTitle>
          <p className="text-xs text-muted-foreground">
            Facturas vencidas, rendiciones que no cuadraron, dinero sin rendir, mercadería sin confirmar, urgentes de la semana, efectivo de deliverys sin entregar y precios que subieron {Math.round(UMBRAL_VARIACION * 100)}% o más sobre su precio habitual.
          </p>
        </CardHeader>
        <CardContent>
          {alertas.length === 0 ? (
            <p className="py-4 text-center text-sm text-emerald-700">Todo en orden. No hay nada que revisar.</p>
          ) : (
            <div className="space-y-2">
              {alertas.map(a => (
                <div key={a.clave} className={`flex flex-wrap items-start gap-3 rounded-md border p-3 ${a.nivel === 'alta' ? 'border-red-300 bg-red-50/60' : 'border-amber-200 bg-amber-50/50'}`}>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${a.nivel === 'alta' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}>{a.tipo}</span>
                  <span className="rounded bg-yayis-cream px-2 py-0.5 text-xs font-bold text-yayis-dark">{a.sedeNombre}</span>
                  <div className="min-w-[12rem] flex-1">
                    <p className="text-sm font-medium text-yayis-dark">{a.titulo}</p>
                    <p className="text-xs text-muted-foreground">{a.detalle}</p>
                  </div>
                  {a.ir && (
                    <Button variant="outline" size="sm" onClick={() => irA(a.sedeId, a.ir!)}>
                      Ir <ArrowRight size={14} className="ml-1" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cuentas por pagar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><CreditCard size={18} className="text-blue-600" /> Cuentas por pagar a crédito</CardTitle>
          <p className="text-xs text-muted-foreground">Ordenadas por vencimiento. Se pagan desde la cuenta del negocio, no desde la caja chica.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {calendario.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No hay facturas a crédito pendientes.</p>
          ) : calendario.map(([dia, facturas]) => {
            const totalDia = facturas.reduce((s, c) => roundTwo(s + Number(c.total)), 0);
            const vencidas = dia === 'vencidas';
            const pronto = !vencidas && dia !== 'sin-fecha' && dia <= sumarDias(hoy, DIAS_AVISO_VENCIMIENTO);
            return (
              <div key={dia}>
                <div className={`mb-1 flex items-center justify-between text-sm font-bold ${vencidas ? 'text-red-700' : pronto ? 'text-amber-700' : 'text-yayis-dark'}`}>
                  <span className="capitalize">{vencidas ? 'Vencidas' : dia === 'sin-fecha' ? 'Sin fecha' : `${fechaLarga(dia)}${dia === hoy ? ' (hoy)' : ''}`}</span>
                  <span>{formatMonto(totalDia)}</span>
                </div>
                <div className="divide-y rounded-md border">
                  {facturas.map(c => (
                    <div key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                      <span className="rounded bg-yayis-cream px-2 py-0.5 text-xs font-bold text-yayis-dark">{c.sedes?.nombre}</span>
                      <span className="font-medium">{c.proveedores?.nombre}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.tipo_comprobante === 'factura' ? 'Factura' : 'Boleta'}{c.numero_comprobante ? ` ${c.numero_comprobante}` : ''} · comprada el {fechaCorta(c.fecha)}
                        {vencidas && c.fecha_vencimiento ? ` · venció el ${fechaCorta(c.fecha_vencimiento)}` : ''}
                      </span>
                      <span className="ml-auto font-bold">{formatMonto(Number(c.total))}</span>
                      <Button variant="ghost" size="sm" onClick={() => verFoto(c.evidencia_comprobante_path)}><Eye size={14} className="mr-1" /> Factura</Button>
                      <Button size="sm" onClick={() => setPagando(c)}>Registrar pago</Button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Compras del mes */}
      {comprasMes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><ShoppingBag size={18} /> Compras a proveedores este mes</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Sede</th>
                  <th className="py-2 text-right font-medium">Al contado</th>
                  <th className="py-2 text-right font-medium">A crédito</th>
                  <th className="py-2 text-right font-medium">Total</th>
                  <th className="py-2 text-right font-medium">Sin comprobante</th>
                </tr>
              </thead>
              <tbody>
                {comprasMes.map(([sede, t]) => (
                  <tr key={sede} className="border-b last:border-b-0">
                    <td className="py-2 font-medium">{sede}</td>
                    <td className="py-2 text-right">{formatMonto(t.contado)}</td>
                    <td className="py-2 text-right">{formatMonto(t.credito)}</td>
                    <td className="py-2 text-right font-bold">{formatMonto(roundTwo(t.contado + t.credito))}</td>
                    <td className="py-2 text-right text-xs">
                      {(() => {
                        const sc = sinComprobante.get(sede);
                        if (!sc || sc.sin === 0) return <span className="text-muted-foreground">—</span>;
                        const pct = sc.total > 0 ? Math.round((sc.sin / sc.total) * 100) : 0;
                        return <span className={pct >= 10 ? 'font-bold text-amber-700' : ''}>{formatMonto(sc.sin)} ({pct}%) · {sc.cantidad} compra(s)</span>;
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Deliverys de Compras, plegado con resumen */}
      <details className="group rounded-lg border bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 p-4">
          <span className="flex items-center gap-2 text-sm font-bold text-yayis-dark"><Bike size={16} /> Deliverys de Compras · este mes</span>
          <span className="text-xs text-muted-foreground">{totalDeliverysMes} delivery(s)</span>
          <span className={`text-xs font-bold ${totalEfectivoDelivery > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
            {totalEfectivoDelivery > 0 ? `${formatMonto(totalEfectivoDelivery)} de efectivo por entregar` : 'Sin efectivo pendiente'}
          </span>
          <ChevronDown size={16} className="ml-auto transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-2 border-t p-4">
          <p className="text-xs text-muted-foreground">
            Lo que Fabio entregó a clientes con pedidos de cada sede. «Efectivo por entregar» es el dinero que cobró en la puerta y aún no pasó al administrador
            (se alerta si pasan {DIAS_PARA_ENTREGAR_EFECTIVO} días). Este control no mueve la caja chica de ninguna sede.
          </p>
          {deliverysPorSede.length === 0 ? (
            <p className="py-3 text-center text-sm text-muted-foreground">Todavía no hay deliverys registrados.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Sede</th>
                  <th className="py-2 text-right font-medium">Deliverys</th>
                  <th className="py-2 text-right font-medium">Delivery cobrado</th>
                  <th className="py-2 text-right font-medium">Productos llevados</th>
                  <th className="py-2 text-right font-medium">Efectivo por entregar</th>
                </tr>
              </thead>
              <tbody>
                {deliverysPorSede.map(x => (
                  <tr key={x.nombre} className="border-b last:border-0">
                    <td className="py-2 font-medium">{x.nombre}</td>
                    <td className="py-2 text-right">{x.mes.cantidad}</td>
                    <td className="py-2 text-right">{formatMonto(x.mes.totalDelivery)}</td>
                    <td className="py-2 text-right">{formatMonto(x.mes.totalProductos)}</td>
                    <td className={`py-2 text-right font-bold ${x.pendiente.efectivoPendiente > 0 ? 'text-amber-700' : ''}`}>{formatMonto(x.pendiente.efectivoPendiente)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>

      {/* Cambios de precio, plegado con resumen */}
      <details className="group rounded-lg border bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 p-4">
          <span className="flex items-center gap-2 text-sm font-bold text-yayis-dark">Cambios de precio · últimos 30 días</span>
          {cambiosPrecio.length === 0 ? (
            <span className="text-xs text-muted-foreground">Ningún precio se movió {Math.round(UMBRAL_VARIACION * 100)}% o más</span>
          ) : (
            <>
              <span className="flex items-center gap-1 text-xs font-bold text-red-700"><TrendingUp size={14} /> {subieron.length} {subieron.length === 1 ? 'subió' : 'subieron'} · {formatMonto(pagadoDeMas)} de más</span>
              <span className="flex items-center gap-1 text-xs font-bold text-emerald-700"><TrendingDown size={14} /> {bajaron.length} {bajaron.length === 1 ? 'bajó' : 'bajaron'} · {formatMonto(ahorro)} de ahorro</span>
            </>
          )}
          <ChevronDown size={16} className="ml-auto transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-2 border-t p-4">
          <p className="text-xs text-muted-foreground">
            Cada compra se compara con el precio habitual del producto (el típico de sus últimas 3 compras, en la misma unidad, de cualquier sede o proveedor).
            Rojo si salió {Math.round(UMBRAL_VARIACION * 100)}% o más caro; verde si salió {Math.round(UMBRAL_VARIACION * 100)}% o más barato.
          </p>
          {cambiosPrecio.map(({ item: it, unitario, habitual, variacion }) => {
            const sube = variacion.tipo === 'sube';
            return (
              <div key={it.id} className={`flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm ${sube ? 'border-red-200 bg-red-50/50' : 'border-emerald-200 bg-emerald-50/50'}`}>
                <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold text-white ${sube ? 'bg-red-600' : 'bg-emerald-600'}`}>
                  {sube ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {formatPorcentaje(variacion.porcentaje)}
                </span>
                <span className="font-medium">{it.productos?.nombre ?? 'Producto'}</span>
                <span className="rounded bg-yayis-cream px-2 py-0.5 text-xs font-bold text-yayis-dark">{it.compras?.sedes?.nombre}</span>
                <span className="text-xs text-muted-foreground">
                  {formatMonto(precioMostrado(unitario, it.unidad).valor)} por {precioMostrado(unitario, it.unidad).etiqueta} (habitual {formatMonto(precioMostrado(habitual.unitario, it.unidad).valor)}) · {formatCantidad(Number(it.cantidad))} {it.unidad} a {it.compras?.proveedores?.nombre ?? '—'}, {it.compras ? fechaCorta(it.compras.fecha) : ''}
                </span>
                <span className={`ml-auto text-xs font-bold ${sube ? 'text-red-700' : 'text-emerald-700'}`}>
                  {sube ? `${formatMonto(variacion.diferencia)} de más` : `Ahorro ${formatMonto(-variacion.diferencia)}`}
                </span>
              </div>
            );
          })}
        </div>
      </details>

      {/* Pagos recientes, plegado */}
      {pagadas.length > 0 && (
        <details className="group rounded-lg border bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-bold text-yayis-dark">
            <span>Facturas pagadas recientemente ({pagadas.length})</span>
            <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="divide-y border-t text-sm">
            {pagadas.map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <span className="rounded bg-yayis-cream px-2 py-0.5 text-xs font-bold text-yayis-dark">{c.sedes?.nombre}</span>
                <span className="font-medium">{c.proveedores?.nombre}</span>
                <span className="text-xs text-muted-foreground">
                  pagada el {c.pagado_at ? fechaCorta(new Date(c.pagado_at).toLocaleDateString('en-CA', { timeZone: 'America/Lima' })) : '—'}
                  {c.referencia_pago ? ` · op. ${c.referencia_pago}` : ''}
                </span>
                <span className="ml-auto font-bold">{formatMonto(Number(c.total))}</span>
                <Button variant="ghost" size="sm" onClick={() => verFoto(c.evidencia_pago_path)}><Eye size={14} className="mr-1" /> Constancia</Button>
              </div>
            ))}
          </div>
        </details>
      )}

      {pagando && <PagarFactura compra={pagando} onClose={() => setPagando(null)} onPagar={handlePagar} />}
    </div>
  );
}
