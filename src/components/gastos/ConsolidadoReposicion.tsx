import { Card, CardContent } from '@/components/ui/card';
import { formatMonto } from '@/lib/utils';
import type { ConsolidadoReposicion as Datos, TotalOrigen } from '@/hooks/useConsolidadoReposicion';
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
export function ConsolidadoReposicion({ datos, responsable }: { datos: Datos; responsable: string }) {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="text-sm font-bold text-yayis-dark">Consolidado para reposición</p>
          <p className="text-xs text-muted-foreground">
            Todo lo que Gerencia debe reponer a {responsable} (gastos pendientes), separado por quién lo pagó. Las compras de Fabio entran aquí cuando se cierra su rendición.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Columna titulo={`Pagado por ${responsable}`} icono={<UserRound size={14} />} t={datos.administrador} />
          <Columna titulo="Compras de Fabio" icono={<ShoppingBasket size={14} />} t={datos.compras} />
          <Columna titulo="Total a reponer" icono={<Landmark size={14} />} t={datos.total} destacado />
        </div>
      </CardContent>
    </Card>
  );
}
