import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { useToast } from '@/components/ui/toast';
import { EvidenciaInput } from '@/components/compras/EvidenciaInput';
import type { EncargoDetalle } from '@/hooks/useDeliveryCompras';
import { fechaCorta } from '@/lib/compras';
import { getTodayLima } from '@/lib/dates';
import { formatMonto, roundTwo } from '@/lib/utils';
import type { MetodoPago } from '@/types';

/** Devolverle al delivery lo que pagó más sus carreras. Al guardar nacen los gastos para la rendición. */
export function PagarDelivery({ encargo, onClose, pagar }: {
  encargo: EncargoDetalle | null;
  onClose: () => void;
  pagar: (id: string, metodo: MetodoPago, captura: File | null, fecha: string) => Promise<{ error: string | null }>;
}) {
  const { addToast } = useToast();
  const hoy = getTodayLima();
  const [metodo, setMetodo] = useState<MetodoPago>('cuentas');
  const [captura, setCaptura] = useState<File | null>(null);
  const [fecha, setFecha] = useState(hoy);
  const [guardando, setGuardando] = useState(false);
  if (!encargo) return null;

  const nombre = encargo.repartidores?.nombre ?? 'el delivery';
  const total = roundTwo(Number(encargo.total_compras) + Number(encargo.total_carreras));
  const falta = metodo === 'cuentas' && !captura ? 'Sube la captura del Yape o la transferencia.' : null;

  const enviar = async () => {
    if (falta) return;
    setGuardando(true);
    const { error } = await pagar(encargo.id, metodo, metodo === 'cuentas' ? captura : null, fecha);
    setGuardando(false);
    if (error) { addToast(error, 'error'); return; }
    addToast(`Pagado: ${formatMonto(total)} a ${nombre}. Ya está en tu Registro de Gastos para la rendición.`);
    setCaptura(null);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`Pagar a ${nombre}`}
      footer={
        <div className="space-y-2">
          {falta && <p className="text-xs text-amber-700">{falta}</p>}
          <Button className="h-11 w-full" disabled={!!falta || guardando} onClick={() => void enviar()}>{guardando ? 'Guardando…' : `Pagar ${formatMonto(total)}`}</Button>
        </div>
      }>
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 p-3 text-sm">
          <p className="text-xs text-muted-foreground">Compra del {fechaCorta(encargo.fecha)}</p>
          {encargo.compras.map(c => (
            <div key={c.id} className="flex justify-between gap-2">
              <span>{c.proveedores?.nombre ?? 'Proveedor'} <span className="text-[11px] text-muted-foreground">· {c.tipo_comprobante === 'sin_comprobante' ? 'sin comprobante' : c.tipo_comprobante}</span></span>
              <span className="shrink-0 whitespace-nowrap tabular-nums">{formatMonto(Number(c.total))}</span>
            </div>
          ))}
          {Number(encargo.total_carreras) > 0 && (
            <div className="flex justify-between"><span>{encargo.carreras} carreras × {formatMonto(Number(encargo.precio_carrera))}</span><span className="tabular-nums">{formatMonto(Number(encargo.total_carreras))}</span></div>
          )}
          <div className="mt-1 flex justify-between border-t pt-1 font-bold text-yayis-dark"><span>Total</span><span className="tabular-nums">{formatMonto(total)}</span></div>
        </div>
        <Segmentado etiqueta="Cómo le pagaste" valor={metodo} onCambiar={v => setMetodo(v as MetodoPago)}
          opciones={[{ valor: 'cuentas', texto: 'Yape / transferencia' }, { valor: 'efectivo', texto: 'Efectivo' }]} />
        {metodo === 'cuentas' && <EvidenciaInput id="captura-delivery" label="Captura del pago" requerido archivo={captura} onChange={setCaptura} />}
        <label className="block text-xs text-muted-foreground">Fecha del pago
          <Input type="date" value={fecha} min={encargo.fecha} max={hoy} onChange={e => setFecha(e.target.value)} className="mt-1" />
        </label>
        <p className="text-[11px] text-muted-foreground">Al pagar se crean solos los gastos para la rendición: uno por proveedor (con su comprobante) y uno por las carreras. Gerencia te los repone como siempre.</p>
      </div>
    </Modal>
  );
}
