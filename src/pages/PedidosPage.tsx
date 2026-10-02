import { useMemo, useState } from 'react';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { usePedidos } from '@/hooks/usePedidos';
import { useProductos } from '@/hooks/useProductos';
import { useProveedores } from '@/hooks/useProveedores';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { Loading } from '@/components/ui/loading';
import { PedidoEditor } from '@/components/compras/PedidoEditor';
import { getTodayLima, DIAS_SEMANA } from '@/lib/dates';
import { ESTADO_ITEM, ESTADO_PEDIDO, fechaCorta, fechaLarga, formatCantidad, proximasFechasCompra } from '@/lib/compras';
import { AlertTriangle, CalendarDays, ChevronDown, ClipboardList, Loader2 } from 'lucide-react';

export function PedidosPage() {
  const { sedeActiva } = useSedeActiva();
  const { pedidos, loading, crearPedido, agregarItem, actualizarItem, eliminarItem, enviarPedido, cancelarPedido } = usePedidos();
  const { productos, obtenerOCrear, recordarProveedor, recordarUnidad } = useProductos();
  const { proveedores } = useProveedores();
  const { addToast } = useToast();

  const hoy = getTodayLima();
  const diasCompra = useMemo(() => sedeActiva?.dias_compra ?? [], [sedeActiva]);
  const nombresDias = DIAS_SEMANA.filter(d => diasCompra.includes(d.valor)).map(d => d.largo);

  const abiertos = pedidos.filter(p => p.estado === 'borrador' || p.estado === 'enviado');
  const historial = pedidos.filter(p => p.estado !== 'borrador' && p.estado !== 'enviado');

  // Fechas de compra disponibles para una lista nueva: las proximas del calendario
  // que todavia no tienen su lista regular.
  const fechasOcupadas = new Set(
    pedidos.filter(p => !p.urgente && p.estado !== 'cancelado').map(p => p.fecha_compra),
  );
  const fechasLibres = proximasFechasCompra(diasCompra, hoy, 6).filter(f => !fechasOcupadas.has(f)).slice(0, 3);

  const [fechaNueva, setFechaNueva] = useState('');
  const [creando, setCreando] = useState(false);
  const [mostrarUrgente, setMostrarUrgente] = useState(false);
  const [motivoUrgente, setMotivoUrgente] = useState('');

  const fechaElegida = fechasLibres.includes(fechaNueva) ? fechaNueva : fechasLibres[0] ?? '';

  async function handleNuevaLista() {
    if (!fechaElegida) return;
    setCreando(true);
    const { error } = await crearPedido(fechaElegida);
    setCreando(false);
    if (error) addToast(`Error: ${error}`, 'error');
  }

  async function handleUrgente() {
    if (!motivoUrgente.trim()) return addToast('Escribe por qué es urgente', 'error');
    setCreando(true);
    const { error } = await crearPedido(hoy, true, motivoUrgente);
    setCreando(false);
    if (error) return addToast(`Error: ${error}`, 'error');
    addToast('Pedido urgente creado. Agrega los productos y envíalo.', 'success');
    setMotivoUrgente('');
    setMostrarUrgente(false);
  }

  if (loading && pedidos.length === 0) return <Loading text="Cargando pedidos..." />;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-yayis-dark">Pedidos de compra{sedeActiva ? ` — ${sedeActiva.nombre}` : ''}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays size={15} />
          {nombresDias.length > 0
            ? <>Compras sale a comprar para esta sede los <strong className="text-yayis-dark">{nombresDias.join(' y ')}</strong>.</>
            : 'Esta sede aún no tiene días de compra configurados (Gerencia los marca en Configuración).'}
        </p>
      </div>

      {/* Listas abiertas */}
      {abiertos.map(p => (
        <PedidoEditor
          key={p.id}
          pedido={p}
          productos={productos}
          proveedores={proveedores}
          onRecordarProveedor={recordarProveedor}
          onRecordarUnidad={recordarUnidad}
          obtenerOCrear={obtenerOCrear}
          onAgregar={agregarItem}
          onActualizar={actualizarItem}
          onEliminar={eliminarItem}
          onEnviar={enviarPedido}
          onCancelar={cancelarPedido}
        />
      ))}

      {/* Nueva lista / pedido urgente */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><ClipboardList size={18} /> Nueva lista de compra</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {fechasLibres.length > 0 ? (
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="text-xs font-medium" htmlFor="fecha-nueva">Para el día de compra</label>
                <Select id="fecha-nueva" value={fechaElegida} onChange={e => setFechaNueva(e.target.value)} className="mt-1 w-56 capitalize">
                  {fechasLibres.map(f => <option key={f} value={f} className="capitalize">{fechaLarga(f)}</option>)}
                </Select>
              </div>
              <Button onClick={handleNuevaLista} disabled={creando}>
                {creando ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
                Empezar lista
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {diasCompra.length === 0
                ? 'Sin días de compra configurados no se pueden programar listas; solo pedidos urgentes.'
                : 'Ya tienes listas para los próximos días de compra.'}
            </p>
          )}

          <div className="border-t pt-4">
            {!mostrarUrgente ? (
              <Button variant="outline" size="sm" onClick={() => setMostrarUrgente(true)} className="border-amber-400 text-amber-800 hover:bg-amber-50">
                <AlertTriangle size={14} className="mr-1" /> Necesito algo urgente hoy
              </Button>
            ) : (
              <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3">
                <p className="text-sm font-medium text-amber-900">Pedido urgente para hoy, fuera del día de compra</p>
                <p className="text-xs text-amber-800">Se permite, pero Gerencia lo verá marcado. Úsalo solo si no puede esperar al próximo día de compra.</p>
                <Input
                  placeholder="¿Por qué es urgente? Ej: se acabó la harina para la producción de mañana"
                  value={motivoUrgente}
                  onChange={e => setMotivoUrgente(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleUrgente()}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleUrgente} disabled={creando} className="bg-amber-600 hover:bg-amber-700">
                    Crear pedido urgente
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setMostrarUrgente(false); setMotivoUrgente(''); }}>Cancelar</Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Historial (plegado por defecto) */}
      {historial.length > 0 && (
        <details className="group rounded-lg border bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-bold text-yayis-dark">
            <span>Pedidos anteriores ({historial.length})</span>
            <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="divide-y border-t">
            {historial.map(p => {
              const comprados = p.pedido_items.filter(i => i.estado === 'comprado').length;
              const noHabia = p.pedido_items.filter(i => i.estado === 'no_habia').length;
              return (
                <details key={p.id} className="px-4 py-3">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium capitalize">{fechaCorta(p.fecha_compra)}</span>
                    {p.urgente && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Urgente</span>}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_PEDIDO[p.estado].clase}`}>{ESTADO_PEDIDO[p.estado].label}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.pedido_items.length} productos · {comprados} comprados{noHabia > 0 ? ` · ${noHabia} no había` : ''}
                    </span>
                  </summary>
                  <ul className="mt-2 space-y-1 pl-2 text-xs">
                    {p.pedido_items.map(i => (
                      <li key={i.id} className="flex items-center gap-2">
                        <span className={`rounded-full px-1.5 py-0.5 ${ESTADO_ITEM[i.estado].clase}`}>{ESTADO_ITEM[i.estado].label}</span>
                        <span>{i.productos?.nombre}</span>
                        <span className="text-muted-foreground">{formatCantidad(i.cantidad)} {i.unidad}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
