import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { getTodayLima } from '@/lib/dates';
import { subirFotoGasolina } from '@/lib/evidencias';
import { esViajeExtra } from '@/lib/viajes';
import { sumarDias, diaSemanaDe } from '@/lib/compras';
import type { CargaCombustible, MotivoViaje, TipoViaje, Viaje } from '@/types';

function mensaje(error: string): string {
  if (error.includes('viajes_uno_abierto')) return 'Ya tienes un viaje abierto: primero marca «Volví».';
  if (error.includes('viaje_km_coherente')) return 'El km de regreso no puede ser menor que el de salida.';
  if (error.includes('relation') && error.includes('viajes')) return 'Falta activar los viajes en la base de datos (avísale a Gerencia).';
  return error;
}

/** Los viajes de hoy de Compras, el que está abierto y la gasolina de la semana. */
export function useViajes() {
  const { profile } = useAuth();
  const hoy = getTodayLima();
  const [viajesHoy, setViajesHoy] = useState<Viaje[]>([]);
  const [abierto, setAbierto] = useState<Viaje | null>(null);
  const [ultimoKm, setUltimoKm] = useState<number | null>(null);
  const [gasolinaSemana, setGasolinaSemana] = useState<CargaCombustible[]>([]);
  const [loading, setLoading] = useState(true);
  const lunes = sumarDias(hoy, -((diaSemanaDe(hoy) + 6) % 7));

  const fetchViajes = useCallback(async () => {
    if (!profile) return;
    const [delDia, abiertos, ultimo, cargas] = await Promise.all([
      supabase.from('viajes').select('*').eq('conductor', profile.id).eq('fecha', hoy).order('salida_at', { ascending: true }),
      supabase.from('viajes').select('*').eq('conductor', profile.id).is('regreso_at', null).limit(1),
      supabase.from('viajes').select('km_salida, km_regreso').eq('conductor', profile.id).order('salida_at', { ascending: false }).limit(1),
      supabase.from('cargas_combustible').select('*').eq('conductor', profile.id).gte('fecha', lunes).order('created_at', { ascending: true }),
    ]);
    setViajesHoy((delDia.data ?? []) as Viaje[]);
    setAbierto(((abiertos.data ?? [])[0] as Viaje | undefined) ?? null);
    const u = (ultimo.data ?? [])[0] as { km_salida: number; km_regreso: number | null } | undefined;
    setUltimoKm(u ? Number(u.km_regreso ?? u.km_salida) : null);
    setGasolinaSemana((cargas.data ?? []) as CargaCombustible[]);
    setLoading(false);
  }, [profile, hoy, lunes]);

  useEffect(() => { void fetchViajes(); }, [fetchViajes]);

  const salir = useCallback(async (datos: { tipo: TipoViaje; km: number; motivo: MotivoViaje | null; motivoSedeId: string | null; motivoDetalle: string }) => {
    if (!profile) return { error: 'Sin usuario' };
    const extra = esViajeExtra(datos.tipo, viajesHoy);
    if (extra && !datos.motivo) return { error: 'Elige por qué haces otro viaje.' };
    const { error } = await supabase.from('viajes').insert({
      conductor: profile.id,
      fecha: hoy,
      tipo: datos.tipo,
      km_salida: datos.km,
      es_extra: extra,
      motivo: extra ? datos.motivo : null,
      motivo_sede_id: extra && datos.motivo === 'lista_tardia' ? datos.motivoSedeId : null,
      motivo_detalle: extra ? (datos.motivoDetalle.trim() || null) : null,
    });
    if (error) return { error: mensaje(error.message) };
    await fetchViajes();
    return { error: null };
  }, [profile, hoy, viajesHoy, fetchViajes]);

  const volver = useCallback(async (km: number) => {
    if (!abierto) return { error: 'No hay un viaje abierto.' };
    const { error } = await supabase.from('viajes').update({ km_regreso: km, regreso_at: new Date().toISOString() }).eq('id', abierto.id);
    if (error) return { error: mensaje(error.message) };
    await fetchViajes();
    return { error: null };
  }, [abierto, fetchViajes]);

  const cargarGasolina = useCallback(async (datos: { monto: number; km: number | null; foto: File | null }) => {
    if (!profile) return { error: 'Sin usuario' };
    let foto_path: string | null = null;
    if (datos.foto) {
      const subida = await subirFotoGasolina(datos.foto, profile.id);
      if (subida.error) return { error: subida.error };
      foto_path = subida.path;
    }
    const { error } = await supabase.from('cargas_combustible').insert({ conductor: profile.id, fecha: hoy, monto: datos.monto, km: datos.km, foto_path });
    if (error) return { error: mensaje(error.message) };
    await fetchViajes();
    return { error: null };
  }, [profile, hoy, fetchViajes]);

  const gastadoSemana = gasolinaSemana.reduce((t, c) => t + Number(c.monto), 0);
  return {
    hoy, viajesHoy, abierto, ultimoKm, loading, gastadoSemana,
    esExtraSiSale: (tipo: TipoViaje) => esViajeExtra(tipo, viajesHoy),
    salir, volver, cargarGasolina, fetchViajes,
  };
}
