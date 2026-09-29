import { supabase } from '@/lib/supabase';
import { validarConstancia } from '@/hooks/useGastos';

// Las evidencias de compras van al mismo almacenamiento privado que las constancias de gastos,
// en la carpeta de la sede. Asi el gasto que nace de una compra muestra la misma foto.
const BUCKET = 'constancias-gastos';

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export { validarConstancia as validarEvidencia };

export async function subirEvidencia(file: File, sedeId: string, userId: string, tipo: string) {
  const error = validarConstancia(file);
  if (error) return { path: null, error };
  const path = `${sedeId}/${userId}/compras/${tipo}-${crypto.randomUUID()}.${EXTENSION[file.type]}`;
  const { error: errSubida } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (errSubida) return { path: null, error: `No se pudo subir la foto: ${errSubida.message}` };
  return { path, error: null };
}

export async function borrarEvidencias(paths: (string | null | undefined)[]) {
  const validos = paths.filter((p): p is string => !!p);
  if (validos.length > 0) await supabase.storage.from(BUCKET).remove(validos);
}

/**
 * Abre una evidencia en una pestaña nueva. La pestaña se abre antes de pedir el enlace privado
 * para que el navegador no la bloquee como ventana emergente.
 */
export async function abrirEvidencia(path: string): Promise<string | null> {
  const ventana = window.open('', '_blank');
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data) {
    ventana?.close();
    return `No se pudo abrir la foto: ${error?.message ?? 'archivo no disponible'}`;
  }
  if (!ventana) return 'El navegador bloqueó la ventana. Habilita las ventanas emergentes e inténtalo de nuevo.';
  ventana.opener = null;
  ventana.location.href = data.signedUrl;
  return null;
}
