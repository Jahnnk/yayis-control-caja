import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { roundTwo } from '@/lib/utils';

export interface PorReponerSede {
  sedeId: string;
  nombre: string;
  total: number;
  gastos: number;
}

/**
 * Lo pendiente de reposición de cada sede (gastos en estado «pendiente»), para la pantalla «Hoy» de Gerencia.
 * Es la misma regla que «Reponer» en el Resumen: deuda = gastos pendientes.
 */
export function usePorReponerSedes(activo: boolean): { porReponer: PorReponerSede[]; loading: boolean } {
  const [porReponer, setPorReponer] = useState<PorReponerSede[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    (async () => {
      setLoading(true);
      const filas: { sede_id: string; monto: number; sedes: { nombre: string } | null }[] = [];
      // Supabase da máximo 1000 filas por consulta: se lee por bloques.
      for (let desde = 0; desde < 20_000; desde += 1000) {
        const { data, error } = await supabase.from('gastos').select('sede_id, monto, sedes(nombre)')
          .eq('estado', 'pendiente').order('id').range(desde, desde + 999);
        if (error) { console.error('Error leyendo gastos por reponer:', error); break; }
        filas.push(...((data ?? []) as unknown as typeof filas));
        if ((data ?? []).length < 1000) break;
      }
      if (!vigente) return;
      const mapa = new Map<string, PorReponerSede>();
      for (const f of filas) {
        const s = mapa.get(f.sede_id) ?? { sedeId: f.sede_id, nombre: f.sedes?.nombre ?? 'Sede', total: 0, gastos: 0 };
        mapa.set(f.sede_id, { ...s, total: roundTwo(s.total + Number(f.monto)), gastos: s.gastos + 1 });
      }
      setPorReponer(Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setLoading(false);
    })();
    return () => { vigente = false; };
  }, [activo]);

  return { porReponer, loading };
}
