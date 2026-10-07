import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { useCompras, validarCompra, type NuevaCompra } from '@/hooks/useCompras';
import { useProductos } from '@/hooks/useProductos';
import { useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EvidenciaInput } from '@/components/compras/EvidenciaInput';
import { AvisoPrecio } from '@/components/compras/AvisoPrecio';
import { usePreciosHabituales } from '@/hooks/usePreciosHabituales';
import { claveProducto } from '@/lib/precios';
import { repartirTotal } from '@/lib/reparto-total';
import { alCambiarCantidad, alCambiarUnidad, alEscribirTotal, alEscribirUnitario, baseDePrecio, type CamposPrecio } from '@/lib/precio-linea';
import { formatMonto, roundTwo } from '@/lib/utils';
import { NOMBRE_FOTO, TOPE_SIN_COMPROBANTE_EFECTIVO, fechaCorta, formatCantidad, fotosExigidas, normalizarUnidad, sumarDias, unidadesSugeridas } from '@/lib/compras';
import { getTodayLima } from '@/lib/dates';
import {
  borrarBorrador, claveBorrador, guardarBorrador, guardarFoto, leerBorrador, leerFotos, limpiarBorradoresViejos, limpiarCompraAbierta,
  marcarCompraAbierta,
} from '@/lib/borradores';
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
  // En gramos y ml se escribe el precio por kg / por litro (más natural que el precio de un gramo).
  const { factor, etiqueta } = baseDePrecio(unidad);
  return (
    <div className="flex w-full flex-wrap items-end gap-2">
      <label className="text-[11px] text-muted-foreground">
        Precio por {etiqueta || 'unidad'}
        <span className="mt-0.5 flex items-center gap-1 text-sm text-foreground">
          S/
          <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" className="h-8 w-24" value={campos.unit} disabled={disabled}
            onChange={e => onChange(alEscribirUnitario(campos, e.target.value, factor))} aria-label={`Precio de cada ${etiqueta || 'unidad'} de ${nombre}`} />
        </span>
      </label>
      <span className="pb-1.5 text-sm text-muted-foreground">=</span>
      <label className="text-[11px] text-muted-foreground">
        Total de la línea
        <span className="mt-0.5 flex items-center gap-1 text-sm text-foreground">
          S/
          <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" className="h-8 w-24" value={campos.precio} disabled={disabled}
            onChange={e => onChange(alEscribirTotal(campos, e.target.value, factor))} aria-label={`Precio total de ${nombre}`} />
        </span>
      </label>
      {!disabled && campos.precio === '' && (
        <Button type="button" size="sm" variant="outline" className="mb-0.5 h-8 text-xs"
          onClick={() => onChange(alEscribirTotal(campos, '0', factor))} title="No pagaste nada por este producto (ya estaba pagado)">
          Sin costo
        </Button>
      )}
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
  const { sedes } = useSedeActiva();
  const { registrarCompra } = useCompras();
  // Tope de esta sede para comprar en efectivo sin boleta (lo cambia Gerencia en Configuración).
  const topeSinBoleta = Number(sedes.find(s => s.id === sedeId)?.tope_sin_comprobante ?? TOPE_SIN_COMPROBANTE_EFECTIVO);
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
  // «Solo me dieron el total»: se escribe el total de la compra y el sistema lo reparte entre los productos.
  const [soloTotal, setSoloTotal] = useState(false);
  const [totalTexto, setTotalTexto] = useState('');
  // Borrador automático: se guarda solo para no perder lo escrito si el celular recarga la página.
  const [borradorListo, setBorradorListo] = useState(false);
  const [fotosListas, setFotosListas] = useState(false);
  const [confirmarDescartar, setConfirmarDescartar] = useState(false);
  const clave = claveBorrador(hoy, sedeId, proveedor.id);

  // Al abrir: todas las líneas incluidas con la cantidad pedida, las entregas abiertas de la sede
  // y, si había una compra a medio llenar (la página se recargó), lo que ya se había escrito.
  useEffect(() => {
    if (!open) { setBorradorListo(false); setFotosListas(false); return; }
    limpiarBorradoresViejos(hoy);
    marcarCompraAbierta({ fecha: hoy, sedeId, proveedorId: proveedor.id });
    const borrador = leerBorrador(clave);

    const base: Record<string, EstadoLinea> = Object.fromEntries(
      candidatas.map(c => [c.pedido_item_id, { incluir: true, cantidad: String(Number(c.cantidad)), precio: '', unit: '', ultimo: null } as EstadoLinea]),
    );
    if (borrador) for (const id of Object.keys(base)) if (borrador.lineas[id]) base[id] = { ...base[id]!, ...borrador.lineas[id]! };
    setLineas(base);
    setExtras(borrador?.extras ?? []);
    setNumero(borrador?.numero ?? '');
    setObservacion(borrador?.observacion ?? '');
    setSoloTotal(borrador?.soloTotal ?? false);
    setTotalTexto(borrador?.totalTexto ?? '');
    setFotoComprobante(null);
    setFotoProducto(null);
    setFotoPago(null);
    setComprobante(borrador?.comprobante ?? (credito ? 'factura' : 'boleta'));
    if (borrador && !credito) setMetodo(borrador.metodo);
    setBorradorListo(true);

    // Las fotos guardadas se recuperan aparte (son archivos).
    setFotosListas(false);
    leerFotos(clave).then(f => {
      if (f.comprobante) setFotoComprobante(f.comprobante);
      if (f.producto) setFotoProducto(f.producto);
      if (f.pago) setFotoPago(f.pago);
      setFotosListas(true);
    });

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
      setEntregaId(borrador && lista.some(e => e.id === borrador.entregaId) ? borrador.entregaId : lista[0]?.id ?? '');
    });
  }, [open, candidatas, credito, sedeId, profile, clave, hoy, proveedor.id]);

  // Guarda el borrador mientras se escribe (con una pequeña pausa para no escribir en cada tecla).
  useEffect(() => {
    if (!open || !borradorListo) return;
    const t = setTimeout(() => guardarBorrador(clave, { lineas, extras, entregaId, metodo, comprobante, numero, observacion, soloTotal, totalTexto }), 300);
    return () => clearTimeout(t);
  }, [open, borradorListo, clave, lineas, extras, entregaId, metodo, comprobante, numero, observacion, soloTotal, totalTexto]);

  // Las fotos se guardan apenas se toman (solo después de haber recuperado las anteriores).
  useEffect(() => { if (open && fotosListas) void guardarFoto(clave, 'comprobante', fotoComprobante); }, [open, fotosListas, clave, fotoComprobante]);
  useEffect(() => { if (open && fotosListas) void guardarFoto(clave, 'producto', fotoProducto); }, [open, fotosListas, clave, fotoProducto]);
  useEffect(() => { if (open && fotosListas) void guardarFoto(clave, 'pago', fotoPago); }, [open, fotosListas, clave, fotoPago]);

  /** Cierra y descarta el borrador (la compra se guardó o se canceló a propósito). */
  function cerrarYDescartar() {
    borrarBorrador(clave);
    limpiarCompraAbierta();
    setConfirmarDescartar(false);
    onClose();
  }

  const sinBoletaEfectivo = !credito && comprobante === 'sin_comprobante' && metodo === 'efectivo';
  // Fotos obligatorias que todavía no se subieron (la compra se puede guardar igual, como evidencia pendiente).
  const faltanFotosBase = fotosExigidas({ tipo_comprobante: comprobante, metodo_pago: credito ? null : metodo, condicion_pago: credito ? 'credito' : 'contado' })
    .filter(r => !({ comprobante: fotoComprobante, producto: fotoProducto, pago: fotoPago })[r]);

  const hayContenido = Object.values(lineas).some(l => l.precio !== '' || l.unit !== '')
    || extras.some(e => e.nombre.trim() !== '' || e.precio !== '')
    || !!fotoComprobante || !!fotoProducto || !!fotoPago || numero.trim() !== '' || observacion.trim() !== '' || totalTexto.trim() !== '';
  /** La X, Escape y Cancelar piden confirmación si ya había algo escrito, para no perderlo por un toque sin querer. */
  function pedirCerrar() {
    if (hayContenido) setConfirmarDescartar(true);
    else cerrarYDescartar();
  }

  const total = useMemo(() => {
    if (soloTotal) return roundTwo(parseFloat(totalTexto) || 0);
    const deLista = candidatas.reduce((s, c) => {
      const l = lineas[c.pedido_item_id];
      return l?.incluir ? s + (parseFloat(l.precio) || 0) : s;
    }, 0);
    const deExtras = extras.reduce((s, e) => s + (parseFloat(e.precio) || 0), 0);
    return roundTwo(deLista + deExtras);
  }, [candidatas, lineas, extras, soloTotal, totalTexto]);

  // Precio habitual de lo que está en la lista y de lo agregado que ya existe en el catálogo.
  const productoDeExtra = (nombre: string) => productos.find(p => p.nombre.toLowerCase() === nombre.trim().toLowerCase());
  const habituales = usePreciosHabituales(open ? [
    ...candidatas.map(c => c.producto_id),
    ...extras.map(e => productoDeExtra(e.nombre)?.id).filter((id): id is string => !!id),
  ] : []);

  // Reparto del total entre los productos (en proporción a su precio habitual; sin precio conocido, partes iguales).
  const repartido = useMemo(() => {
    if (!soloTotal) return new Map<string, number>();
    const lista = [
      ...candidatas.filter(c => lineas[c.pedido_item_id]?.incluir).map(c => ({
        clave: `L:${c.pedido_item_id}`,
        estimado: (() => { const h = habituales.get(claveProducto(c.producto_id, c.unidad)); const q = parseFloat(lineas[c.pedido_item_id]?.cantidad ?? ''); return h && q > 0 ? h.unitario * q : null; })(),
      })),
      ...extras.map((e, i) => ({ e, i })).filter(x => x.e.nombre.trim()).map(({ e, i }) => ({
        clave: `E:${i}`,
        estimado: (() => { const p = productoDeExtra(e.nombre); const h = p ? habituales.get(claveProducto(p.id, e.unidad)) : undefined; const q = parseFloat(e.cantidad); return h && q > 0 ? h.unitario * q : null; })(),
      })),
    ];
    return repartirTotal(total, lista);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloTotal, total, candidatas, lineas, extras, habituales, productos]);

  // Recojo sin pago: todo lo que se incluye vale S/ 0 (ya estaba pagado). No sale dinero: no pide entrega, pago, boleta ni fotos.
  const lineasIncluidas = candidatas.filter(c => lineas[c.pedido_item_id]?.incluir);
  const extrasConNombre = extras.filter(e => e.nombre.trim());
  const hayLineas = lineasIncluidas.length + extrasConNombre.length > 0;
  const esRecojo = hayLineas && total === 0 && (soloTotal
    ? totalTexto.trim() !== ''
    : lineasIncluidas.every(c => lineas[c.pedido_item_id]!.precio !== '') && extrasConNombre.every(e => e.precio !== ''));
  const faltanFotos = esRecojo ? [] : faltanFotosBase;

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
    for (const [i, e] of extras.entries()) {
      if (!e.nombre.trim()) continue;
      const unidadExtra = normalizarUnidad(e.unidad) || 'unidad';
      const { producto, error } = await obtenerOCrear(e.nombre, unidadExtra);
      if (error || !producto) {
        setGuardando(false);
        return addToast(`Error con "${e.nombre}": ${error ?? 'no se pudo guardar'}`, 'error');
      }
      lineasExtra.push({
        pedido_item_id: null, producto_id: producto.id, cantidad: parseFloat(e.cantidad) || 0, unidad: unidadExtra, nombre: e.nombre,
        precio_total: soloTotal ? (repartido.get(`E:${i}`) ?? NaN) : parseFloat(e.precio),
        precio_repartido: soloTotal && !esRecojo,
      });
    }

    const incluidas = candidatas.filter(c => lineas[c.pedido_item_id]?.incluir);
    const compra: NuevaCompra = {
      sede_id: sedeId,
      proveedor_id: proveedor.id,
      pedido_id: incluidas[0]?.pedido_id ?? null,
      pedidoIds: Array.from(new Set(incluidas.map(c => c.pedido_id))),
      fecha: hoy,
      condicion_pago: credito && !esRecojo ? 'credito' : 'contado',
      dias_credito: proveedor.dias_credito,
      entrega_id: credito || esRecojo ? null : entregaId || null,
      metodo_pago: credito || esRecojo ? null : metodo,
      tipo_comprobante: esRecojo ? 'sin_comprobante' : comprobante,
      numero_comprobante: esRecojo ? null : numero,
      observacion,
      lineas: [
        ...incluidas.map(c => {
          const l = lineas[c.pedido_item_id]!;
          return {
            pedido_item_id: c.pedido_item_id,
            producto_id: c.producto_id,
            cantidad: parseFloat(l.cantidad) || 0,
            unidad: c.unidad,
            nombre: c.nombre,
            precio_total: soloTotal ? (repartido.get(`L:${c.pedido_item_id}`) ?? NaN) : l.precio === '' ? NaN : parseFloat(l.precio),
            precio_repartido: soloTotal && !esRecojo,
          };
        }),
        ...lineasExtra,
      ],
      fotoComprobante: esRecojo ? null : fotoComprobante,
      fotoProducto: esRecojo ? null : fotoProducto,
      fotoPago: esRecojo ? null : fotoPago,
      evidenciaPendiente: faltanFotos.length > 0,
      topeSinComprobante: topeSinBoleta,
    };

    const invalida = validarCompra(compra);
    if (invalida) {
      setGuardando(false);
      return addToast(invalida, 'error');
    }
    const { error } = await registrarCompra(compra);
    setGuardando(false);
    if (error) return addToast(`Error: ${error}`, 'error');
    addToast(esRecojo ? `Recojo sin pago a ${proveedor.nombre} registrado` : `Compra a ${proveedor.nombre} registrada (${formatMonto(total)})`, 'success');
    onGuardado();
    cerrarYDescartar();
  }

  return (
    <>
    <Modal open={open} onClose={pedirCerrar} title={`Compra a ${proveedor.nombre} — ${sedeNombre}`}>
      <div className="space-y-5">
        {/* Productos y precios */}
        <section>
          <p className="mb-2 text-sm font-bold text-yayis-dark">¿Qué compraste y cuánto pagaste por cada cosa?</p>
          <p className="-mt-1 mb-2 text-xs text-muted-foreground">Escribe el <strong>precio de cada unidad</strong> o el <strong>total</strong> de la línea: el otro se calcula solo. Debajo de cada producto verás su precio habitual: en rojo si pagas bastante más, en verde si consigues un mejor precio. Si no pagaste nada por un producto (ya estaba pagado), pulsa <strong>Sin costo</strong>.</p>
          <label className="mb-2 flex cursor-pointer items-start gap-2 rounded-md bg-yayis-cream px-3 py-2 text-sm">
            <input type="checkbox" className="mt-0.5" checked={soloTotal} onChange={e => setSoloTotal(e.target.checked)} />
            <span><strong>Solo me dieron el total de la compra</strong> y no sé el precio de cada producto. Yo escribo el total y el sistema lo reparte.</span>
          </label>
          {soloTotal && (
            <div className="mb-2 rounded-md border border-yayis-green/40 bg-white px-3 py-2">
              <label className="text-xs font-medium" htmlFor="total-compra">Total de la compra (S/)</label>
              <Input id="total-compra" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" className="mt-1 w-40"
                value={totalTexto} onChange={e => setTotalTexto(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">
                El reparto es una estimación (según el precio habitual de cada producto) y queda marcado como «repartido»: no se usa para el seguimiento de precios.
              </p>
            </div>
          )}
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
                    onChange={e => cambiarLinea(c.pedido_item_id, alCambiarCantidad(l, e.target.value, baseDePrecio(c.unidad).factor))} aria-label={`Cantidad comprada de ${c.nombre}`} />
                  <span className="w-12 text-xs text-muted-foreground">{c.unidad}</span>
                  {soloTotal ? (
                    l.incluir && <span className="w-full text-sm text-muted-foreground">Repartido: <strong className="text-yayis-dark">≈ {formatMonto(repartido.get(`L:${c.pedido_item_id}`) ?? 0)}</strong></span>
                  ) : (
                    <CamposDePrecio campos={l} unidad={c.unidad} nombre={c.nombre} disabled={!l.incluir} onChange={n => cambiarLinea(c.pedido_item_id, n)} />
                  )}
                  {!soloTotal && l.incluir && parseFloat(l.precio) !== 0 && <AvisoPrecio habitual={habituales.get(claveProducto(c.producto_id, c.unidad))} cantidad={l.cantidad} precio={l.precio} unidad={c.unidad} />}
                </div>
              );
            })}
            {extras.map((e, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 bg-yayis-cream/40 px-3 py-2 text-sm">
                <Input list="catalogo-compra" placeholder="Producto que no estaba en la lista" className="h-8 min-w-[10rem] flex-1" value={e.nombre}
                  onChange={ev => setExtras(prev => prev.map((x, j) => j === i ? { ...x, nombre: ev.target.value.toLocaleUpperCase('es-PE') } : x))} aria-label="Producto adicional" />
                <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="Cant." className="h-8 w-20" value={e.cantidad}
                  onChange={ev => setExtras(prev => prev.map((x, j) => j === i ? { ...x, ...alCambiarCantidad(x, ev.target.value, baseDePrecio(x.unidad).factor) } : x))} aria-label="Cantidad" />
                <Input list="unidades-compra" className="h-8 w-24 text-xs" value={e.unidad} autoComplete="off" placeholder="unidad"
                  onChange={ev => setExtras(prev => prev.map((x, j) => j === i ? { ...x, ...alCambiarUnidad(x, baseDePrecio(ev.target.value).factor), unidad: ev.target.value } : x))} aria-label="Unidad" />
                <button type="button" onClick={() => setExtras(prev => prev.filter((_, j) => j !== i))} aria-label="Quitar producto" className="text-red-500"><Trash2 size={14} /></button>
                {soloTotal ? (
                  e.nombre.trim() && <span className="w-full text-sm text-muted-foreground">Repartido: <strong className="text-yayis-dark">≈ {formatMonto(repartido.get(`E:${i}`) ?? 0)}</strong></span>
                ) : (
                  <CamposDePrecio campos={e} unidad={e.unidad} nombre={e.nombre || 'el producto'}
                    onChange={n => setExtras(prev => prev.map((x, j) => j === i ? { ...x, ...n } : x))} />
                )}
                {!soloTotal && parseFloat(e.precio) !== 0 && productoDeExtra(e.nombre) && (
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

        {esRecojo && (
          <section className="space-y-2 rounded-md border border-blue-300 bg-blue-50 p-3">
            <p className="text-sm font-medium text-blue-900">Recojo sin pago</p>
            <p className="text-xs text-blue-900">
              Todo vale S/ 0: se registra que recogiste estos productos, que ya estaban pagados. No sale dinero de ninguna entrega y no pide boleta ni fotos.
            </p>
            <Input placeholder="Observación (opcional): ¿quién ya lo pagó?" value={observacion} onChange={e => setObservacion(e.target.value)} aria-label="Observación" />
          </section>
        )}

        {/* Pago */}
        {!esRecojo && <section className="space-y-3 rounded-md border p-3">
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
                      onClick={() => setMetodo(m)}>
                      {m === 'efectivo' ? 'Efectivo' : 'Yape / transferencia'}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>}

        {/* Comprobante y fotos */}
        {!esRecojo && <section className="space-y-3">
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
              <p className="mt-1 text-xs text-amber-800">
                {metodo === 'efectivo'
                  ? `Sin boleta en efectivo: hasta ${formatMonto(topeSinBoleta)} por compra. Escribe abajo, en Observación, dónde y a quién le compraste (obligatorio).`
                  : 'Sin boleta por Yape/transferencia: foto del producto y captura del Yape (si no alcanzaste a tomarlas, puedes subirlas después).'}
              </p>
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
              <EvidenciaInput id="foto-producto" label={metodo === 'cuentas' ? 'Foto del producto' : 'Foto del producto (opcional)'} archivo={fotoProducto} onChange={setFotoProducto} requerido={metodo === 'cuentas'} />
            )}
            {!credito && metodo === 'cuentas' && (
              <EvidenciaInput id="foto-pago" label="Captura del Yape / transferencia" archivo={fotoPago} onChange={setFotoPago} requerido />
            )}
          </div>
          <Input
            placeholder={sinBoletaEfectivo ? 'Observación (obligatoria): dónde y a quién compraste' : 'Observación (opcional)'}
            className={sinBoletaEfectivo && !observacion.trim() ? 'border-amber-400' : ''}
            value={observacion} onChange={e => setObservacion(e.target.value)} aria-label="Observación"
          />
        </section>}

        {faltanFotos.length > 0 && (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Falta: {faltanFotos.map(r => NOMBRE_FOTO[r]).join(' y ')}. Si no alcanzaste a tomarla, guarda la compra igual: queda con <strong>evidencia pendiente</strong> y la subes después desde «Mi dinero y rendición». No podrás rendir cuentas hasta completarla.
          </p>
        )}

        {!credito && !esRecojo && entregas.length === 0 && (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            No puedes guardar todavía: no tienes dinero entregado por {sedeNombre}. Pídele al administrador que registre la entrega y vuelve a abrir esta compra.
          </p>
        )}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={pedirCerrar} disabled={guardando}>Cancelar</Button>
          <Button onClick={handleGuardar} disabled={guardando || (!credito && !esRecojo && entregas.length === 0)}>
            {guardando ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
            {esRecojo ? 'Guardar recojo sin pago' : faltanFotos.length > 0 ? 'Guardar y subir la foto después' : 'Guardar compra'}
          </Button>
        </div>
      </div>
    </Modal>
    <ConfirmDialog
      open={open && confirmarDescartar}
      title="¿Descartar esta compra?"
      message="Ya escribiste datos o subiste fotos. Si sales, se borra todo lo que llenaste. Si solo necesitas ir a otra app, no pulses esto: lo que llenaste se guarda solo."
      confirmLabel="Sí, descartar"
      variant="destructive"
      onConfirm={cerrarYDescartar}
      onCancel={() => setConfirmarDescartar(false)}
    />
    </>
  );
}
