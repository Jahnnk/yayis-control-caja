import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Loader2, Wrench } from 'lucide-react';

/**
 * Ajuste puntual TEMPORAL (8-jul-2026): saldar toda la deuda anterior al 8 de
 * julio (ya confirmada pagada con Luis) y dejar como pendiente solo lo del
 * 8 de julio. Corre con la sesion del usuario (RLS aplica). Se retira una vez
 * usado.
 */

const FECHA_CORTE = '2026-07-08'; // gastos < esta fecha se saldan; los de esta fecha quedan pendientes

interface Props {
  onDone?: () => void;
}

export function AjusteDeudaTemporal({ onDone }: Props) {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function ejecutar() {
    setConfirm(false);
    if (!profile?.sede_id) { addToast('No se pudo identificar tu sede', 'error'); return; }
    setRunning(true);

    // 1. Saldar toda la deuda pendiente anterior al 8 de julio
    const { data: saldados, error: e1 } = await supabase
      .from('gastos')
      .update({ estado: 'pagado' })
      .eq('sede_id', profile.sede_id)
      .eq('estado', 'pendiente')
      .lt('fecha', FECHA_CORTE)
      .select('id');
    if (e1) { addToast(`Error al saldar lo anterior: ${e1.message}`, 'error'); setRunning(false); return; }

    // 2. Dejar TODO lo del 8 de julio como pendiente (y soltar vinculos de reposicion)
    const { data: pendientes, error: e2 } = await supabase
      .from('gastos')
      .update({ estado: 'pendiente', reposicion_id: null })
      .eq('sede_id', profile.sede_id)
      .eq('fecha', FECHA_CORTE)
      .select('id');
    if (e2) { addToast(`Error al marcar lo de hoy: ${e2.message}`, 'error'); setRunning(false); return; }

    const nSaldados = saldados?.length ?? 0;
    const nPend = pendientes?.length ?? 0;
    setDone(`Listo: ${nSaldados} gasto(s) viejo(s) saldado(s) y ${nPend} gasto(s) del ${FECHA_CORTE} dejados como pendientes.`);
    addToast('Ajuste aplicado correctamente', 'success');
    setRunning(false);
    onDone?.();
  }

  return (
    <div className="border-2 border-dashed border-teal-300 bg-teal-50/40 rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h4 className="text-sm font-bold text-teal-800 flex items-center gap-2">
          <Wrench size={16} /> Ajuste puntual de deuda (temporal)
        </h4>
        <Button
          size="sm"
          variant="outline"
          className="border-teal-500 text-teal-700 hover:bg-teal-100"
          disabled={running || done !== null}
          onClick={() => setConfirm(true)}
        >
          {running ? <Loader2 size={14} className="animate-spin mr-1" /> : <Wrench size={14} className="mr-1" />}
          {done ? 'Ya aplicado' : 'Aplicar ajuste'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Marca como pagada toda la deuda anterior al {FECHA_CORTE} (ya saldada con Luis) y deja como pendiente
        solo lo del {FECHA_CORTE}. Úsalo una vez; después lo retiro.
      </p>
      {done && <p className="text-xs text-teal-700 font-medium mt-2">{done} Recarga la página para ver el saldo actualizado.</p>}

      <ConfirmDialog
        open={confirm}
        title="¿Aplicar el ajuste de deuda?"
        message={`Se marcará como PAGADA toda la deuda pendiente anterior al ${FECHA_CORTE}, y TODO lo del ${FECHA_CORTE} quedará como pendiente por reponer. Esta acción modifica tus registros.`}
        confirmLabel="Sí, aplicar"
        onConfirm={ejecutar}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
