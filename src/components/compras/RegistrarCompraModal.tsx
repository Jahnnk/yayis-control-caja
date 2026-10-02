import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useCompras, validarCompra, type NuevaCompra } from '@/hooks/useCompras';
import { useProductos } from '@/hooks/useProductos';
import { useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { EvidenciaInput } from '@/components/compras/EvidenciaInput';
import { AvisoPrecio } from '@/components/compras/AvisoPrecio';
import { usePreciosHabituales } from '@/hooks/usePreciosHabituales';
import { claveProducto } from '@/lib/precios';
import { alCambiarCantidad, alEscribirTotal, alEscribirUnitario, type CamposPrecio } from '@/lib/precio-linea';
import { formatMonto, roundTwo } from '@/lib/utils';
import { fechaCorta, formatCantidad, normalizarUnidad, sumarDias, unidadesSugeridas } from '@/lib/compras';
import { getTodayLima } from '@/lib/dates';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import type { MetodoPago, Proveedor, TipoComprobante } from '@/types';

export interface LineaCandidata {
  pedido_item_id: string;
  pedido_id: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  unidad: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onGuardado: () => void;
  sedeId: string;
  sedeNombre: string;
  proveedor: Pick<Proveedor, 'id' | 'nombre' | 'condicion_pago' | 'dias_credito'>;
  candidatas: LineaCandidata[];
}

interface EstadoLinea extends CamposPrecio {
  incluir: boolean;
}

interface LineaExtra extends CamposPrecio {
  nombre: string;
  unidad: string;
}

/** Precio de una línea: por unidad o total; al escribir uno, el otro se calcula solo. */
function CamposDePrecio({ campos, unidad, nombre, disabled, onChange }: {
  campos: CamposPrecio;
  unidad: string;
  nombre: string;
  disabled?: boolean;
  onChange: (nuevos: CamposPrecio) => void;
}) {
  return (
    <div className="flex w-full flex-wrap items-end gap-2">
      <label className="text-[11px] text-muted-foreground">
        Precio por {unidad || 'unidad'}
        <span className="mt-0.5 flex items-center gap-1 text-sm text-foreground">
          S/
          <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" className="h-8 w-24" value={campos.unit} disabled={disabled}
            onChange={e => onChange(alEscribirUnitario(campos, e.target.value))} aria-label={`Precio de cada ${unidad || 'unidad'} de ${nombre}`} />
        </span>
      </label>
      <span className="pb-1.5 text-sm text-muted-foreground">=</span>
      <label className="text-[11px] text-muted-foreground">
        Total de la línea
        <span className="mt-0.5 flex items-center gap-1 text-sm text-foreground">
          S/
          <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" className="h-8 w-24" value={campos.precio} disabled={disabled}
            onChange={e => onChange(alEscribirTotal(campos, e.target.value))} aria-label={`Precio total de ${nombre}`} />
        </span>
      </label>
    </div>
  );
}

interface EntregaAbierta {
  id: string;
  fecha: string;
  monto: number;
  metodo_pago: MetodoPago;
  compras: { total: number }[];
}

export function RegistrarCompraModal({ open, onClose, onGuardado, sedeId, sedeNombre, proveedor, candidatas }: Props) {
  const { profile } = useAuth();
  const { registrarCompra } = useCompras();
  const { productos, obtenerOCrear } = useProductos();
  const { addToast } = useToast();
  const hoy = getTodayLima();
  const credito = proveedor.condicion_pago === 'credito';

  const [lineas, setLineas] = useState<Record<string, EstadoLinea>>({});
  const [extras, setExtras] = useState<LineaExtra[]>([]);
  const [entregas, setEntregas] = useState<EntregaAbierta[]>([]);
  const [entregaId, setEntregaId] = useState('');
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo');
  const [comprobante, setComprobante] = useState<TipoComprobante>('boleta');
  const [numero, setNumero] = useState('');
  const [observacion, setObservacion] = useState('');
  const [fotoComprobante, setFotoComprobante] = useState<File | null>(null);
  const [fotoProducto, setFotoProducto] = useState<File | null>(null);
  const [fotoPago, setFotoPago] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Al abrir: todas las líneas incluidas con la cantidad pedida, y las entregas abiertas de la sede.
  useEffect(() => {
    if (!open) return;
    setLineas(Object.fromEntries(candidatas.map(c => [c.pedido_item_id, { incluir: true, cantidad: String(Number(c.cantidad)), precio: '', unit: '', ultimo: null }])));
    setExtras([]);
    setNumero('');
    setObservacion('');
    setFotoComprobante(null);
    setFotoProducto(null);
    setFotoPago(null);
    setComprobante(credito ? 'factura' : 'boleta');
    if (credito || !profile) return;
    let consulta = supabase
      .from('entregas')
      .select('id, fecha, monto, metodo_pago, compras(total)')
      .eq('sede_id', sedeId)
      .eq('estado', 'abierta')
      .order('fecha', { ascending: true });
    if (profile.rol === 'compras') consulta = consulta.eq('receptor_id', profile.id);
    consulta.then(({ data }) => {
      const lista = (data ?? []) as EntregaAbierta[];
      setEntregas(lista);
      setEntregaId(lista[0]?.id ?? '');
    });
  }, [open, candidatas, credito, sedeId, profile]);

  // Sin boleta solo se permite pagar por Yape/transferencia.
  useEffect(() => {
    if (comprobante === 'sin_comprobante') setMetodo('cuentas');
  }, [comprobante]);

  const total = useMemo(() => {
    const deLista = candidatas.reduce((s, c) => {
      const l = lineas[c.pedido_item_id];
      return l?.incluir ? s + (parseFloat(l.precio) || 0) : s;
    }, 0);
    const deExtras = extras.reduce((s, e) => s + (parseFloat(e.precio) || 0), 0);
    return roundTwo(deLista + deExtras);
  }, [candidatas, lineas, extras]);

  // Precio habitual de lo que está en la lista y de lo agregado que ya existe en el catálogo.
  const productoDeExtra = (nombre: string) => productos.find(p => p.nombre.toLowerCase() === nombre.trim().toLowerCase());
  const habituales = usePreciosHabituales(open ? [
    ...candidatas.map(c => c.producto_id),
    ...extras.map(e => productoDeExtra(e.nombre)?.id).filter((id): id is string => !!id),
  ] : []);

  const entrega = entregas.find(e => e.id === entregaId);
  const saldoEntrega = entrega
    ? roundTwo(Number(entrega.monto) - entrega.compras.reduce((s, c) => s + Number(c.total), 0))
    : 0;
  const saldoDespues = roundTwo(saldoEntrega - total);

  function cambiarLinea(id: string, cambios: Partial<EstadoLinea>) {
    setLineas(prev => ({ ...prev, [id]: { ...prev[id]!, ...cambios } }));
  }

  async function handleGuardar() {
    if (!profile) return;
    setGuardando(true);

    // Productos que no estaban en la lista: se crean en el catálogo si hace falta.
    const lineasExtra = [];
    for (const e of extras) {
      if (!e.nombre.trim()) continue;
      const unidadExtra = normalizarUnidad(e.unidad) || 'unidad';
      const { producto, error } = await obtenerOCrear(e.nombre, unidadExtra);
      if (error || !producto) {
        setGuardando(false);
        return addToast(`Error con "${e.nombre}": ${error ?? 'no se pudo guardar'}`, 'error');
      }
      lineasExtra.push({ pedido_item_id: null, producto_id: producto.id, cantidad: parseFloat(e.cantidad) || 0, unidad: unidadExtra, precio_total: parseFloat(e.precio) });
    }

    const incluidas = candidatas.filter(c => lineas[c.pedido_item_id]?.incluir);
    const compra: NuevaCompra = {
      sede_id: sedeId,
      proveedor_id: proveedor.id,
      pedido_id: incluidas[0]?.pedido_id ?? null,
      pedidoIds: Array.from(new Set(incluidas.map(c => c.pedido_id))),
      fecha: hoy,
      condicion_pago: credito ? 'credito' : 'contado',
      dias_credito: proveedor.dias_credito,
      entrega_id: credito ? null : entregaId || null,
      metodo_pago: credito ? null : metodo,
      tipo_comprobante: comprobante,
      numero_comprobante: numero,
      observacion,
      lineas: [
        ...incluidas.map(c => {
          const l = lineas[c.pedido_item_id]!;
          return {
            pedido_item_id: c.pedido_item_id,
            producto_id: c.producto_id,
            cantidad: parseFloat(l.cantidad) || 0,
            unidad: c.unidad,
            precio_total: l.precio === '' ? NaN : parseFloat(l.precio),
          };
        }),
        ...lineasExtra,
      ],
      fotoComprobante,
      fotoProducto,
      fotoPago,
    };

    const invalida = validarCompra(compra);
    if (invalida) {
      setGuardando(false);
      return addToast(invalida, 'error');
    }
    const { error } = await registrarCompra(compra);
    setGuardando(false);
    if (error) return addToast(`Error: ${error}`, 'error');
    addToast(`Compra a ${proveedor.nombre} registrada (${formatMonto(total)})`, 'success');
    onGuardado();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={`Compra a ${proveedor.nombre} — ${sedeNombre}`}>
      <div className="space-y-5">
        {/* Productos y precios */}
        <section>
          <p className="mb-2 text-sm font-bold text-yayis-dark">¿Qué compraste y cuánto pagaste por cada cosa?</p>
          <p className="-mt-1 mb-2 text-xs text-muted-foreground">Escribe el <strong>precio de cada unidad</strong> o el <strong>total</strong> de la línea: el otro se calcula solo. Debajo de cada producto verás su precio habitual: en rojo si pagas bastante más, en verde si consigues un mejor precio.</p>
          <div className="divide-y rounded-md border">
            {candidatas.map(c => {
              const l = lineas[c.pedido_item_id];
              if (!l) return null;
              return (
                <div key={c.pedido_item_id} className={`flex flex-wrap items-center gap-2 px-3 py-2 text-sm ${l.incluir ? '' : 'opacity-50'}`}>
                  <label className="flex min-w-[10rem] flex-1 items-center gap-2">
                    <input type="checkbox" checked={l.incluir} onChange={e => cambiarLinea(c.pedido_item_id, { incluir: e.target.checked })} />
                    <span className="font-medium">{c.nombre}</span>
                    <span className="text-xs text-muted-foreground">(pedido: {formatCantidad(c.cantidad)} {c.unidad})</span>
                  </label>
                  <Input type="number" inputMode="decimal" min="0" step="0.01" className="h-8 w-20" value={l.cantidad} disabled={!l.incluir}
                    onChange={e => cambiarLinea(c.pedido_item_id, alCambiarCantidad(l, e.target.value))} aria-label={`Cantidad comprada de ${c.nombre}`} />
                  <span className="w-12 text-xs text-muted-foreground">{c.unidad}</span>
                  <CamposDePrecio campos={l} unidad={c.unidad} nombre={c.nombre} disabled={!l.incluir} onChange={n => cambiarLinea(c.pedido_item_id, n)} />
                  {l.incluir && <AvisoPrecio habitual={habituales.get(claveProducto(c.producto_id, c.unidad))} cantidad={l.cantidad} precio={l.precio} unidad={c.unidad} />}
                </div>
              );
            })}
            {extras.map((e, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 bg-yayis-cream/40 px-3 py-2 text-sm">
                <Input list="catalogo-compra" placeholder="Producto que no estaba en la lista" className="h-8 min-w-[10rem] flex-1" value={e.nombre}
                  onChange={ev => setExtras(prev => prev.map((x, j) => j === i ? { ...x, nombre: ev.target.value } : x))} aria-label="Producto adicional" />
                <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="Cant." className="h-8 w-20" value={e.cantidad}
                  onChange={ev => setExtras(prev => prev.map((x, j) => j === i ? { ...x, ...alCambiarCantidad(x, ev.target.value) } : x))} aria-label="Cantidad" />
                <Input list="unidades-compra" className="h-8 w-24 text-xs" value={e.unidad} autoComplete="off" placeholder="unidad"
                  onChange={ev => setExtras(prev => prev.map((x, j) => j === i ? { ...x, unidad: ev.target.value } : x))} aria-label="Unidad" />
                <button type="button" onClick={() => setExtras(prev => prev.filter((_, j) => j !== i))} aria-label="Quitar producto" className="text-red-500"><Trash2 size={14} /></button>
                <CamposDePrecio campos={e} unidad={e.unidad} nombre={e.nombre || 'el producto'}
                  onChange={n => setExtras(prev => prev.map((x, j) => j === i ? { ...x, ...n } : x))} />
                {productoDeExtra(e.nombre) && (
                  <AvisoPrecio habitual={habituales.get(claveProducto(productoDeExtra(e.nombre)!.id, e.unidad))} cantidad={e.cantidad} precio={e.precio} unidad={e.unidad} />
                )}
              </div>
            ))}
          </div>
          <datalist id="catalogo-compra">{productos.map(p => <option key={p.id} value={p.nombre} />)}</datalist>
          <datalist id="unidades-compra">{unidadesSugeridas(productos).map(x => <option key={x} value={x} />)}</datalist>
          <div className="mt-2 flex items-center justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={() => setExtras(prev => [...prev, { nombre: '', cantidad: '', unidad: 'kg', precio: '', unit: '', ultimo: null }])}>
              <Plus size={14} className="mr-1" /> Agregar algo que no estaba en la lista
            </Button>
            <span className="text-sm">Total: <strong className="text-lg text-yayis-dark">{formatMonto(total)}</strong></span>
          </div>
        </section>

        {/* Pago */}
        <section className="space-y-3 rounded-md border p-3">
          {credito ? (
            <p className="text-sm">
              <strong className="text-blue-700">Compra a crédito</strong> ({proveedor.dias_credito} días): no sale de tu dinero.
              Vence el <strong className="capitalize">{fechaCorta(sumarDias(hoy, proveedor.dias_credito))}</strong> y la paga Gerencia.
            </p>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium" htmlFor="entrega">¿De qué dinero sale?</label>
                {entregas.length === 0 ? (
                  <p className="mt-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                    No tienes dinero entregado por {sedeNombre}. Pídele al administrador que registre la entrega antes de guardar esta compra.
                  </p>
                ) : (
                  <Select id="entrega" value={entregaId} onChange={e => setEntregaId(e.target.value)} className="mt-1">
                    {entregas.map(e => {
                      const saldo = roundTwo(Number(e.monto) - e.compras.reduce((s, c) => s + Number(c.total), 0));
                      return <option key={e.id} value={e.id}>Entrega del {fechaCorta(e.fecha)} · {formatMonto(Number(e.monto))} · te quedan {formatMonto(saldo)}</option>;
                    })}
                  </Select>
                )}
                {entrega && (
                  <p className={`mt-1 text-xs ${saldoDespues < 0 ? 'font-medium text-red-600' : 'text-muted-foreground'}`}>
                    {saldoDespues < 0
                      ? `Esta compra supera el dinero que te queda en ${formatMonto(-saldoDespues)}: se registrará como dinero que pusiste tú y la sede te lo devolverá.`
                      : `Después de esta compra te quedarán ${formatMonto(saldoDespues)}.`}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs font-medium">¿Cómo pagaste?</p>
                <div className="mt-1 flex gap-2">
                  {(['efectivo', 'cuentas'] as const).map(m => (
                    <Button key={m} type="button" size="sm" variant={metodo === m ? 'default' : 'outline'} aria-pressed={metodo === m}
                      disabled={m === 'efectivo' && comprobante === 'sin_comprobante'} onClick={() => setMetodo(m)}>
                      {m === 'efectivo' ? 'Efectivo' : 'Yape / transferencia'}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Comprobante y fotos */}
        <section className="space-y-3">
          <div>
            <p className="text-xs font-medium">¿Qué comprobante te dieron?</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {(['boleta', 'factura', 'sin_comprobante'] as const).map(t => (
                <Button key={t} type="button" size="sm" variant={comprobante === t ? 'default' : 'outline'} aria-pressed={comprobante === t}
                  disabled={t === 'sin_comprobante' && credito} onClick={() => setComprobante(t)}>
                  {t === 'boleta' ? 'Boleta' : t === 'factura' ? 'Factura' : 'No me dieron'}
                </Button>
              ))}
            </div>
            {comprobante === 'sin_comprobante' && (
              <p className="mt-1 text-xs text-amber-800">Sin comprobante: el pago debe ser por Yape/transferencia y necesitas foto del producto y del Yape.</p>
            )}
          </div>
          {comprobante !== 'sin_comprobante' && (
            <Input placeholder="N° de boleta o factura (opcional)" value={numero} onChange={e => setNumero(e.target.value)} aria-label="Número de comprobante" />
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {comprobante !== 'sin_comprobante' && (
              <EvidenciaInput id="foto-comprobante" label={`Foto de la ${comprobante}`} archivo={fotoComprobante} onChange={setFotoComprobante} requerido />
            )}
            {comprobante === 'sin_comprobante' && (
              <EvidenciaInput id="foto-producto" label="Foto del producto" archivo={fotoProducto} onChange={setFotoProducto} requerido />
            )}
            {!credito && metodo === 'cuentas' && (
              <EvidenciaInput id="foto-pago" label="Captura del Yape / transferencia" archivo={fotoPago} onChange={setFotoPago} requerido />
            )}
          </div>
          <Input placeholder="Observación (opcional)" value={observacion} onChange={e => setObservacion(e.target.value)} aria-label="Observación" />
        </section>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={handleGuardar} disabled={guardando || (!credito && entregas.length === 0)}>
            {guardando ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
            Guardar compra
          </Button>
        </div>
      </div>
    </Modal>
  );
}
