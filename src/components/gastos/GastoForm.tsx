import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGastos, validarConstancia } from '@/hooks/useGastos';
import { useCategorias } from '@/hooks/useCategorias';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { useToast } from '@/components/ui/toast';
import { usePresupuestoCaja } from '@/hooks/usePresupuestoCaja';
import { BarraPresupuesto } from '@/components/presupuesto/BarraPresupuesto';
import { mesDe, pasaElTope } from '@/lib/presupuesto';
import { formatMonto } from '@/lib/utils';
import { getTodayLima } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { ChevronDown, FileText, Loader2, Paperclip, Plus, X } from 'lucide-react';
import { Segmentado } from '@/components/ui/segmentado';
import type { GastoFormData, MetodoPago } from '@/types';

interface GastoFormProps {
  onSaved: () => void;
  editData?: GastoFormData & { id: string; constancia_path: string | null };
  onCancelEdit?: () => void;
  /** Categorías más usadas en los gastos de la sede (completan los botones si aún no hay recientes). */
  categoriasFrecuentes?: string[];
}

export function GastoForm({ onSaved, editData, onCancelEdit, categoriasFrecuentes = [] }: GastoFormProps) {
  const { profile } = useAuth();
  const { createGasto, updateGasto } = useGastos();
  const { categorias } = useCategorias();
  const { addToast } = useToast();

  const isOwner = profile?.rol === 'owner';
  const { sedeActiva, sedeId } = useSedeActiva();
  const today = getTodayLima();

  const [form, setForm] = useState<GastoFormData>({
    fecha: editData?.fecha ?? today,
    descripcion: editData?.descripcion ?? '',
    categoria_id: editData?.categoria_id ?? '',
    metodo_pago: editData?.metodo_pago ?? 'efectivo',
    monto: editData?.monto ?? '',
    estado: 'pendiente',
    notas: editData?.notas ?? '',
    con_monto_semanal: editData?.con_monto_semanal ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [motivoTope, setMotivoTope] = useState('');
  const [constanciaFile, setConstanciaFile] = useState<File | null>(null);
  const [eliminarConstancia, setEliminarConstancia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // «Más detalles» (fecha, notas, constancia): plegado al anotar; abierto al editar.
  const [masDetalles, setMasDetalles] = useState(!!editData);
  const montoRef = useRef<HTMLInputElement>(null);

  // Las categorías que más usa esta sede salen como botones (se recuerdan en este navegador).
  const claveRecientes = `yayis:categorias-recientes:${sedeId ?? ''}`;
  const [recientes, setRecientes] = useState<string[]>([]);
  useEffect(() => {
    try { setRecientes(JSON.parse(localStorage.getItem(claveRecientes) ?? '[]') as string[]); } catch { setRecientes([]); }
  }, [claveRecientes]);
  function recordarCategoria(id: string) {
    const lista = [id, ...recientes.filter(x => x !== id)].slice(0, 5);
    setRecientes(lista);
    try { localStorage.setItem(claveRecientes, JSON.stringify(lista)); } catch { /* sin almacenamiento: no pasa nada */ }
  }

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
        con_monto_semanal: editData.con_monto_semanal,
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
        con_monto_semanal: false,
      });
    }
    setConstanciaFile(null);
    setEliminarConstancia(false);
    setMasDetalles(!!editData);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [editData]);

  useEffect(() => {
    if (form.categoria_id && categorias.length > 0 && !categorias.some(c => c.id === form.categoria_id)) {
      setForm(prev => ({ ...prev, categoria_id: '' }));
    }
  }, [categorias, form.categoria_id]);

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

  // Presupuesto: la barra de la categoría del gasto, con este gasto encima (rayado).
  const { uso: usoMes, recargar: recargarPresupuesto } = usePresupuestoCaja(sedeId, mesDe(form.fecha || today));
  const categoriaElegida = categorias.find(c => c.id === form.categoria_id);
  const usoCategoria = categoriaElegida?.categoria_presupuesto
    ? usoMes.find(u => u.categoria === categoriaElegida.categoria_presupuesto)
    : undefined;
  // Al editar, el gasto ya está contado en lo gastado: solo se suma la diferencia.
  const yaContado = editData && editData.categoria_id === form.categoria_id && mesDe(editData.fecha) === mesDe(form.fecha)
    ? parseFloat(editData.monto) || 0 : 0;
  const montoExtra = Math.max(0, (parseFloat(form.monto) || 0) - yaContado);
  const chequeoTope = pasaElTope(usoCategoria, montoExtra);
  const pideMotivo = !!chequeoTope?.pasa && montoExtra > 0;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.descripcion.trim()) return addToast('La descripcion es obligatoria', 'error');
    if (!form.categoria_id) return addToast('Selecciona una categoria', 'error');
    if (!form.monto || parseFloat(form.monto) <= 0) return addToast('El monto debe ser mayor a 0', 'error');
    if (pideMotivo && !motivoTope.trim()) return addToast('Este gasto pasa el tope del presupuesto: escribe por qué', 'error');
    const datos: GastoFormData = { ...form, motivo_sobre_tope: pideMotivo ? motivoTope.trim() : undefined };

    setSaving(true);

    if (editData?.id) {
      // Solo se envía la casilla si cambió.
      const cambios: Partial<GastoFormData> = { ...datos };
      if (form.con_monto_semanal === editData.con_monto_semanal) delete cambios.con_monto_semanal;
      const { error } = await updateGasto(editData.id, cambios, {
        file: constanciaFile,
        pathActual: editData.constancia_path,
        eliminar: eliminarConstancia,
      });
      if (error) addToast(`Error: ${error}`, 'error');
      else {
        addToast('Gasto actualizado', 'success');
        setMotivoTope('');
        recargarPresupuesto();
        onCancelEdit?.();
        onSaved();
      }
    } else {
      const { error } = await createGasto(datos, constanciaFile);
      if (error) addToast(`Error: ${error}`, 'error');
      else {
        addToast('Gasto registrado', 'success');
        recordarCategoria(form.categoria_id);
        setMasDetalles(false);
        montoRef.current?.focus();
        // Keep fecha and metodo_pago, clear rest
        setForm(prev => ({
          fecha: prev.fecha,
          descripcion: '',
          categoria_id: '',
          metodo_pago: prev.metodo_pago,
          monto: '',
          estado: 'pagado',
          notas: '',
          con_monto_semanal: false,
        }));
        clearConstancia();
        setMotivoTope('');
        recargarPresupuesto();
        onSaved();
        // Reload daily summary
        const reloader = (window as unknown as Record<string, unknown>).__reloadResumenDiario;
        if (typeof reloader === 'function') (reloader as () => void)();
      }
    }

    setSaving(false);
  }

  const activas = categorias.filter(c => c.activa);
  const chips = Array.from(new Set([...recientes, ...categoriasFrecuentes])).map(id => activas.find(c => c.id === id)).filter((c): c is NonNullable<typeof c> => !!c).slice(0, 4);
  const resumenDetalles = [
    form.fecha === today ? 'hoy' : form.fecha,
    form.notas.trim() ? `"${form.notas.trim()}"` : 'sin notas',
    constanciaFile || (editData?.constancia_path && !eliminarConstancia) ? 'con constancia' : 'sin constancia',
  ].join(' · ');

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-white p-4 shadow-sm lg:p-6">
      <h2 className="text-lg font-bold text-yayis-dark">{editData ? 'Editar gasto' : 'Anotar un gasto'}</h2>

      {/* Monto y descripción: lo primero que se sabe */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
        <div>
          <label className="text-sm font-medium" htmlFor="monto-gasto">Monto (S/)</label>
          <Input ref={montoRef} id="monto-gasto" type="number" inputMode="decimal" step="0.01" min="0.01" placeholder="0.00"
            value={form.monto} onChange={e => updateField('monto', e.target.value)} required className="mt-1 h-11 text-lg" />
        </div>
        <div>
          <label className="text-sm font-medium" htmlFor="descripcion-gasto">¿En qué se gastó?</label>
          <Input id="descripcion-gasto" placeholder="Ej: gas para el horno" value={form.descripcion}
            onChange={e => updateField('descripcion', e.target.value)} required className="mt-1 h-11" />
        </div>
      </div>

      {/* Categoría: las de siempre a un toque */}
      <div>
        <p className="text-sm font-medium">Categoría</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {chips.map(c => (
            <Button key={c.id} type="button" size="sm" variant={form.categoria_id === c.id ? 'default' : 'outline'} aria-pressed={form.categoria_id === c.id}
              onClick={() => updateField('categoria_id', c.id)} className="h-9">
              {c.nombre}
            </Button>
          ))}
          <Select value={chips.some(c => c.id === form.categoria_id) ? '' : form.categoria_id} onChange={e => e.target.value && updateField('categoria_id', e.target.value)}
            className={`h-9 w-auto min-w-[10rem] flex-1 sm:flex-none ${form.categoria_id && !chips.some(c => c.id === form.categoria_id) ? 'border-yayis-green font-medium' : ''}`}
            aria-label="Categoría">
            <option value="">{chips.length > 0 ? 'Otra…' : 'Elegir categoría…'}</option>
            {activas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
        </div>
      </div>

      {/* Forma de pago */}
      <div>
        <p className="mb-1 text-sm font-medium">¿Cómo se pagó?</p>
        <Segmentado etiqueta="Forma de pago" valor={form.metodo_pago} onCambiar={v => updateField('metodo_pago', v as MetodoPago)}
          opciones={[{ valor: 'efectivo', texto: 'Efectivo' }, { valor: 'cuentas', texto: 'Yape / Plin / transferencia' }]} />
      </div>

      {/* Monto semanal */}
      {(sedeActiva?.monto_semanal_compras ?? 0) > 0 && (
        <label className="flex items-start gap-2 rounded-md bg-yayis-cream/60 px-3 py-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4" checked={form.con_monto_semanal} disabled={saving}
            onChange={e => updateField('con_monto_semanal', e.target.checked)} />
          <span><strong>Lo pagué con el monto semanal</strong> <span className="text-xs text-muted-foreground">(resta de tu saldo semanal; se repone igual)</span></span>
        </label>
      )}

      {/* Presupuesto de la categoría (los topes los aprueba Gerencia en Cash Control) */}
      {usoCategoria?.tope && (
        <div className={`rounded-lg border p-3 ${pideMotivo ? 'border-red-300 bg-red-50/60' : 'bg-yayis-cream'}`}>
          <BarraPresupuesto uso={usoCategoria} extra={montoExtra} etiquetaExtra="este gasto" />
          {pideMotivo && (
            <div className="mt-3">
              <label className="text-sm font-medium text-red-800" htmlFor="motivo-tope">
                Este gasto pasa el tope de {formatMonto(usoCategoria.tope)}. ¿Por qué es necesario? *
              </label>
              <Input id="motivo-tope" placeholder="Ej: se malogró la licuadora y no se puede esperar al próximo mes" value={motivoTope}
                onChange={e => setMotivoTope(e.target.value)} className="mt-1 bg-white" />
              <p className="mt-1 text-xs text-red-700">Se puede registrar igual; Gerencia de Finanzas verá el motivo en sus alertas.</p>
            </div>
          )}
        </div>
      )}

      {/* Más detalles: fecha, notas y constancia */}
      <div>
        <button type="button" onClick={() => setMasDetalles(v => !v)} aria-expanded={masDetalles}
          className="inline-flex flex-wrap items-center gap-1 text-left text-xs text-muted-foreground">
          <span>{resumenDetalles}</span>
          <span className="inline-flex items-center gap-0.5 font-medium text-yayis-green">cambiar <ChevronDown size={12} className={`transition-transform ${masDetalles ? 'rotate-180' : ''}`} /></span>
        </button>
        {masDetalles && (
          <div className="mt-2 grid grid-cols-1 gap-3 rounded-md bg-gray-50 p-3 sm:grid-cols-[10rem_1fr]">
            <div>
              <label className="text-sm font-medium" htmlFor="fecha-gasto">Fecha</label>
              <Input id="fecha-gasto" type="date" value={form.fecha} onChange={e => updateField('fecha', e.target.value)} max={today} className="mt-1 bg-white" />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="notas-gasto">Notas (opcional)</label>
              <Input id="notas-gasto" placeholder="Detalles adicionales..." value={form.notas} onChange={e => updateField('notas', e.target.value)} className="mt-1 bg-white" />
            </div>
            <div className="sm:col-span-2">
              <p className="text-sm font-medium">Constancia (opcional)</p>
              <div className="mt-1 rounded-md border border-dashed border-gray-300 bg-white p-3">
                <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={e => handleConstanciaChange(e.target.files?.[0])} className="sr-only" id="constancia-gasto" disabled={saving} />
                {constanciaFile ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                      <FileText size={18} className="shrink-0 text-yayis-green" />
                      <span className="truncate">{constanciaFile.name}</span>
                    </div>
                    <Button type="button" variant="ghost" size="icon" onClick={clearConstancia} title="Quitar archivo"><X size={16} /></Button>
                  </div>
                ) : editData?.constancia_path && !eliminarConstancia ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm text-yayis-dark"><FileText size={18} className="text-yayis-green" /> Este gasto ya tiene una constancia</span>
                    <div className="flex gap-2">
                      <label htmlFor="constancia-gasto" className="cursor-pointer rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50">Reemplazar</label>
                      <button type="button" onClick={() => setEliminarConstancia(true)} className="px-2 text-sm text-red-600 hover:text-red-700">Eliminar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <label htmlFor="constancia-gasto" className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-gray-50">
                      <Paperclip size={16} className="mr-2" /> Adjuntar constancia
                    </label>
                    <span className="text-xs text-muted-foreground">Foto o PDF, máximo 10 MB</span>
                    {eliminarConstancia && (
                      <button type="button" onClick={() => setEliminarConstancia(false)} className="text-sm text-yayis-green hover:underline">Conservar la constancia anterior</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={saving} className="h-11 flex-1 sm:flex-none">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus size={16} className="mr-2" />}
          {editData ? 'Guardar cambios' : 'Anotar gasto'}
        </Button>
        {editData && onCancelEdit && (
          <Button type="button" variant="outline" onClick={onCancelEdit} className="h-11">Cancelar</Button>
        )}
      </div>
    </form>
  );
}
