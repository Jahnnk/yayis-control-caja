import { fechaCorta } from '@/lib/compras';
import { formatMonto, roundTwo } from '@/lib/utils';
import type { CompraDeCompras, SinRendir } from '@/hooks/useConsolidadoReposicion';

/** Filas de compras (fecha, proveedor, total) de una lista. */
function FilasCompras({ compras }: { compras: CompraDeCompras[] }) {
  return (
    <div className="divide-y rounded-md border bg-white text-sm">
      {compras.map(c => (
        <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
          <span className="w-24 capitalize text-muted-foreground">{fechaCorta(c.fecha)}</span>
          <span className="min-w-[8rem] flex-1 font-medium">{c.proveedor}</span>
          {c.evidenciaPendiente && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Falta una foto</span>}
          <span className="font-bold">{formatMonto(c.total)}</span>
        </div>
      ))}
    </div>
  );
}

/** Las compras que Compras ya registró, según el paso en que van: registradas, rendidas (falta cerrar) y cerradas (ya son gasto). */
export function ComprasRegistradas({ sinRendir }: { sinRendir: SinRendir }) {
  if (sinRendir.cantidad === 0 && sinRendir.cerradas.length === 0) return null;
  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <div>
        <p className="text-sm font-bold text-amber-900">Compras que Compras ya registró en el sistema</p>
        <p className="text-xs text-amber-900">
          Esto es lo que Compras <strong>ya registró</strong>, según el paso en que va: <strong>registradas</strong> (Compras todavía no rinde cuentas), <strong>rendidas</strong> (Compras ya rindió; falta que tú cierres la rendición, más abajo en esta pantalla) y <strong>cerradas</strong> (ya son gasto y aparecen en Registro de Gastos).
          Lo que Compras gastó y <strong>todavía no registró</strong> no aparece aquí: se ve como «falta justificar» en el recorrido del dinero.
        </p>
      </div>
      {(['abierta', 'rendida'] as const).map(estado => {
        const lista = sinRendir.compras.filter(c => c.estado === estado);
        if (lista.length === 0) return null;
        return (
          <div key={estado}>
            <p className="mb-1 text-xs font-bold text-amber-900">
              {estado === 'abierta' ? 'Registradas, Compras aún no rinde cuentas' : 'Rendidas por Compras: falta cerrar la rendición'} ({lista.length} · {formatMonto(lista.reduce((t, c) => roundTwo(t + c.total), 0))})
            </p>
            <FilasCompras compras={lista} />
          </div>
        );
      })}
      {sinRendir.cerradas.length > 0 && (
        <details className="rounded-md border bg-white">
          <summary className="cursor-pointer list-none px-3 py-2 text-xs font-bold text-yayis-dark">
            Cerradas este mes, ya son gasto ({sinRendir.cerradas.length} · {formatMonto(sinRendir.cerradas.reduce((t, c) => roundTwo(t + c.total), 0))})
          </summary>
          <div className="border-t"><FilasCompras compras={sinRendir.cerradas} /></div>
        </details>
      )}
    </div>
  );
}
