import { useEffect, useMemo, useState } from 'react';
import { ListChecks, Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { Segmentado } from '@/components/ui/segmentado';
import { useToast } from '@/components/ui/toast';
import { EvidenciaInput } from '@/components/compras/EvidenciaInput';
import { SelectorUnidad } from '@/components/compras/SelectorUnidad';
import { useProductos } from '@/hooks/useProductos';
import { useProveedores } from '@/hooks/useProveedores';
import { useCategorias } from '@/hooks/useCategorias';
import { usePreciosHabituales } from '@/hooks/usePreciosHabituales';
import type { CompraParaGuardar, Repartidor } from '@/hooks/useDeliveryCompras';
import { claveProducto } from '@/lib/precios';
import { claveNombre, fechaCorta } from '@/lib/compras';
import { getTodayLima } from '@/lib/dates';
import { formatMonto } from '@/lib/utils';
import {
  cuentaDelivery, num, porProveedor, tramosValidos, precioSugerido, queFalta, subida,
  type ComprobanteProveedor, type LineaTraida,
} from '@/lib/delivery-compras';
import type { PedidoConItems, TipoComprobante } from '@/types';

const nuevaLinea = (): LineaTraida => ({
  clave: crypto.randomUUID(), productoNombre: '', productoId: null, cantidad: '', unidad: '', pagado: '', proveedorId: '', pedidoItemId: null,
});

const COMPROBANTES = [
  { valor: 'factura', texto: 'Factura' },
  { valor: 'boleta', texto: 'Boleta' },
  { valor: 'sin_comprobante', texto: 'Sin comprobante' },
];

/**
 * «Lo que trajo el delivery» (24-nov-2026). El administrador registra, con el mensaje del delivery y las boletas
 * en la mano, qué compró, a cuánto, de qué proveedor y con qué comprobante, y las carreras. Los productos de la
 * lista del día se traen con un toque (y quedan comprados y recibidos). Reglas: lib/delivery-compras.ts.
 */
export function RegistrarTraido({ open, onClose, repartidores, pedidos, guardar, crearRepartidor }: {
  open: boolean;
  onClose: () => void;
  repartidores: Repartidor[];
  /** Listas de la sede con productos pendientes (para traerlos). */
  pedidos: PedidoConItems[];
  guardar: (d: { repartidorId: string; pedidoId: string | null; fecha: string; carreras: { cantidad: number; precio: number }[]; notas: string; compras: CompraParaGuardar[] }) => Promise<{ error: string | null }>;
  crearRepartidor: (nombre: string, precioCarrera: number) => Promise<{ repartidor: Repartidor | null; error: string | null }>;
}) {
  const { addToast } = useToast();
  const { productos, obtenerOCrear } = useProductos();
  const { proveedores, crearProveedor } = useProveedores();
  const { categorias } = useCategorias();
  const hoy = getTodayLima();

  const [repartidorId, setRepartidorId] = useState(repartidores[0]?.id ?? '');
  const repartidor = repartidores.find(r => r.id === repartidorId) ?? null;
  const [fecha, setFecha] = useState(hoy);
  const [cambiarFecha, setCambiarFecha] = useState(false);
  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const [lineas, setLineas] = useState<LineaTraida[]>([nuevaLinea()]);
  const [comprobantes, setComprobantes] = useState<Record<string, ComprobanteProveedor>>({});
  // Carreras por tramos: la tarifa de siempre y, si fue más lejos, otra tarifa.
  const [tramos, setTramos] = useState<{ clave: string; cantidad: string; precio: string }[]>([{ clave: 't0', cantidad: '', precio: '' }]);
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [nuevoProveedor, setNuevoProveedor] = useState<{ linea: string; nombre: string } | null>(null);
  const [otroDelivery, setOtroDelivery] = useState<{ nombre: string; precio: string } | null>(null);

  useEffect(() => { if (!repartidorId && repartidores[0]) setRepartidorId(repartidores[0].id); }, [repartidores, repartidorId]);
  // Al elegir quién trajo la compra, la tarifa de carrera es la suya (mientras no se hayan anotado carreras).
  useEffect(() => {
    if (!repartidor) return;
    const precio = repartidor.precio_carrera > 0 ? repartidor.precio_carrera.toFixed(2) : '';
    setTramos(prev => (prev.length === 1 && prev[0]!.cantidad === '' ? [{ ...prev[0]!, precio }] : prev));
  }, [repartidor]);

  const agregarDelivery = async () => {
    if (!otroDelivery) return;
    const { repartidor: r, error } = await crearRepartidor(otroDelivery.nombre, num(otroDelivery.precio));
    if (error || !r) { addToast(error ?? 'No se pudo agregar', 'error'); return; }
    setRepartidorId(r.id);
    setOtroDelivery(null);
  };

  const habituales = usePreciosHabituales(lineas.map(l => l.productoId).filter((x): x is string => !!x));
  const ultimoUnitario = (l: LineaTraida) => (l.productoId ? habituales.get(claveProducto(l.productoId, l.unidad))?.unitario ?? null : null);

  const usadas = useMemo(() => lineas.filter(l => l.productoNombre.trim() !== '' || num(l.pagado) > 0), [lineas]);
  const grupos = useMemo(() => porProveedor(usadas), [usadas]);
  const tramosNum = tramos.map(t => ({ cantidad: num(t.cantidad), precio: num(t.precio) }));
  const cuenta = cuentaDelivery(grupos, comprobantes, tramosNum);
  const falta = !repartidor ? 'Elige quién trajo la compra.' : queFalta(lineas, comprobantes);

  // Cada proveedor nuevo en la lista recibe su comprobante con la categoría que se adivina por su primer producto.
  useEffect(() => {
    setComprobantes(prev => {
      let cambio = false;
      const sig = { ...prev };
      for (const g of grupos) {
        if (sig[g.proveedorId]) continue;
        const prod = productos.find(p => p.id === g.lineas[0]?.productoId);
        const porPresupuesto = prod?.categoria_presupuesto ? categorias.find(c => c.categoria_presupuesto === prod.categoria_presupuesto) : undefined;
        const insumos = categorias.find(c => claveNombre(c.nombre) === 'insumos');
        sig[g.proveedorId] = { tipo: 'factura', numero: '', categoriaId: porPresupuesto?.id ?? insumos?.id ?? '', observacion: '', foto: null };
        cambio = true;
      }
      return cambio ? sig : prev;
    });
  }, [grupos, productos, categorias]);

  const pedidosAbiertos = pedidos.filter(p => p.estado === 'enviado' && p.pedido_items.some(i => i.estado === 'pendiente'));
  const pedido = pedidosAbiertos.find(p => p.id === pedidoId) ?? null;
  const yaTraidos = new Set(lineas.map(l => l.pedidoItemId).filter(Boolean));
  const pendientesDeLista = (pedido?.pedido_items ?? []).filter(i => i.estado === 'pendiente' && !yaTraidos.has(i.id));

  const traerLista = () => {
    if (!pedido) return;
    const nuevas = pendientesDeLista.map<LineaTraida>(i => {
      const prod = productos.find(p => p.id === i.producto_id);
      return {
        clave: crypto.randomUUID(), productoNombre: i.productos?.nombre ?? prod?.nombre ?? '', productoId: i.producto_id,
        cantidad: String(Number(i.cantidad)), unidad: i.unidad, pagado: '',
        proveedorId: i.proveedor_id ?? prod?.proveedor_id ?? '', pedidoItemId: i.id,
      };
    });
    setLineas(prev => [...prev.filter(l => l.productoNombre.trim() !== '' || num(l.pagado) > 0), ...nuevas, nuevaLinea()]);
  };

  // Con el precio habitual, lo que viene de la lista trae lo que se espera pagar (se corrige si cambió).
  useEffect(() => {
    setLineas(prev => {
      let cambio = false;
      const sig = prev.map(l => {
        if (l.pagado !== '' || !l.productoId || !l.pedidoItemId) return l;
        const s = precioSugerido(num(l.cantidad), habituales.get(claveProducto(l.productoId, l.unidad))?.unitario);
        if (!s) return l;
        cambio = true;
        return { ...l, pagado: s };
      });
      return cambio ? sig : prev;
    });
  }, [habituales]);

  const cambiar = (clave: string, c: Partial<LineaTraida>) => setLineas(prev => prev.map(l => (l.clave === clave ? { ...l, ...c } : l)));
  const elegirProducto = (clave: string, nombre: string) => {
    const prod = productos.find(p => claveNombre(p.nombre) === claveNombre(nombre));
    setLineas(prev => prev.map(l => (l.clave !== clave ? l : {
      ...l, productoNombre: nombre, productoId: prod?.id ?? null,
      unidad: prod && !l.unidad ? prod.unidad : l.unidad,
      proveedorId: prod?.proveedor_id && !l.proveedorId ? prod.proveedor_id : l.proveedorId,
    })));
  };
  const cambiarComprobante = (proveedorId: string, c: Partial<ComprobanteProveedor>) =>
    setComprobantes(prev => ({ ...prev, [proveedorId]: { ...prev[proveedorId]!, ...c } }));

  const crearElProveedor = async () => {
    if (!nuevoProveedor || nuevoProveedor.nombre.trim().length < 2) return;
    const { proveedor, error } = await crearProveedor({ nombre: nuevoProveedor.nombre.trim(), condicion_pago: 'contado' });
    if (error || !proveedor) { addToast(error ?? 'No se pudo crear el proveedor', 'error'); return; }
    cambiar(nuevoProveedor.linea, { proveedorId: proveedor.id });
    setNuevoProveedor(null);
  };

  const reiniciar = () => {
    setLineas([nuevaLinea()]); setComprobantes({}); setTramos([{ clave: 't0', cantidad: '', precio: repartidor && repartidor.precio_carrera > 0 ? repartidor.precio_carrera.toFixed(2) : '' }]); setNotas(''); setPedidoId(null); setFecha(hoy); setCambiarFecha(false);
  };

  const enviar = async () => {
    if (falta || !repartidor) return;
    setGuardando(true);
    // Productos nuevos: se crean en el catálogo (sin duplicados) antes de guardar.
    const ids = new Map<string, string>();
    for (const l of usadas) {
      if (l.productoId) { ids.set(l.clave, l.productoId); continue; }
      const { producto, error } = await obtenerOCrear(l.productoNombre, l.unidad);
      if (error || !producto) { setGuardando(false); addToast(error ?? `No se pudo crear ${l.productoNombre}`, 'error'); return; }
      ids.set(l.clave, producto.id);
    }
    const compras: CompraParaGuardar[] = grupos.map(g => {
      const c = comprobantes[g.proveedorId]!;
      return {
        proveedor_id: g.proveedorId, categoria_id: c.categoriaId, tipo_comprobante: c.tipo,
        numero_comprobante: c.tipo === 'sin_comprobante' ? '' : c.numero, observacion: c.observacion, foto: c.foto,
        items: g.lineas.map(l => ({ producto_id: ids.get(l.clave)!, cantidad: num(l.cantidad), unidad: l.unidad, precio_total: num(l.pagado), pedido_item_id: l.pedidoItemId })),
      };
    });
    const { error } = await guardar({
      repartidorId: repartidor.id, pedidoId: pedido?.id ?? null, fecha, carreras: tramosValidos(tramosNum), notas, compras,
    });
    setGuardando(false);
    if (error) { addToast(error, 'error'); return; }
    addToast(`Listo: le debes ${formatMonto(cuenta.total)} a ${repartidor.nombre}.`);
    reiniciar();
    onClose();
  };

  const nombreProveedor = (id: string) => proveedores.find(p => p.id === id)?.nombre ?? 'Proveedor';
  const datalist = 'productos-delivery';

  return (
    <Modal open={open} onClose={onClose} title={`Lo que trajo ${repartidor?.nombre ?? 'el delivery'}`} pantallaCompletaEnCelular
      footer={
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted-foreground">Le debes a {repartidor?.nombre ?? 'el delivery'}</span>
            <span className="text-xl font-bold tabular-nums text-yayis-dark">{formatMonto(cuenta.total)}</span>
          </div>
          {falta && <p className="text-xs text-amber-700">{falta}</p>}
          <Button className="h-11 w-full" disabled={!!falta || guardando} onClick={() => void enviar()}>{guardando ? 'Guardando…' : 'Guardar lo que trajo'}</Button>
        </div>
      }>
      <div className="space-y-5">
        {/* Quién y cuándo */}
        <section>
          <p className="text-sm font-bold text-yayis-dark">¿Quién trajo la compra?</p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Delivery">
            {repartidores.map(r => (
              <Button key={r.id} type="button" variant={repartidorId === r.id ? 'default' : 'outline'} aria-pressed={repartidorId === r.id}
                className="h-10" onClick={() => { setRepartidorId(r.id); setOtroDelivery(null); }}>{r.nombre}</Button>
            ))}
            {!otroDelivery && (
              <Button type="button" variant="outline" className="h-10 text-yayis-green" onClick={() => setOtroDelivery({ nombre: '', precio: '' })}>
                <Plus size={16} className="mr-1" /> Otro delivery
              </Button>
            )}
          </div>
          {otroDelivery && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border bg-yayis-cream/40 p-2">
              <Input autoFocus value={otroDelivery.nombre} placeholder="Nombre (ej. PedidosYa)" aria-label="Nombre del delivery" className="min-w-[10rem] flex-1"
                onChange={e => setOtroDelivery({ ...otroDelivery, nombre: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') void agregarDelivery(); }} />
              <div className="relative w-36">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">S/</span>
                <Input inputMode="decimal" value={otroDelivery.precio} placeholder="Carrera (opcional)" aria-label="Precio habitual por carrera" className="pl-7"
                  onChange={e => setOtroDelivery({ ...otroDelivery, precio: e.target.value })} />
              </div>
              <Button type="button" onClick={() => void agregarDelivery()}>Agregar</Button>
              <button type="button" className="text-xs text-muted-foreground" onClick={() => setOtroDelivery(null)}>Cancelar</button>
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {cambiarFecha ? (
            <Input type="date" value={fecha} max={hoy} onChange={e => setFecha(e.target.value)} className="w-auto" aria-label="Fecha de la compra" />
          ) : (
            <span className="text-muted-foreground">Compró {fecha === hoy ? 'hoy' : `el ${fechaCorta(fecha)}`} · <button type="button" className="text-yayis-green underline" onClick={() => setCambiarFecha(true)}>cambiar</button></span>
          )}
        </div>

        {/* De la lista */}
        {pedidosAbiertos.length > 0 && (
          <section className="rounded-lg border bg-yayis-cream/40 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-yayis-dark"><ListChecks size={16} /> Traer de tu lista</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Select value={pedidoId ?? ''} onChange={e => setPedidoId(e.target.value || null)} aria-label="Lista" className="w-auto min-w-[12rem]">
                <option value="">Elige la lista…</option>
                {pedidosAbiertos.map(p => (
                  <option key={p.id} value={p.id}>Lista del {fechaCorta(p.fecha_compra)}{p.urgente ? ' (urgente)' : ''} · {p.pedido_items.filter(i => i.estado === 'pendiente').length} por comprar</option>
                ))}
              </Select>
              {pedido && pendientesDeLista.length > 0 && (
                <Button type="button" variant="outline" onClick={traerLista}>Traer {pendientesDeLista.length} producto{pendientesDeLista.length === 1 ? '' : 's'}</Button>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Quita lo que no trajo: queda pendiente en la lista. Lo que guardes queda comprado y recibido.</p>
          </section>
        )}

        {/* Productos */}
        <section className="space-y-2">
          <h4 className="text-sm font-bold text-yayis-dark">¿Qué trajo y cuánto pagó?</h4>
          <datalist id={datalist}>{productos.filter(p => p.activo).map(p => <option key={p.id} value={p.nombre} />)}</datalist>
          {lineas.map(l => {
            const ult = ultimoUnitario(l);
            const sube = subida(num(l.cantidad), num(l.pagado), ult);
            return (
              <div key={l.clave} className="rounded-lg border bg-white p-3">
                <div className="flex gap-2">
                  <Input list={datalist} value={l.productoNombre} placeholder="Producto (ej. MANTEQUILLA SIN SAL)" aria-label="Producto"
                    onChange={e => elegirProducto(l.clave, e.target.value)} className="flex-1" />
                  <button type="button" onClick={() => setLineas(prev => (prev.length === 1 ? [nuevaLinea()] : prev.filter(x => x.clave !== l.clave)))}
                    className="px-1 text-muted-foreground hover:text-red-600" aria-label="Quitar producto"><Trash2 size={16} /></button>
                </div>
                <div className="mt-2 grid grid-cols-[1fr_1fr_1fr] gap-2 sm:grid-cols-[90px_120px_120px_1fr]">
                  <Input inputMode="decimal" value={l.cantidad} placeholder="Cant." aria-label="Cantidad" onChange={e => cambiar(l.clave, { cantidad: e.target.value })} />
                  <SelectorUnidad value={l.unidad} onChange={u => cambiar(l.clave, { unidad: u })} ariaLabel="Unidad"
                    delProducto={productos.find(p => p.id === l.productoId)?.unidad} />
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">S/</span>
                    <Input inputMode="decimal" value={l.pagado} placeholder="Pagó" aria-label="Cuánto pagó" className="pl-7" onChange={e => cambiar(l.clave, { pagado: e.target.value })} />
                  </div>
                  <div className="col-span-3 sm:col-span-1">
                    {nuevoProveedor?.linea === l.clave ? (
                      <div className="flex gap-1">
                        <Input autoFocus value={nuevoProveedor.nombre} placeholder="Nombre del proveedor" aria-label="Nuevo proveedor"
                          onChange={e => setNuevoProveedor({ linea: l.clave, nombre: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') void crearElProveedor(); }} />
                        <Button type="button" size="sm" onClick={() => void crearElProveedor()}>Crear</Button>
                      </div>
                    ) : (
                      <Select value={l.proveedorId} aria-label="Proveedor"
                        onChange={e => (e.target.value === '__nuevo' ? setNuevoProveedor({ linea: l.clave, nombre: '' }) : cambiar(l.clave, { proveedorId: e.target.value }))}>
                        <option value="">¿Dónde lo compró?</option>
                        {proveedores.filter(p => p.activo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        <option value="__nuevo">+ Otro proveedor…</option>
                      </Select>
                    )}
                  </div>
                </div>
                {(ult || sube) && (
                  <p className={`mt-1.5 text-[11px] ${sube ? 'font-medium text-amber-700' : 'text-muted-foreground'}`}>
                    {ult ? `Último precio: ${formatMonto(ult)} por ${l.unidad}` : ''}{sube ? ` · esta vez sube ${sube}%` : ''}
                  </p>
                )}
              </div>
            );
          })}
          <Button type="button" variant="outline" className="w-full" onClick={() => setLineas(prev => [...prev, nuevaLinea()])}><Plus size={16} className="mr-1" /> Otro producto</Button>
        </section>

        {/* Comprobante por proveedor */}
        {grupos.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-sm font-bold text-yayis-dark">Comprobantes</h4>
            {grupos.map(g => {
              const c = comprobantes[g.proveedorId];
              if (!c) return null;
              return (
                <div key={g.proveedorId} className="space-y-2 rounded-lg border bg-white p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{nombreProveedor(g.proveedorId)}</span>
                    <span className="text-sm tabular-nums">{formatMonto(g.total)} <span className="text-[11px] text-muted-foreground">· {g.lineas.length} producto{g.lineas.length === 1 ? '' : 's'}</span></span>
                  </div>
                  <Segmentado etiqueta="Comprobante" opciones={COMPROBANTES} valor={c.tipo} onCambiar={v => cambiarComprobante(g.proveedorId, { tipo: v as TipoComprobante, foto: null })} />
                  {c.tipo !== 'sin_comprobante' ? (
                    <>
                      <Input value={c.numero} placeholder={`Número de ${c.tipo === 'factura' ? 'factura' : 'boleta'} (ej. F001-2345)`} aria-label="Número de comprobante"
                        onChange={e => cambiarComprobante(g.proveedorId, { numero: e.target.value })} />
                      <EvidenciaInput id={`foto-${g.proveedorId}`} label={`Foto de la ${c.tipo === 'factura' ? 'factura' : 'boleta'}`} requerido
                        archivo={c.foto} onChange={f => cambiarComprobante(g.proveedorId, { foto: f })} />
                    </>
                  ) : (
                    <>
                      <Input value={c.observacion} placeholder="¿Dónde compró? (ej. Mercado Central, puesto de verduras)" aria-label="Dónde compró"
                        onChange={e => cambiarComprobante(g.proveedorId, { observacion: e.target.value })} />
                      <EvidenciaInput id={`foto-${g.proveedorId}`} label="Foto de la nota o del producto (opcional)"
                        archivo={c.foto} onChange={f => cambiarComprobante(g.proveedorId, { foto: f })} />
                    </>
                  )}
                  <label className="block text-xs text-muted-foreground">Categoría del gasto
                    <Select value={c.categoriaId} onChange={e => cambiarComprobante(g.proveedorId, { categoriaId: e.target.value })} className="mt-1" aria-label="Categoría">
                      <option value="">Elige…</option>
                      {categorias.map(cat => <option key={cat.id} value={cat.id}>{cat.nombre}</option>)}
                    </Select>
                  </label>
                </div>
              );
            })}
          </section>
        )}

        {/* Carreras */}
        <section className="rounded-lg border bg-white p-3">
          <h4 className="text-sm font-bold text-yayis-dark">Carreras</h4>
          {tramos.map((t, k) => (
            <div key={t.clave} className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <Input inputMode="numeric" value={t.cantidad} placeholder="0" aria-label="Cantidad de carreras" className="w-20 text-right"
                onChange={e => setTramos(prev => prev.map(x => (x.clave === t.clave ? { ...x, cantidad: e.target.value.replace(/[^\d]/g, '') } : x)))} />
              <span>carreras ×</span>
              <div className="relative w-28">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">S/</span>
                <Input inputMode="decimal" value={t.precio} aria-label="Precio por carrera" className="pl-7 text-right"
                  onChange={e => setTramos(prev => prev.map(x => (x.clave === t.clave ? { ...x, precio: e.target.value } : x)))} />
              </div>
              <span className="ml-auto font-semibold tabular-nums">= {formatMonto(Math.floor(num(t.cantidad)) * num(t.precio))}</span>
              {k > 0 && (
                <button type="button" onClick={() => setTramos(prev => prev.filter(x => x.clave !== t.clave))} className="text-muted-foreground hover:text-red-600" aria-label="Quitar tarifa"><Trash2 size={16} /></button>
              )}
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between gap-2">
            <button type="button" onClick={() => setTramos(prev => [...prev, { clave: crypto.randomUUID(), cantidad: '', precio: '' }])}
              className="flex items-center gap-1 text-xs font-medium text-yayis-green"><Plus size={14} /> Otra tarifa (más lejos)</button>
            {tramos.length > 1 && <span className="text-sm font-bold tabular-nums">Total {formatMonto(cuenta.carreras)}</span>}
          </div>
        </section>

        {/* La cuenta */}
        <section className="rounded-lg bg-gray-50 p-3 text-sm">
          <div className="flex justify-between"><span>Con factura o boleta</span><span className="tabular-nums">{formatMonto(cuenta.conComprobante)}</span></div>
          <div className="flex justify-between"><span>Sin comprobante</span><span className="tabular-nums">{formatMonto(cuenta.sinComprobante)}</span></div>
          <div className="flex justify-between"><span>Carreras</span><span className="tabular-nums">{formatMonto(cuenta.carreras)}</span></div>
          <div className="mt-1 flex justify-between border-t pt-1 font-bold text-yayis-dark"><span>Le debes</span><span className="tabular-nums">{formatMonto(cuenta.total)}</span></div>
        </section>

        <Input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Nota (opcional)" aria-label="Nota" />
      </div>
    </Modal>
  );
}
