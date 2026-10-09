import { AlertTriangle, Ban, Check, CheckCircle2, PackageCheck, Send, ShoppingBasket, Truck } from 'lucide-react';
import type { PasoSeguimiento, Seguimiento } from '@/lib/seguimiento-pedido';

const ICONO: Record<PasoSeguimiento['clave'], typeof Send> = {
  enviada: Send,
  comprando: ShoppingBasket,
  en_camino: Truck,
  recibido: PackageCheck,
};

const MENSAJE: Record<Seguimiento['tono'], { clase: string; icono: typeof Send | null }> = {
  normal: { clase: 'text-yayis-dark', icono: null },
  alerta: { clase: 'text-amber-800', icono: AlertTriangle },
  listo: { clase: 'text-emerald-800', icono: CheckCircle2 },
  cancelado: { clase: 'text-gray-500', icono: Ban },
};

function nombreDelPaso(s: Seguimiento) {
  if (s.indiceActual < 0) return 'Cancelada';
  if (s.indiceActual >= 4) return 'Recibido';
  return s.pasos[s.indiceActual]!.titulo;
}

/**
 * Seguimiento de una lista de compra, al estilo de un pedido de delivery:
 * Enviada → Comprando → En camino → Recibido, con la hora de cada paso y una frase de qué pasa ahora.
 */
export function SeguimientoPedido({ seguimiento: s }: { seguimiento: Seguimiento }) {
  const alerta = s.tono === 'alerta';
  const m = MENSAJE[s.tono];
  return (
    <div
      className={`rounded-xl border px-3 pb-3 pt-2.5 ${alerta ? 'border-amber-200 bg-amber-50/50' : s.tono === 'cancelado' ? 'border-gray-200 bg-gray-50' : 'border-emerald-100 bg-emerald-50/30'}`}
      aria-label={`Seguimiento de la lista: ${nombreDelPaso(s)}. ${s.mensaje}`}
    >
      <p className={`flex items-start gap-1.5 text-sm font-medium ${m.clase}`} aria-live="polite">
        {m.icono && <m.icono size={15} className="mt-0.5 shrink-0" />}
        <span>{s.mensaje}</span>
      </p>

      <div className="relative mt-3">
        {/* Riel y avance: van del centro del primer punto al centro del último */}
        <div className="absolute left-[12.5%] right-[12.5%] top-4 h-1 -translate-y-1/2 rounded-full bg-gray-200" aria-hidden />
        <div
          className={`absolute left-[12.5%] top-4 h-1 -translate-y-1/2 rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${alerta ? 'bg-amber-500' : 'bg-yayis-green'}`}
          style={{ width: `${s.avance * 75}%` }}
          aria-hidden
        />
        <ol className="relative grid grid-cols-4">
          {s.pasos.map(p => {
            const Icono = p.estado === 'hecho' ? Check : ICONO[p.clave];
            const actual = p.estado === 'actual';
            const color = p.estado === 'hecho'
              ? (alerta ? 'bg-amber-500 text-white' : 'bg-yayis-green text-white')
              : actual
                ? (alerta ? 'bg-white text-amber-600 ring-2 ring-amber-500' : 'bg-white text-yayis-green ring-2 ring-yayis-green')
                : 'bg-white text-gray-300 ring-1 ring-gray-200';
            return (
              <li key={p.clave} className="flex flex-col items-center text-center" aria-current={actual ? 'step' : undefined}>
                <span className="relative flex h-8 w-8 items-center justify-center">
                  {actual && <span className={`absolute inset-0 rounded-full motion-safe:animate-ping ${alerta ? 'bg-amber-400/30' : 'bg-yayis-green/25'}`} aria-hidden />}
                  <span className={`relative flex h-8 w-8 items-center justify-center rounded-full shadow-sm transition-colors duration-500 ${color}`}>
                    <Icono size={15} strokeWidth={2.4} />
                  </span>
                </span>
                <span className={`mt-1.5 text-[11px] font-semibold leading-tight sm:text-xs ${p.estado === 'pendiente' ? 'text-gray-400' : 'text-yayis-dark'}`}>{p.titulo}</span>
                {p.hora && <span className="text-[10px] leading-tight text-muted-foreground sm:text-[11px]">{p.hora}</span>}
                {p.detalle && <span className={`text-[10px] font-medium leading-tight sm:text-[11px] ${actual && alerta ? 'text-amber-700' : 'text-muted-foreground'}`}>{p.detalle}</span>}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/** Versión de una línea (para listas y resúmenes): cuatro puntos y el nombre del paso actual. */
export function SeguimientoMini({ seguimiento: s }: { seguimiento: Seguimiento }) {
  const alerta = s.tono === 'alerta';
  const actual = s.indiceActual >= 0 && s.indiceActual < 4 ? s.pasos[s.indiceActual] : null;
  return (
    <span className="inline-flex items-center gap-2" title={s.mensaje} aria-label={`${nombreDelPaso(s)}. ${s.mensaje}`}>
      <span className="relative inline-flex h-2.5 w-16 items-center" aria-hidden>
        <span className="absolute inset-x-1 h-0.5 rounded-full bg-gray-200" />
        <span className={`absolute left-1 h-0.5 rounded-full transition-[width] duration-700 ${alerta ? 'bg-amber-500' : 'bg-yayis-green'}`} style={{ width: `calc((100% - 0.5rem) * ${s.avance})` }} />
        <span className="relative flex w-full justify-between">
          {s.pasos.map(p => (
            <span
              key={p.clave}
              className={`h-2.5 w-2.5 rounded-full ${p.estado === 'hecho' ? (alerta ? 'bg-amber-500' : 'bg-yayis-green') : p.estado === 'actual' ? `bg-white ring-2 ${alerta ? 'ring-amber-500' : 'ring-yayis-green'}` : 'bg-gray-200'}`}
            />
          ))}
        </span>
      </span>
      <span className={`text-xs font-medium ${alerta ? 'text-amber-700' : s.tono === 'listo' ? 'text-emerald-700' : s.tono === 'cancelado' ? 'text-gray-500' : 'text-yayis-dark'}`}>
        {nombreDelPaso(s)}{actual?.detalle && actual.detalle !== 'Esperando' ? ` · ${actual.detalle}` : ''}
        {s.indiceActual >= 4 && s.pasos[3]!.detalle && s.tono === 'alerta' ? ` · ${s.pasos[3]!.detalle}` : ''}
      </span>
    </span>
  );
}
