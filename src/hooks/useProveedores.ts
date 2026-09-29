import { useCallback, useEffect, useState } from 'react';
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
}

function mensajeError(message: string): string {
  if (message.includes('proveedores_nombre_unico')) return 'Ya existe un proveedor con ese nombre';
  return message;
}

export function useProveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
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
