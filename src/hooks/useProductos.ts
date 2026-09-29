import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Producto } from '@/types';

export function useProductos() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchProductos = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('productos').select('*').order('nombre');
    if (error) console.error('Error cargando productos:', error);
    else setProductos((data ?? []) as Producto[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchProductos(); }, [fetchProductos]);

  /**
   * Devuelve el producto del catalogo con ese nombre (sin importar mayusculas),
   * y si no existe lo crea. Asi el catalogo se arma solo a medida que se pide.
   */
  const obtenerOCrear = useCallback(async (nombre: string, unidad: string) => {
    const limpio = nombre.trim().replace(/\s+/g, ' ');
    const existente = productos.find(p => p.nombre.toLowerCase() === limpio.toLowerCase());
    if (existente) return { producto: existente, error: null };

    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from('productos')
      .insert({ nombre: limpio, unidad, creado_por: auth.user?.id ?? null })
      .select('*')
      .single();

    if (error) {
      // Otro usuario lo pudo crear hace un momento: se busca y se reutiliza.
      if (error.message.includes('productos_nombre_unico')) {
        const { data: ya } = await supabase.from('productos').select('*').ilike('nombre', limpio).maybeSingle();
        if (ya) {
          await fetchProductos();
          return { producto: ya as Producto, error: null };
        }
      }
      return { producto: null, error: error.message };
    }
    await fetchProductos();
    return { producto: data as Producto, error: null };
  }, [productos, fetchProductos]);

  const actualizarProducto = useCallback(async (id: string, cambios: { unidad?: string; proveedor_id?: string | null; nombre?: string; activo?: boolean }) => {
    const { error } = await supabase.from('productos').update(cambios).eq('id', id);
    if (error) return { error: error.message.includes('productos_nombre_unico') ? 'Ya existe un producto con ese nombre' : error.message };
    await fetchProductos();
    return { error: null };
  }, [fetchProductos]);

  return { productos, loading, fetchProductos, obtenerOCrear, actualizarProducto };
}
