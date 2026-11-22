/**
 * Puerta única de Yayi's (22-nov-2026, pedido de Jahnn): botón «Inicio» que vuelve a la página con todas las apps
 * en Cash Control. Solo aparece para quien llegó desde esa puerta (el enlace trae `?desde=puerta`), porque solo
 * esas personas tienen cuenta allí. La marca vive en este navegador; no es seguridad, solo decide si mostrar el botón.
 */

export const URL_INICIO_PUERTA =
  (import.meta.env.VITE_PUERTA_URL as string | undefined) ?? 'https://cash-control-delta.vercel.app/inicio';

const CLAVE = 'yayis_puerta';

/** Se llama una vez al cargar la app: si el enlace vino de la puerta, lo recuerda y limpia la dirección. */
export function recordarSiVieneDeLaPuerta(): void {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get('desde') !== 'puerta') return;
    localStorage.setItem(CLAVE, '1');
    url.searchParams.delete('desde');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch {
    /* navegador sin almacenamiento: sin botón */
  }
}

export function vinoDeLaPuerta(): boolean {
  try {
    return localStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
}
