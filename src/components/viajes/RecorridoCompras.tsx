import { useMemo, useState } from 'react';
import { Desplegable } from '@/components/ui/desplegable';
import { Dato } from '@/components/ui/dato';
import { Button } from '@/components/ui/button';
import { useIndicadoresViajes } from '@/hooks/useIndicadoresViajes';
import { GASOLINA_SEMANAL, recorridoSemana } from '@/lib/viajes';
import { lunesDe } from '@/lib/dinero-semana';
import { fechaCorta, sumarDias } from '@/lib/compras';
import { formatMonto, roundTwo } from '@/lib/utils';
import { Bike, ChevronLeft, ChevronRight } from 'lucide-react';

const km = (n: number) => `${n.toLocaleString('es-PE', { maximumFractionDigits: 1 })} km`;
/** El costo por km se calcula con esta semana y las 3 anteriores. */
const SEMANAS_COSTO = 4;

/** ¿Cuántos km hizo Compras cada día de la semana y le alcanzan los S/ 20 de gasolina? (Gerencia, las 3 sedes) */
export function RecorridoCompras({ hoy }: { hoy: string }) {
  const semanaActual = lunesDe(hoy);
  const [lunes, setLunes] = useState(semanaActual);
  const domingo = sumarDias(lunes, 6);
  const desdeCosto = sumarDias(lunes, -7 * (SEMANAS_COSTO - 1));
  const datos = useIndicadoresViajes(desdeCosto, domingo);
  const r = useMemo(() => recorridoSemana(datos.viajes, datos.cargas, lunes, desdeCosto), [datos, lunes, desdeCosto]);

  const diferencia = r.gasolinaNecesaria === null ? null : roundTwo(GASOLINA_SEMANAL - r.gasolinaNecesaria);
  const veredicto = diferencia === null ? null
    : diferencia >= 0 ? { texto: `Alcanza · sobran ${formatMonto(diferencia)}`, clase: 'text-emerald-700' }
    : { texto: `No alcanza · faltan ${formatMonto(-diferencia)}`, clase: 'text-red-600' };
  const esActual = lunes === semanaActual;

  return (
    <Desplegable
      icono={<Bike size={16} />}
      titulo="Recorrido de Compras"
      resumen={datos.sinTabla ? <span>Falta activarlo</span> : <>
        <span>{esActual ? 'Esta semana' : `Semana del ${fechaCorta(lunes)}`}: <strong className="text-yayis-dark">{km(r.km)}</strong></span>
        <span>gasolina {formatMonto(r.gasolinaCargada)} de {formatMonto(GASOLINA_SEMANAL)}</span>
        {veredicto && <span className={`font-bold ${veredicto.clase}`}>{veredicto.texto}</span>}
      </>}
    >
      {datos.sinTabla ? (
        <p className="text-sm text-muted-foreground">Falta correr el SQL de viajes en la base de datos.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Las 3 sedes · lo que Compras marca con «Salgo» y «Volví» (km del tablero).</p>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" aria-label="Semana anterior" onClick={() => setLunes(sumarDias(lunes, -7))}><ChevronLeft size={14} /></Button>
              <span className="px-2 text-sm font-medium">{fechaCorta(lunes)} – {fechaCorta(domingo)}</span>
              <Button variant="outline" size="sm" aria-label="Semana siguiente" disabled={esActual} onClick={() => setLunes(sumarDias(lunes, 7))}><ChevronRight size={14} /></Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-medium">Día</th>
                  <th className="py-2 text-right font-medium">Viajes</th>
                  <th className="py-2 text-right font-medium">Compras</th>
                  <th className="py-2 text-right font-medium">Deliverys</th>
                  <th className="py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {r.dias.map(d => (
                  <tr key={d.fecha} className={`border-b ${d.fecha > hoy ? 'text-muted-foreground' : ''}`}>
                    <td className="py-1.5 capitalize">{fechaCorta(d.fecha)}</td>
                    <td className="py-1.5 text-right tabular-nums">{d.viajes || '—'}</td>
                    <td className="py-1.5 text-right tabular-nums">{d.kmCompras ? km(d.kmCompras) : '—'}</td>
                    <td className="py-1.5 text-right tabular-nums">{d.kmDeliverys ? km(d.kmDeliverys) : '—'}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums">{d.km ? km(d.km) : '—'}</td>
                  </tr>
                ))}
                <tr className="font-bold text-yayis-dark">
                  <td className="pt-2">Semana</td>
                  <td className="pt-2 text-right tabular-nums">{r.dias.reduce((t, d) => t + d.viajes, 0)}</td>
                  <td className="pt-2 text-right tabular-nums">{km(r.kmCompras)}</td>
                  <td className="pt-2 text-right tabular-nums">{km(r.kmDeliverys)}</td>
                  <td className="pt-2 text-right tabular-nums">{km(r.km)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-2 text-sm font-bold text-yayis-dark">¿Alcanzan los {formatMonto(GASOLINA_SEMANAL)} de gasolina?</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Dato etiqueta="Cargó esta semana" valor={formatMonto(r.gasolinaCargada)} nota={`Se le da ${formatMonto(GASOLINA_SEMANAL)} cada lunes`} alerta={r.gasolinaCargada > GASOLINA_SEMANAL} />
              <Dato etiqueta="Costo por km" valor={r.costoPorKm === null ? '—' : `S/ ${r.costoPorKm.toFixed(2)}`}
                nota={r.costoPorKm === null ? 'Faltan km o cargas de gasolina' : `Gasolina ÷ km de las últimas ${r.semanasDelCosto} semanas`} />
              <Dato etiqueta="Necesitó esta semana" valor={r.gasolinaNecesaria === null ? '—' : formatMonto(r.gasolinaNecesaria)}
                nota={veredicto ? veredicto.texto : `${km(r.km)} × costo por km`} alerta={diferencia !== null && diferencia < 0} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Lo que necesitó = km de la semana × costo por km. Se usa el costo de varias semanas porque una carga sola no dice cuánto se gastó (a veces llena el tanque y le dura más). Con más semanas registradas, la cifra se afina.
            </p>
          </div>
        </div>
      )}
    </Desplegable>
  );
}
