import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Segmentado } from '@/components/ui/segmentado';
import { AvisoPrecio } from '@/components/compras/AvisoPrecio';
import { usePreciosHabituales } from '@/hooks/usePreciosHabituales';
import { useUltimosPreciosProveedor } from '@/hooks/useUltimosPreciosProveedor';
import { claveProducto } from '@/lib/precios';
import { repartirTotal } from '@/lib/reparto-total';
import { alCambiarCantidad, alCambiarUnidad, alEscribirTotal, alEscribirUnitario, baseDePrecio, referenciaPorUnidadLinea, type CamposPrecio } from '@/lib/precio-linea';
import { formatMonto, roundTwo } from '@/lib/utils';
import { RANURAS_PAGO_EXTRA } from '@/lib/borradores';
import { NOMBRE_FOTO, TOPE_SIN_COMPROBANTE_EFECTIVO, fechaCorta, formatCantidad, fotosExigidas, normalizarUnidad, sumarDias, unidadesSugeridas } from '@/lib/compras';
import { getTodayLima } from '@/lib/dates';
import {
  borrarBorrador, claveBorrador, guardarBorrador, guardarFoto, leerBorrador, leerFotos, limpiarBorradoresViejos, limpiarCompraAbierta,
  marcarCompraAbierta,
} from '@/lib/borradores';
import { Check, Loader2, Plus, Trash2 } from 'lucide-react';
import type { MetodoPago, Proveedor, TipoComprobante } from '@/types';

export interface LineaCandidata {
  pedido_item_id: string;
  pedido_id: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  /** Precio de referencia que puso el administrador (por kg / litro / unidad). */
  precio_referencia?: number | null;
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
  /** Si se compró menos de lo pedido: el resto queda pendiente (se compra otro día) o ya no se compra («no había»). */
  resto?: 'pendiente' | 'no_habia';
  /** El precio salió solo (de la referencia de la lista o de la última compra) y Fabio todavía no lo tocó. */
  sugerido?: boolean;
  origenSugerido?: 'referencia' | 'ultimo';
}

interface LineaExtra extends CamposPrecio {
  nombre: string;
  unidad: string;
}

