import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AYUDA_UNIDAD_SOL, ESTADO_PEDIDO, fechaLarga, formatCantidad, normalizarUnidad, unidadesSugeridas } from '@/lib/compras';
import { AlertTriangle, Gauge, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import { usePresupuestoCaja } from '@/hooks/usePresupuestoCaja';
import { BarraPresupuesto } from '@/components/presupuesto/BarraPresupuesto';
import { CATEGORIAS_DEL_ADMIN, CATEGORIAS_PRESUPUESTO, estimarLineasPedido, estimarPorCategoria, mesDe, nombreCategoria, type UsoCategoria } from '@/lib/presupuesto';
import { formatMonto, roundTwo } from '@/lib/utils';
import type { PrecioHabitual } from '@/lib/precios';
import type { PedidoConItems, Producto, Proveedor } from '@/types';
import type { NuevoItem } from '@/hooks/usePedidos';
import type { PrecioPagado } from '@/hooks/usePreciosPagados';
import { baseDePrecio, referenciaPorUnidadLinea } from '@/lib/precio-linea';
import { CantidadCelda, EntregaCelda, PrecioPagadoCelda, type DatosProblema } from '@/components/compras/EntregaProducto';

const OTRAS_CATEGORIAS = CATEGORIAS_PRESUPUESTO.filter(c => !(CATEGORIAS_DEL_ADMIN as readonly string[]).includes(c));

/** Las opciones de categoría: primero las que suele manejar el administrador. */
function OpcionesCategoria() {
  return (
    <>
      <optgroup label="Las de siempre">
        {CATEGORIAS_DEL_ADMIN.map(c => <option key={c} value={c}>{nombreCategoria(c)}</option>)}
      </optgroup>
      <optgroup label="Otras">
        {OTRAS_CATEGORIAS.map(c => <option key={c} value={c}>{nombreCategoria(c)}</option>)}
      </optgroup>
    </>
  );
}

interface Props {
  pedido: PedidoConItems;
  productos: Producto[];
  proveedores: Proveedor[];
  onRecordarProveedor: (productoId: string, proveedorId: string) => Promise<{ error: string | null }>;
  onRecordarUnidad: (productoId: string, unidad: string) => Promise<{ error: string | null }>;
  onRecordarCategoria: (productoId: string, categoria: string | null) => Promise<{ error: string | null }>;
  /** Precio habitual de cada producto (clave producto|unidad), para estimar lo que costará la lista. */
  habituales: Map<string, PrecioHabitual>;
  /** Lo estimado de las OTRAS listas de la sede del mismo mes que todavía no se compran, por categoría. */
  otrosPorCategoria: Map<string, number>;
  obtenerOCrear: (nombre: string, unidad: string) => Promise<{ producto: Producto | null; error: string | null }>;
  onAgregar: (pedidoId: string, item: NuevoItem) => Promise<{ error: string | null }>;
  onActualizar: (itemId: string, cambios: { cantidad?: number; unidad?: string; proveedor_id?: string | null; urgente?: boolean; precio_referencia?: number | null }) => Promise<{ error: string | null }>;
  onEliminar: (itemId: string) => Promise<{ error: string | null }>;
  /** Lo pagado por cada línea ya comprada (clave: id de la línea del pedido). */
  pagos: Map<string, PrecioPagado>;
  /** El administrador confirma (o deshace) que un producto comprado ya llegó a su sede. */
  onEntregado: (itemId: string, entregado: boolean) => Promise<{ error: string | null }>;
  /** Registra un problema al recibir un producto. */
  onProblema: (itemId: string, datos: DatosProblema) => Promise<{ error: string | null }>;
  /** Pasa un producto que no había a la próxima lista. */
  onVolverAPedir: (itemId: string) => Promise<{ error: string | null }>;
  onEnviar: (pedidoId: string, motivoSobreTope?: string) => Promise<{ error: string | null }>;
  onCancelar: (pedido: PedidoConItems) => Promise<{ error: string | null }>;
}

export function PedidoEditor({ pedido, productos, proveedores, onRecordarProveedor, onRecordarUnidad, onRecordarCategoria, habituales, otrosPorCategoria, obtenerOCrear, onAgregar, onActualizar, onEliminar, pagos, onEntregado, onProblema, onVolverAPedir, onEnviar, onCancelar }: Props) {
  const { addToast } = useToast();
  const [nombre, setNombre] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [unidad, setUnidad] = useState<string>('kg');
  const [nota, setNota] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [urgenteNuevo, setUrgenteNuevo] = useState(false);
  const [referenciaNueva, setReferenciaNueva] = useState('');
  const [categoriaNueva, setCategoriaNueva] = useState('');
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);
  const [motivoTope, setMotivoTope] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [confirmCancelar, setConfirmCancelar] = useState(false);

  const enviado = pedido.estado === 'enviado';
  const items = pedido.pedido_items.slice().sort((a, b) => (a.productos?.nombre ?? '').localeCompare(b.productos?.nombre ?? ''));
  const datalistId = `productos-${pedido.id}`;
  const proveedoresActivos = proveedores.filter(p => p.activo);
  const sugeridas = unidadesSugeridas(productos);
  const datalistUnidades = `unidades-${pedido.id}`;
  const urgentes = items.filter(i => i.estado === 'pendiente' && i.urgente).length;
  const sinProveedor = items.filter(i => i.estado === 'pendiente' && !i.proveedor_id).length;
  // Productos de la lista sin proveedor que el sistema ya sabe a quién se le compran.
  const recordables = items.filter(i => {
    if (i.estado !== 'pendiente' || i.proveedor_id) return false;
    const habitual = productos.find(p => p.id === i.producto_id)?.proveedor_id;
    return !!habitual && proveedoresActivos.some(p => p.id === habitual);
  });

  // Presupuesto: lo que costaría lo pendiente de esta lista (precio habitual) por categoría,
  // sobre lo ya gastado en el mes y lo estimado de las otras listas sin comprar.
  const { uso, hayTopes } = usePresupuestoCaja(pedido.sede_id, mesDe(pedido.fecha_compra));
  const categoriaDe = (productoId: string) => productos.find(p => p.id === productoId)?.categoria_presupuesto;
  const lineasEstimadas = estimarLineasPedido(items, categoriaDe, habituales);
  const estimado = estimarPorCategoria(lineasEstimadas);
  const totalEstimado = roundTwo([...estimado.porCategoria.values()].reduce((s, v) => s + v, 0));
  const barras = [...estimado.porCategoria.entries()].map(([categoria, esta]) => {
    const u: UsoCategoria = uso.find(x => x.categoria === categoria) ?? { categoria, tope: null, presupuestoTotal: null, gastado: 0, enviadoEl: null };
    const otros = otrosPorCategoria.get(categoria) ?? 0;
    return { uso: u, esta, otros, extra: roundTwo(esta + otros) };
  }).sort((a, b) => (b.uso.tope ? (b.uso.gastado + b.extra) / b.uso.tope : -1) - (a.uso.tope ? (a.uso.gastado + a.extra) / a.uso.tope : -1));
  const excedidas = barras.filter(b => b.uso.tope && b.uso.gastado + b.extra > b.uso.tope);

  function handleNombre(texto: string) {
    const valor = texto.toLocaleUpperCase('es-PE'); // los productos se escriben en MAYÚSCULAS
    setNombre(valor);
    const conocido = productos.find(p => p.nombre.toLowerCase() === valor.trim().toLowerCase());
    if (conocido) {
      setUnidad(conocido.unidad);
      setProveedorId(conocido.proveedor_id ?? '');
      setCategoriaNueva(conocido.categoria_presupuesto ?? '');
    }
  }

  async function handleAgregar() {
    const cant = parseFloat(cantidad);
    if (!nombre.trim()) return addToast('Escribe el producto', 'error');
    if (!cant || cant <= 0) return addToast('La cantidad debe ser mayor a 0', 'error');

    setGuardando(true);
    const unidadFinal = normalizarUnidad(unidad);
    if (!unidadFinal) return addToast('Escribe la unidad (kg, unidad, sol…)', 'error');
    const { producto, error } = await obtenerOCrear(nombre, unidadFinal);
    if (error || !producto) {
      setGuardando(false);
      return addToast(`Error: ${error ?? 'no se pudo guardar el producto'}`, 'error');
    }
    if (items.some(i => i.producto_id === producto.id && i.estado === 'pendiente')) {
      setGuardando(false);
      return addToast(`${producto.nombre} ya está en la lista: cambia su cantidad ahí.`, 'warning');
    }
    const { error: errItem } = await onAgregar(pedido.id, {
      producto_id: producto.id,
      cantidad: cant,
      unidad: unidadFinal,
      nota: nota.trim() || null,
      proveedor_id: proveedorId || producto.proveedor_id,
      urgente: urgenteNuevo,
      ...(referenciaNueva.trim() !== '' && parseFloat(referenciaNueva) >= 0 ? { precio_referencia: parseFloat(referenciaNueva) } : {}),
    });
    setGuardando(false);
    if (errItem) return addToast(`Error: ${errItem}`, 'error');
    if (proveedorId && proveedorId !== producto.proveedor_id) await recordar(producto.id, producto.nombre, proveedorId);
    if (unidadFinal !== producto.unidad) await recordarUnidadDe(producto.id, producto.nombre, unidadFinal);
    if (categoriaNueva && categoriaNueva !== (producto.categoria_presupuesto ?? '')) await recordarCategoriaDe(producto.id, producto.nombre, categoriaNueva);
    setCategoriaNueva('');
    setNombre('');
    setCantidad('');
    setNota('');
    setProveedorId('');
    setUrgenteNuevo(false);
    setReferenciaNueva('');
  }

  /** Guarda (o borra, si se deja vacío) el precio de referencia de una línea. */
  async function handleReferencia(itemId: string, actual: number | null | undefined, valor: string) {
    const nuevo = valor.trim() === '' ? null : parseFloat(valor);
    if (nuevo !== null && !(nuevo >= 0)) return;
    if ((nuevo ?? null) === (actual === undefined || actual === null ? null : Number(actual))) return;
    const { error } = await onActualizar(itemId, { precio_referencia: nuevo });
    if (error) addToast(`Error: ${error}`, 'error');
  }

  async function handleCantidad(itemId: string, actual: number, valor: string) {
    const cant = parseFloat(valor);
    if (!cant || cant <= 0 || cant === Number(actual)) return;
    const { error } = await onActualizar(itemId, { cantidad: cant });
    if (error) addToast(`Error: ${error}`, 'error');
  }

  /** Guarda el proveedor como el habitual del producto y avisa qué pasará la próxima vez. */
  async function recordar(productoId: string, nombreProducto: string, proveedorElegido: string) {
    const { error } = await onRecordarProveedor(productoId, proveedorElegido);
    if (error) return addToast(`Se guardó en esta lista, pero no se pudo recordar: ${error}`, 'warning');
    const nombreProveedor = proveedores.find(p => p.id === proveedorElegido)?.nombre ?? 'ese proveedor';
    addToast(`Recordado: la próxima vez, ${nombreProducto} saldrá con ${nombreProveedor}`, 'success');
  }

  async function recordarUnidadDe(productoId: string, nombreProducto: string, unidadElegida: string) {
    const { error } = await onRecordarUnidad(productoId, unidadElegida);
    if (error) return addToast(`Se guardó en esta lista, pero no se pudo recordar la unidad: ${error}`, 'warning');
    addToast(`Recordado: ${nombreProducto} se pedirá en «${unidadElegida}»`, 'success');
  }

  async function recordarCategoriaDe(productoId: string, nombreProducto: string, categoria: string | null) {
    const { error } = await onRecordarCategoria(productoId, categoria);
    if (error) return addToast(`No se pudo guardar la categoría: ${error}`, 'warning');
    addToast(categoria ? `Recordado: ${nombreProducto} va en «${nombreCategoria(categoria)}»` : `${nombreProducto} quedó sin categoría`, 'success');
  }

  async function handleCategoria(productoId: string, nombreProducto: string, valor: string) {
    await recordarCategoriaDe(productoId, nombreProducto, valor || null);
  }

  async function handleUnidad(itemId: string, valor: string) {
    const item = items.find(i => i.id === itemId);
    const nueva = normalizarUnidad(valor);
    if (!item || !nueva || nueva === item.unidad) return;
    const { error } = await onActualizar(itemId, { unidad: nueva });
    if (error) return addToast(`Error: ${error}`, 'error');
    const catalogo = productos.find(p => p.id === item.producto_id)?.unidad;
    if (catalogo !== nueva) await recordarUnidadDe(item.producto_id, item.productos?.nombre ?? 'el producto', nueva);
  }

  async function handleProveedor(itemId: string, valor: string) {
    const item = items.find(i => i.id === itemId);
    const { error } = await onActualizar(itemId, { proveedor_id: valor || null });
    if (error) return addToast(`Error: ${error}`, 'error');
    if (valor && item) {
      const habitual = productos.find(p => p.id === item.producto_id)?.proveedor_id;
      if (habitual !== valor) await recordar(item.producto_id, item.productos?.nombre ?? 'el producto', valor);
    }
  }

  /** Completa con el proveedor recordado los productos de esta lista que aún no tienen uno. */
  async function handleCompletarRecordados() {
    let completados = 0;
    for (const i of recordables) {
      const proveedor = productos.find(p => p.id === i.producto_id)?.proveedor_id;
      if (!proveedor) continue;
      const { error } = await onActualizar(i.id, { proveedor_id: proveedor });
      if (error) return addToast(`Error: ${error}`, 'error');
      completados += 1;
    }
    addToast(`Se completó el proveedor de ${completados} producto(s)`, 'success');
  }

  async function handleUrgente(itemId: string, valor: boolean) {
    const { error } = await onActualizar(itemId, { urgente: valor });
    if (error) addToast(`Error: ${error}`, 'error');
  }

  async function handleEliminar(itemId: string) {
    const { error } = await onEliminar(itemId);
    if (error) addToast(`Error: ${error}`, 'error');
  }

  async function handleEnviar() {
    // Si la lista pasa el tope de alguna categoría, primero se pide el motivo (le llega a Finanzas).
    if (excedidas.length > 0 && !pidiendoMotivo) {
      setPidiendoMotivo(true);
      return;
    }
    if (excedidas.length > 0 && !motivoTope.trim()) return addToast('Escribe por qué la lista pasa el tope', 'error');
    const { error } = await onEnviar(pedido.id, excedidas.length > 0 ? motivoTope : undefined);
    if (error) addToast(`Error: ${error}`, 'error');
    else {
      addToast('Lista enviada a Compras', 'success');
      setPidiendoMotivo(false);
      setMotivoTope('');
    }
  }

  async function handleCancelar() {
    setConfirmCancelar(false);
    const { error } = await onCancelar(pedido);
    if (error) addToast(error, 'error');
    else addToast(pedido.estado === 'borrador' ? 'Lista descartada' : 'Pedido cancelado', 'success');
  }

  return (
    <Card className={pedido.urgente ? 'border-amber-300' : ''}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base capitalize">
            {pedido.urgente ? 'Pedido urgente' : 'Lista'} para el {fechaLarga(pedido.fecha_compra)}
          </CardTitle>
          <div className="flex items-center gap-2">
            {pedido.urgente && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                <AlertTriangle size={12} /> Urgente
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_PEDIDO[pedido.estado].clase}`}>
              {ESTADO_PEDIDO[pedido.estado].label}
            </span>
          </div>
        </div>
        {pedido.urgente && pedido.motivo_urgente && (
          <p className="text-xs text-amber-800">Motivo: {pedido.motivo_urgente}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Agregar producto */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
          <div className="col-span-2 sm:col-span-5">
            <label className="text-xs font-medium" htmlFor={`prod-${pedido.id}`}>Producto</label>
            <Input
              id={`prod-${pedido.id}`}
              list={datalistId}
              placeholder="Ej: HARINA PREPARADA"
              value={nombre}
              onChange={e => handleNombre(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAgregar()}
              className="mt-1"
              autoComplete="off"
            />
            <datalist id={datalistId}>
              {productos.filter(p => p.activo).map(p => <option key={p.id} value={p.nombre} />)}
            </datalist>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium" htmlFor={`cant-${pedido.id}`}>Cantidad</label>
            <Input
              id={`cant-${pedido.id}`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={cantidad}
              onChange={e => setCantidad(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAgregar()}
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium" htmlFor={`uni-${pedido.id}`}>Unidad</label>
            <Input
              id={`uni-${pedido.id}`}
              list={datalistUnidades}
              value={unidad}
              onChange={e => setUnidad(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAgregar()}
              className="mt-1"
              autoComplete="off"
              placeholder="kg, sol…"
            />
            <datalist id={datalistUnidades}>
              {sugeridas.map(u => <option key={u} value={u} />)}
            </datalist>
          </div>
          <div className="col-span-2 sm:col-span-5">
            <label className="text-xs font-medium" htmlFor={`prov-${pedido.id}`}>Proveedor (a quién se le compra)</label>
            <Select id={`prov-${pedido.id}`} value={proveedorId} onChange={e => setProveedorId(e.target.value)} className="mt-1">
              <option value="">Sin proveedor todavía</option>
              {proveedoresActivos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </Select>
          </div>
          <div className="col-span-2 sm:col-span-7">
            <label className="text-xs font-medium" htmlFor={`cat-${pedido.id}`}>Categoría del presupuesto</label>
            <Select id={`cat-${pedido.id}`} value={categoriaNueva} onChange={e => setCategoriaNueva(e.target.value)} className="mt-1">
              <option value="">Elegir…</option>
              <OpcionesCategoria />
            </Select>
          </div>
          <div className="col-span-2 sm:col-span-4">
            <label className="text-xs font-medium" htmlFor={`ref-${pedido.id}`}>Precio de referencia (opcional)</label>
            <div className="mt-1 flex items-center gap-1 text-sm">
              S/
              <Input id={`ref-${pedido.id}`} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" value={referenciaNueva}
                onChange={e => setReferenciaNueva(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAgregar()} />
              <span className="whitespace-nowrap text-xs text-muted-foreground">por {baseDePrecio(unidad || 'unidad').etiqueta}</span>
            </div>
          </div>
          <div className="col-span-2 sm:col-span-8">
            <label className="text-xs font-medium" htmlFor={`nota-${pedido.id}`}>Nota (opcional)</label>
            <Input
              id={`nota-${pedido.id}`}
              placeholder="Marca, tamaño..."
              value={nota}
              onChange={e => setNota(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAgregar()}
              className="mt-1"
            />
          </div>
          <div className="col-span-2 flex flex-wrap items-center gap-4 sm:col-span-12">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={urgenteNuevo} onChange={e => setUrgenteNuevo(e.target.checked)} />
              <span className="font-medium text-red-700">⚡ Urgente</span>
              <span className="text-xs text-muted-foreground">(Compras lo compra primero)</span>
            </label>
            <Button size="sm" onClick={handleAgregar} disabled={guardando}>
              {guardando ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Plus size={14} className="mr-1" />}
              Agregar a la lista
            </Button>
          </div>
        </div>

        <p className="-mt-1 text-xs text-muted-foreground">💡 {AYUDA_UNIDAD_SOL}</p>

        {/* Lista */}
        {items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">La lista está vacía. Agrega el primer producto.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Producto</th>
                  <th className="py-2 font-medium">Cantidad</th>
                  <th className="py-2 font-medium">Proveedor</th>
                  <th className="py-2 font-medium">Categoría</th>
                  <th className="py-2 font-medium" title="Lo que crees que costará. Compras la recibe con la lista y, si cambia al comprar, ve cuánto subió o bajó.">Precio ref.</th>
                  <th className="py-2 text-right font-medium" title="Lo que costaría (precio habitual) si falta comprar; lo que se pagó si ya se compró">Precio</th>
                  <th className="py-2 text-center font-medium">⚡ Urgente</th>
                  <th className="py-2 font-medium">Nota</th>
                  {enviado && <th className="py-2 font-medium">Estado</th>}
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id} className={`border-b last:border-b-0 ${i.urgente && i.estado === 'pendiente' ? 'bg-red-50/60' : ''}`}>
                    <td className="py-2 pr-2 font-medium">{i.productos?.nombre ?? '—'}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {i.estado === 'pendiente' ? (
                        <span className="inline-flex items-center gap-1">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            defaultValue={Number(i.cantidad)}
                            onBlur={e => handleCantidad(i.id, i.cantidad, e.target.value)}
                            className="h-8 w-20"
                            aria-label={`Cantidad de ${i.productos?.nombre ?? 'producto'}`}
                          />
                          <Input
                            key={`${i.id}-${i.unidad}`}
                            list={datalistUnidades}
                            defaultValue={i.unidad}
                            onBlur={e => { handleUnidad(i.id, e.target.value); if (!e.target.value.trim()) e.target.value = i.unidad; }}
                            onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                            className="h-8 w-24 text-xs"
                            autoComplete="off"
                            aria-label={`Unidad de ${i.productos?.nombre ?? 'producto'}`}
                          />
                        </span>
                      ) : (
                        <CantidadCelda item={i} pago={pagos.get(i.id)} />
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      {i.estado === 'pendiente' ? (
                        <Select
                          className={`h-8 w-44 text-xs ${i.proveedor_id ? '' : 'border-amber-400'}`}
                          value={i.proveedor_id ?? ''}
                          onChange={e => handleProveedor(i.id, e.target.value)}
                          aria-label={`Proveedor de ${i.productos?.nombre ?? 'producto'}`}
                        >
                          <option value="">Elegir proveedor…</option>
                          {proveedoresActivos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                          {i.proveedor_id && !proveedoresActivos.some(p => p.id === i.proveedor_id) && (
                            <option value={i.proveedor_id}>{i.proveedores?.nombre ?? 'Proveedor'}</option>
                          )}
                        </Select>
                      ) : (
                        <span className="text-xs">{i.proveedores?.nombre ?? '—'}</span>
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      {i.estado === 'pendiente' ? (
                        <Select
                          className={`h-8 w-40 text-xs ${categoriaDe(i.producto_id) ? '' : 'border-amber-400'}`}
                          value={categoriaDe(i.producto_id) ?? ''}
                          onChange={e => handleCategoria(i.producto_id, i.productos?.nombre ?? 'El producto', e.target.value)}
                          aria-label={`Categoría de ${i.productos?.nombre ?? 'producto'}`}
                        >
                          <option value="">Elegir…</option>
                          <OpcionesCategoria />
                        </Select>
                      ) : (
                        <span className="text-xs">{categoriaDe(i.producto_id) ? nombreCategoria(categoriaDe(i.producto_id)!) : '—'}</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      {i.estado === 'pendiente' ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          S/
                          <Input
                            key={`${i.id}-${i.precio_referencia ?? ''}`}
                            type="number" inputMode="decimal" min="0" step="0.01" placeholder="—"
                            defaultValue={i.precio_referencia ?? ''}
                            onBlur={e => handleReferencia(i.id, i.precio_referencia, e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                            className="h-8 w-20"
                            aria-label={`Precio de referencia de ${i.productos?.nombre ?? 'producto'}`}
                          />
                          <span className="text-muted-foreground">/{baseDePrecio(i.unidad).etiqueta}</span>
                        </span>
                      ) : (
                        <span className="text-xs tabular-nums">
                          {i.precio_referencia !== null && i.precio_referencia !== undefined ? `${formatMonto(Number(i.precio_referencia))}/${baseDePrecio(i.unidad).etiqueta}` : '—'}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-right text-xs tabular-nums text-muted-foreground">
                      {(() => {
                        if (i.estado === 'comprado') return <PrecioPagadoCelda pago={pagos.get(i.id)} referencia={i.precio_referencia} />;
                        if (i.estado !== 'pendiente') return '';
                        const ref = referenciaPorUnidadLinea(i.precio_referencia, i.unidad);
                        if (ref !== undefined) return <span title="Estimado con tu precio de referencia">≈ {formatMonto(roundTwo(ref * Number(i.cantidad)))}</span>;
                        const h = habituales.get(`${i.producto_id}|${i.unidad}`);
                        return h ? <span title="Estimado con el precio habitual">≈ {formatMonto(roundTwo(h.unitario * Number(i.cantidad)))}</span> : '—';
                      })()}
                    </td>
                    <td className="py-2 pr-2 text-center">
                      {i.estado === 'pendiente' ? (
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer accent-red-600"
                          checked={!!i.urgente}
                          onChange={e => handleUrgente(i.id, e.target.checked)}
                          aria-label={`Marcar ${i.productos?.nombre ?? 'producto'} como urgente`}
                        />
                      ) : (
                        i.urgente && <span className="text-xs font-bold text-red-700">⚡</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-xs text-muted-foreground">{i.nota ?? ''}</td>
                    {enviado && (
                      <td className="py-2 pr-2">
                        <EntregaCelda item={i} puedeMarcar onCambiar={onEntregado} onProblema={onProblema} onVolverAPedir={onVolverAPedir} />
                      </td>
                    )}
                    <td className="py-2 text-right">
                      {i.estado === 'pendiente' && (
                        <Button variant="ghost" size="icon" onClick={() => handleEliminar(i.id)} aria-label={`Quitar ${i.productos?.nombre ?? 'producto'}`} className="text-red-500 hover:text-red-700">
                          <Trash2 size={14} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Presupuesto: cuánto usaría esta lista de cada tope */}
        {lineasEstimadas.length > 0 && (
          <div className="space-y-3 rounded-lg border bg-yayis-cream p-3">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-yayis-dark">
              <Gauge size={16} /> Esta lista cuesta unos <strong>{formatMonto(totalEstimado)}</strong>
              <span className="text-xs font-normal text-muted-foreground">(con el precio habitual de cada producto)</span>
            </p>
            {hayTopes ? (
              barras.filter(b => b.uso.tope).map(b => (
                <BarraPresupuesto key={b.uso.categoria} uso={b.uso} extra={b.extra}
                  etiquetaExtra={b.otros > 0 ? `esta lista y otras sin comprar (estimado)` : 'esta lista (estimado)'} />
              ))
            ) : (
              <p className="text-xs text-muted-foreground">Todavía no hay presupuesto aprobado para este mes: cuando Gerencia lo apruebe, aquí verás cuánto usa la lista de cada tope.</p>
            )}
            {hayTopes && barras.some(b => !b.uso.tope) && (
              <p className="text-xs text-muted-foreground">
                Sin tope este mes: {barras.filter(b => !b.uso.tope).map(b => `${nombreCategoria(b.uso.categoria)} (${formatMonto(b.esta)})`).join(', ')}.
              </p>
            )}
            {(estimado.sinCategoria > 0 || estimado.sinPrecio > 0) && (
              <p className="text-xs text-amber-800">
                {estimado.sinCategoria > 0 && <>{estimado.sinCategoria} producto(s) sin categoría: elígela en la columna <strong>Categoría</strong>. </>}
                {estimado.sinPrecio > 0 && <>{estimado.sinPrecio} producto(s) todavía sin precio conocido (no se compraron antes en esa unidad): no entran en el estimado.</>}
              </p>
            )}
          </div>
        )}

        {pidiendoMotivo && excedidas.length > 0 && pedido.estado === 'borrador' && (
          <div className="space-y-2 rounded-lg border border-red-300 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-800">
              Esta lista pasa el tope de {excedidas.map(b => nombreCategoria(b.uso.categoria)).join(', ')}. ¿Por qué es necesaria igual?
            </p>
            <Input
              placeholder="Ej: viene un pedido grande de tortas para el fin de semana"
              value={motivoTope}
              onChange={e => setMotivoTope(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleEnviar()}
              className="bg-white"
            />
            <p className="text-xs text-red-700">Se puede enviar igual; Gerencia de Finanzas verá el motivo. También puedes quitar o bajar productos.</p>
          </div>
        )}

        {urgentes > 0 && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            ⚡ {urgentes === 1 ? '1 producto urgente' : `${urgentes} productos urgentes`}: Compras {pedido.estado === 'borrador' ? 'los verá primero cuando envíes la lista' : 'ya los ve primero en su ruta'}.
          </p>
        )}

        {sinProveedor > 0 && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {sinProveedor === 1 ? '1 producto' : `${sinProveedor} productos`} sin proveedor. Elígelo en la columna <strong>Proveedor</strong> para que Compras vea la lista ya agrupada por proveedor; si no, tendrá que asignarlo él.
            {recordables.length > 0 && (
              <Button size="sm" variant="outline" className="mt-2 block border-amber-400" onClick={handleCompletarRecordados}>
                Completar los proveedores que el sistema ya recuerda ({recordables.length})
              </Button>
            )}
          </p>
        )}

        {/* Acciones */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          {pedido.estado === 'borrador' ? (
            <p className="text-xs text-muted-foreground">Compras todavía no ve esta lista. Envíala cuando esté completa.</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Enviada a Compras{pedido.enviado_at ? ` el ${new Date(pedido.enviado_at).toLocaleString('es-PE', { timeZone: 'America/Lima', weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}.
              {' '}Si agregas algo más, Compras lo verá al instante.
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmCancelar(true)} className="text-red-600">
              {pedido.estado === 'borrador' ? 'Descartar lista' : 'Cancelar pedido'}
            </Button>
            {pedido.estado === 'borrador' && (
              <Button size="sm" onClick={handleEnviar} disabled={items.length === 0}
                className={pidiendoMotivo && excedidas.length > 0 ? 'bg-red-600 hover:bg-red-700' : ''}>
                <Send size={14} className="mr-1" /> {pidiendoMotivo && excedidas.length > 0 ? 'Enviar igual' : 'Enviar a Compras'}
              </Button>
            )}
          </div>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmCancelar}
        title={pedido.estado === 'borrador' ? '¿Descartar esta lista?' : '¿Cancelar este pedido?'}
        message={pedido.estado === 'borrador'
          ? 'Se borrará la lista con todos sus productos.'
          : 'Compras dejará de ver este pedido. Solo se puede cancelar si todavía no compró nada.'}
        confirmLabel="Sí, cancelar"
        variant="destructive"
        onConfirm={handleCancelar}
        onCancel={() => setConfirmCancelar(false)}
      />
    </Card>
  );
}
