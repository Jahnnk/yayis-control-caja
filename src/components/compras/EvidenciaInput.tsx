import { useRef } from 'react';
import { Camera, FileText, X } from 'lucide-react';
import { validarEvidencia } from '@/lib/evidencias';
import { useToast } from '@/components/ui/toast';

interface Props {
  id: string;
  label: string;
  archivo: File | null;
  onChange: (file: File | null) => void;
  requerido?: boolean;
}

/** Botón para tomar o elegir una foto (en el celular abre la cámara). */
export function EvidenciaInput({ id, label, archivo, onChange, requerido }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  function elegir(file?: File) {
    if (!file) return;
    const error = validarEvidencia(file);
    if (error) {
      addToast(error, 'error');
      if (ref.current) ref.current.value = '';
      return;
    }
    onChange(file);
  }

  return (
    <div>
      <p className="text-xs font-medium">{label}{requerido && <span className="text-red-600"> *</span>}</p>
      <input
        ref={ref}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        capture="environment"
        className="sr-only"
        onChange={e => elegir(e.target.files?.[0])}
      />
      {archivo ? (
        <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2"><FileText size={16} className="shrink-0 text-emerald-600" /><span className="truncate">{archivo.name}</span></span>
          <button type="button" onClick={() => { onChange(null); if (ref.current) ref.current.value = ''; }} aria-label={`Quitar ${label}`} className="text-muted-foreground hover:text-red-600"><X size={16} /></button>
        </div>
      ) : (
        <label htmlFor={id} className={`mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm hover:bg-gray-50 ${requerido ? 'border-amber-400 text-amber-800' : 'border-gray-300 text-muted-foreground'}`}>
          <Camera size={16} /> Tomar o elegir foto
        </label>
      )}
    </div>
  );
}
