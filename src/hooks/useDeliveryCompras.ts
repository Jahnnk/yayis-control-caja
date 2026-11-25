import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { borrarEvidencias, subirEvidencia } from '@/lib/evidencias';
import type { MetodoPago, TipoComprobante } from '@/types';

/**
 * Delivery de compras de la sede activa (24-nov-2026): el delivery tercerizado compra con su plata, el
 * administrador registra lo que trajo y le devuelve. Todo se guarda con funciones de la base (todo o nada):
 * supabase/delivery_de_compras.sql. Reglas de la pantalla: lib/delivery-compras.ts.
 */

export interface Repartidor { id: string; nombre: string; telefono: string | null; precio_carrera: number }

export interface EncargoDetalle {
  id: string;
  fecha: string;
  carreras: number;
  precio_carrera: number;
  total_carreras: number;
  total_compras: number;
  /** Si hubo varias tarifas: el detalle por tramos (si fue una sola, null). */
  detalle_carreras: { cantidad: number; precio: number }[] | null;
  notas: string | null;
  estado: 'por_pagar' | 'pagado';
  metodo_pago: MetodoPago | null;
  fecha_pago: string | null;
  evidencia_pago_path: string | null;
  repartidores: { nombre: string } | null;
  compras: {
    id: string;
    total: number;
    tipo_comprobante: TipoComprobante;
    numero_comprobante: string | null;
    observacion: string | null;
    evidencia_comprobante_path: string | null;
    evidencia_producto_path: string | null;
    proveedores: { nombre: string } | null;
    categorias: { nombre: string } | null;
    compra_items: { cantidad: number; unidad: string; precio_total: number; productos: { nombre: string } | null }[];
  }[];
}

export interface CompraParaGuardar {
  proveedor_id: string;
  categoria_id: string;
  tipo_comprobante: TipoComprobante;
  numero_comprobante: string;
  observacion: string;
  foto: File | null;
  items: { producto_id: string; cantidad: number; unidad: string; precio_total: number; pedido_item_id: string | null }[];
}

const SELECT_ENCARGO = '*, repartidores(nombre), compras(id, total, tipo_comprobante, numero_comprobante, observacion, evidencia_comprobante_path, evidencia_producto_path, proveedores(nombre), categorias(nombre), compra_items(cantidad, unidad, precio_total, productos(nombre)))';

function mensaje(e: { message: string } | null): string {
  if (!e) return 'No se pudo guardar.';
  if (/function .*(registrar_compra_repartidor|pagar_repartidor|anular_encargo_repartidor)|relation .*(repartidores|encargos_repartidor)|schema cache/i.test(e.message)) {
    return 'Falta preparar la base: hay que correr supabase/delivery_de_compras.sql en Supabase.';
  }
  return e.message;
}

