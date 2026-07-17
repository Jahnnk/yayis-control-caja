import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGastos, validarConstancia } from '@/hooks/useGastos';
import { useCategorias } from '@/hooks/useCategorias';
import { useToast } from '@/components/ui/toast';
import { getTodayLima } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { FileText, Loader2, Paperclip, Plus, X } from 'lucide-react';
import type { GastoFormData, MetodoPago } from '@/types';

interface GastoFormProps {
  onSaved: () => void;
  editData?: GastoFormData & { id: string; constancia_path: string | null };
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
    estado: 'pendiente',
    notas: editData?.notas ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [constanciaFile, setConstanciaFile] = useState<File | null>(null);
  const [eliminarConstancia, setEliminarConstancia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update form when editData changes (user clicks edit on a gasto)
  useEffect(() => {
    if (editData) {
      setForm({
        fecha: editData.fecha,
        descripcion: editData.descripcion,
        categoria_id: editData.categoria_id,
        metodo_pago: editData.metodo_pago,
        monto: editData.monto,
        estado: editData.estado,
        notas: editData.notas,
      });
    } else {
      setForm({
        fecha: today,
        descripcion: '',
        categoria_id: '',
        metodo_pago: 'efectivo',
        monto: '',
        estado: 'pagado',
        notas: '',
      });
    }
    setConstanciaFile(null);
    setEliminarConstancia(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [editData]);

  function handleConstanciaChange(file?: File) {
    if (!file) return;
    const error = validarConstancia(file);
    if (error) {
      addToast(error, 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setConstanciaFile(file);
    setEliminarConstancia(false);
  }

  function clearConstancia() {
    setConstanciaFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

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
      const { error } = await updateGasto(editData.id, form, {
        file: constanciaFile,
        pathActual: editData.constancia_path,
        eliminar: eliminarConstancia,
      });
      if (error) addToast(`Error: ${error}`, 'error');
      else {
        addToast('Gasto actualizado', 'success');
        onCancelEdit?.();
        onSaved();
      }
    } else {
      const { error } = await createGasto(form, constanciaFile);
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
        clearConstancia();
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

        {/* Constancia */}
        <div className="sm:col-span-2 lg:col-span-3">
          <label className="text-sm font-medium">Constancia (opcional)</label>
          <div className="mt-1 rounded-md border border-dashed border-gray-300 p-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={e => handleConstanciaChange(e.target.files?.[0])}
              className="sr-only"
              id="constancia-gasto"
              disabled={saving}
            />

            {constanciaFile ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <FileText size={18} className="shrink-0 text-yayis-green" />
                  <span className="truncate">{constanciaFile.name}</span>
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={clearConstancia} title="Quitar archivo">
                  <X size={16} />
                </Button>
              </div>
            ) : editData?.constancia_path && !eliminarConstancia ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm text-yayis-dark">
                  <FileText size={18} className="text-yayis-green" />
                  Este gasto ya tiene una constancia
                </span>
                <div className="flex gap-2">
                  <label htmlFor="constancia-gasto" className="cursor-pointer rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">
                    Reemplazar
                  </label>
                  <button type="button" onClick={() => setEliminarConstancia(true)} className="px-2 text-sm text-red-600 hover:text-red-700">
                    Eliminar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="constancia-gasto" className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50">
                  <Paperclip size={16} className="mr-2" />
                  Adjuntar constancia
                </label>
                <span className="text-xs text-muted-foreground">Foto o PDF, máximo 10 MB</span>
                {eliminarConstancia && (
                  <button type="button" onClick={() => setEliminarConstancia(false)} className="text-sm text-yayis-green hover:underline">
                    Conservar la constancia anterior
                  </button>
                )}
              </div>
            )}
          </div>
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
