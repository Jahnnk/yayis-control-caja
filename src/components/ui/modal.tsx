import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Barra fija abajo (total, qué falta y el botón principal): siempre a la vista mientras se baja. */
  footer?: ReactNode;
  /** En el celular ocupa toda la pantalla (formularios largos que se llenan en la calle). */
  pantallaCompletaEnCelular?: boolean;
}

/** Ventana superpuesta para formularios largos. Se cierra con la X o con la tecla Escape. */
export function Modal({ open, title, onClose, children, footer, pantallaCompletaEnCelular }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const alPresionar = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [open, onClose]);

  if (!open) return null;
  const completa = !!pantallaCompletaEnCelular;
  return (
    <div className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 sm:items-center sm:p-4 ${completa ? 'p-0' : 'p-4'}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className={`w-full max-w-2xl bg-white shadow-xl sm:my-4 sm:rounded-lg ${completa ? 'min-h-full sm:min-h-0' : 'my-4 rounded-lg'}`}>
        <div className={`flex items-center justify-between border-b px-5 py-3 ${completa ? 'sticky top-0 z-10 bg-white sm:static' : ''}`}>
          <h3 className="text-lg font-bold text-yayis-dark">{title}</h3>
          <button onClick={onClose} className="-mr-1 p-1 text-muted-foreground hover:text-yayis-dark" aria-label="Cerrar"><X size={22} /></button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
        {footer && (
          <div className="sticky bottom-0 z-10 border-t bg-white/95 px-4 py-3 backdrop-blur sm:rounded-b-lg sm:px-5">{footer}</div>
        )}
      </div>
    </div>
  );
}
