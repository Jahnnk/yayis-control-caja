import { Card, CardContent } from '@/components/ui/card';
import { formatMonto } from '@/lib/utils';
import type { ConsolidadoReposicion as Datos, SinRendir, TotalOrigen } from '@/hooks/useConsolidadoReposicion';
import { Landmark, ShoppingBasket, UserRound } from 'lucide-react';

function Columna({ titulo, icono, t, destacado }: { titulo: string; icono: React.ReactNode; t: TotalOrigen; destacado?: boolean }) {
  return (
    <div className={`rounded-md border p-3 ${destacado ? 'border-yayis-green bg-emerald-50/60' : 'bg-white'}`}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{icono} {titulo}</p>
      <p className={`mt-1 text-xl font-bold ${destacado ? 'text-yayis-green' : 'text-yayis-dark'}`}>{formatMonto(t.total)}</p>
      <p className="text-xs text-muted-foreground">
        {t.cantidad} gasto(s) · efectivo {formatMonto(t.efectivo)} · cuentas {formatMonto(t.cuentas)}
      </p>
    </div>
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
          <Columna titulo="Pagado por el administrador" icono={<UserRound size={14} />} t={datos.administrador} />
          <Columna titulo="Compras (a proveedores)" icono={<ShoppingBasket size={14} />} t={datos.compras} />
          <Columna titulo="Total a reponer" icono={<Landmark size={14} />} t={datos.total} destacado />
        </div>
        {sinRendir && sinRendir.cantidad > 0 && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Además hay <strong>{formatMonto(sinRendir.total)}</strong> en {sinRendir.cantidad} compra(s) hechas por Compras con la <strong>rendición todavía sin cerrar</strong>.
            No suman al total de arriba: entran cuando Compras rinda cuentas y el administrador cierre la rendición. El detalle está en «Compras que Compras registró», en Dinero de la semana.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
