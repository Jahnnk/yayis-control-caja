/** Oficios sugeridos para los técnicos de emergencia (se puede escribir otro). */
export const OFICIOS = [
  'Electricista', 'Gasfitero', 'Refrigeración', 'Máquina de café', 'Gas', 'Hornos', 'Cerrajero', 'Pintor', 'Albañil', 'Internet / sistema',
];

/**
 * Enlace de WhatsApp para un teléfono peruano. 9 dígitos (celular) → se antepone 51.
 * Si ya trae el 51 (11 dígitos) se deja igual. Si no parece un número, null.
 */
export function enlaceWhatsApp(telefono: string | null | undefined): string | null {
  const d = (telefono ?? '').replace(/\D/g, '');
  if (d.length === 9) return `https://wa.me/51${d}`;
  if (d.length === 11 && d.startsWith('51')) return `https://wa.me/${d}`;
  return d.length >= 10 ? `https://wa.me/${d}` : null;
}
