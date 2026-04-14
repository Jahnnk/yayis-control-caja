import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { calcularSemana, getMesLabel } from '@/lib/dates';
import type { GastoConCategoria, GastoFormData } from '@/types';

export function useGastos() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [gastos, setGastos] = useState<GastoConCategoria[]>([]);
  const [total, setTotal] = useState(0);

  const fetchGastos = useCallback(async (filters?: {
    fecha?: string;
    semana?: number;
    mes?: string;
    categoria_id?: string;
    metodo_pago?: string;
    estado?: string;
    busqueda?: string;
    page?: number;
    pageSize?: number;
  }) => {
    if (!profile) return;
    setLoading(true);

    const page = filters?.page ?? 0;
    const pageSize = filters?.pageSize ?? 20;
    const from = page * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('gastos')
      .select('*, categorias(nombre), profiles(nombre)', { count: 'exact' })
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });

    if (profile.rol !== 'owner' && profile.sede_id) {
      query = query.eq('sede_id', profile.sede_id);
    }

    if (filters?.fecha) query = query.eq('fecha', filters.fecha);
    if (filters?.semana !== undefined && filters?.mes) {
      query = query.eq('semana', filters.semana).eq('mes', filters.mes);
    }
    if (filters?.categoria_id) query = query.eq('categoria_id', filters.categoria_id);
    if (filters?.metodo_pago) query = query.eq('metodo_pago', filters.metodo_pago);
    if (filters?.estado) query = query.eq('estado', filters.estado);
    if (filters?.busqueda) query = query.ilike('descripcion', `%${filters.busqueda}%`);

    query = query.range(from, to);

    const { data, count, error } = await query;
    if (error) {
      console.error('Error fetching gastos:', error);
    } else {
      setGastos((data ?? []) as GastoConCategoria[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  }, [profile]);

  const createGasto = useCallback(async (formData: GastoFormData) => {
    if (!profile?.sede_id) return { error: 'Sin sede asignada' };

    const semana = calcularSemana(formData.fecha);
    const mes = getMesLabel(formData.fecha);

    // Get next numero_registro
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('get_next_numero_registro', {
        p_fecha: formData.fecha,
        p_sede_id: profile.sede_id,
      });

    if (rpcError) return { error: rpcError.message };

    const { error } = await supabase.from('gastos').insert({
      numero_registro: rpcData as number,
      fecha: formData.fecha,
      descripcion: formData.descripcion.trim(),
      categoria_id: formData.categoria_id,
      metodo_pago: formData.metodo_pago,
      monto: parseFloat(formData.monto),
      estado: 'pendiente' as const,
      notas: formData.notas.trim() || null,
      semana,
      mes,
      sede_id: profile.sede_id,
      registrado_por: profile.id,
    });

    if (error) return { error: error.message };
    return { error: null };
  }, [profile]);

  const updateGasto = useCallback(async (id: string, formData: Partial<GastoFormData>) => {
    const updates: Record<string, unknown> = {};
    if (formData.descripcion !== undefined) updates.descripcion = formData.descripcion.trim();
    if (formData.categoria_id !== undefined) updates.categoria_id = formData.categoria_id;
    if (formData.metodo_pago !== undefined) updates.metodo_pago = formData.metodo_pago;
    if (formData.monto !== undefined) updates.monto = parseFloat(formData.monto);
    if (formData.estado !== undefined) updates.estado = formData.estado;
    if (formData.notas !== undefined) updates.notas = formData.notas.trim() || null;

    if (formData.fecha !== undefined) {
      updates.fecha = formData.fecha;
      updates.semana = calcularSemana(formData.fecha);
      updates.mes = getMesLabel(formData.fecha);
    }

    const { error } = await supabase.from('gastos').update(updates).eq('id', id);
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const deleteGasto = useCallback(async (id: string) => {
    const { error } = await supabase.from('gastos').delete().eq('id', id);
    if (error) return { error: error.message };
    return { error: null };
  }, []);

  const fetchResumenDiario = useCallback(async (fecha: string) => {
    if (!profile?.sede_id) return { efectivo: 0, cuentas: 0, total: 0 };

    const { data } = await supabase
      .from('gastos')
      .select('metodo_pago, monto')
      .eq('sede_id', profile.sede_id)
      .eq('fecha', fecha);

    let efectivo = 0;
    let cuentas = 0;
    for (const g of data ?? []) {
      const monto = Number(g.monto);
      if (g.metodo_pago === 'efectivo') efectivo += monto;
      else cuentas += monto;
    }

    return {
      efectivo: Math.round(efectivo * 100) / 100,
      cuentas: Math.round(cuentas * 100) / 100,
      total: Math.round((efectivo + cuentas) * 100) / 100,
    };
  }, [profile]);

  return {
    gastos,
    total,
    loading,
    fetchGastos,
    createGasto,
    updateGasto,
    deleteGasto,
    fetchResumenDiario,
  };
}
