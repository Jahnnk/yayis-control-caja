import { Desplegable } from '@/components/ui/desplegable';
import { useAhorroSede } from '@/hooks/useAhorroSede';
import { fechaCorta, formatCantidad } from '@/lib/compras';
import { precioMostrado } from '@/lib/precio-linea';
import { formatPorcentaje, DIAS_MEJOR_PROVEEDOR, UMBRAL_VARIACION } from '@/lib/precios';
import { formatMonto } from '@/lib/utils';
import type { Periodo } from '@/lib/ahorro';
import { PiggyBank } from 'lucide-react';

function Cifras({ titulo, p }: { titulo: string; p: Periodo }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-sm">Ahorraste <strong className="whitespace-nowrap tabular-nums text-emerald-700">{formatMonto(p.ahorro)}</strong></p>
      <p className="text-sm">Pagaste de más <strong className={`whitespace-nowrap tabular-nums ${p.deMas > 0 ? 'text-red-700' : 'text-yayis-dark'}`}>{formatMonto(p.deMas)}</strong></p>
    </div>
  );
}

/**
 * «Precios de tus compras»: cuánto ahorró y cuánto pagó de más la sede frente al precio habitual,
 * en la semana y en el mes, y las 3 compras que más se pagaron de más con el mejor proveedor sugerido.
 */
export function ResumenAhorro({ sedeId }: { sedeId: string | null | undefined }) {
  const r = useAhorroSede(sedeId);
  if (!r) return null;
  const precio = (unitario: number, unidad: string) => { const m = precioMostrado(unitario, unidad); return `${formatMonto(m.valor)} por ${m.etiqueta}`; };

  return (
    <Desplegable
      icono={<PiggyBank size={16} />}
      titulo="Precios de tus compras"
      abierto={r.semana.deMas > 0}
      resumen={<>
        <span>Semana: ahorraste <strong className="text-emerald-700">{formatMonto(r.semana.ahorro)}</strong></span>
        <span>de más <strong className={r.semana.deMas > 0 ? 'text-red-700' : ''}>{formatMonto(r.semana.deMas)}</strong></span>
      </>}
    >
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <Cifras titulo="Esta semana" p={r.semana} />
          <Cifras titulo="Este mes" p={r.mes} />
        </div>
        {r.peores.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Lo que más se pagó de más este mes</p>
            {r.peores.map((x, i) => (
              <div key={i} className="rounded-lg border border-red-100 bg-red-50/40 p-3">
                <p className="font-semibold text-yayis-dark">{x.compra.nombre}
                  <span className="ml-1 font-normal text-red-700">+{formatMonto(x.deMas)} ({formatPorcentaje(x.porcentaje)})</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {fechaCorta(x.compra.fecha)} · {formatCantidad(x.compra.cantidad)} {x.compra.unidad} a {x.compra.proveedor} · {precio(x.unitario, x.compra.unidad)} (lo habitual: {precio(x.habitual, x.compra.unidad)})
                </p>
                {x.mejor && (
                  <p className="mt-1 text-xs text-emerald-800">
                    💡 Mejor proveedor: <strong>{x.mejor.proveedor}</strong>, {precio(x.mejor.unitario, x.compra.unidad)} el {fechaCorta(x.mejor.fecha)}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Este mes ninguna compra salió mucho más cara de lo habitual.</p>
        )}
        <p className="text-[11px] text-muted-foreground">
          Se compara cada compra con su precio habitual (las últimas 3 compras). Cuenta solo lo que se movió {Math.round(UMBRAL_VARIACION * 100)}% o más. Mejor proveedor: el último precio más bajo en {DIAS_MEJOR_PROVEEDOR} días.
        </p>
      </div>
    </Desplegable>
  );
}
