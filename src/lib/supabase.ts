import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Borra la sesion guardada localmente (por si quedo un token corrupto que
 * traba la verificacion de sesion al abrir la app) y recarga en /login.
 * No requiere red: solo limpia localStorage, no toca datos del servidor.
 */
export function clearLocalSessionAndReload() {
  Object.keys(localStorage)
    .filter(k => k.startsWith('sb-'))
    .forEach(k => localStorage.removeItem(k));
  window.location.href = '/login';
}
