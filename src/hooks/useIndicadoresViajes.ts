import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CompraParaViaje, DeliveryParaViaje, ListaParaViaje } from '@/lib/viajes';
import type { CargaCombustible, Viaje } from '@/types';

export interface DatosViajes {
  viajes: Viaje[];
  cargas: CargaCombustible[];
  compras: CompraParaViaje[];
  deliverys: DeliveryParaViaje[];
  listas: ListaParaViaje[];
  loading: boolean;
  /** Falta correr el SQL de viajes. */
  sinTabla: boolean;
}

/** Lo necesario para los indicadores de viajes de un periodo (solo Gerencia). */
export function useIndicadoresViajes(desde: string, hasta: string): DatosViajes {
  const [datos, setDatos] = useState<DatosViajes>({ viajes: [], cargas: [], compras: [], deliverys: [], listas: [], loading: true, sinTabla: false });

  useEffect(() => {
    let vigente = true;
    (async () => {
      const [viajes, cargas, compras, deliverys, listas] = await Promise.all([
        supabase.from('viajes').select('*').gte('fecha', desde).lte('fecha', hasta),
        supabase.from('cargas_combustible').select('*').gte('fecha', desde).lte('fecha', hasta),
        supabase.from('compras').select('created_at, total, registrado_por, proveedores(nombre)').gte('fecha', desde).lte('fecha', hasta),
        supabase.from('deliverys').select('created_at, registrado_por').gte('fecha', desde).lte('fecha', hasta),
        supabase.from('pedidos').select('sede_id, fecha_compra, enviado_at, urgente, estado, sedes(nombre)').gte('fecha_compra', desde).lte('fecha_compra', hasta),
      ]);
      if (!vigente) return;
      setDatos({
        viajes: (viajes.data ?? []) as Viaje[],
        cargas: (cargas.data ?? []) as CargaCombustible[],
        compras: ((compras.data ?? []) as unknown as Array<{ created_at: string; total: number; registrado_por: string; proveedores: { nombre: string } | null }>)
          .map(c => ({ created_at: c.created_at, total: Number(c.total), registrado_por: c.registrado_por, proveedor: c.proveedores?.nombre ?? null })),
        deliverys: (deliverys.data ?? []) as DeliveryParaViaje[],
        listas: ((listas.data ?? []) as unknown as Array<Omit<ListaParaViaje, 'sede'> & { sedes: { nombre: string } | null }>)
          .map(l => ({ ...l, sede: l.sedes?.nombre ?? '' })),
        loading: false,
        sinTabla: !!viajes.error,
      });
    })();
    return () => { vigente = false; };
  }, [desde, hasta]);

  return datos;
}
