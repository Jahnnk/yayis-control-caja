import { useRef, useState } from 'react';
import { Camera, FileText, X } from 'lucide-react';
import { validarEvidencia } from '@/lib/evidencias';
import { CamaraModal } from '@/components/compras/CamaraModal';
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
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  // Con cámara integrada no se sale de la página (el celular no recarga ni se pierde lo escrito).
  const hayCamara = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

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
        {...(hayCamara ? {} : { capture: 'environment' as const })}
        className="sr-only"
        onChange={e => elegir(e.target.files?.[0])}
      />
      {archivo ? (
        <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2"><FileText size={16} className="shrink-0 text-emerald-600" /><span className="truncate">{archivo.name}</span></span>
          <button type="button" onClick={() => { onChange(null); if (ref.current) ref.current.value = ''; }} aria-label={`Quitar ${label}`} className="text-muted-foreground hover:text-red-600"><X size={16} /></button>
        </div>
      ) : (
        <div className="mt-1 flex flex-wrap gap-2">
          {hayCamara && (
            <button type="button" onClick={() => setCamaraAbierta(true)}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm hover:bg-gray-50 ${requerido ? 'border-amber-400 text-amber-800' : 'border-gray-300 text-muted-foreground'}`}>
              <Camera size={16} /> Tomar foto
            </button>
          )}
          <label htmlFor={id} className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm hover:bg-gray-50 ${requerido ? 'border-amber-400 text-amber-800' : 'border-gray-300 text-muted-foreground'}`}>
            <FileText size={16} /> {hayCamara ? 'Elegir de la galería' : 'Tomar o elegir foto'}
          </label>
        </div>
      )}
      {camaraAbierta && (
        <CamaraModal
          titulo={label}
          onCerrar={() => setCamaraAbierta(false)}
          onFoto={file => { setCamaraAbierta(false); elegir(file); }}
          onSinCamara={motivo => {
            setCamaraAbierta(false);
            addToast(`${motivo} Usa «Elegir de la galería».`, 'warning');
          }}
        />
      )}
    </div>
  );
}
