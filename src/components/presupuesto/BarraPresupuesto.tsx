import { formatMonto, roundTwo } from '@/lib/utils';
import { estadoBarra, nombreCategoria, porcentaje, type EstadoBarra, type UsoCategoria } from '@/lib/presupuesto';

const COLOR: Record<EstadoBarra, { barra: string; texto: string; extra: string }> = {
  ok: { barra: 'bg-yayis-green', texto: 'text-yayis-dark', extra: 'bg-yayis-green/40' },
  ojo: { barra: 'bg-amber-500', texto: 'text-amber-800', extra: 'bg-amber-500/40' },
  pasado: { barra: 'bg-red-600', texto: 'text-red-700', extra: 'bg-red-600/40' },
  'sin-tope': { barra: 'bg-gray-400', texto: 'text-gray-600', extra: 'bg-gray-400/40' },
};

interface Props {
  uso: UsoCategoria;
  /** Lo que se suma con lo que se está registrando o pidiendo (se dibuja rayado, encima de lo gastado). */
  extra?: number;
  /** Texto para lo que se suma: «este gasto», «esta lista (estimado)». */
  etiquetaExtra?: string;
  compacta?: boolean;
}

/**
 * Una barra por categoría: se llena con lo gastado en el mes (más lo que se está por gastar, rayado).
 * Verde hasta 80% del tope, ámbar desde 80%, roja si se pasa.
 */
export function BarraPresupuesto({ uso, extra = 0, etiquetaExtra, compacta = false }: Props) {
  const total = roundTwo(uso.gastado + extra);
  const estado = estadoBarra(total, uso.tope);
  const pct = porcentaje(total, uso.tope);
  const c = COLOR[estado];
  // La barra muestra hasta 125% del tope; la raya marca el 100%.
  const escala = uso.tope ? uso.tope * 1.25 : Math.max(total, 1);
  const ancho = (n: number) => `${Math.min(100, (n / escala) * 100)}%`;
  const queda = uso.tope ? roundTwo(uso.tope - total) : null;

  return (
    <div className={compacta ? 'space-y-1' : 'space-y-1.5'}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-medium text-yayis-dark">{nombreCategoria(uso.categoria)}</span>
        <span className={`tabular-nums ${c.texto}`}>
          {uso.tope
            ? <><strong>{formatMonto(total)}</strong> de {formatMonto(uso.tope)} · {pct}%</>
            : <><strong>{formatMonto(total)}</strong> · sin tope este mes</>}
        </span>
      </div>
      <div
        className={`relative w-full overflow-hidden rounded-full bg-gray-100 ${compacta ? 'h-2.5' : 'h-3.5'}`}
        role="meter"
        aria-label={`${nombreCategoria(uso.categoria)}: ${pct ?? '—'}% del tope`}
        aria-valuemin={0}
        aria-valuemax={uso.tope ?? undefined}
        aria-valuenow={total}
      >
        <div className={`absolute inset-y-0 left-0 rounded-full ${c.barra}`} style={{ width: ancho(uso.gastado) }} />
        {extra > 0 && (
          <div
            className={`absolute inset-y-0 ${c.extra}`}
            style={{
              left: ancho(uso.gastado),
              width: `calc(${ancho(total)} - ${ancho(uso.gastado)})`,
              backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,.55) 0 4px, transparent 4px 8px)',
            }}
          />
        )}
        {uso.tope && <div className="absolute inset-y-0 w-0.5 bg-gray-700/60" style={{ left: '80%' }} title="Tope (100%)" />}
      </div>
      {!compacta && (
        <p className="text-xs text-muted-foreground">
          {extra > 0 && <>Gastado {formatMonto(uso.gastado)} + {etiquetaExtra ?? 'esto'} {formatMonto(extra)}. </>}
          {queda !== null && (queda >= 0
            ? <>Te quedan <strong className="text-yayis-dark">{formatMonto(queda)}</strong> este mes.</>
            : <span className="font-medium text-red-700">Se pasa del tope por {formatMonto(-queda)}.</span>)}
        </p>
      )}
    </div>
  );
}
