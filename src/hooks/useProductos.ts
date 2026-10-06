import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Producto } from '@/types';

/** Nombre de producto como se guarda: sin espacios de más y en MAYÚSCULAS. */
export function nombreDeProducto(nombre: string): string {
  return nombre.trim().replace(/\s+/g, ' ').toLocaleUpperCase('es-PE');
}

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
    // Los nombres del catálogo van siempre en MAYÚSCULAS (la base también lo hace cumplir).
    const limpio = nombreDeProducto(nombre);
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
    const { error } = await supabase.from('productos')
      .update(cambios.nombre !== undefined ? { ...cambios, nombre: nombreDeProducto(cambios.nombre) } : cambios).eq('id', id);
    if (error) return { error: error.message.includes('productos_nombre_unico') ? 'Ya existe un producto con ese nombre' : error.message };
    await fetchProductos();
    return { error: null };
  }, [fetchProductos]);

  /**
   * Recuerda el proveedor habitual de un producto (lo puede hacer el administrador, Compras y Gerencia).
   * Se actualiza la lista local para que el siguiente producto que se agregue ya salga con su proveedor.
   */
  const recordarProveedor = useCallback(async (productoId: string, proveedorId: string) => {
    const { error } = await supabase.rpc('recordar_proveedor_producto', { p_producto: productoId, p_proveedor: proveedorId });
    if (error) return { error: error.message };
    setProductos(prev => prev.map(p => (p.id === productoId ? { ...p, proveedor_id: proveedorId } : p)));
    return { error: null };
  }, []);

  /** Recuerda la unidad habitual de un producto (administradores, Compras y Gerencia). */
  const recordarUnidad = useCallback(async (productoId: string, unidad: string) => {
    const { error } = await supabase.rpc('recordar_unidad_producto', { p_producto: productoId, p_unidad: unidad });
    if (error) return { error: error.message };
    setProductos(prev => prev.map(p => (p.id === productoId ? { ...p, unidad } : p)));
    return { error: null };
  }, []);

  /** Recuerda la categoría del presupuesto de un producto (para estimar las listas por categoría). */
  const recordarCategoria = useCallback(async (productoId: string, categoria: string | null) => {
    const { error } = await supabase.rpc('recordar_categoria_producto', { p_producto: productoId, p_categoria: categoria });
    if (error) return { error: error.message };
    setProductos(prev => prev.map(p => (p.id === productoId ? { ...p, categoria_presupuesto: categoria } : p)));
    return { error: null };
  }, []);

  return { productos, loading, fetchProductos, obtenerOCrear, actualizarProducto, recordarProveedor, recordarUnidad, recordarCategoria };
}
