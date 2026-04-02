import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export function getTodayLima(): string {
  const now = new Date();
  const limaOffset = -5 * 60;
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const lima = new Date(utc + limaOffset * 60000);
  return format(lima, 'yyyy-MM-dd');
}

export function calcularSemana(fecha: string): number {
  const d = new Date(fecha + 'T00:00:00');
  const primerDia = new Date(d.getFullYear(), d.getMonth(), 1);
  const dowPrimerDia = primerDia.getDay(); // 0=domingo

  let finSemana1: Date;
  if (dowPrimerDia === 0) {
    finSemana1 = new Date(primerDia);
  } else {
    finSemana1 = new Date(primerDia);
    finSemana1.setDate(primerDia.getDate() + (7 - dowPrimerDia));
  }

  if (d <= finSemana1) return 1;

  const diasDesdeSemana2 = Math.floor(
    (d.getTime() - finSemana1.getTime()) / (1000 * 60 * 60 * 24)
  ) - 1;
  return 2 + Math.floor(diasDesdeSemana2 / 7);
}

export function getMesLabel(fecha: string): string {
  const d = new Date(fecha + 'T12:00:00');
  const label = format(d, 'MMMM yyyy', { locale: es });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function getSemanasDelMes(anio: number, mes: number): { semana: number; inicio: string; fin: string }[] {
  const primerDia = new Date(anio, mes - 1, 1);
  const ultimoDia = new Date(anio, mes, 0);
  const semanas: { semana: number; inicio: string; fin: string }[] = [];

  const dowPrimerDia = primerDia.getDay();
  let finSemana1: Date;
  if (dowPrimerDia === 0) {
    finSemana1 = new Date(primerDia);
  } else {
    finSemana1 = new Date(primerDia);
    finSemana1.setDate(primerDia.getDate() + (7 - dowPrimerDia));
    if (finSemana1 > ultimoDia) finSemana1 = new Date(ultimoDia);
  }

  semanas.push({
    semana: 1,
    inicio: format(primerDia, 'yyyy-MM-dd'),
    fin: format(finSemana1, 'yyyy-MM-dd'),
  });

  let inicioSiguiente = new Date(finSemana1);
  inicioSiguiente.setDate(finSemana1.getDate() + 1);
  let numSemana = 2;

  while (inicioSiguiente <= ultimoDia) {
    const finSemana = new Date(inicioSiguiente);
    finSemana.setDate(inicioSiguiente.getDate() + 6);
    if (finSemana > ultimoDia) finSemana.setTime(ultimoDia.getTime());

    semanas.push({
      semana: numSemana,
      inicio: format(inicioSiguiente, 'yyyy-MM-dd'),
      fin: format(finSemana, 'yyyy-MM-dd'),
    });

    inicioSiguiente = new Date(finSemana);
    inicioSiguiente.setDate(finSemana.getDate() + 1);
    numSemana++;
  }

  return semanas;
}

export function getMesesDisponibles(): { label: string; anio: number; mes: number }[] {
  const meses: { label: string; anio: number; mes: number }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const label = format(d, 'MMMM yyyy', { locale: es });
    meses.push({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      anio: d.getFullYear(),
      mes: d.getMonth() + 1,
    });
  }
  return meses;
}
