import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
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
import type { EstadoItemPedido } from '@/types';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Clock, MapPin, Phone, Store, X } from 'lucide-react';

interface LineaRuta {
  item: ItemRuta;
  pedido: PedidoRuta;
}

interface GrupoProducto {
  productoId: string;
  nombre: string;
  lineas: LineaRuta[];
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
  const { pedidos, borradores, loading, marcarItem, asignarProveedor } = useRutaCompras(fecha);
  const { proveedores } = useProveedores();
  const { addToast } = useToast();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [guardarHabitual, setGuardarHabitual] = useState(true);

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
    for (const g of porProveedor.values()) g.productos.sort((a, b) => a.nombre.localeCompare(b.nombre));
    // Primero lo que falta asignar, luego por nombre de proveedor.
    return Array.from(porProveedor.values()).sort((a, b) => {
      if (a.clave === 'sin-proveedor') return -1;
      if (b.clave === 'sin-proveedor') return 1;
      return (a.proveedor?.nombre ?? '').localeCompare(b.proveedor?.nombre ?? '');
    });
  }, [pedidos]);

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

      {loading && pedidos.length === 0 ? (
        <Loading text="Cargando ruta..." />
      ) : grupos.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No hay nada que comprar este día.</p>
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
              </CardContent>
            </Card>
          );
        })
      )}

      {proveedoresActivos.length === 0 && grupos.length > 0 && (
        <p className="text-center text-sm text-muted-foreground">
          Todavía no hay proveedores registrados. <Link to="/proveedores" className="font-medium text-yayis-green underline">Regístralos aquí</Link>.
        </p>
      )}
    </div>
  );
}
