import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { formatMonto, roundTwo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Loader2, Search } from 'lucide-react';

/**
 * Herramienta TEMPORAL de auditoria para entender el descuadre entre:
 *   - Deuda "vieja" (suma de gastos pendientes)
 *   - Deuda "neta" (total gastos - total repuesto)
 *
 * Muestra los gastos marcados como pagados SIN reposicion vinculada y las
 * reposiciones sin gastos vinculados, que son las dos causas del descuadre.
 * Una vez conciliados los datos historicos, este componente se puede quitar.
 */

type GastoHuerfano = {
  id: string;
  fecha: string;
  descripcion: string;
  monto: number;
  metodo: string;
  categoria: string;
};

type RepoHuerfana = {
  id: string;
  fecha: string;
  monto: number;
  metodo: string;
  notas: string | null;
};

type Resultado = {
  pagadoTotalEf: number;
  pagadoTotalCt: number;
  repuestoTotalEf: number;
  repuestoTotalCt: number;
  gastosHuerfanos: GastoHuerfano[];
  huerfanosTotalEf: number;
  huerfanosTotalCt: number;
  reposHuerfanas: RepoHuerfana[];
  reposHuerfanasTotalEf: number;
  reposHuerfanasTotalCt: number;
};

const PAGE_SIZE = 1000;

