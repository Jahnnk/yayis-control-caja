import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ESTADO_ITEM, ESTADO_PEDIDO, UNIDADES, fechaLarga, formatCantidad } from '@/lib/compras';
import { AlertTriangle, Loader2, Plus, Send, Trash2 } from 'lucide-react';
import type { PedidoConItems, Producto, Proveedor } from '@/types';
import type { NuevoItem } from '@/hooks/usePedidos';

interface Props {
  pedido: PedidoConItems;
  productos: Producto[];
  proveedores: Proveedor[];
  obtenerOCrear: (nombre: string, unidad: string) => Promise<{ producto: Producto | null; error: string | null }>;
  onAgregar: (pedidoId: string, item: NuevoItem) => Promise<{ error: string | null }>;
  onActualizar: (itemId: string, cambios: { cantidad?: number; proveedor_id?: string | null }) => Promise<{ error: string | null }>;
  onEliminar: (itemId: string) => Promise<{ error: string | null }>;
  onEnviar: (pedidoId: string) => Promise<{ error: string | null }>;
  onCancelar: (pedido: PedidoConItems) => Promise<{ error: string | null }>;
}

export function PedidoEditor({ pedido, productos, proveedores, obtenerOCrear, onAgregar, onActualizar, onEliminar, onEnviar, onCancelar }: Props) {
  const { addToast } = useToast();
  const [nombre, setNombre] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [unidad, setUnidad] = useState<string>('kg');
  const [nota, setNota] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [confirmCancelar, setConfirmCancelar] = useState(false);

  const enviado = pedido.estado === 'enviado';
  const items = pedido.pedido_items.slice().sort((a, b) => (a.productos?.nombre ?? '').localeCompare(b.productos?.nombre ?? ''));
  const datalistId = `productos-${pedido.id}`;
  const proveedoresActivos = proveedores.filter(p => p.activo);
  const sinProveedor = items.filter(i => i.estado === 'pendiente' && !i.proveedor_id).length;

  function handleNombre(valor: string) {
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
    const { producto, error } = await obtenerOCrear(nombre, unidad);
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
      unidad,
      nota: nota.trim() || null,
      proveedor_id: proveedorId || producto.proveedor_id,
    });
    setGuardando(false);
    if (errItem) return addToast(`Error: ${errItem}`, 'error');
    setNombre('');
    setCantidad('');
    setNota('');
    setProveedorId('');
  }

  async function handleCantidad(itemId: string, actual: number, valor: string) {
    const cant = parseFloat(valor);
    if (!cant || cant <= 0 || cant === Number(actual)) return;
    const { error } = await onActualizar(itemId, { cantidad: cant });
    if (error) addToast(`Error: ${error}`, 'error');
  }

  async function handleProveedor(itemId: string, valor: string) {
    const { error } = await onActualizar(itemId, { proveedor_id: valor || null });
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
              placeholder="Ej: Harina preparada"
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
            <Select id={`uni-${pedido.id}`} value={unidad} onChange={e => setUnidad(e.target.value)} className="mt-1">
              {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
            </Select>
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
          <div className="col-span-2 sm:col-span-12">
            <Button size="sm" onClick={handleAgregar} disabled={guardando}>
              {guardando ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Plus size={14} className="mr-1" />}
              Agregar a la lista
            </Button>
          </div>
        </div>

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
                  <th className="py-2 font-medium">Nota</th>
                  {enviado && <th className="py-2 font-medium">Estado</th>}
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map(i => (
                  <tr key={i.id} className="border-b last:border-b-0">
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
                          <span className="text-xs text-muted-foreground">{i.unidad}</span>
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

        {sinProveedor > 0 && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {sinProveedor === 1 ? '1 producto' : `${sinProveedor} productos`} sin proveedor. Elígelo en la columna <strong>Proveedor</strong> para que Compras vea la lista ya agrupada por proveedor; si no, tendrá que asignarlo él.
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
