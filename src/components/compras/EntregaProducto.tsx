import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { useToast } from '@/components/ui/toast';
import { precioMostrado } from '@/lib/precio-linea';
import { formatCantidad } from '@/lib/compras';
import { formatPorcentaje } from '@/lib/precios';
import { formatMonto, roundTwo } from '@/lib/utils';
import type { PrecioPagado } from '@/hooks/usePreciosPagados';
import type { PedidoItem } from '@/types';
import { AlertTriangle, Check, Loader2, RotateCcw, X } from 'lucide-react';

/** Lo que se pagó por la línea y, debajo, el precio por unidad (por kg / litro si se pidió en g / ml). */
export function PrecioPagadoCelda({ pago, referencia }: { pago: PrecioPagado | undefined; referencia?: number | null }) {
  if (!pago || pago.cantidad <= 0) return <span className="text-muted-foreground">—</span>;
  const p = precioMostrado(pago.total / pago.cantidad, pago.unidad);
  // Frente al precio de referencia que escribió el administrador (ambos por kg / litro / unidad).
  const ref = referencia !== null && referencia !== undefined ? Number(referencia) : null;
  const variacion = ref !== null && ref > 0 && !pago.repartido ? p.valor / ref - 1 : null;
  return (
    <span className="whitespace-nowrap">
      <strong className="text-yayis-dark">{pago.repartido ? '≈ ' : ''}{formatMonto(pago.total)}</strong>
      <span className="block text-[11px] text-muted-foreground">
        {pago.repartido ? 'repartido del total' : `${formatMonto(roundTwo(p.valor))} por ${p.etiqueta}`}
      </span>
      {variacion !== null && ref !== null && (
        <span className={`block text-[11px] font-medium ${variacion >= 0.005 ? 'text-red-600' : variacion <= -0.005 ? 'text-emerald-700' : 'text-muted-foreground'}`}>
          {Math.abs(variacion) < 0.005 ? `igual a la ref. (${formatMonto(ref)})` : `${variacion > 0 ? '▲' : '▼'} ${formatPorcentaje(variacion)} vs ref. ${formatMonto(ref)}`}
        </span>
      )}
    </span>
  );
}

/**
 * Cantidad de una línea del pedido. Si Compras compró una cantidad distinta de la pedida
 * (por ejemplo había menos stock), se ve lo que realmente llegó y, debajo, lo que se pidió.
 */
export function CantidadCelda({ item, pago }: { item: Pick<PedidoItem, 'cantidad' | 'unidad' | 'estado'>; pago: PrecioPagado | undefined }) {
  const comprada = item.estado === 'comprado' && pago ? pago.cantidad : null;
  if (comprada === null || Math.abs(comprada - Number(item.cantidad)) < 0.005) {
    return <span className="whitespace-nowrap">{formatCantidad(item.cantidad)} {item.unidad}</span>;
  }
  return (
    <span className="whitespace-nowrap">
      <strong className="text-amber-800">{formatCantidad(comprada)} {item.unidad}</strong>
      <span className="block text-[11px] text-amber-700">se pidieron {formatCantidad(item.cantidad)}</span>
    </span>
  );
}

export type DatosProblema = { estado: 'incompleto' | 'no_llego' | 'llego_mal'; cantidadRecibida?: number; nota: string };

const TEXTO_PROBLEMA: Record<DatosProblema['estado'], string> = { incompleto: 'Llegó incompleto', no_llego: 'No llegó', llego_mal: 'Llegó mal' };

/**
 * Revisión de un producto: mientras no se revisa, «Conforme» o «Problema»; ya revisado, su resultado
 * (conforme / incompleto / no llegó / llegó mal) con la nota, y «Deshacer».
 */