/** Precio de una línea: por unidad o total; al escribir uno, el otro se calcula solo. */
function CamposDePrecio({ campos, unidad, nombre, disabled, permitirSinCosto, onChange }: {
  campos: CamposPrecio;
  /** Muestra el botón «Sin costo» (cuando el precio está vacío o es solo una sugerencia). */
  permitirSinCosto?: boolean;
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
      {!disabled && (campos.precio === '' || permitirSinCosto) && (
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
  // Otras capturas de pago (se pagó a varios puestos por Yape): la compra lleva una constancia por pago.
  const [pagosExtra, setPagosExtra] = useState<(File | null)[]>([]);
  const [guardando, setGuardando] = useState(false);
  // «Solo me dieron el total»: se escribe el total de la compra y el sistema lo reparte entre los productos.
  const [soloTotal, setSoloTotal] = useState(false);
  const [totalTexto, setTotalTexto] = useState('');
  // Lo que Fabio dice que pagó en total: cuadra contra los precios que salieron solos de la última compra.
  const [pagadoTexto, setPagadoTexto] = useState('');
  const sugeridosAplicados = useRef(new Set<string>());
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
    setPagadoTexto(borrador?.pagadoTexto ?? '');
    sugeridosAplicados.current = new Set();
    setFotoComprobante(null);
    setFotoProducto(null);
    setFotoPago(null);
    setPagosExtra([]);
    setComprobante(borrador?.comprobante ?? (credito ? 'factura' : 'boleta'));
    if (borrador && !credito) setMetodo(borrador.metodo);
    setBorradorListo(true);

    // Las fotos guardadas se recuperan aparte (son archivos).
    setFotosListas(false);
    leerFotos(clave).then(f => {
      if (f.comprobante) setFotoComprobante(f.comprobante);
      if (f.producto) setFotoProducto(f.producto);
      if (f.pago) setFotoPago(f.pago);
      setPagosExtra(RANURAS_PAGO_EXTRA.map(r => f[r] ?? null).filter((x): x is File => !!x));
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
    const t = setTimeout(() => guardarBorrador(clave, { lineas, extras, entregaId, metodo, comprobante, numero, observacion, soloTotal, totalTexto, pagadoTexto }), 300);
    return () => clearTimeout(t);
  }, [open, borradorListo, clave, lineas, extras, entregaId, metodo, comprobante, numero, observacion, soloTotal, totalTexto, pagadoTexto]);

  // Las fotos se guardan apenas se toman (solo después de haber recuperado las anteriores).
  useEffect(() => { if (open && fotosListas) void guardarFoto(clave, 'comprobante', fotoComprobante); }, [open, fotosListas, clave, fotoComprobante]);
  useEffect(() => { if (open && fotosListas) void guardarFoto(clave, 'producto', fotoProducto); }, [open, fotosListas, clave, fotoProducto]);
  useEffect(() => { if (open && fotosListas) void guardarFoto(clave, 'pago', fotoPago); }, [open, fotosListas, clave, fotoPago]);
  useEffect(() => {
    if (!open || !fotosListas) return;
    RANURAS_PAGO_EXTRA.forEach((r, i) => { void guardarFoto(clave, r, pagosExtra[i] ?? null); });
  }, [open, fotosListas, clave, pagosExtra]);

  /** Cierra y descarta el borrador (la compra se guardó o se canceló a propósito). */
  function cerrarYDescartar() {
    borrarBorrador(clave);
    limpiarCompraAbierta();
    setConfirmarDescartar(false);
    onClose();
  }

  // Sin boleta (efectivo o Yape): la observación (dónde y a quién se compró) es obligatoria.
  const sinBoleta = !credito && comprobante === 'sin_comprobante';

  const hayContenido = Object.values(lineas).some(l => (l.precio !== '' || l.unit !== '') && !l.sugerido)
    || extras.some(e => e.nombre.trim() !== '' || e.precio !== '')
    || !!fotoComprobante || !!fotoProducto || !!fotoPago || pagosExtra.length > 0 || numero.trim() !== '' || observacion.trim() !== '' || totalTexto.trim() !== '' || pagadoTexto.trim() !== '';
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

  // Precios ya escritos: lo último que se le pagó a ESTE proveedor por cada producto. Solo se rellena lo que
  // todavía está vacío, una sola vez por línea; Fabio corrige lo que cambió y cuadra con el total que pagó.
  const ultimos = useUltimosPreciosProveedor(open ? proveedor.id : null, candidatas.map(c => c.producto_id));
  useEffect(() => {
    if (!open || !borradorListo) return;
    setLineas(prev => {
      let cambio = false;
      const sig = { ...prev };
      for (const c of candidatas) {
        const l = prev[c.pedido_item_id];
        if (!l || sugeridosAplicados.current.has(c.pedido_item_id)) continue;
        const { factor } = baseDePrecio(c.unidad);
        // Primero el precio de referencia que puso el administrador en su lista; si no hay, el de la última compra a este proveedor.
        const ref = c.precio_referencia ?? null;
        const u = ultimos.get(claveProducto(c.producto_id, c.unidad));
        const unitTexto = ref !== null ? String(ref) : u ? String(Math.round(u.unitario * factor * 10000) / 10000) : null;
        if (unitTexto === null) continue; // todavía no hay (los últimos precios pueden llegar después)
        sugeridosAplicados.current.add(c.pedido_item_id);
        if (l.precio !== '' || l.unit !== '') continue;
        sig[c.pedido_item_id] = { ...l, ...alEscribirUnitario(l, unitTexto, factor), sugerido: true, origenSugerido: ref !== null ? 'referencia' : 'ultimo' };
        cambio = true;
      }
      return cambio ? sig : prev;
    });
  }, [open, borradorListo, ultimos, candidatas]);

  // Reparto del total entre los productos (en proporción a su precio habitual; sin precio conocido, partes iguales).
  const repartido = useMemo(() => {
    if (!soloTotal) return new Map<string, number>();
    const lista = [
      ...candidatas.filter(c => lineas[c.pedido_item_id]?.incluir).map(c => ({
        clave: `L:${c.pedido_item_id}`,
        estimado: (() => { const h = habituales.get(claveProducto(c.producto_id, c.unidad)); const q = parseFloat(lineas[c.pedido_item_id]?.cantidad ?? ''); return h && q > 0 ? h.unitario * q : null; })(),
        // Unidad «sol»: el monto es la cantidad (2 sol = S/ 2), no se reparte.
        fijo: c.unidad === 'sol' ? parseFloat(lineas[c.pedido_item_id]?.cantidad ?? '') || null : null,
      })),
      ...extras.map((e, i) => ({ e, i })).filter(x => x.e.nombre.trim()).map(({ e, i }) => ({
        clave: `E:${i}`,
        estimado: (() => { const p = productoDeExtra(e.nombre); const h = p ? habituales.get(claveProducto(p.id, e.unidad)) : undefined; const q = parseFloat(e.cantidad); return h && q > 0 ? h.unitario * q : null; })(),
        fijo: e.unidad === 'sol' ? parseFloat(e.cantidad) || null : null,
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
  // Fotos obligatorias que todavía no se subieron (la compra se puede guardar igual, como evidencia pendiente).
  // La foto del producto sin boleta por Yape solo es obligatoria por encima del tope sin boleta de la sede.
  const fotoProductoObligatoria = sinBoleta && metodo === 'cuentas' && total > topeSinBoleta;
  const faltanFotosBase = fotosExigidas(
    { tipo_comprobante: comprobante, metodo_pago: credito ? null : metodo, condicion_pago: credito ? 'credito' : 'contado' },
    { total, tope: topeSinBoleta },
  ).filter(r => !({ comprobante: fotoComprobante, producto: fotoProducto, pago: fotoPago })[r]);
  const faltanFotos = esRecojo ? [] : faltanFotosBase;

  // Cuadre: si quedan precios sugeridos sin tocar, Fabio escribe cuánto pagó en total y debe coincidir con la suma.
  const requiereCuadre = !soloTotal && !esRecojo && lineasIncluidas.some(c => lineas[c.pedido_item_id]!.sugerido);
  const pagado = parseFloat(pagadoTexto);
  const diferencia = Number.isNaN(pagado) ? null : roundTwo(pagado - total);
  const cuadra = diferencia !== null && Math.abs(diferencia) <= 0.1;

  const entrega = entregas.find(e => e.id === entregaId);
  const saldoEntrega = entrega
    ? roundTwo(Number(entrega.monto) - entrega.compras.reduce((s, c) => s + Number(c.total), 0))
    : 0;
  const saldoDespues = roundTwo(saldoEntrega - total);

  function cambiarLinea(id: string, cambios: Partial<EstadoLinea>) {
    setLineas(prev => ({ ...prev, [id]: { ...prev[id]!, ...cambios } }));
  }

  /**
   * Arma la compra con lo que hay en pantalla. `lineasExtra` son los productos que no estaban en la lista,
   * ya con su producto del catálogo (al guardar) o con un id provisional (para revisar qué falta antes de guardar).
   */
  function construirCompra(lineasExtra: NuevaCompra['lineas']): NuevaCompra {
    const incluidas = candidatas.filter(c => lineas[c.pedido_item_id]?.incluir);
    return {
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
            cantidad_pedida: c.cantidad,
            resto: l.resto ?? 'pendiente',
            precio_total: soloTotal ? (repartido.get(`L:${c.pedido_item_id}`) ?? NaN) : l.precio === '' ? NaN : parseFloat(l.precio),
            precio_repartido: soloTotal && !esRecojo,
          };
        }),
        ...lineasExtra,
      ],
      fotoComprobante: esRecojo ? null : fotoComprobante,
      fotoProducto: esRecojo ? null : fotoProducto,
      fotoPago: esRecojo ? null : fotoPago,
      fotosPagoExtra: esRecojo ? [] : pagosExtra.filter((f): f is File => !!f),
      evidenciaPendiente: faltanFotos.length > 0,
      topeSinComprobante: topeSinBoleta,
    };
  }

  /** Línea de un producto agregado (no estaba en la lista). */
  function lineaExtra(e: LineaExtra, i: number, productoId: string) {
    return {
      pedido_item_id: null, producto_id: productoId, cantidad: parseFloat(e.cantidad) || 0, unidad: normalizarUnidad(e.unidad) || 'unidad', nombre: e.nombre,
      precio_total: soloTotal ? (repartido.get(`E:${i}`) ?? NaN) : parseFloat(e.precio),
      precio_repartido: soloTotal && !esRecojo,
    };
  }

  // Qué impide guardar ahora mismo (las mismas reglas que se revisan al guardar), para decirlo antes de pulsar.
  const bloqueo: string | null = (() => {
    if (!hayLineas) return 'Marca al menos un producto.';
    if (soloTotal && totalTexto.trim() === '') return 'Escribe el total de la compra.';
    if (requiereCuadre && diferencia === null) return 'Escribe cuánto pagaste en total para comprobar los precios.';
    if (requiereCuadre && !cuadra) return 'Los precios no cuadran con lo que pagaste: corrige el que cambió.';
    if (!credito && !esRecojo && entregas.length === 0) return `No tienes dinero entregado por ${sedeNombre}.`;
    return validarCompra(construirCompra(extras.map((e, i) => ({ e, i })).filter(x => x.e.nombre.trim()).map(({ e, i }) => lineaExtra(e, i, 'nuevo'))));
  })();

  // Estado de cada paso, para marcarlo con ✓ cuando está completo.
  const productosListos = hayLineas && (soloTotal ? totalTexto.trim() !== '' : lineasIncluidas.every(c => lineas[c.pedido_item_id]!.precio !== '') && extrasConNombre.every(e => e.precio !== ''))
    && (!requiereCuadre || cuadra);
  const pagoListo = credito || esRecojo || (!!entregaId && !!metodo);
  const comprobanteListo = esRecojo || (faltanFotos.length === 0 && (!sinBoleta || observacion.trim() !== ''));

  async function handleGuardar() {
    if (!profile) return;
    if (requiereCuadre) {
      if (diferencia === null) return addToast('Escribe cuánto pagaste en total para comprobar que los precios cuadran.', 'error');
      if (!cuadra) return addToast(`Los productos suman ${formatMonto(total)} pero dices que pagaste ${formatMonto(pagado)}: algún precio cambió. Corrige el que cambió.`, 'error');
    }
    setGuardando(true);

    // Productos que no estaban en la lista: se crean en el catálogo si hace falta.
    const lineasExtra = [];
    for (const [i, e] of extras.entries()) {
      if (!e.nombre.trim()) continue;
      const { producto, error } = await obtenerOCrear(e.nombre, normalizarUnidad(e.unidad) || 'unidad');
      if (error || !producto) {
        setGuardando(false);
        return addToast(`Error con "${e.nombre}": ${error ?? 'no se pudo guardar'}`, 'error');
      }
      lineasExtra.push(lineaExtra(e, i, producto.id));
    }

    const compra = construirCompra(lineasExtra);
    const invalida = validarCompra(compra);
    if (invalida) {
      setGuardando(false);
      return addToast(invalida, 'error');
    }
    const { error, aviso } = await registrarCompra(compra);
    setGuardando(false);
    if (error) return addToast(`Error: ${error}`, 'error');
    if (aviso) addToast(aviso, 'warning');
    addToast(esRecojo ? `Recojo sin pago a ${proveedor.nombre} registrado` : `Compra a ${proveedor.nombre} registrada (${formatMonto(total)})`, 'success');
    onGuardado();
    cerrarYDescartar();
  }

  const unaEntrega = entregas.length === 1 ? entregas[0]! : null;

  return (
    <>
    <Modal
      open={open}
      onClose={pedirCerrar}
      title={`Compra a ${proveedor.nombre} — ${sedeNombre}`}
      pantallaCompletaEnCelular
      footer={
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm">Total <strong className="text-lg tabular-nums text-yayis-dark">{formatMonto(total)}</strong>{esRecojo && <span className="ml-1 text-xs text-blue-700">· recojo sin pago</span>}</p>
            <p className={`line-clamp-2 text-xs leading-snug ${bloqueo ? 'text-amber-800' : faltanFotos.length > 0 ? 'text-amber-700' : 'text-emerald-700'}`} title={bloqueo ?? undefined}>
              {bloqueo ?? (faltanFotos.length > 0 ? `Falta la ${faltanFotos.map(r => NOMBRE_FOTO[r]).join(' y la ')}: puedes subirla después` : '✓ Todo listo para guardar')}
            </p>
          </div>
          <Button variant="ghost" onClick={pedirCerrar} disabled={guardando} className="hidden sm:inline-flex">Cancelar</Button>
          <Button onClick={handleGuardar} disabled={guardando || (!credito && !esRecojo && entregas.length === 0)} className="h-11 shrink-0 sm:h-10">
            {guardando ? <Loader2 size={14} className="mr-1 animate-spin" /> : null}
            {esRecojo ? 'Guardar recojo' : faltanFotos.length > 0 ? 'Guardar sin la foto' : 'Guardar compra'}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* 1. Productos y precios */}
        <section className="space-y-3">
          <PasoTitulo numero={1} titulo="¿Qué compraste?" listo={productosListos} />
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1" role="group" aria-label="Cómo te dieron los precios">
            <button type="button" aria-pressed={!soloTotal} onClick={() => setSoloTotal(false)}
              className={`rounded-md px-2 py-2 text-sm font-medium transition ${!soloTotal ? 'bg-white text-yayis-dark shadow-sm' : 'text-muted-foreground'}`}>
              Sé el precio de cada producto
            </button>
            <button type="button" aria-pressed={soloTotal} onClick={() => setSoloTotal(true)}
              className={`rounded-md px-2 py-2 text-sm font-medium transition ${soloTotal ? 'bg-white text-yayis-dark shadow-sm' : 'text-muted-foreground'}`}>
              Solo me dieron el total
            </button>
          </div>
          {soloTotal ? (
            <div className="rounded-md border border-yayis-green/40 bg-white px-3 py-2">
              <label className="text-xs font-medium" htmlFor="total-compra">Total de la compra (S/)</label>
              <Input id="total-compra" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" className="mt-1 h-11 w-44 text-lg"
                value={totalTexto} onChange={e => setTotalTexto(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">El sistema lo reparte entre los productos (es una estimación y no cuenta para el seguimiento de precios).</p>
            </div>
          ) : (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none font-medium text-yayis-green">¿Cómo lleno los precios?</summary>
              <p className="mt-1">Escribe el <strong>precio de cada unidad</strong> o el <strong>total</strong> de la línea: el otro se calcula solo. Debajo verás el precio habitual: en rojo si pagas bastante más, en verde si consigues mejor precio. Si no pagaste nada por un producto (ya estaba pagado), pulsa <strong>Sin costo</strong>.</p>
            </details>
          )}
          <div className="divide-y rounded-md border">
            {candidatas.map(c => {
              const l = lineas[c.pedido_item_id];
              if (!l) return null;
              return (
                <div key={c.pedido_item_id} className={`space-y-2 px-3 py-3 text-sm ${l.incluir ? '' : 'bg-gray-50 opacity-60'}`}>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" className="h-5 w-5 accent-[#098B5F]" checked={l.incluir} onChange={e => cambiarLinea(c.pedido_item_id, { incluir: e.target.checked })} />
                    <span className="font-semibold text-yayis-dark">{c.nombre}</span>
                    <span className="text-xs text-muted-foreground">pedido: {formatCantidad(c.cantidad)} {c.unidad}</span>
                  </label>
                  {l.incluir && (
                    <div className="flex flex-wrap items-end gap-2 pl-7">
                      <label className="text-[11px] text-muted-foreground">
                        Compraste
                        <span className="mt-0.5 flex items-center gap-1 text-sm text-foreground">
                          <Input type="number" inputMode="decimal" min="0" step="0.01" className="h-9 w-20" value={l.cantidad}
                            onChange={e => cambiarLinea(c.pedido_item_id, alCambiarCantidad(l, e.target.value, baseDePrecio(c.unidad).factor))} aria-label={`Cantidad comprada de ${c.nombre}`} />
                          <span className="text-xs text-muted-foreground">{c.unidad}</span>
                        </span>
                      </label>
                      {soloTotal ? (
                        <span className="pb-2 text-sm text-muted-foreground">Repartido: <strong className="text-yayis-dark">≈ {formatMonto(repartido.get(`L:${c.pedido_item_id}`) ?? 0)}</strong></span>
                      ) : (
                        <CamposDePrecio campos={l} unidad={c.unidad} nombre={c.nombre} permitirSinCosto={l.sugerido}
                          onChange={n => cambiarLinea(c.pedido_item_id, { ...n, sugerido: false })} />
                      )}
                    </div>
                  )}
                  {l.incluir && parseFloat(l.cantidad) > 0 && parseFloat(l.cantidad) < c.cantidad - 0.005 && (
                    <div className="ml-7 flex flex-wrap items-center gap-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
                      <span>Compraste menos de lo pedido: faltan <strong>{formatCantidad(roundTwo(c.cantidad - parseFloat(l.cantidad)))} {c.unidad}</strong>.</span>
                      <Select className="h-8 w-52 text-xs" value={l.resto ?? 'pendiente'} onChange={e => cambiarLinea(c.pedido_item_id, { resto: e.target.value as 'pendiente' | 'no_habia' })} aria-label={`Qué pasa con lo que falta de ${c.nombre}`}>
                        <option value="pendiente">Lo compro otro día</option>
                        <option value="no_habia">Ya no se compra (no había)</option>
                      </Select>
                    </div>
                  )}
                  {!soloTotal && l.incluir && l.sugerido && (
                    <p className="pl-7 text-xs text-blue-700">
                      {l.origenSugerido === 'referencia'
                        ? 'Sugerido: el precio de referencia de la sede. Cámbialo si hoy costó distinto.'
                        : `Sugerido: tu última compra a este proveedor${ultimos.get(claveProducto(c.producto_id, c.unidad))?.fecha ? ` (${fechaCorta(ultimos.get(claveProducto(c.producto_id, c.unidad))!.fecha)})` : ''}. Cámbialo si hoy costó distinto.`}
                    </p>
                  )}
                  {!soloTotal && l.incluir && !l.sugerido && parseFloat(l.precio) !== 0 && (
                    <div className="pl-7"><AvisoPrecio habitual={habituales.get(claveProducto(c.producto_id, c.unidad))} referencia={referenciaPorUnidadLinea(c.precio_referencia, c.unidad)} cantidad={l.cantidad} precio={l.precio} unidad={c.unidad} /></div>
                  )}
                </div>
              );
            })}
            {extras.map((e, i) => (
              <div key={i} className="space-y-2 bg-yayis-cream/40 px-3 py-3 text-sm">
                <div className="flex items-center gap-2">
                  <Input list="catalogo-compra" placeholder="Producto que no estaba en la lista" className="h-9 min-w-0 flex-1" value={e.nombre}
                    onChange={ev => setExtras(prev => prev.map((x, j) => j === i ? { ...x, nombre: ev.target.value.toLocaleUpperCase('es-PE') } : x))} aria-label="Producto adicional" />
                  <button type="button" onClick={() => setExtras(prev => prev.filter((_, j) => j !== i))} aria-label="Quitar producto" className="p-2 text-red-500"><Trash2 size={16} /></button>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="Cant." className="h-9 w-20" value={e.cantidad}
                    onChange={ev => setExtras(prev => prev.map((x, j) => j === i ? { ...x, ...alCambiarCantidad(x, ev.target.value, baseDePrecio(x.unidad).factor) } : x))} aria-label="Cantidad" />
                  <Input list="unidades-compra" className="h-9 w-24 text-xs" value={e.unidad} autoComplete="off" placeholder="unidad"
                    onChange={ev => setExtras(prev => prev.map((x, j) => j === i ? { ...x, ...alCambiarUnidad(x, baseDePrecio(ev.target.value).factor), unidad: ev.target.value } : x))} aria-label="Unidad" />
                  {soloTotal ? (
                    e.nombre.trim() && <span className="pb-2 text-sm text-muted-foreground">Repartido: <strong className="text-yayis-dark">≈ {formatMonto(repartido.get(`E:${i}`) ?? 0)}</strong></span>
                  ) : (
                    <CamposDePrecio campos={e} unidad={e.unidad} nombre={e.nombre || 'el producto'}
                      onChange={n => setExtras(prev => prev.map((x, j) => j === i ? { ...x, ...n } : x))} />
                  )}
                </div>
                {!soloTotal && parseFloat(e.precio) !== 0 && productoDeExtra(e.nombre) && (
                  <AvisoPrecio habitual={habituales.get(claveProducto(productoDeExtra(e.nombre)!.id, e.unidad))} cantidad={e.cantidad} precio={e.precio} unidad={e.unidad} />
                )}
              </div>
            ))}
          </div>
          <datalist id="catalogo-compra">{productos.map(p => <option key={p.id} value={p.nombre} />)}</datalist>
          <datalist id="unidades-compra">{unidadesSugeridas(productos).map(x => <option key={x} value={x} />)}</datalist>
          <Button type="button" variant="ghost" size="sm" onClick={() => setExtras(prev => [...prev, { nombre: '', cantidad: '', unidad: 'kg', precio: '', unit: '', ultimo: null }])}>
            <Plus size={14} className="mr-1" /> Agregar algo que no estaba en la lista
          </Button>
          {requiereCuadre && (
            <div className={`rounded-md border px-3 py-2 ${cuadra ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
              <p className="text-xs">
                Hay precios <strong>«Sugerido»</strong>. Corrige los que hoy costaron distinto y escribe <strong>cuánto pagaste en total</strong> para comprobar que todo cuadra.
              </p>
              <div className="mt-2 flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs font-medium" htmlFor="total-pagado">Total que pagaste (S/)</label>
                  <Input id="total-pagado" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0.00" className="mt-1 h-10 w-36 bg-white"
                    value={pagadoTexto} onChange={e => setPagadoTexto(e.target.value)} />
                </div>
                <p className={`pb-2 text-sm font-medium ${cuadra ? 'text-emerald-700' : diferencia === null ? 'text-amber-800' : 'text-red-700'}`}>
                  {diferencia === null
                    ? `Los productos suman ${formatMonto(total)}.`
                    : cuadra
                      ? '✓ Cuadra'
                      : `No cuadra: ${diferencia > 0 ? 'pagaste' : 'faltan'} ${formatMonto(Math.abs(diferencia))} ${diferencia > 0 ? 'más' : 'por justificar'}. Algún precio cambió.`}
                </p>
              </div>
              {diferencia !== null && !cuadra && (
                <p className="mt-1 text-xs text-muted-foreground">¿No sabes cuál cambió? Elige arriba «Solo me dieron el total».</p>
              )}
            </div>
          )}
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

        {/* 2. Pago */}
        {!esRecojo && <section className="space-y-3">
          <PasoTitulo numero={2} titulo="¿Cómo pagaste?" listo={pagoListo} />
          {credito ? (
            <p className="rounded-md bg-blue-50 px-3 py-2 text-sm">
              <strong className="text-blue-700">Compra a crédito</strong> ({proveedor.dias_credito} días): no sale de tu dinero.
              Vence el <strong>{fechaCorta(sumarDias(hoy, proveedor.dias_credito))}</strong> y la paga Gerencia.
            </p>
          ) : (
            <>
              {entregas.length === 0 ? (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                  No tienes dinero entregado por {sedeNombre}. Pídele al administrador que registre la entrega y vuelve a abrir esta compra.
                </p>
              ) : unaEntrega ? (
                <p className="text-sm">Sale del dinero que te dio {sedeNombre} el <strong>{fechaCorta(unaEntrega.fecha)}</strong> ({formatMonto(Number(unaEntrega.monto))}).</p>
              ) : (
                <div>
                  <label className="text-xs font-medium" htmlFor="entrega">¿De qué dinero sale?</label>
                  <Select id="entrega" value={entregaId} onChange={e => setEntregaId(e.target.value)} className="mt-1 h-10">
                    {entregas.map(e => {
                      const saldo = roundTwo(Number(e.monto) - e.compras.reduce((s, c) => s + Number(c.total), 0));
                      return <option key={e.id} value={e.id}>Entrega del {fechaCorta(e.fecha)} · {formatMonto(Number(e.monto))} · te quedan {formatMonto(saldo)}</option>;
                    })}
                  </Select>
                </div>
              )}
              {entrega && (
                <p className={`-mt-1 text-xs ${saldoDespues < 0 ? 'font-medium text-red-600' : 'text-muted-foreground'}`}>
                  {saldoDespues < 0
                    ? `Esta compra supera lo que te queda en ${formatMonto(-saldoDespues)}: queda como dinero que pusiste tú y la sede te lo devuelve.`
                    : `Te quedan ${formatMonto(saldoEntrega)}; después de esta compra, ${formatMonto(saldoDespues)}.`}
                </p>
              )}
              <Segmentado
                etiqueta="Forma de pago"
                opciones={[{ valor: 'efectivo', texto: 'Efectivo' }, { valor: 'cuentas', texto: 'Yape / transferencia' }]}
                valor={metodo}
                onCambiar={v => setMetodo(v as MetodoPago)}
              />
            </>
          )}
        </section>}

        {/* 3. Comprobante y fotos */}
        {!esRecojo && <section className="space-y-3">
          <PasoTitulo numero={3} titulo="Comprobante y fotos" listo={comprobanteListo} />
          <Segmentado
            etiqueta="Comprobante"
            opciones={[
              { valor: 'boleta', texto: 'Boleta' },
              { valor: 'factura', texto: 'Factura' },
              { valor: 'sin_comprobante', texto: 'No me dieron', deshabilitado: credito },
            ]}
            valor={comprobante}
            onCambiar={v => setComprobante(v as TipoComprobante)}
          />
          {comprobante === 'sin_comprobante' && (
            <p className="text-xs text-amber-800">
              {metodo === 'efectivo'
                ? `Sin boleta en efectivo: hasta ${formatMonto(topeSinBoleta)} por compra, y escribe abajo dónde y a quién le compraste.`
                : `Sin boleta por Yape: la captura del pago y, abajo, dónde y a quién le compraste. La foto del producto es opcional hasta ${formatMonto(topeSinBoleta)}.`}
            </p>
          )}
          {comprobante !== 'sin_comprobante' && (
            <Input placeholder="N° de boleta o factura (opcional)" className="h-10" value={numero} onChange={e => setNumero(e.target.value)} aria-label="Número de comprobante" />
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {comprobante !== 'sin_comprobante' && (
              <EvidenciaInput id="foto-comprobante" label={`Foto de la ${comprobante}`} archivo={fotoComprobante} onChange={setFotoComprobante} requerido />
            )}
            {comprobante === 'sin_comprobante' && (
              <EvidenciaInput id="foto-producto" label={fotoProductoObligatoria ? 'Foto del producto' : 'Foto del producto (opcional)'} archivo={fotoProducto} onChange={setFotoProducto} requerido={fotoProductoObligatoria} />
            )}
            {!credito && metodo === 'cuentas' && (
              <EvidenciaInput id="foto-pago" label={pagosExtra.length > 0 ? 'Captura del Yape 1' : 'Captura del Yape / transferencia'} archivo={fotoPago} onChange={setFotoPago} requerido />
            )}
            {!credito && metodo === 'cuentas' && pagosExtra.map((f, i) => (
              <EvidenciaInput key={i} id={`foto-pago-${i + 2}`} label={`Captura del Yape ${i + 2}`} archivo={f}
                onChange={nuevo => setPagosExtra(prev => nuevo ? prev.map((x, j) => (j === i ? nuevo : x)) : prev.filter((_, j) => j !== i))} requerido />
            ))}
          </div>
          {!credito && metodo === 'cuentas' && pagosExtra.length < RANURAS_PAGO_EXTRA.length && (
            <Button type="button" variant="ghost" size="sm" className="-mt-1" onClick={() => setPagosExtra(prev => [...prev, null])}>
              <Plus size={14} className="mr-1" /> Otra captura de Yape (pagaste a varios puestos)
            </Button>
          )}
          <Input
            placeholder={sinBoleta ? 'Dónde y a quién compraste (obligatorio)' : 'Observación (opcional)'}
            className={`h-10 ${sinBoleta && !observacion.trim() ? 'border-amber-400' : ''}`}
            value={observacion} onChange={e => setObservacion(e.target.value)} aria-label="Observación"
          />
          {faltanFotos.length > 0 && (
            <p className="text-xs text-amber-800">
              ¿No alcanzaste a tomar la foto? Guarda igual: queda con <strong>evidencia pendiente</strong> y la subes después en «Mi dinero y rendición» (no podrás rendir hasta completarla).
            </p>
          )}
        </section>}
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

/** Título de cada paso del formulario, con ✓ cuando ya está completo. */
function PasoTitulo({ numero, titulo, listo }: { numero: number; titulo: string; listo: boolean }) {
  return (
    <h4 className="flex items-center gap-2 text-sm font-bold text-yayis-dark">
      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs transition-colors ${listo ? 'bg-yayis-green text-white' : 'bg-gray-200 text-gray-600'}`}>
        {listo ? <Check size={13} strokeWidth={3} /> : numero}
      </span>
      {titulo}
    </h4>
  );
}
