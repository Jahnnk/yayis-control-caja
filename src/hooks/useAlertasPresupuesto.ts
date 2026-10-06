import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { sumarDias } from '@/lib/compras';
import type { UsoCategoria } from '@/lib/presupuesto';

export interface SobreTopeGasto {
  id: string; sede_id: string; fecha: string; monto: number; descripcion: string; motivo_sobre_tope: string;
  sedes: { nombre: string } | null; categorias: { nombre: string } | null;
}
export interface SobreTopePedido {
  id: string; sede_id: string; fecha_compra: string; motivo_sobre_tope: string; sedes: { nombre: string } | null;
}
export interface UsoSede { sedeId: string; sedeNombre: string; uso: UsoCategoria[] }

/**
 * Lo que necesita el Panel de Finanzas para las alertas del presupuesto: gastos y listas que se
 * registraron pasando el tope (con su motivo, últimos 14 días) y cómo va cada sede este mes.
 * Si el SQL del presupuesto todavía no se corrió, devuelve todo vacío y el panel sigue igual.
 */
export function useAlertasPresupuesto(hoy: string) {
  const { sedes } = useSedeActiva();
  const [gastos, setGastos] = useState<SobreTopeGasto[]>([]);
  const [pedidos, setPedidos] = useState<SobreTopePedido[]>([]);
  const [usoPorSede, setUsoPorSede] = useState<UsoSede[]>([]);
  const claveSedes = sedes.map(s => s.id).join(',');

  useEffect(() => {
    let vigente = true;
    const desde = sumarDias(hoy, -14);
    const mes = hoy.slice(0, 7);
    Promise.all([
      supabase.from('gastos').select('id, sede_id, fecha, monto, descripcion, motivo_sobre_tope, sedes(nombre), categorias(nombre)')
        .not('motivo_sobre_tope', 'is', null).gte('fecha', desde).order('fecha', { ascending: false }),
      supabase.from('pedidos').select('id, sede_id, fecha_compra, motivo_sobre_tope, sedes(nombre)')
        .not('motivo_sobre_tope', 'is', null).gte('fecha_compra', desde).neq('estado', 'cancelado'),
      Promise.all(sedes.map(async s => {
        const { data, error } = await supabase.rpc('uso_presupuesto_caja', { p_sede: s.id, p_mes: mes });
        const uso = error ? [] : ((data ?? []) as { categoria: string; tope: number | null; presupuesto_total: number | null; gastado: number; enviado_el: string | null }[])
          .map(f => ({ categoria: f.categoria, tope: f.tope === null ? null : Number(f.tope), presupuestoTotal: f.presupuesto_total === null ? null : Number(f.presupuesto_total), gastado: Number(f.gastado), enviadoEl: f.enviado_el }));
        return { sedeId: s.id, sedeNombre: s.nombre, uso };
      })),
    ]).then(([g, p, u]) => {
      if (!vigente) return;
      setGastos(g.error ? [] : (g.data ?? []) as unknown as SobreTopeGasto[]);
      setPedidos(p.error ? [] : (p.data ?? []) as unknown as SobreTopePedido[]);
      setUsoPorSede(u);
    });
    return () => { vigente = false; };
  }, [hoy, claveSedes]); // eslint-disable-line react-hooks/exhaustive-deps

  return { gastos, pedidos, usoPorSede };
}
