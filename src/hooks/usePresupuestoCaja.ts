import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { UsoCategoria } from '@/lib/presupuesto';

interface FilaUso {
  categoria: string;
  tope: number | string | null;
  presupuesto_total: number | string | null;
  gastado: number | string;
  enviado_el: string | null;
}

const aNumero = (v: number | string | null) => (v === null ? null : Number(v));

/**
 * Topes del mes (los manda Cash Control) y lo gastado por categoría en una sede. Usa la función
 * uso_presupuesto_caja de la base: la misma regla para todas las pantallas.
 */
export function usePresupuestoCaja(sedeId: string | null, mes: string) {
  const [uso, setUso] = useState<UsoCategoria[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    if (!sedeId) { setUso([]); return; }
    setLoading(true);
    const { data, error: err } = await supabase.rpc('uso_presupuesto_caja', { p_sede: sedeId, p_mes: mes });
    setLoading(false);
    if (err) {
      // Antes de correr la migración la función no existe: la pantalla funciona sin barras.
      console.error('Error cargando el presupuesto:', err);
      setError(err.message);
      setUso([]);
      return;
    }
    setError(null);
    setUso(((data ?? []) as FilaUso[]).map(f => ({
      categoria: f.categoria,
      tope: aNumero(f.tope),
      presupuestoTotal: aNumero(f.presupuesto_total),
      gastado: Number(f.gastado),
      enviadoEl: f.enviado_el,
    })));
  }, [sedeId, mes]);

  useEffect(() => { recargar(); }, [recargar]);

  /** Hay presupuesto aprobado para este mes (al menos una categoría con tope). */
  const hayTopes = uso.some(u => u.tope !== null);
  return { uso, hayTopes, loading, error, recargar };
}
