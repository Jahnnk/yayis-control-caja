import { useEffect, useState } from 'react';

/** Indicador «En vivo»: la pantalla se actualiza sola y dice hace cuánto fue la última vez. */
export function EnVivo({ actualizadoAt }: { actualizadoAt: Date | null }) {
  const [, setTic] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTic(n => n + 1), 15_000);
    return () => window.clearInterval(t);
  }, []);
  const segundos = actualizadoAt ? Math.max(0, Math.round((Date.now() - actualizadoAt.getTime()) / 1000)) : null;
  const hace = segundos === null ? '' : segundos < 45 ? 'recién actualizado' : `actualizado hace ${Math.max(1, Math.round(segundos / 60))} min`;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-xs text-emerald-800" title="Esta pantalla se actualiza sola cada minuto mientras haya listas en camino.">
      <span className="relative flex h-2 w-2" aria-hidden>
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      <span><strong className="font-semibold">En vivo</strong>{hace ? ` · ${hace}` : ''}</span>
    </span>
  );
}