export function AuditoriaDeudaLuis() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<Resultado | null>(null);

  async function ejecutar() {
    if (!profile?.sede_id) return;
    setLoading(true);
    setError(null);

    // 1. Todos los gastos PAGADOS (con su reposicion_id y categoria), paginado
    const pagados: Array<Record<string, unknown>> = [];
    for (let desde = 0; ; desde += PAGE_SIZE) {
      const { data, error: e } = await supabase
        .from('gastos')
        .select('id, fecha, descripcion, monto, metodo_pago, reposicion_id, categorias(nombre)')
        .eq('sede_id', profile.sede_id)
        .eq('estado', 'pagado')
        .order('fecha', { ascending: true })
        .range(desde, desde + PAGE_SIZE - 1);
      if (e) { setError(e.message); setLoading(false); return; }
      pagados.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }

    // 2. Todas las reposiciones
    const { data: reposData, error: eRepo } = await supabase
      .from('reposiciones')
      .select('id, fecha, monto, metodo_pago, notas')
      .eq('sede_id', profile.sede_id)
      .order('fecha', { ascending: true });
    if (eRepo) { setError(eRepo.message); setLoading(false); return; }

    // --- Totales de gastos pagados por metodo ---
    let pagadoTotalEf = 0, pagadoTotalCt = 0;
    let huerfanosTotalEf = 0, huerfanosTotalCt = 0;
    const gastosHuerfanos: GastoHuerfano[] = [];
    const reposUsadas = new Set<string>();

    for (const g of pagados) {
      const monto = Number(g.monto);
      const metodo = g.metodo_pago as string;
      if (metodo === 'efectivo') pagadoTotalEf = roundTwo(pagadoTotalEf + monto);
      else pagadoTotalCt = roundTwo(pagadoTotalCt + monto);

      const repoId = g.reposicion_id as string | null;
      if (repoId) {
        reposUsadas.add(repoId);
      } else {
        // Gasto pagado SIN reposicion que lo respalde
        gastosHuerfanos.push({
          id: g.id as string,
          fecha: g.fecha as string,
          descripcion: ((g.descripcion as string) ?? '(sin descripcion)'),
          monto,
          metodo,
          categoria: ((g.categorias as { nombre: string } | null)?.nombre) ?? 'Otros',
        });
        if (metodo === 'efectivo') huerfanosTotalEf = roundTwo(huerfanosTotalEf + monto);
        else huerfanosTotalCt = roundTwo(huerfanosTotalCt + monto);
      }
    }

    // --- Reposiciones sin gastos vinculados ---
    let repuestoTotalEf = 0, repuestoTotalCt = 0;
    let reposHuerfanasTotalEf = 0, reposHuerfanasTotalCt = 0;
    const reposHuerfanas: RepoHuerfana[] = [];

    for (const r of reposData ?? []) {
      const monto = Number(r.monto);
      const metodo = r.metodo_pago as string;
      if (metodo === 'efectivo') repuestoTotalEf = roundTwo(repuestoTotalEf + monto);
      else repuestoTotalCt = roundTwo(repuestoTotalCt + monto);

      if (!reposUsadas.has(r.id as string)) {
        reposHuerfanas.push({
          id: r.id as string,
          fecha: r.fecha as string,
          monto,
          metodo,
          notas: (r.notas as string | null) ?? null,
        });
        if (metodo === 'efectivo') reposHuerfanasTotalEf = roundTwo(reposHuerfanasTotalEf + monto);
        else reposHuerfanasTotalCt = roundTwo(reposHuerfanasTotalCt + monto);
      }
    }

    // Ordenar huerfanos por monto desc para ver primero los mas grandes
    gastosHuerfanos.sort((a, b) => b.monto - a.monto);

    setRes({
      pagadoTotalEf, pagadoTotalCt,
      repuestoTotalEf, repuestoTotalCt,
      gastosHuerfanos, huerfanosTotalEf, huerfanosTotalCt,
      reposHuerfanas, reposHuerfanasTotalEf, reposHuerfanasTotalCt,
    });
    setLoading(false);
  }

  const descuadreEf = res ? roundTwo(res.pagadoTotalEf - res.repuestoTotalEf) : 0;
  const descuadreCt = res ? roundTwo(res.pagadoTotalCt - res.repuestoTotalCt) : 0;

  return (
    <div className="border-2 border-dashed border-purple-300 bg-purple-50/40 rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h4 className="text-sm font-bold text-purple-800 flex items-center gap-2">
          <Search size={16} /> Auditoría de la deuda con Luis (temporal)
        </h4>
        <Button
          size="sm"
          variant="outline"
          className="border-purple-400 text-purple-700 hover:bg-purple-100"
          disabled={loading}
          onClick={ejecutar}
        >
          {loading ? <Loader2 size={14} className="animate-spin mr-1" /> : <Search size={14} className="mr-1" />}
          {res ? 'Volver a auditar' : 'Ejecutar auditoría'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Rastrea de dónde sale la diferencia entre la deuda que muestra el sistema y el dinero neto que le debes a Luis.
      </p>

      {error && <p className="text-xs text-red-600">Error: {error}</p>}

      {res && (
        <div className="space-y-4">
          {/* Resumen del descuadre */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { label: 'Efectivo', pagado: res.pagadoTotalEf, repuesto: res.repuestoTotalEf, desc: descuadreEf },
              { label: 'Cuentas', pagado: res.pagadoTotalCt, repuesto: res.repuestoTotalCt, desc: descuadreCt },
            ].map(m => (
              <div key={m.label} className="bg-white border border-purple-200 rounded-lg p-3 text-sm">
                <p className="font-bold text-purple-800 mb-1">{m.label}</p>
                <div className="flex justify-between"><span className="text-muted-foreground">Gastos marcados pagados</span><span className="font-medium">{formatMonto(m.pagado)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Reposiciones registradas</span><span className="font-medium">{formatMonto(m.repuesto)}</span></div>
                <div className="flex justify-between border-t mt-1 pt-1 font-bold">
                  <span>Descuadre</span>
                  <span className={m.desc > 0 ? 'text-red-600' : m.desc < 0 ? 'text-emerald-600' : ''}>{formatMonto(m.desc)}</span>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            El descuadre se explica por: <strong>gastos marcados pagados sin reposición que los respalde</strong> menos <strong>reposiciones sin gastos vinculados</strong>.
          </p>

          {/* Gastos pagados sin reposicion */}
          <div>
            <p className="text-sm font-bold text-purple-800 mb-1">
              Gastos marcados pagados SIN reposición ({res.gastosHuerfanos.length}) — Ef: {formatMonto(res.huerfanosTotalEf)} · Ct: {formatMonto(res.huerfanosTotalCt)}
            </p>
            <p className="text-xs text-muted-foreground mb-2">Estos son los sospechosos: el sistema los dio por pagados pero no hay una reposición concreta detrás. Revísalos con Luis.</p>
            {res.gastosHuerfanos.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Ninguno.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto border border-purple-200 rounded-lg bg-white">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-purple-50">
                    <tr className="border-b">
                      <th className="text-left px-2 py-1.5 font-medium">Fecha</th>
                      <th className="text-left px-2 py-1.5 font-medium">Descripcion</th>
                      <th className="text-left px-2 py-1.5 font-medium">Categoria</th>
                      <th className="text-left px-2 py-1.5 font-medium">Pago</th>
                      <th className="text-right px-2 py-1.5 font-medium">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.gastosHuerfanos.map(g => (
                      <tr key={g.id} className="border-b last:border-b-0">
                        <td className="px-2 py-1.5 whitespace-nowrap">{g.fecha}</td>
                        <td className="px-2 py-1.5">{g.descripcion}</td>
                        <td className="px-2 py-1.5">{g.categoria}</td>
                        <td className="px-2 py-1.5">{g.metodo === 'efectivo' ? 'Efectivo' : 'Cuentas'}</td>
                        <td className="px-2 py-1.5 text-right font-medium whitespace-nowrap">{formatMonto(g.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Reposiciones sin gastos */}
          <div>
            <p className="text-sm font-bold text-purple-800 mb-1">
              Reposiciones SIN gastos vinculados ({res.reposHuerfanas.length}) — Ef: {formatMonto(res.reposHuerfanasTotalEf)} · Ct: {formatMonto(res.reposHuerfanasTotalCt)}
            </p>
            <p className="text-xs text-muted-foreground mb-2">Reposiciones que registraste pero que el sistema no logró ligar a gastos concretos.</p>
            {res.reposHuerfanas.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Ninguna.</p>
            ) : (
              <div className="max-h-56 overflow-y-auto border border-purple-200 rounded-lg bg-white">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-purple-50">
                    <tr className="border-b">
                      <th className="text-left px-2 py-1.5 font-medium">Fecha</th>
                      <th className="text-left px-2 py-1.5 font-medium">Pago</th>
                      <th className="text-left px-2 py-1.5 font-medium">Notas</th>
                      <th className="text-right px-2 py-1.5 font-medium">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.reposHuerfanas.map(r => (
                      <tr key={r.id} className="border-b last:border-b-0">
                        <td className="px-2 py-1.5 whitespace-nowrap">{r.fecha}</td>
                        <td className="px-2 py-1.5">{r.metodo === 'efectivo' ? 'Efectivo' : 'Cuentas'}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.notas ?? '-'}</td>
                        <td className="px-2 py-1.5 text-right font-medium whitespace-nowrap">{formatMonto(r.monto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
