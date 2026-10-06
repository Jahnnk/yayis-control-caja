import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AYUDA_UNIDAD_SOL, ESTADO_ITEM, ESTADO_PEDIDO, fechaLarga, formatCantidad, normalizarUnidad, unidadesSugeridas } from '@/lib/compras';
import { AlertTriangle, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import type { PedidoConItems, Producto, Proveedor } from '@/types';
import type { NuevoItem } from '@/hooks/usePedidos';

interface Props {
  pedido: PedidoConItems;
  productos: Producto[];
  proveedores: Proveedor[];
  onRecordarProveedor: (productoId: string, proveedorId: string) => Promise<{ error: string | null }>;
  onRecordarUnidad: (productoId: string, unidad: string) => Promise<{ error: string | null }>;
  obtenerOCrear: (nombre: string, unidad: string) => Promise<{ producto: Producto | null; error: string | null }>;
  onAgregar: (pedidoId: string, item: NuevoItem) => Promise<{ error: string | null }>;
  onActualizar: (itemId: string, cambios: { cantidad?: number; unidad?: string; proveedor_id?: string | null; urgente?: boolean }) => Promise<{ error: string | null }>;
  onEliminar: (itemId: string) => Promise<{ error: string | null }>;
  onEnviar: (pedidoId: string) => Promise<{ error: string | null }>;
  onCancelar: (pedido: PedidoConItems) => Promise<{ error: string | null }>;
}

export function PedidoEditor({ pedido, productos, proveedores, onRecordarProveedor, onRecordarUnidad, obtenerOCrear, onAgregar, onActualizar, onEliminar, onEnviar, onCancelar }: Props) {
  const { addToast } = useToast();
  const [nombre, setNombre] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [unidad, setUnidad] = useState<string>('kg');
  const [nota, setNota] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [urgenteNuevo, setUrgenteNuevo] = useState(false);
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

  function handleNombre(texto: string) {
    const valor = texto.toLocaleUpperCase('es-PE'); // los productos se escriben en MAYÚSCULAS
    setNombre(valor);
    const conocido = productos.find(p => p.nombre.toLowerCase() === valor.trim().toLowerCase());
    if (conocido) {
      setUnidad(conocido.unidad);
      setProveedorId(conocido.proveedor_id ?? '');
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
    });
    setGuardando(false);
    if (errItem) return addToast(`Error: ${errItem}`, 'error');
    if (proveedorId && proveedorId !== producto.proveedor_id) await recordar(producto.id, producto.nombre, proveedorId);
    if (unidadFinal !== producto.unidad) await recordarUnidadDe(producto.id, producto.nombre, unidadFinal);
    setNombre('');
    setCantidad('');
    setNota('');
    setProveedorId('');
    setUrgenteNuevo(false);
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
    const { error } = await onEnviar(pedido.id);
    if (error) addToast(`Error: ${error}`, 'error');
    else addToast('Lista enviada a Compras', 'success');
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
                        <span>{formatCantidad(i.cantidad)} {i.unidad}</span>
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
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_ITEM[i.estado].clase}`}>
                          {ESTADO_ITEM[i.estado].label}
                        </span>
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
              <Button size="sm" onClick={handleEnviar} disabled={items.length === 0}>
                <Send size={14} className="mr-1" /> Enviar a Compras
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
