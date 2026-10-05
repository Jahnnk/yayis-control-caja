import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { RegistrarCompraModal, type LineaCandidata } from '@/components/compras/RegistrarCompraModal';
import { abrirEvidencia } from '@/lib/evidencias';
import { leerCompraAbierta } from '@/lib/borradores';
import { formatMonto } from '@/lib/utils';
import { useRutaCompras, type ItemRuta, type PedidoRuta } from '@/hooks/useRutaCompras';
import { useProveedores } from '@/hooks/useProveedores';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { Loading } from '@/components/ui/loading';
import { getTodayLima } from '@/lib/dates';
import { diaSemanaDe, fechaCorta, fechaLarga, formatCantidad, sumarDias } from '@/lib/compras';
import type { EstadoItemPedido, Proveedor } from '@/types';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Clock, Eye, MapPin, PackageCheck, Phone, Receipt, Store, X } from 'lucide-react';

interface LineaRuta {
  item: ItemRuta;
  pedido: PedidoRuta;
}

interface GrupoProducto {
  productoId: string;
  nombre: string;
  lineas: LineaRuta[];
}

interface GrupoSede {
  sedeId: string;
  nombre: string;
  /** Lo que ya compró y debe llevarle, lo que aún falta y lo que no había. */
  entregar: LineaRuta[];
  faltan: LineaRuta[];
  noHabia: LineaRuta[];
}

interface GrupoProveedor {
  clave: string;
  proveedor: ItemRuta['proveedores'];
  productos: GrupoProducto[];
  total: number;
  resueltos: number;
}

// Total por unidad, porque dos sedes pueden pedir el mismo producto en unidades distintas.
function totalPorUnidad(lineas: LineaRuta[]): string {
  const porUnidad = new Map<string, number>();
  for (const { item } of lineas) porUnidad.set(item.unidad, (porUnidad.get(item.unidad) ?? 0) + Number(item.cantidad));
  return Array.from(porUnidad.entries()).map(([u, c]) => `${formatCantidad(c)} ${u}`).join(' + ');
}

