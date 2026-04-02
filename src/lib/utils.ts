import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMonto(monto: number): string {
  return `S/ ${monto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function roundTwo(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function parseNumericInput(value: string): number {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : roundTwo(parsed);
}
