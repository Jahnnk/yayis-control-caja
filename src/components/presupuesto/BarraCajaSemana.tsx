import { formatMonto, roundTwo } from '@/lib/utils';
import { estadoBarra, porcentaje, type EstadoBarra } from '@/lib/presupuesto';
import { rangoSemana, type CajaSemana } from '@/lib/caja-semana';

const COLOR: Record<EstadoBarra, { barra: string; texto: string; extra: string }> = {
  ok: { barra: 'bg-yayis-green', texto: 'text-yayis-dark', extra: 'bg-yayis-green/40' },
  ojo: { barra: 'bg-amber-500', texto: 'text-amber-800', extra: 'bg-amber-500/40' },
  pasado: { barra: 'bg-red-600', texto: 'text-red-700', extra: 'bg-red-600/40' },
  'sin-tope': { barra: 'bg-gray-400', texto: 'text-gray-600', extra: 'bg-gray-400/40' },
};

/** La caja chica de la semana: se llena con lo gastado de lunes a hoy (más lo que se está por gastar, rayado). */
export function BarraCajaSemana({ caja, extra = 0, etiquetaExtra }: { caja: CajaSemana; extra?: number; etiquetaExtra?: string }) {
  const total = roundTwo(caja.gastado + extra);
  const estado = estadoBarra(total, caja.tope);
  const c = COLOR[estado];
  const escala = caja.tope ? caja.tope * 1.25 : Math.max(total, 1);
  const ancho = (n: number) => `${Math.min(100, (n / escala) * 100)}%`;
  const queda = caja.tope ? roundTwo(caja.tope - total) : null;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-medium text-yayis-dark">Caja chica de la semana <span className="font-normal text-muted-foreground">· {rangoSemana(caja)}</span></span>
        <span className={`tabular-nums ${c.texto}`}>
          {caja.tope ? <><strong>{formatMonto(total)}</strong> de {formatMonto(caja.tope)} · {porcentaje(total, caja.tope)}%</> : <>{formatMonto(total)} · sin fondo configurado</>}
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-gray-100">
        <div className={`absolute inset-y-0 left-0 ${c.barra}`} style={{ width: ancho(caja.gastado) }} />
        {extra > 0 && <div className={`absolute inset-y-0 ${c.extra} bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,.5)_4px,rgba(255,255,255,.5)_8px)]`} style={{ left: ancho(caja.gastado), width: ancho(extra) }} />}
        {caja.tope && <div className="absolute inset-y-0 w-0.5 bg-gray-700/60" style={{ left: ancho(caja.tope) }} />}
      </div>
      <p className="text-xs text-muted-foreground">
        Tus gastos {formatMonto(caja.gastosAdmin)} + compras de Fabio al contado {formatMonto(caja.comprasContado)}
        {extra > 0 && etiquetaExtra ? <> + {etiquetaExtra} {formatMonto(extra)}</> : null}
        {queda !== null && <> · {queda >= 0 ? `quedan ${formatMonto(queda)}` : <strong className="text-red-700">te pasas {formatMonto(-queda)}</strong>}</>}
      </p>
    </div>
  );
}
