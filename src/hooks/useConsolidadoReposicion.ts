import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { roundTwo } from '@/lib/utils';

export interface TotalOrigen { total: number; cantidad: number; efectivo: number; cuentas: number }
export interface ConsolidadoReposicion { administrador: TotalOrigen; compras: TotalOrigen; total: TotalOrigen }

/** Compras de Fabio ya hechas con dinero entregado, pero cuya rendición todavía no se cierra (aún no son gasto a reponer). */
export interface SinRendir { total: number; cantidad: number; compras: { id: string; fecha: string; total: number; proveedor: string; evidenciaPendiente: boolean }[] }

const vacio = (): TotalOrigen => ({ total: 0, cantidad: 0, efectivo: 0, cuentas: 0 });
const PAGINA = 1000;

/**
 * Lo que hay que reponer (gastos pendientes) de la sede activa, separado por quién lo originó:
 * lo que pagó el administrador y las compras de Fabio. `version` sirve para volver a calcular.
 */
export function useConsolidadoReposicion(version = 0) {
  const { sedeId } = useSedeActiva();
  const [consolidado, setConsolidado] = useState<ConsolidadoReposicion>({ administrador: vacio(), compras: vacio(), total: vacio() });
  const [sinRendir, setSinRendir] = useState<SinRendir>({ total: 0, cantidad: 0, compras: [] });
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!sedeId) return;
    let vigente = true;
    (async () => {
      setCargando(true);
      const r: ConsolidadoReposicion = { administrador: vacio(), compras: vacio(), total: vacio() };
      for (let desde = 0; ; desde += PAGINA) {
        const { data, error } = await supabase.from('gastos').select('monto, metodo_pago, origen')
          .eq('sede_id', sedeId).eq('estado', 'pendiente').order('id', { ascending: true }).range(desde, desde + PAGINA - 1);
        if (error) { console.error('Error calculando el consolidado de reposición:', error); break; }
        for (const g of data ?? []) {
          const monto = Number(g.monto);
          for (const t of [g.origen === 'compras' ? r.compras : r.administrador, r.total]) {
            t.total = roundTwo(t.total + monto);
            t.cantidad += 1;
            if (g.metodo_pago === 'efectivo') t.efectivo = roundTwo(t.efectivo + monto); else t.cuentas = roundTwo(t.cuentas + monto);
          }
        }
        if (!data || data.length < PAGINA) break;
      }
      // Compras al contado de Fabio (con entrega de dinero) que todavía no se convirtieron en gasto: falta cerrar la rendición.
      const pendientes: SinRendir = { total: 0, cantidad: 0, compras: [] };
      for (let desde = 0; ; desde += PAGINA) {
        const { data, error } = await supabase.from('compras').select('id, fecha, total, entrega_id, evidencia_pendiente, proveedores(nombre)')
          .eq('sede_id', sedeId).is('gasto_id', null).order('id', { ascending: true }).range(desde, desde + PAGINA - 1);
        if (error) { console.error('Error calculando las compras sin rendir:', error); break; }
        for (const c of data ?? []) {
          if (!c.entrega_id || !(Number(c.total) > 0)) continue;
          pendientes.total = roundTwo(pendientes.total + Number(c.total));
          pendientes.cantidad += 1;
          pendientes.compras.push({
            id: c.id as string, fecha: c.fecha as string, total: Number(c.total),
            proveedor: ((c.proveedores as unknown as { nombre: string } | null)?.nombre) ?? 'Proveedor',
            evidenciaPendiente: !!c.evidencia_pendiente,
          });
        }
        if (!data || data.length < PAGINA) break;
      }
      pendientes.compras.sort((a, b) => b.fecha.localeCompare(a.fecha));
      if (vigente) { setConsolidado(r); setSinRendir(pendientes); setCargando(false); }
    })();
    return () => { vigente = false; };
  }, [sedeId, version]);

  return { consolidado, sinRendir, cargando };
}
