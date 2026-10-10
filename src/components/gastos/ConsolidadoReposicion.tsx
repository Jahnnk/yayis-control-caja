import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { formatMonto, roundTwo } from '@/lib/utils';
import type { ConsolidadoReposicion as Datos, SinRendir, TotalOrigen } from '@/hooks/useConsolidadoReposicion';
import { Landmark, ShoppingBasket, UserRound } from 'lucide-react';

function Columna({ titulo, icono, t, destacado, to }: { titulo: string; icono: React.ReactNode; t: TotalOrigen; destacado?: boolean; to: string }) {
  return (
    <Link to={to} title="Ver el detalle de estos gastos" className={`group block rounded-md border p-3 transition hover:border-yayis-green hover:shadow-sm ${destacado ? 'border-yayis-green bg-emerald-50/60' : 'bg-white'}`}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{icono} {titulo}</p>
      <p className={`mt-1 text-xl font-bold ${destacado ? 'text-yayis-green' : 'text-yayis-dark'}`}>{formatMonto(t.total)}</p>
      <p className="text-xs text-muted-foreground">
        {t.cantidad} gasto(s) · efectivo {formatMonto(t.efectivo)} · cuentas {formatMonto(t.cuentas)}
      </p>
      <p className="mt-1 text-xs font-medium text-yayis-green opacity-80 group-hover:opacity-100">Ver detalle →</p>
    </Link>
  );
}

/** Consolidado para reposición: lo pendiente de reponer, separado entre lo que pagó el administrador y las compras de Fabio. */
export function ConsolidadoReposicion({ datos, responsable, sinRendir }: { datos: Datos; responsable: string; sinRendir?: SinRendir }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="text-sm font-bold text-yayis-dark">Consolidado para reposición</p>
          <p className="text-xs text-muted-foreground">
            Todo lo que Gerencia debe reponer a {responsable} (gastos pendientes), separado por quién lo pagó. Lo que compra Compras entra aquí cuando se cierra su rendición.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Columna titulo="Pagado por el administrador" icono={<UserRound size={14} />} t={datos.administrador} to="/gastos?origen=administrador#lista-gastos" />
          <Columna titulo="Compras (a proveedores)" icono={<ShoppingBasket size={14} />} t={datos.compras} to="/gastos?origen=compras#lista-gastos" />
          <Columna titulo="Total a reponer" icono={<Landmark size={14} />} t={datos.total} destacado to="/gastos#lista-gastos" />
        </div>
        {sinRendir && sinRendir.cantidad > 0 && (() => {
          const rendidas = sinRendir.compras.filter(c => c.estado === 'rendida').reduce((t, c) => roundTwo(t + Number(c.total)), 0);
          const porRendir = roundTwo(sinRendir.total - rendidas);
          const totalConCompras = roundTwo(datos.total.total + sinRendir.total);
          return (
            <div className="space-y-2 rounded-md border-2 border-amber-300 bg-amber-50 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-bold text-amber-900">Total con lo de Compras</p>
                <p className="text-2xl font-bold tabular-nums text-amber-900">{formatMonto(totalConCompras)}</p>
              </div>
              <p className="text-xs text-amber-900">
                {formatMonto(datos.total.total)} que ya se puede reponer + <strong>{formatMonto(sinRendir.total)}</strong> en {sinRendir.cantidad} compra(s) de Compras con la rendición sin cerrar
                {rendidas > 0 && porRendir > 0 ? ` (${formatMonto(rendidas)} ya rendidas, falta que ${responsable} las cierre; ${formatMonto(porRendir)} Compras aún no rinde)` : rendidas > 0 ? ` (ya rendidas: falta que ${responsable} las cierre)` : ' (Compras aún no rinde)'}.
              </p>
              <p className="text-xs text-amber-800">
                Para reponer todo de una vez, primero Compras rinde y {responsable} cierra las rendiciones en Dinero de la semana: así esas compras pasan a «por reponer» y la reposición las marca como repuestas. Si se repone antes, esa parte queda sin marcar.
              </p>
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
