import { useState, type FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGastos } from '@/hooks/useGastos';
import { useCategorias } from '@/hooks/useCategorias';
import { useToast } from '@/components/ui/toast';
import { getTodayLima } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { Loader2, Plus } from 'lucide-react';
import type { GastoFormData, MetodoPago, EstadoGasto } from '@/types';

interface GastoFormProps {
  onSaved: () => void;
  editData?: GastoFormData & { id: string };
  onCancelEdit?: () => void;
}

export function GastoForm({ onSaved, editData, onCancelEdit }: GastoFormProps) {
  const { profile } = useAuth();
  const { createGasto, updateGasto } = useGastos();
  const { categorias } = useCategorias();
  const { addToast } = useToast();

  const isOwner = profile?.rol === 'owner';
  const today = getTodayLima();

  const [form, setForm] = useState<GastoFormData>({
    fecha: editData?.fecha ?? today,
    descripcion: editData?.descripcion ?? '',
    categoria_id: editData?.categoria_id ?? '',
    metodo_pago: editData?.metodo_pago ?? 'efectivo',
    monto: editData?.monto ?? '',
    estado: editData?.estado ?? 'pagado',
    notas: editData?.notas ?? '',
  });
  const [saving, setSaving] = useState(false);

  function updateField<K extends keyof GastoFormData>(key: K, value: GastoFormData[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.descripcion.trim()) return addToast('La descripcion es obligatoria', 'error');
    if (!form.categoria_id) return addToast('Selecciona una categoria', 'error');
    if (!form.monto || parseFloat(form.monto) <= 0) return addToast('El monto debe ser mayor a 0', 'error');

    setSaving(true);

    if (editData?.id) {
      const { error } = await updateGasto(editData.id, form);
      if (error) addToast(`Error: ${error}`, 'error');
      else {
        addToast('Gasto actualizado', 'success');
        onCancelEdit?.();
        onSaved();
      }
    } else {
      const { error } = await createGasto(form);
      if (error) addToast(`Error: ${error}`, 'error');
      else {
        addToast('Gasto registrado', 'success');
        // Keep fecha and metodo_pago, clear rest
        setForm(prev => ({
          fecha: prev.fecha,
          descripcion: '',
          categoria_id: '',
          metodo_pago: prev.metodo_pago,
          monto: '',
          estado: 'pagado',
          notas: '',
        }));
        onSaved();
        // Reload daily summary
        const reloader = (window as unknown as Record<string, unknown>).__reloadResumenDiario;
        if (typeof reloader === 'function') (reloader as () => void)();
      }
    }

    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border shadow-sm p-4 lg:p-6">
      <h2 className="text-lg font-bold text-yayis-dark mb-4">
        {editData ? 'Editar Gasto' : 'Registrar Gasto'}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Fecha */}
        <div>
          <label className="text-sm font-medium">Fecha</label>
          <Input
            type="date"
            value={form.fecha}
            onChange={e => updateField('fecha', e.target.value)}
            max={today}
            className="mt-1"
          />
        </div>

        {/* Descripcion */}
        <div className="sm:col-span-2 lg:col-span-2">
          <label className="text-sm font-medium">Descripcion del gasto *</label>
          <Input
            placeholder="Ej: Compra de harina para produccion"
            value={form.descripcion}
            onChange={e => updateField('descripcion', e.target.value)}
            required
            className="mt-1"
          />
        </div>

        {/* Categoria */}
        <div>
          <label className="text-sm font-medium">Categoria *</label>
          <Select
            value={form.categoria_id}
            onChange={e => updateField('categoria_id', e.target.value)}
            required
            className="mt-1"
          >
            <option value="">Seleccionar...</option>
            {categorias.filter(c => c.activa).map(c => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </Select>
        </div>

        {/* Metodo de pago */}
        <div>
          <label className="text-sm font-medium">Metodo de pago</label>
          <Select
            value={form.metodo_pago}
            onChange={e => updateField('metodo_pago', e.target.value as MetodoPago)}
            className="mt-1"
          >
            <option value="efectivo">Efectivo</option>
            <option value="cuentas">Cuentas (Yape/Plin/Transferencia)</option>
          </Select>
        </div>

        {/* Monto */}
        <div>
          <label className="text-sm font-medium">Monto (S/) *</label>
          <Input
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            value={form.monto}
            onChange={e => updateField('monto', e.target.value)}
            required
            className="mt-1"
          />
        </div>

        {/* Estado */}
        <div>
          <label className="text-sm font-medium">Estado</label>
          <Select
            value={form.estado}
            onChange={e => updateField('estado', e.target.value as EstadoGasto)}
            className="mt-1"
          >
            <option value="pagado">Pagado</option>
            <option value="pendiente">Pendiente</option>
          </Select>
        </div>

        {/* Notas */}
        <div className="sm:col-span-2">
          <label className="text-sm font-medium">Notas (opcional)</label>
          <Input
            placeholder="Detalles adicionales..."
            value={form.notas}
            onChange={e => updateField('notas', e.target.value)}
            className="mt-1"
          />
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        <Button type="submit" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus size={16} className="mr-2" />}
          {editData ? 'Guardar Cambios' : 'Registrar Gasto'}
        </Button>
        {editData && onCancelEdit && (
          <Button type="button" variant="outline" onClick={onCancelEdit}>Cancelar</Button>
        )}
      </div>
    </form>
  );
}
