import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { CondicionPago, Proveedor } from '@/types';

export interface ProveedorInput {
  nombre: string;
  telefono?: string | null;
  direccion?: string | null;
  condicion_pago?: CondicionPago;
  dias_credito?: number;
  notas?: string | null;
  activo?: boolean;
  tipo?: 'proveedor' | 'tecnico';
  oficio?: string | null;
}

export const esTecnico = (p: Pick<Proveedor, 'tipo'>) => p.tipo === 'tecnico';

function mensajeError(message: string): string {
  if (message.includes('proveedores_nombre_unico')) return 'Ya existe un contacto con ese nombre';
  if (/column .*(tipo|oficio)/i.test(message)) return 'Falta activar los técnicos: hay que correr supabase/tecnicos.sql en Supabase.';
  return message;
}

/**
 * Proveedores para compras, listas y precios. Los técnicos (electricista, gasfitero…) quedan fuera,
 * salvo con `incluirTecnicos` (pantalla Proveedores y el proveedor opcional de un gasto).
 */
export function useProveedores({ incluirTecnicos = false }: { incluirTecnicos?: boolean } = {}) {
  const [todos, setProveedores] = useState<Proveedor[]>([]);
  const proveedores = useMemo(() => (incluirTecnicos ? todos : todos.filter(p => !esTecnico(p))), [todos, incluirTecnicos]);
  const [loading, setLoading] = useState(false);

  const fetchProveedores = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('proveedores').select('*').order('nombre');
    if (error) console.error('Error cargando proveedores:', error);
    else setProveedores((data ?? []) as Proveedor[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchProveedores(); }, [fetchProveedores]);

  const crearProveedor = useCallback(async (input: ProveedorInput) => {
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('proveedores')
      .insert({ ...input, nombre: input.nombre.trim(), creado_por: auth.user?.id ?? null })
      .select('*')
      .single();
    if (error) return { proveedor: null, error: mensajeError(error.message) };
    await fetchProveedores();
    return { proveedor: data as Proveedor, error: null };
  }, [fetchProveedores]);

  const actualizarProveedor = useCallback(async (id: string, cambios: Partial<ProveedorInput>) => {
    const { error } = await supabase.from('proveedores').update(cambios).eq('id', id);
    if (error) return { error: mensajeError(error.message) };
    await fetchProveedores();
    return { error: null };
  }, [fetchProveedores]);

  return { proveedores, loading, fetchProveedores, crearProveedor, actualizarProveedor };
}