export function useDeliveryCompras() {
  const { user } = useAuth();
  const { sedeId } = useSedeActiva();
  const [repartidores, setRepartidores] = useState<Repartidor[]>([]);
  const [encargos, setEncargos] = useState<EncargoDetalle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!sedeId) { setEncargos([]); return; }
    setLoading(true);
    const [r, e] = await Promise.all([
      supabase.from('repartidores').select('id, nombre, telefono, precio_carrera').eq('activo', true).order('nombre'),
      // Todo lo que se debe y lo último pagado.
      supabase.from('encargos_repartidor').select(SELECT_ENCARGO).eq('sede_id', sedeId)
        .order('fecha', { ascending: false }).order('created_at', { ascending: false }).limit(40),
    ]);
    if (r.error || e.error) setError(mensaje(r.error ?? e.error));
    else setError(null);
    setRepartidores(((r.data ?? []) as Repartidor[]).map(x => ({ ...x, precio_carrera: Number(x.precio_carrera) })));
    setEncargos((e.data ?? []) as unknown as EncargoDetalle[]);
    setLoading(false);
  }, [sedeId]);

  useEffect(() => { cargar(); }, [cargar]);

  /** Sube las fotos y guarda todo de una vez. Si la base lo rechaza, borra las fotos subidas. */
  const registrar = useCallback(async (d: {
    repartidorId: string; pedidoId: string | null; fecha: string; carreras: { cantidad: number; precio: number }[]; notas: string;
    compras: CompraParaGuardar[];
  }): Promise<{ error: string | null }> => {
    if (!sedeId || !user) return { error: 'No se pudo identificar tu sede.' };
    const subidas: string[] = [];
    const compras = [];
    for (const c of d.compras) {
      let path: string | null = null;
      if (c.foto) {
        const r = await subirEvidencia(c.foto, sedeId, user.id, 'comprobante-delivery');
        if (r.error || !r.path) { await borrarEvidencias(subidas); return { error: r.error ?? 'No se pudo subir la foto.' }; }
        path = r.path;
        subidas.push(r.path);
      }
      compras.push({
        proveedor_id: c.proveedor_id, categoria_id: c.categoria_id, tipo_comprobante: c.tipo_comprobante,
        numero_comprobante: c.numero_comprobante, observacion: c.observacion,
        evidencia_comprobante_path: c.tipo_comprobante === 'sin_comprobante' ? null : path,
        evidencia_producto_path: c.tipo_comprobante === 'sin_comprobante' ? path : null,
        items: c.items,
      });
    }
    const { error } = await supabase.rpc('registrar_compra_repartidor', {
      p_sede: sedeId, p_repartidor: d.repartidorId, p_pedido: d.pedidoId, p_fecha: d.fecha,
      p_carreras: d.carreras, p_notas: d.notas, p_compras: compras,
    });
    if (error) { await borrarEvidencias(subidas); return { error: mensaje(error) }; }
    await cargar();
    return { error: null };
  }, [sedeId, user, cargar]);

  /** Devolverle la plata: crea los gastos de la rendición. */
  const pagar = useCallback(async (encargoId: string, metodo: MetodoPago, captura: File | null, fecha: string): Promise<{ error: string | null }> => {
    if (!sedeId || !user) return { error: 'No se pudo identificar tu sede.' };
    let path: string | null = null;
    if (captura) {
      const r = await subirEvidencia(captura, sedeId, user.id, 'pago-delivery');
      if (r.error || !r.path) return { error: r.error ?? 'No se pudo subir la captura.' };
      path = r.path;
    }
    const { error } = await supabase.rpc('pagar_repartidor', { p_encargo: encargoId, p_metodo: metodo, p_evidencia: path, p_fecha: fecha });
    if (error) { await borrarEvidencias([path]); return { error: mensaje(error) }; }
    await cargar();
    return { error: null };
  }, [sedeId, user, cargar]);

  /** Otro delivery (el de siempre no pudo: una app u otra persona). Lo puede agregar el administrador. */
  const crearRepartidor = useCallback(async (nombre: string, precioCarrera: number): Promise<{ repartidor: Repartidor | null; error: string | null }> => {
    const limpio = nombre.trim().replace(/\s+/g, ' ');
    if (limpio.length < 2) return { repartidor: null, error: 'Escribe el nombre del delivery.' };
    const ya = repartidores.find(r => r.nombre.toLowerCase() === limpio.toLowerCase());
    if (ya) return { repartidor: ya, error: null };
    const { data, error } = await supabase.from('repartidores')
      .insert({ nombre: limpio, precio_carrera: Math.max(0, precioCarrera || 0) })
      .select('id, nombre, telefono, precio_carrera').single();
    if (error || !data) {
      if (error && /row-level security|policy/i.test(error.message)) return { repartidor: null, error: 'Falta preparar la base: hay que correr supabase/repartidores_admin.sql en Supabase.' };
      return { repartidor: null, error: mensaje(error) };
    }
    const r = { ...(data as Repartidor), precio_carrera: Number((data as Repartidor).precio_carrera) };
    setRepartidores(prev => [...prev, r].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
    return { repartidor: r, error: null };
  }, [repartidores]);

  const anular = useCallback(async (encargo: EncargoDetalle): Promise<{ error: string | null }> => {
    const { error } = await supabase.rpc('anular_encargo_repartidor', { p_encargo: encargo.id });
    if (error) return { error: mensaje(error) };
    await borrarEvidencias(encargo.compras.flatMap(c => [c.evidencia_comprobante_path, c.evidencia_producto_path]));
    await cargar();
    return { error: null };
  }, [cargar]);

  return { repartidores, encargos, loading, error, cargar, registrar, pagar, anular, crearRepartidor };
}
