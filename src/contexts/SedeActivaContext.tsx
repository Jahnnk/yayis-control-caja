import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Sede } from '@/types';

interface SedeActivaState {
  /** Sede con la que se trabaja en todas las pantallas. */
  sedeId: string | null;
  sedeActiva: Sede | null;
  /** Sedes activas que el usuario puede elegir (solo gerencia ve mas de una). */
  sedes: Sede[];
  puedeCambiarSede: boolean;
  cambiarSede: (id: string) => void;
  /** Nombre del administrador que maneja la caja de la sede activa. */
  responsable: string | null;
  recargarSedes: () => Promise<void>;
}

const SedeActivaContext = createContext<SedeActivaState | undefined>(undefined);

const STORAGE_KEY = 'yayis.sedeActiva';

function leerGuardada(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

function guardar(id: string) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* sin almacenamiento: solo se pierde la preferencia */ }
}

export function SedeActivaProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [sedeId, setSedeId] = useState<string | null>(null);
  const [responsable, setResponsable] = useState<string | null>(null);

  const esGerencia = profile?.rol === 'owner';

  const recargarSedes = useCallback(async () => {
    const { data, error } = await supabase
      .from('sedes')
      .select('*')
      .eq('activa', true)
      .order('nombre');
    if (error) {
      console.error('Error cargando sedes:', error);
      return;
    }
    setSedes((data ?? []) as Sede[]);
  }, []);

  useEffect(() => {
    if (!profile) {
      setSedes([]);
      setSedeId(null);
      return;
    }
    recargarSedes();
  }, [profile, recargarSedes]);

  // Elegir la sede inicial: gerencia recuerda la ultima que uso; el resto usa la suya.
  useEffect(() => {
    if (!profile) return;
    if (!esGerencia) {
      setSedeId(profile.sede_id);
      return;
    }
    if (sedes.length === 0) return;
    setSedeId(actual => {
      if (actual && sedes.some(s => s.id === actual)) return actual;
      const guardada = leerGuardada();
      if (guardada && sedes.some(s => s.id === guardada)) return guardada;
      if (profile.sede_id && sedes.some(s => s.id === profile.sede_id)) return profile.sede_id;
      return sedes[0]?.id ?? null;
    });
  }, [profile, esGerencia, sedes]);

  // Quien maneja la caja de la sede (para mostrar "Caja de Sol", "Reposiciones a Chari", etc.)
  useEffect(() => {
    if (!sedeId) {
      setResponsable(null);
      return;
    }
    let cancelado = false;
    supabase
      .from('profiles')
      .select('nombre')
      .eq('sede_id', sedeId)
      .eq('rol', 'admin')
      .eq('activo', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .then(({ data }) => {
        if (!cancelado) setResponsable(data?.[0]?.nombre ?? null);
      });
    return () => { cancelado = true; };
  }, [sedeId]);

  const cambiarSede = useCallback((id: string) => {
    if (!esGerencia) return;
    setSedeId(id);
    guardar(id);
  }, [esGerencia]);

  const sedeActiva = sedes.find(s => s.id === sedeId) ?? null;

  return (
    <SedeActivaContext.Provider value={{
      sedeId,
      sedeActiva,
      sedes,
      puedeCambiarSede: esGerencia && sedes.length > 1,
      cambiarSede,
      responsable,
      recargarSedes,
    }}>
      {children}
    </SedeActivaContext.Provider>
  );
}

export function useSedeActiva() {
  const ctx = useContext(SedeActivaContext);
  if (!ctx) throw new Error('useSedeActiva debe usarse dentro de SedeActivaProvider');
  return ctx;
}
