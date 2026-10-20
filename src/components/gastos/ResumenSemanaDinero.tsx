import { Dato } from '@/components/ui/dato';
import { fechaCorta, sumarDias } from '@/lib/compras';
import { formatMonto } from '@/lib/utils';
import type { SemanaSede } from '@/lib/dinero-semana';

/**
 * El dinero de Compras de TODA la semana (todas las entregas), para no sumar a mano.
 * mirada «sede»: el administrador ve su sede. «compras»: Compras ve una fila por sede.
 */
export function ResumenSemanaDinero({ filas, lunes, mirada }: { filas: SemanaSede[]; lunes: string; mirada: 'sede' | 'compras' }) {
  const semana = `Semana del ${fechaCorta(lunes)} al ${fechaCorta(sumarDias(lunes, 6))}`;
  if (filas.length === 0) return null;

  return (
    <section aria-label="Dinero de Compras de la semana" className="space-y-2 rounded-lg border bg-white p-3 shadow-sm sm:p-4">
      <div>
        <p className="text-sm font-bold text-yayis-dark">{mirada === 'sede' ? 'El dinero de Compras esta semana' : 'Tu dinero esta semana'}</p>
        <p className="text-xs text-muted-foreground">{semana} · todas las entregas juntas</p>
      </div>
      {mirada === 'compras' && (
        <div className="divide-y rounded-md border">
          {filas.map(f => (
            <div key={f.sedeId} className="space-y-1 px-3 py-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {f.sede}{f.arrastre > 0 && <span className="font-normal normal-case"> · venía {formatMonto(f.arrastre)} de la semana pasada</span>}
              </p>
              <div className="grid grid-cols-4 gap-1 text-center">
                {[['Recibiste', f.entregado], ['Gastaste', f.gastado], ['Devolviste', f.vuelto], ['Tienes', f.enManos]].map(([t, v]) => (
                  <div key={t as string}>
                    <p className="text-[11px] text-muted-foreground">{t as string}</p>
                    <p className={`text-sm font-bold tabular-nums ${t === 'Tienes' && (v as number) < 0 ? 'text-red-600' : 'text-yayis-dark'}`}>{formatMonto(v as number)}</p>
                  </div>
                ))}
              </div>
              {f.debeACompras > 0 && <p className="text-xs font-medium text-amber-800">{f.sede} te debe {formatMonto(f.debeACompras)} por lo que pusiste de tu bolsillo.</p>}
            </div>
          ))}
        </div>
      )}
      {mirada === 'sede' && filas.map(f => (
        <div key={f.sedeId} className="space-y-1.5">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-1">
            <Dato
              etiqueta="Le entregaste"
              valor={formatMonto(f.entregado)}
              nota={`${f.entregas} entrega(s)${f.arrastre > 0 ? ` + ${formatMonto(f.arrastre)} que venía de la semana pasada` : ''}`}
            />
            <Dato etiqueta="Gastó" valor={formatMonto(f.gastado)} nota="Compras registradas" />
            <Dato etiqueta="Te devolvió en mano" valor={formatMonto(f.vuelto)} nota="Vuelto de rendiciones cerradas" />
          </div>
        </div>
      ))}
    </section>
  );
}
