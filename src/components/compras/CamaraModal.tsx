import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LADO_MAXIMO = 1600; // las fotos del celular pesan 5-8 MB; así quedan en unos 300-600 KB

/**
 * Cámara dentro de la propia página. Abrir la app de cámara del celular obliga al navegador a segundo plano
 * y en celulares con poca memoria recarga la página (se perdía todo lo escrito y la foto). Aquí no se sale de la página.
 */
export function CamaraModal({ titulo, onFoto, onCerrar, onSinCamara }: {
  titulo: string;
  onFoto: (archivo: File) => void;
  onCerrar: () => void;
  /** La cámara no se pudo usar (sin permiso, sin cámara): quien llama usa el método de siempre. */
  onSinCamara: (motivo: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [lista, setLista] = useState(false);

  useEffect(() => {
    let cancelado = false;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false })
      .then(stream => {
        if (cancelado) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          void video.play().then(() => setLista(true)).catch(() => onSinCamara('No se pudo iniciar la cámara.'));
        }
      })
      .catch(err => onSinCamara(err?.name === 'NotAllowedError' ? 'No diste permiso para usar la cámara.' : 'No se pudo abrir la cámara.'));
    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
    // Se abre una sola vez al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tomar() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const escala = Math.min(1, LADO_MAXIMO / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * escala);
    canvas.height = Math.round(video.videoHeight * escala);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
      if (!blob) return onSinCamara('No se pudo tomar la foto.');
      onFoto(new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.85);
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <p className="text-sm font-medium">{titulo}</p>
        <button type="button" onClick={onCerrar} aria-label="Cerrar cámara"><X size={22} /></button>
      </div>
      <video ref={videoRef} playsInline muted className="min-h-0 flex-1 bg-black object-contain" />
      <div className="flex items-center justify-center gap-4 px-4 py-5">
        <Button type="button" variant="outline" onClick={onCerrar}>Cancelar</Button>
        <Button type="button" size="lg" onClick={tomar} disabled={!lista} className="gap-2">
          <Camera size={18} /> Tomar foto
        </Button>
      </div>
    </div>
  );
}
