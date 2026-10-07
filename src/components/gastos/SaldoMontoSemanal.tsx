import type { ReactNode } from 'react';
import { formatMonto } from '@/lib/utils';
import type { SaldoSemanal } from '@/hooks/useSaldoSemanal';

/** Franja con el saldo del monto semanal de la sede (se ve en Registro de Gastos y en Dinero de la semana). */
export function SaldoMontoSemanal({ saldo, children }: { saldo: SaldoSemanal; children?: ReactNode }) {
  if (saldo.montoSemanal <= 0) return null;
  return (
    <div className="rounded-lg border bg-yayis-cream px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <span>Monto semanal: <strong>{formatMonto(saldo.montoSemanal)}</strong></span>
        <span>− Entregado a Compras: <strong>{formatMonto(saldo.entregado)}</strong></span>
        <span>− Pagado por ti: <strong>{formatMonto(saldo.pagadoDirecto)}</strong></span>
        <span className={saldo.queda < 0 ? 'font-bold text-red-600' : 'text-yayis-dark'}>
          = Te queda: <strong className="text-base">{formatMonto(saldo.queda)}</strong>
        </span>
        {children}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        De lunes a hoy (y lo marcado antes que sigue sin reponer). «Pagado por ti» son los gastos que marcas como «Lo pagué con el monto semanal»; igual se reponen.
        {saldo.queda < 0 && <span className="font-medium text-red-600"> Ya te pasaste del monto semanal.</span>}
      </p>
    </div>
  );
}