export function RutaComprasPage() {
  const hoy = getTodayLima();
  const [fecha, setFecha] = useState(hoy);
  const { sedes } = useSedeActiva();
  const { pedidos, borradores, compras, loading, fetchRuta, marcarItem, asignarProveedor } = useRutaCompras(fecha);
  const { proveedores } = useProveedores();
  const { addToast } = useToast();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [guardarHabitual, setGuardarHabitual] = useState(true);
  const [vista, setVista] = useState<'proveedor' | 'sede'>('proveedor');
  const [registrando, setRegistrando] = useState<{
    sedeId: string;
    sedeNombre: string;
    proveedor: Pick<Proveedor, 'id' | 'nombre' | 'condicion_pago' | 'dias_credito'>;
    candidatas: LineaCandidata[];
  } | null>(null);

  // Lineas de pedido que ya forman parte de una compra registrada.
  const yaCompradas = useMemo(
    () => new Set(compras.flatMap(c => c.compra_items.map(i => i.pedido_item_id)).filter(Boolean)),
    [compras],
  );

  const dia = diaSemanaDe(fecha);
  const sedesDelDia = sedes.filter(s => (s.dias_compra ?? []).includes(dia));

  const grupos = useMemo<GrupoProveedor[]>(() => {
    const porProveedor = new Map<string, GrupoProveedor>();
    for (const pedido of pedidos) {
      for (const item of pedido.pedido_items) {
        const clave = item.proveedor_id ?? 'sin-proveedor';
        let grupo = porProveedor.get(clave);
        if (!grupo) {
          grupo = { clave, proveedor: item.proveedores, productos: [], total: 0, resueltos: 0 };
          porProveedor.set(clave, grupo);
        }
        let prod = grupo.productos.find(p => p.productoId === item.producto_id);
        if (!prod) {
          prod = { productoId: item.producto_id, nombre: item.productos?.nombre ?? 'Producto', lineas: [] };
          grupo.productos.push(prod);
        }
        prod.lineas.push({ item, pedido });
        grupo.total += 1;
        if (item.estado !== 'pendiente') grupo.resueltos += 1;
      }
    }
    // Lo urgente (y todavía por comprar) va primero, dentro del proveedor y entre proveedores.
    const esUrgente = (prod: GrupoProducto) => prod.lineas.some(l => l.item.urgente && l.item.estado === 'pendiente');
    for (const g of porProveedor.values()) g.productos.sort((a, b) => Number(esUrgente(b)) - Number(esUrgente(a)) || a.nombre.localeCompare(b.nombre));
    // Primero lo que falta asignar, luego por nombre de proveedor.
    const conUrgente = (g: GrupoProveedor) => g.productos.some(esUrgente);
    return Array.from(porProveedor.values()).sort((a, b) => {
      if (a.clave === 'sin-proveedor') return -1;
      if (b.clave === 'sin-proveedor') return 1;
      return Number(conUrgente(b)) - Number(conUrgente(a)) || (a.proveedor?.nombre ?? '').localeCompare(b.proveedor?.nombre ?? '');
    });
  }, [pedidos]);

  // Vista por sede: qué debe llevarle Fabio a cada una.
  const gruposSede = useMemo<GrupoSede[]>(() => {
    const porSede = new Map<string, GrupoSede>();
    for (const pedido of pedidos) {
      let g = porSede.get(pedido.sede_id);
      if (!g) {
        g = { sedeId: pedido.sede_id, nombre: pedido.sedes?.nombre ?? '', entregar: [], faltan: [], noHabia: [] };
        porSede.set(pedido.sede_id, g);
      }
      for (const item of pedido.pedido_items) {
        const linea = { item, pedido };
        if (item.estado === 'comprado') g.entregar.push(linea);
        else if (item.estado === 'no_habia') g.noHabia.push(linea);
        else g.faltan.push(linea);
      }
    }
    const porNombre = (a: LineaRuta, b: LineaRuta) => (a.item.productos?.nombre ?? '').localeCompare(b.item.productos?.nombre ?? '');
    for (const g of porSede.values()) { g.entregar.sort(porNombre); g.faltan.sort(porNombre); g.noHabia.sort(porNombre); }
    return Array.from(porSede.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [pedidos]);

  // Todo lo urgente que falta comprar, para mostrarlo arriba de todo.
  const urgentesPendientes = useMemo(() => grupos.flatMap(g => g.productos.flatMap(prod => prod.lineas
    .filter(l => l.item.urgente && l.item.estado === 'pendiente')
    .map(l => ({ ...l, producto: prod.nombre, proveedor: g.clave === 'sin-proveedor' ? null : g.proveedor?.nombre ?? null })))), [grupos]);

  const totalLineas = grupos.reduce((s, g) => s + g.total, 0);
  const totalResueltas = grupos.reduce((s, g) => s + g.resueltos, 0);

  async function handleMarcar(linea: LineaRuta, estado: EstadoItemPedido) {
    const nuevo = linea.item.estado === estado ? 'pendiente' : estado;
    setOcupado(linea.item.id);
    const { error } = await marcarItem(linea.item, nuevo);
    setOcupado(null);
    if (error) addToast(`Error: ${error}`, 'error');
  }

  async function handleAsignar(linea: LineaRuta, proveedorId: string) {
    if (!proveedorId) return;
    setOcupado(linea.item.id);
    const { error } = await asignarProveedor(linea.item, proveedorId, guardarHabitual);
    setOcupado(null);
    if (error) addToast(error, 'error');
  }

  // Lo que falta registrar de este proveedor para cada sede (lo "no había" no se compra).
  function pendientesPorSede(g: GrupoProveedor) {
    const porSede = new Map<string, { sedeNombre: string; candidatas: LineaCandidata[] }>();
    for (const prod of g.productos) {
      for (const { item, pedido } of prod.lineas) {
        if (item.estado === 'no_habia' || yaCompradas.has(item.id)) continue;
        const entrada = porSede.get(pedido.sede_id) ?? { sedeNombre: pedido.sedes?.nombre ?? '', candidatas: [] };
        entrada.candidatas.push({
          pedido_item_id: item.id,
          pedido_id: pedido.id,
          producto_id: item.producto_id,
          nombre: prod.nombre,
          cantidad: Number(item.cantidad),
          unidad: item.unidad,
        });
        porSede.set(pedido.sede_id, entrada);
      }
    }
    return Array.from(porSede.entries());
  }

  // Si el celular recargó la página con una compra a medio llenar (salió a otra app o a la cámara),
  // se vuelve a abrir esa misma compra; el formulario recupera solo lo que ya había escrito.
  const reaperturaIntentada = useRef(false);
  useEffect(() => {
    if (reaperturaIntentada.current || loading || pedidos.length === 0 || registrando) return;
    reaperturaIntentada.current = true;
    const marca = leerCompraAbierta();
    if (!marca || marca.fecha !== fecha) return;
    for (const g of grupos) {
      if (!g.proveedor || g.proveedor.id !== marca.proveedorId) continue;
      const entrada = pendientesPorSede(g).find(([sedeId]) => sedeId === marca.sedeId);
      if (entrada) setRegistrando({ sedeId: marca.sedeId, sedeNombre: entrada[1].sedeNombre, proveedor: g.proveedor, candidatas: entrada[1].candidatas });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pedidos, grupos, registrando, fecha]);

  async function verFoto(path: string | null) {
    if (!path) return;
    const error = await abrirEvidencia(path);
    if (error) addToast(error, 'error');
  }

  function estadoSede(sedeId: string) {
    const regular = pedidos.find(p => p.sede_id === sedeId && !p.urgente && p.fecha_compra === fecha);
    if (regular?.estado === 'comprado') return { texto: 'Compra terminada', clase: 'text-emerald-700', icono: Check };
    if (regular) return { texto: `Lista enviada (${regular.pedido_items.length} productos)`, clase: 'text-blue-700', icono: Check };
    if (borradores.some(b => b.sede_id === sedeId)) return { texto: 'Lista en preparación, aún no enviada', clase: 'text-amber-700', icono: Clock };
    return { texto: 'Todavía no hizo su lista', clase: 'text-red-600', icono: AlertTriangle };
  }

  function etiquetaPedido(p: PedidoRuta) {
    if (p.urgente) return <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">Urgente</span>;
    if (p.fecha_compra < fecha) return <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">Atrasado · era {fechaCorta(p.fecha_compra)}</span>;
    return null;
  }

  const proveedoresActivos = proveedores.filter(p => p.activo);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-yayis-dark">Ruta de compras</h1>
          <p className="text-sm capitalize text-muted-foreground">{fechaLarga(fecha)}{fecha === hoy ? ' (hoy)' : ''}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => setFecha(sumarDias(fecha, -1))} aria-label="Día anterior"><ChevronLeft size={16} /></Button>
          <Input type="date" value={fecha} onChange={e => e.target.value && setFecha(e.target.value)} className="w-40" aria-label="Fecha de la ruta" />
          <Button variant="outline" size="icon" onClick={() => setFecha(sumarDias(fecha, 1))} aria-label="Día siguiente"><ChevronRight size={16} /></Button>
          {fecha !== hoy && <Button variant="ghost" size="sm" onClick={() => setFecha(hoy)}>Hoy</Button>}
        </div>
      </div>

      {/* Sedes que compran este día */}
      <Card>
        <CardContent className="space-y-2 p-4">
          {sedesDelDia.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguna sede tiene programada compra este día.</p>
          ) : (
            sedesDelDia.map(s => {
              const e = estadoSede(s.id);
              return (
                <div key={s.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{s.nombre}</span>
                  <span className={`flex items-center gap-1 ${e.clase}`}><e.icono size={14} /> {e.texto}</span>
                </div>
              );
            })
          )}
          {totalLineas > 0 && (
            <div className="border-t pt-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Avance de la ruta</span>
                <span><strong className="text-yayis-dark">{totalResueltas}</strong> de {totalLineas} productos</span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
                <div className="h-2 rounded-full bg-yayis-green transition-all" style={{ width: `${(totalResueltas / totalLineas) * 100}%` }} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {totalLineas > 0 && (
        <div className="flex w-fit gap-1 rounded-lg border bg-white p-1" role="group" aria-label="Cómo ver la ruta">
          <Button type="button" size="sm" variant={vista === 'proveedor' ? 'default' : 'ghost'} aria-pressed={vista === 'proveedor'} onClick={() => setVista('proveedor')}>
            <Store size={14} className="mr-1" /> Por proveedor
          </Button>
          <Button type="button" size="sm" variant={vista === 'sede' ? 'default' : 'ghost'} aria-pressed={vista === 'sede'} onClick={() => setVista('sede')}>
            <PackageCheck size={14} className="mr-1" /> Por sede (qué entregar)
          </Button>
        </div>
      )}

      {urgentesPendientes.length > 0 && vista === 'proveedor' && (
        <Card className="border-red-300 bg-red-50/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-red-800">⚡ Urgente: cómpralo primero ({urgentesPendientes.length})</CardTitle>
            <p className="text-xs text-red-800">Lo marcó el administrador de cada sede. Está también dentro de cada proveedor, con su etiqueta roja.</p>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {urgentesPendientes.map(u => (
              <div key={u.item.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="rounded bg-white px-2 py-0.5 text-xs font-bold text-yayis-dark">{u.pedido.sedes?.nombre}</span>
                <span className="font-bold">{formatCantidad(u.item.cantidad)} {u.item.unidad}</span>
                <span>{u.producto}</span>
                <span className="text-xs text-muted-foreground">→ {u.proveedor ?? 'sin proveedor asignado'}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {loading && pedidos.length === 0 ? (
        <Loading text="Cargando ruta..." />
      ) : grupos.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No hay nada que comprar este día.</p>
      ) : vista === 'sede' ? (
        gruposSede.map(g => {
          const filaLinea = ({ item, pedido }: LineaRuta) => (
            <div key={item.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-2 text-sm">
              <span className="font-medium">{item.productos?.nombre ?? 'Producto'}</span>
              <span className="font-bold text-yayis-green">{formatCantidad(item.cantidad)} {item.unidad}</span>
              {item.urgente && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">⚡ Urgente</span>}
              {etiquetaPedido(pedido)}
              {item.nota && <span className="text-xs italic text-muted-foreground">"{item.nota}"</span>}
              <span className="ml-auto text-xs text-muted-foreground">{item.proveedores?.nombre ?? 'sin proveedor'}</span>
            </div>
          );
          return (
            <Card key={g.sedeId}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><PackageCheck size={18} className="text-yayis-green" /> {g.nombre}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  <strong className="text-emerald-700">{g.entregar.length}</strong> para entregar · <strong className="text-amber-700">{g.faltan.length}</strong> faltan comprar · <strong className="text-red-600">{g.noHabia.length}</strong> no había
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {g.entregar.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-bold uppercase text-emerald-700">Para entregar a {g.nombre}</p>
                    <div className="divide-y rounded-md border border-emerald-200 bg-emerald-50/40">{g.entregar.map(l => filaLinea(l))}</div>
                  </div>
                )}
                {g.faltan.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-bold uppercase text-amber-700">Falta comprar</p>
                    <div className="divide-y rounded-md border bg-white">{g.faltan.map(l => filaLinea(l))}</div>
                  </div>
                )}
                {g.noHabia.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-bold uppercase text-red-600">No había</p>
                    <div className="divide-y rounded-md border border-red-200 bg-red-50/40">{g.noHabia.map(l => filaLinea(l))}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      ) : (
        grupos.map(g => {
          const sinProveedor = g.clave === 'sin-proveedor';
          return (
            <Card key={g.clave} className={sinProveedor ? 'border-amber-300 bg-amber-50/40' : ''}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Store size={18} className={sinProveedor ? 'text-amber-600' : 'text-yayis-green'} />
                      {sinProveedor ? 'Sin proveedor asignado' : g.proveedor?.nombre}
                    </CardTitle>
                    {sinProveedor ? (
                      <p className="mt-1 text-xs text-amber-800">Elige a quién se le compra cada producto. Se recordará para la próxima vez.</p>
                    ) : (
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {g.proveedor?.telefono && (
                          <a href={`tel:${g.proveedor.telefono}`} className="flex items-center gap-1 hover:text-yayis-green"><Phone size={12} /> {g.proveedor.telefono}</a>
                        )}
                        {g.proveedor?.direccion && <span className="flex items-center gap-1"><MapPin size={12} /> {g.proveedor.direccion}</span>}
                        <span className={g.proveedor?.condicion_pago === 'credito' ? 'font-medium text-blue-700' : ''}>
                          {g.proveedor?.condicion_pago === 'credito' ? `A crédito (${g.proveedor.dias_credito} días)` : 'Al contado'}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{g.resueltos}/{g.total} listos</span>
                </div>
                {sinProveedor && (
                  <label className="flex items-center gap-2 text-xs text-amber-900">
                    <input type="checkbox" checked={guardarHabitual} onChange={e => setGuardarHabitual(e.target.checked)} />
                    Guardar como su proveedor habitual
                  </label>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {g.productos.map(prod => (
                  <div key={prod.productoId}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="font-bold text-yayis-dark">{prod.nombre}</span>
                      <span className="text-sm font-bold text-yayis-green">Total: {totalPorUnidad(prod.lineas)}</span>
                    </div>
                    <div className="divide-y rounded-md border bg-white">
                      {prod.lineas.map(linea => {
                        const { item, pedido } = linea;
                        const trabajando = ocupado === item.id;
                        return (
                          <div key={item.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                            <span className="min-w-[4.5rem] rounded bg-yayis-cream px-2 py-0.5 text-xs font-bold text-yayis-dark">{pedido.sedes?.nombre}</span>
                            <span className="font-medium">{formatCantidad(item.cantidad)} {item.unidad}</span>
                            {item.urgente && item.estado === 'pendiente' && <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">⚡ Urgente</span>}
                            {etiquetaPedido(pedido)}
                            {item.nota && <span className="text-xs italic text-muted-foreground">"{item.nota}"</span>}
                            <div className="ml-auto flex items-center gap-1">
                              {sinProveedor ? (
                                <Select
                                  value=""
                                  onChange={e => handleAsignar(linea, e.target.value)}
                                  disabled={trabajando}
                                  className="h-8 w-48 text-xs"
                                  aria-label={`Proveedor para ${prod.nombre}`}
                                >
                                  <option value="">Elegir proveedor...</option>
                                  {proveedoresActivos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                                </Select>
                              ) : (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={trabajando}
                                    onClick={() => handleMarcar(linea, 'comprado')}
                                    aria-pressed={item.estado === 'comprado'}
                                    className={item.estado === 'comprado' ? 'border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600 hover:text-white' : 'text-emerald-700'}
                                  >
                                    <Check size={14} className="mr-1" /> Comprado
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={trabajando}
                                    onClick={() => handleMarcar(linea, 'no_habia')}
                                    aria-pressed={item.estado === 'no_habia'}
                                    className={item.estado === 'no_habia' ? 'border-red-500 bg-red-500 text-white hover:bg-red-600 hover:text-white' : 'text-red-600'}
                                  >
                                    <X size={14} className="mr-1" /> No había
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {!sinProveedor && g.proveedor && (() => {
                  const proveedor = g.proveedor;
                  const registradasProv = compras.filter(c => c.proveedor_id === proveedor.id);
                  const faltan = pendientesPorSede(g);
                  return (
                    <div className="space-y-2 border-t pt-3">
                      {registradasProv.map(c => (
                        <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm">
                          <Receipt size={14} className="text-emerald-700" />
                          <span className="font-medium">{pedidos.find(p => p.id === c.pedido_id)?.sedes?.nombre}</span>
                          <span className="font-bold text-emerald-800">{formatMonto(Number(c.total))}</span>
                          <span className="text-xs text-muted-foreground">
                            {c.tipo_comprobante === 'sin_comprobante' ? 'Sin comprobante' : c.tipo_comprobante === 'boleta' ? 'Boleta' : 'Factura'}
                            {c.condicion_pago === 'credito' ? ' · a crédito' : c.metodo_pago === 'cuentas' ? ' · Yape/transf.' : ' · efectivo'}
                          </span>
                          <Button variant="ghost" size="sm" className="ml-auto text-emerald-700" onClick={() => verFoto(c.evidencia_comprobante_path ?? c.evidencia_producto_path)}>
                            <Eye size={14} className="mr-1" /> Ver foto
                          </Button>
                        </div>
                      ))}
                      <div className="flex flex-wrap gap-2">
                        {faltan.map(([sedeId, info]) => (
                          <Button
                            key={sedeId}
                            size="sm"
                            onClick={() => setRegistrando({ sedeId, sedeNombre: info.sedeNombre, proveedor, candidatas: info.candidatas })}
                          >
                            <Receipt size={14} className="mr-1" /> Registrar compra · {info.sedeNombre}
                          </Button>
                        ))}
                      </div>
                      {faltan.length > 1 && (
                        <p className="text-xs text-muted-foreground">Pide una boleta separada para cada sede.</p>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          );
        })
      )}

      {registrando && (
        <RegistrarCompraModal
          open
          onClose={() => setRegistrando(null)}
          onGuardado={fetchRuta}
          sedeId={registrando.sedeId}
          sedeNombre={registrando.sedeNombre}
          proveedor={registrando.proveedor}
          candidatas={registrando.candidatas}
        />
      )}

      {proveedoresActivos.length === 0 && grupos.length > 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Todavía no hay proveedores registrados. <Link to="/proveedores" className="font-medium text-yayis-green underline">Regístralos aquí</Link>.
        </p>
      )}
    </div>
  );
}
