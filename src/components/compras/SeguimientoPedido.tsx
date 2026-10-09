import { AlertTriangle, Ban, BadgeCheck, Check, CheckCircle2, ClipboardCheck, HandCoins, Lock, PackageCheck, Receipt, Send, ShoppingBasket, Truck } from 'lucide-react';
import type { PasoSeguimiento, Seguimiento } from '@/lib/seguimiento-pedido';

const ICONO: Record<string, typeof Send> = {
  // Listas de compra
  enviada: Send,
  comprando: ShoppingBasket,
  en_camino: Truck,
  recibido: PackageCheck,
  // Dinero de una entrega
  entregado: HandCoins,
  compras: Receipt,
  rendido: ClipboardCheck,
  cerrado: Lock,
  repuesto: BadgeCheck,
};

const MENSAJE: Record<Seguimiento['tono'], { clase: string; icono: typeof Send | null }> = {
  normal: { clase: 'text-yayis-dark', icono: null },
  alerta: { clase: 'text-amber-800', icono: AlertTriangle },
  listo: { clase: 'text-emerald-800', icono: CheckCircle2 },
  cancelado: { clase: 'text-gray-500', icono: Ban },
};

function nombreDelPaso(s: Seguimiento) {
  if (s.indiceActual < 0) return 'Cancelada';
  if (s.indiceActual >= s.pasos.length) return s.pasos[s.pasos.length - 1]!.titulo;
  return s.pasos[s.indiceActual]!.titulo;
}

/**
 * Seguimiento por pasos, al estilo de un pedido de delivery (listas: Enviada → Comprando → En camino → Recibido;
 * dinero: Entregado → Compras → Rendido → Cerrado → Repuesto), con la hora de cada paso y una frase de qué pasa ahora.
 */
export function SeguimientoPedido({ seguimiento: s }: { seguimiento: Seguimiento }) {
  const alerta = s.tono === 'alerta';
  const m = MENSAJE[s.tono];
  // El riel va del centro del primer punto al centro del último.
  const n = s.pasos.length;
  const borde = `${50 / n}%`;
  const largo = 100 - 100 / n;
  return (
    <div
      className={`rounded-xl border px-3 pb-3 pt-2.5 ${alerta ? 'border-amber-200 bg-amber-50/50' : s.tono === 'cancelado' ? 'border-gray-200 bg-gray-50' : 'border-emerald-100 bg-emerald-50/30'}`}
      aria-label={`Seguimiento: ${nombreDelPaso(s)}. ${s.mensaje}`}
    >
      <p className={`flex items-start gap-1.5 text-sm font-medium ${m.clase}`} aria-live="polite">
        {m.icono && <m.icono size={15} className="mt-0.5 shrink-0" />}
        <span>{s.mensaje}</span>
      </p>

      <div className="relative mt-3">
        {/* Riel y avance: van del centro del primer punto al centro del último */}
        <div className="absolute top-4 h-1 -translate-y-1/2 rounded-full bg-gray-200" style={{ left: borde, right: borde }} aria-hidden />
        <div
          className={`absolute top-4 h-1 -translate-y-1/2 rounded-full transition-[width] duration-700 ease-out motion-reduce:transition-none ${alerta ? 'bg-amber-500' : 'bg-yayis-green'}`}
          style={{ left: borde, width: `${s.avance * largo}%` }}
          aria-hidden
        />
        <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {s.pasos.map(p => {
            const Icono = p.estado === 'hecho' ? Check : ICONO[p.clave] ?? Check;
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
                <span className={`mt-1.5 font-semibold leading-tight sm:text-xs ${n >= 5 ? 'text-[10px]' : 'text-[11px]'} ${p.estado === 'pendiente' ? 'text-gray-400' : 'text-yayis-dark'}`}>{p.titulo}</span>
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
  const ultimo = s.pasos.length - 1;
  const actual = s.indiceActual >= 0 && s.indiceActual <= ultimo ? s.pasos[s.indiceActual] : null;
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
        {s.indiceActual > ultimo && s.pasos[ultimo]!.detalle ? ` · ${s.pasos[ultimo]!.detalle}` : ''}
      </span>
    </span>
  );
}
