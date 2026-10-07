import { useState } from 'react';
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
import { Loader2 } from 'lucide-react';
import type { CompraDetalle } from '@/types';

const CAMPO: Record<RanuraEvidencia, 'evidencia_comprobante_path' | 'evidencia_producto_path' | 'evidencia_pago_path'> = {
  comprobante: 'evidencia_comprobante_path', producto: 'evidencia_producto_path', pago: 'evidencia_pago_path',
};

/** Fotos que todavía le faltan a una compra guardada con evidencia pendiente. */
export function fotosPendientes(c: CompraDetalle, tope: number = TOPE_SIN_COMPROBANTE_EFECTIVO): RanuraEvidencia[] {
  return fotosExigidas(c, { total: Number(c.total), tope }).filter(r => !c[CAMPO[r]]);
}

/** Compras sube la foto que no alcanzó a tomar en el momento. */
export function CompletarEvidenciaModal({ compra, onClose, onListo }: { compra: CompraDetalle; onClose: () => void; onListo: () => void }) {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const { sedes } = useSedeActiva();
  const faltan = fotosPendientes(compra, Number(sedes.find(s => s.id === compra.sede_id)?.tope_sin_comprobante ?? TOPE_SIN_COMPROBANTE_EFECTIVO));
  const [archivos, setArchivos] = useState<Partial<Record<RanuraEvidencia, File | null>>>({});
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!profile) return;
    setGuardando(true);
    const subidas: string[] = [];
    const cambios: Record<string, string | boolean> = {};
    for (const r of faltan) {
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
    if (subidas.length === 0) { setGuardando(false); return addToast('Sube al menos una foto.', 'error'); }
    const quedan = faltan.filter(r => !archivos[r]);
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
        {faltan.map(r => (
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
