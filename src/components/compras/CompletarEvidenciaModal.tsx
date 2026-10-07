import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/toast';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { EvidenciaInput } from '@/components/compras/EvidenciaInput';
import { borrarEvidencias, subirEvidencia } from '@/lib/evidencias';
import { NOMBRE_FOTO, TOPE_SIN_COMPROBANTE_EFECTIVO, fotosExigidas, type RanuraEvidencia } from '@/lib/compras';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { formatMonto } from '@/lib/utils';
import { fechaCorta } from '@/lib/compras';
import { Select } from '@/components/ui/select-native';
import { Loader2 } from 'lucide-react';
import type { CompraDetalle } from '@/types';

const CAMPO: Record<RanuraEvidencia, 'evidencia_comprobante_path' | 'evidencia_producto_path' | 'evidencia_pago_path'> = {
  comprobante: 'evidencia_comprobante_path', producto: 'evidencia_producto_path', pago: 'evidencia_pago_path',
};

/** Fotos que todavía le faltan a una compra guardada con evidencia pendiente. */
export function fotosPendientes(c: CompraDetalle, tope: number = TOPE_SIN_COMPROBANTE_EFECTIVO): RanuraEvidencia[] {
  // El pago también queda cubierto si la compra se pagó junto con otra (una sola transferencia).
  return fotosExigidas(c, { total: Number(c.total), tope }).filter(r => !c[CAMPO[r]] && !(r === 'pago' && c.pago_con_compra_id));
}

/** Compras sube la foto que no alcanzó a tomar en el momento. */
export function CompletarEvidenciaModal({ compra, onClose, onListo }: { compra: CompraDetalle; onClose: () => void; onListo: () => void }) {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const { sedes } = useSedeActiva();
  const faltan = fotosPendientes(compra, Number(sedes.find(s => s.id === compra.sede_id)?.tope_sin_comprobante ?? TOPE_SIN_COMPROBANTE_EFECTIVO));
  const [archivos, setArchivos] = useState<Partial<Record<RanuraEvidencia, File | null>>>({});
  const [guardando, setGuardando] = useState(false);

  // «Se pagó junto con otra compra»: una sola transferencia cubre varias compras (no hay una captura para cada una).
  const falta_pago = faltan.includes('pago');
  const [juntoConOtra, setJuntoConOtra] = useState(false);
  const [otraId, setOtraId] = useState('');
  const [candidatas, setCandidatas] = useState<{ id: string; fecha: string; total: number; proveedor: string }[]>([]);
  useEffect(() => {
    if (!falta_pago) return;
    supabase.from('compras').select('id, fecha, total, metodo_pago, evidencia_pago_path, pago_con_compra_id, registrado_por, proveedores(nombre)')
      .eq('sede_id', compra.sede_id).eq('metodo_pago', 'cuentas').order('fecha', { ascending: false }).limit(60)
      .then(({ data }) => {
        setCandidatas((data ?? [])
          .filter(c => c.id !== compra.id && c.evidencia_pago_path && !c.pago_con_compra_id && c.registrado_por === compra.registrado_por)
          .map(c => ({ id: c.id as string, fecha: c.fecha as string, total: Number(c.total), proveedor: (c.proveedores as unknown as { nombre: string } | null)?.nombre ?? 'Proveedor' })));
      });
  }, [falta_pago, compra.id, compra.sede_id, compra.registrado_por]);

  async function guardar() {
    if (!profile) return;
    if (juntoConOtra && !otraId) return addToast('Elige con qué compra se pagó junto.', 'error');
    setGuardando(true);
    const subidas: string[] = [];
    const cambios: Record<string, string | boolean> = {};
    if (juntoConOtra && otraId) cambios.pago_con_compra_id = otraId;
    for (const r of faltan) {
      if (r === 'pago' && juntoConOtra) continue; // el pago queda cubierto por la otra compra
      const archivo = archivos[r];
      if (!archivo) continue;
      const { path, error } = await subirEvidencia(archivo, compra.sede_id, profile.id, r);
      if (error || !path) {
        await borrarEvidencias(subidas);
        setGuardando(false);
        return addToast(error ?? 'No se pudo subir la foto', 'error');
      }
      subidas.push(path);
      cambios[CAMPO[r]] = path;
    }
    if (subidas.length === 0 && !(juntoConOtra && otraId)) { setGuardando(false); return addToast('Sube al menos una foto.', 'error'); }
    const quedan = faltan.filter(r => !archivos[r] && !(r === 'pago' && juntoConOtra));
    cambios.evidencia_pendiente = quedan.length > 0;
    const { error } = await supabase.from('compras').update(cambios).eq('id', compra.id);
    setGuardando(false);
    if (error) {
      await borrarEvidencias(subidas);
      return addToast(`Error: ${error.message}`, 'error');
    }
    addToast(quedan.length === 0 ? 'Evidencia completa' : 'Foto guardada. Todavía falta otra.', 'success');
    onListo();
    onClose();
  }

  return (
    <Modal open onClose={onClose} title="Subir la foto pendiente">
      <div className="space-y-4">
        <p className="text-sm">
          Compra a <strong>{compra.proveedores?.nombre}</strong> por <strong>{formatMonto(Number(compra.total))}</strong>. Falta: {faltan.map(r => NOMBRE_FOTO[r]).join(' y ')}.
        </p>
        {falta_pago && (
          <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50/50 p-3">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={juntoConOtra} onChange={e => setJuntoConOtra(e.target.checked)} />
              <span><strong>Se pagó junto con otra compra</strong> (una sola transferencia o Yape cubrió las dos). No tengo una captura separada.</span>
            </label>
            {juntoConOtra && (
              <div>
                <label className="text-xs font-medium" htmlFor="pago-junto">¿Con cuál compra? (la que tiene la captura del pago)</label>
                {candidatas.length === 0 ? (
                  <p className="mt-1 text-xs text-red-700">No hay otra compra tuya, pagada por Yape y con su captura, para vincular. Sube la captura del pago.</p>
                ) : (
                  <Select id="pago-junto" className="mt-1" value={otraId} onChange={e => setOtraId(e.target.value)}>
                    <option value="">Elegir…</option>
                    {candidatas.map(c => <option key={c.id} value={c.id}>{fechaCorta(c.fecha)} · {c.proveedor} · {formatMonto(c.total)}</option>)}
                  </Select>
                )}
              </div>
            )}
          </div>
        )}
        {faltan.filter(r => !(r === 'pago' && juntoConOtra)).map(r => (
          <EvidenciaInput key={r} id={`pendiente-${r}`} label={NOMBRE_FOTO[r].charAt(0).toUpperCase() + NOMBRE_FOTO[r].slice(1)}
            archivo={archivos[r] ?? null} onChange={f => setArchivos(prev => ({ ...prev, [r]: f }))} requerido />
        ))}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? <Loader2 size={14} className="mr-1 animate-spin" /> : null} Guardar foto
          </Button>
        </div>
      </div>
    </Modal>
  );
}
