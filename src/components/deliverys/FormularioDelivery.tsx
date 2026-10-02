import { useMemo, useState } from 'react';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { EvidenciaInput } from '@/components/compras/EvidenciaInput';
import { MODALIDADES, cobradoSegunModalidad } from '@/lib/deliverys';
import { getTodayLima } from '@/lib/dates';
import { formatMonto, parseNumericInput } from '@/lib/utils';
import { Loader2 } from 'lucide-react';
import type { MetodoPago, ModalidadDelivery } from '@/types';
import type { NuevoDelivery } from '@/hooks/useDeliverys';

/** Formulario rápido para que Fabio anote un delivery apenas lo entrega. */
export function FormularioDelivery({ onGuardar }: {
  onGuardar: (datos: NuevoDelivery, captura: File | null) => Promise<{ error: string | null }>;
}) {
  const { sedes } = useSedeActiva();
  const { addToast } = useToast();
  const [sedeId, setSedeId] = useState('');
  const [fecha, setFecha] = useState(getTodayLima());
  const [cliente, setCliente] = useState('');
  const [detalle, setDetalle] = useState('');
  const [producto, setProducto] = useState('');
  const [delivery, setDelivery] = useState('');
  const [modalidad, setModalidad] = useState<ModalidadDelivery | ''>('');
  const [metodo, setMetodo] = useState<MetodoPago>('efectivo');
  const [captura, setCaptura] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);

  const montoProducto = parseNumericInput(producto);
  const montoDelivery = parseNumericInput(delivery);
  const cobra = modalidad !== '' && modalidad !== 'todo_prepagado';
  const cobrado = modalidad ? cobradoSegunModalidad(modalidad, montoProducto, montoDelivery) : 0;

  // Lo mínimo para guardar, dicho en palabras (se muestra bajo el botón).
  const falta = useMemo(() => {
    if (!sedeId) return 'Elige de qué sede salió el pedido.';
    if (!cliente.trim()) return 'Escribe el nombre del cliente.';
    if (!modalidad) return 'Indica cómo pagó el cliente.';
    if (modalidad === 'producto_prepagado' && montoDelivery <= 0) return 'Escribe cuánto cobraste de delivery.';
    if (modalidad === 'todo_contra_entrega' && montoProducto + montoDelivery <= 0) return 'Escribe cuánto cobraste.';
    if (cobra && metodo === 'cuentas' && !captura) return 'Sube la captura del Yape o transferencia.';
    return null;
  }, [sedeId, cliente, modalidad, montoProducto, montoDelivery, cobra, metodo, captura]);

  async function guardar() {
    if (falta || !modalidad) return;
    setGuardando(true);
    const { error } = await onGuardar({
      sede_id: sedeId,
      fecha,
      cliente: cliente.trim(),
      detalle: detalle.trim() || null,
      monto_producto: montoProducto,
      monto_delivery: montoDelivery,
      modalidad,
      metodo_cobro: cobra ? metodo : null,
    }, cobra && metodo === 'cuentas' ? captura : null);
    setGuardando(false);
    if (error) return addToast(`Error: ${error}`, 'error');
    addToast('Delivery registrado', 'success');
    // Se limpia lo propio de cada entrega; la sede y la fecha suelen repetirse.
    setCliente(''); setDetalle(''); setProducto(''); setDelivery(''); setModalidad(''); setMetodo('efectivo'); setCaptura(null);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Registrar un delivery</CardTitle>
        <p className="text-xs text-muted-foreground">Anótalo apenas lo entregues. Así se sabe cuánto cobraste y a quién se lo debes entregar.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium" htmlFor="dl-sede">¿De qué sede salió el pedido?</label>
            <Select id="dl-sede" className="mt-1" value={sedeId} onChange={e => setSedeId(e.target.value)}>
              <option value="">Elige la sede…</option>
              {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium" htmlFor="dl-fecha">Fecha</label>
            <Input id="dl-fecha" type="date" className="mt-1" value={fecha} max={getTodayLima()} onChange={e => setFecha(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium" htmlFor="dl-cliente">Cliente</label>
            <Input id="dl-cliente" className="mt-1" placeholder="Nombre o empresa" value={cliente} onChange={e => setCliente(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium" htmlFor="dl-detalle">¿Qué llevaste? (opcional)</label>
            <Input id="dl-detalle" className="mt-1" placeholder="Ej. 2 tortas y 1 docena de panes" value={detalle} onChange={e => setDetalle(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium" htmlFor="dl-producto">Valor del producto (S/)</label>
            <Input id="dl-producto" type="number" inputMode="decimal" min="0" step="0.01" className="mt-1" value={producto} onChange={e => setProducto(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium" htmlFor="dl-delivery">Valor del delivery (S/)</label>
            <Input id="dl-delivery" type="number" inputMode="decimal" min="0" step="0.01" className="mt-1" placeholder="0 si va incluido" value={delivery} onChange={e => setDelivery(e.target.value)} />
          </div>
        </div>

        <fieldset>
          <legend className="text-xs font-medium">¿Cómo pagó el cliente?</legend>
          <div className="mt-1 space-y-2">
            {MODALIDADES.map(m => (
              <label key={m.valor} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${modalidad === m.valor ? 'border-yayis-green bg-emerald-50/60' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input type="radio" name="dl-modalidad" className="mt-1" checked={modalidad === m.valor} onChange={() => setModalidad(m.valor)} />
                <span><span className="font-medium">{m.titulo}</span><span className="block text-xs text-muted-foreground">{m.ayuda}</span></span>
              </label>
            ))}
          </div>
        </fieldset>

        {cobra && (
          <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/40 p-3">
            <p className="text-sm">Cobraste <strong className="text-base">{formatMonto(cobrado)}</strong></p>
            <div>
              <label className="text-xs font-medium" htmlFor="dl-metodo">¿Cómo te pagó?</label>
              <Select id="dl-metodo" className="mt-1 sm:w-64" value={metodo} onChange={e => setMetodo(e.target.value as MetodoPago)}>
                <option value="efectivo">Efectivo</option>
                <option value="cuentas">Yape o transferencia</option>
              </Select>
            </div>
            {metodo === 'efectivo' ? (
              <p className="text-xs text-amber-900">Este efectivo queda a tu cargo hasta que se lo entregues al administrador de la sede.</p>
            ) : (
              <EvidenciaInput id="dl-captura" label="Captura del Yape o transferencia" archivo={captura} onChange={setCaptura} requerido />
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button onClick={guardar} disabled={guardando || falta !== null}>
            {guardando && <Loader2 size={14} className="mr-1 animate-spin" />} Guardar delivery
          </Button>
          {falta && <p className="text-xs text-muted-foreground">{falta}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
