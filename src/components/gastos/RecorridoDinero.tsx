import { Card, CardContent } from '@/components/ui/card';
import { fechaCorta } from '@/lib/compras';
import { formatMonto, roundTwo } from '@/lib/utils';
import type { SaldoSemanal } from '@/hooks/useSaldoSemanal';

interface Tramo { clave: string; etiqueta: string; monto: number; clase: string; ayuda?: string }

/**
 * Recorrido del dinero de la semana: lo que Gerencia dio, a dónde fue (lo que pagó el administrador y lo que
 * entregó a Compras), cuánto de lo de Compras ya está registrado y cuánto falta justificar.
 */
export function RecorridoDinero({ saldo }: { saldo: SaldoSemanal }) {
  if (saldo.montoSemanal <= 0) return null;
  const { montoSemanal, entregado, pagadoDirecto, sinMarcar, registradoCompras } = saldo;

  const registrado = Math.min(registradoCompras, entregado);
  const faltaJustificar = roundTwo(Math.max(entregado - registradoCompras, 0));
  const comprasPusoPropio = roundTwo(Math.max(registradoCompras - entregado, 0));
  const usado = roundTwo(pagadoDirecto + sinMarcar.total + entregado);
  const libre = roundTwo(Math.max(montoSemanal - usado, 0));
  const excede = roundTwo(Math.max(usado - montoSemanal, 0));
  const base = Math.max(montoSemanal, usado) || 1;

  const tramos: Tramo[] = [
    { clave: 'directo', etiqueta: 'Pagado por ti (marcado)', monto: pagadoDirecto, clase: 'bg-blue-600' },
    { clave: 'sin-marcar', etiqueta: 'Otros gastos tuyos sin marcar', monto: sinMarcar.total, clase: 'bg-blue-300', ayuda: 'Si los pagaste con el monto semanal, márcalos al editarlos.' },
    { clave: 'registrado', etiqueta: 'Compras ya registró', monto: registrado, clase: 'bg-violet-500' },
    { clave: 'justificar', etiqueta: 'Compras falta justificar', monto: faltaJustificar, clase: 'bg-amber-400', ayuda: 'Entregado a Compras que aún no está registrado en compras (o que debe devolver como vuelto).' },
    { clave: 'libre', etiqueta: 'Te queda', monto: libre, clase: 'bg-emerald-300' },
  ];

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="text-sm font-bold text-yayis-dark">Recorrido del dinero de esta semana</p>
          <p className="text-xs text-muted-foreground">Lo que Gerencia te dio (monto semanal) y a dónde fue. Incluye lo marcado de días anteriores que todavía no se repone.</p>
        </div>

        <div className="flex h-6 w-full overflow-hidden rounded-md bg-gray-100" role="img"
          aria-label={tramos.filter(t => t.monto > 0).map(t => `${t.etiqueta}: ${formatMonto(t.monto)}`).join('; ')}>
          {tramos.filter(t => t.monto > 0).map(t => (
            <div key={t.clave} className={t.clase} style={{ width: `${(t.monto / base) * 100}%` }} title={`${t.etiqueta}: ${formatMonto(t.monto)}`} />
          ))}
          {excede > 0 && <div className="bg-red-500" style={{ width: `${(excede / base) * 100}%` }} title={`Te pasaste ${formatMonto(excede)}`} />}
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <p className="flex justify-between border-b py-1 font-medium"><span>Monto semanal (Gerencia)</span><strong>{formatMonto(montoSemanal)}</strong></p>
          <p className="flex justify-between border-b py-1"><span>Entregado a Compras</span><strong>{formatMonto(entregado)}</strong></p>
          {tramos.filter(t => t.clave !== 'libre').map(t => (
            <p key={t.clave} className="flex items-center justify-between gap-2 border-b py-1" title={t.ayuda}>
              <span className="flex items-center gap-1.5"><span className={`inline-block h-2.5 w-2.5 rounded-sm ${t.clase}`} />{t.etiqueta}</span>
              <strong>{formatMonto(t.monto)}</strong>
            </p>
          ))}
          <p className={`flex justify-between py-1 font-bold ${excede > 0 ? 'text-red-600' : 'text-emerald-700'}`}>
            <span>{excede > 0 ? 'Te pasaste del monto semanal' : 'Te queda'}</span>
            <span>{excede > 0 ? `− ${formatMonto(excede)}` : formatMonto(libre)}</span>
          </p>
        </div>

        {faltaJustificar > 0 && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Compras recibió <strong>{formatMonto(entregado)}</strong> y ya registró <strong>{formatMonto(registradoCompras)}</strong>: faltan <strong>{formatMonto(faltaJustificar)}</strong> por justificar,
            ya sea registrando las compras que faltan o devolviendo el vuelto.
          </p>
        )}
        {comprasPusoPropio > 0 && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            Compras registró <strong>{formatMonto(comprasPusoPropio)}</strong> más de lo que recibió: lo puso de su bolsillo y se le debe devolver.
          </p>
        )}
        {sinMarcar.total > 0 && (
          <details className="rounded-md border bg-white text-xs">
            <summary className="cursor-pointer list-none px-3 py-2 font-medium text-blue-800">
              {formatMonto(sinMarcar.total)} de tus gastos de esta semana no están marcados como «pagados con el monto semanal» ({sinMarcar.gastos.length}) — ver cuáles
            </summary>
            <div className="divide-y border-t">
              {sinMarcar.gastos.map(g => (
                <div key={g.id} className="flex flex-wrap items-center gap-x-3 px-3 py-1.5">
                  <span className="w-20 capitalize text-muted-foreground">{fechaCorta(g.fecha)}</span>
                  <span className="min-w-[8rem] flex-1">{g.descripcion}</span>
                  <span className="font-medium">{formatMonto(g.monto)}</span>
                </div>
              ))}
              <p className="px-3 py-2 text-muted-foreground">
                Si esos gastos salieron de los S/ {montoSemanal.toLocaleString('es-PE')} semanales, edítalos (botón del lápiz) y marca <strong>«Lo pagué con el monto semanal»</strong>.
                Si salieron de la caja chica, déjalos así.
              </p>
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