export function EntregaCelda({ item, puedeMarcar, onCambiar, onProblema, onVolverAPedir }: {
  item: Pick<PedidoItem, 'id' | 'estado' | 'entregado_at' | 'repedido_at' | 'recepcion_estado' | 'cantidad_recibida' | 'recepcion_nota' | 'cantidad' | 'unidad'>;
  puedeMarcar: boolean;
  /** Marca el producto como conforme (true) o deshace la revisión (false). */
  onCambiar: (itemId: string, entregado: boolean) => Promise<{ error: string | null }>;
  /** Registra un problema al recibirlo (incompleto / no llegó / llegó mal). */
  onProblema?: (itemId: string, datos: DatosProblema) => Promise<{ error: string | null }>;
  /** Pasa un producto que no había a la próxima lista del administrador. */
  onVolverAPedir?: (itemId: string) => Promise<{ error: string | null }>;
}) {
  const { addToast } = useToast();
  const [trabajando, setTrabajando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<DatosProblema['estado']>('incompleto');
  const [cantidad, setCantidad] = useState('');
  const [nota, setNota] = useState('');

  if (item.estado === 'no_habia') {
    async function volverAPedir() {
      if (!onVolverAPedir) return;
      setTrabajando(true);
      const { error } = await onVolverAPedir(item.id);
      setTrabajando(false);
      if (error) addToast(error, 'error');
    }
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">No había</span>
        {item.repedido_at
          ? <span className="text-[11px] font-medium text-emerald-700">✓ Vuelto a pedir</span>
          : onVolverAPedir && puedeMarcar && (
            <Button type="button" size="sm" variant="outline" className="h-7 border-blue-400 px-2 text-xs text-blue-700" disabled={trabajando} onClick={volverAPedir}>
              {trabajando ? <Loader2 size={12} className="mr-1 animate-spin" /> : <RotateCcw size={12} className="mr-1" />} Volver a pedir
            </Button>
          )}
      </span>
    );
  }
  if (item.estado === 'pendiente') return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">Por comprar</span>;

  async function cambiar(entregado: boolean) {
    setTrabajando(true);
    const { error } = await onCambiar(item.id, entregado);
    setTrabajando(false);
    if (error) addToast(error, 'error');
  }

  async function guardarProblema() {
    if (!onProblema) return;
    const recibida = parseFloat(cantidad);
    if (!nota.trim()) return addToast('Escribe una nota explicando el problema.', 'error');
    if (tipo === 'incompleto' && !(recibida >= 0 && recibida < Number(item.cantidad))) return addToast(`Indica cuánto llegó (menos de ${formatCantidad(item.cantidad)} ${item.unidad}).`, 'error');
    setTrabajando(true);
    const { error } = await onProblema(item.id, { estado: tipo, cantidadRecibida: tipo === 'incompleto' ? recibida : undefined, nota });
    setTrabajando(false);
    if (error) return addToast(error, 'error');
    setAbierto(false); setNota(''); setCantidad('');
  }

  if (item.entregado_at) {
    const estado = item.recepcion_estado ?? 'conforme';
    const problema = estado !== 'conforme';
    return (
      <span className="inline-flex flex-col gap-0.5">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {problema ? (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${estado === 'no_llego' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900'}`}>
              {estado === 'no_llego' ? <X size={12} /> : <AlertTriangle size={12} />}
              {TEXTO_PROBLEMA[estado as DatosProblema['estado']]}
              {estado === 'incompleto' && item.cantidad_recibida !== null && item.cantidad_recibida !== undefined && ` · llegaron ${formatCantidad(item.cantidad_recibida)} de ${formatCantidad(item.cantidad)}`}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800"><Check size={12} /> Entregado</span>
          )}
          {puedeMarcar && (
            <button type="button" className="text-[11px] text-muted-foreground underline disabled:opacity-50" disabled={trabajando} onClick={() => cambiar(false)}>Deshacer</button>
          )}
        </span>
        {problema && item.recepcion_nota && <span className="max-w-[16rem] text-[11px] italic text-muted-foreground">“{item.recepcion_nota}”</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-1.5">
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Comprado</span>
        {puedeMarcar && !abierto && (
          <>
            <Button type="button" size="sm" variant="outline" className="h-7 border-emerald-500 px-2 text-xs text-emerald-700" disabled={trabajando} onClick={() => cambiar(true)}>
              {trabajando ? <Loader2 size={12} className="mr-1 animate-spin" /> : <Check size={12} className="mr-1" />} Conforme
            </Button>
            {onProblema && (
              <Button type="button" size="sm" variant="outline" className="h-7 border-amber-400 px-2 text-xs text-amber-800" disabled={trabajando} onClick={() => setAbierto(true)}>
                <AlertTriangle size={12} className="mr-1" /> Problema
              </Button>
            )}
          </>
        )}
      </span>
      {abierto && (
        <span className="flex w-64 max-w-full flex-col gap-1.5 rounded-md border border-amber-300 bg-amber-50/60 p-2">
          <Select className="h-8 text-xs" value={tipo} onChange={e => setTipo(e.target.value as DatosProblema['estado'])} aria-label="Qué pasó con este producto">
            <option value="incompleto">Llegó incompleto</option>
            <option value="no_llego">No llegó</option>
            <option value="llego_mal">Llegó mal (dañado, otro producto…)</option>
          </Select>
          {tipo === 'incompleto' && (
            <Input type="number" inputMode="decimal" min="0" step="0.01" className="h-8 text-xs" placeholder={`¿Cuánto llegó? (de ${formatCantidad(item.cantidad)} ${item.unidad})`}
              value={cantidad} onChange={e => setCantidad(e.target.value)} aria-label="Cantidad que llegó" />
          )}
          <Input className="h-8 text-xs" placeholder="Nota: ¿qué pasó?" value={nota} onChange={e => setNota(e.target.value)} aria-label="Nota del problema" />
          <span className="flex gap-1.5">
            <Button type="button" size="sm" className="h-7 px-2 text-xs" disabled={trabajando} onClick={guardarProblema}>
              {trabajando ? <Loader2 size={12} className="mr-1 animate-spin" /> : null} Guardar problema
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={trabajando} onClick={() => setAbierto(false)}>Cancelar</Button>
          </span>
        </span>
      )}
    </span>
  );
}
