import { useMemo } from 'react';
import { Desplegable } from '@/components/ui/desplegable';
import { Dato } from '@/components/ui/dato';
import { useIndicadoresViajes } from '@/hooks/useIndicadoresViajes';
import { MOTIVO_LABEL, calcularIndicadoresViajes, duracionTexto } from '@/lib/viajes';
import { horaCorta } from '@/lib/seguimiento-pedido';
import { fechaCorta } from '@/lib/compras';
import { formatMonto } from '@/lib/utils';
import { Bike } from 'lucide-react';

const km = (n: number) => `${n.toLocaleString('es-PE', { maximumFractionDigits: 1 })} km`;

/** ¿Cuántos viajes hizo Compras, cuáles se pudieron evitar y cuánto cuesta moverse? (Gerencia) */
export function IndicadoresViajes({ desde, hasta, hoy, sedes }: { desde: string; hasta: string; hoy: string; sedes: { id: string; nombre: string }[] }) {
  const datos = useIndicadoresViajes(desde, hasta);
  const i = useMemo(
    () => calcularIndicadoresViajes(datos.viajes, datos.cargas, datos.compras, datos.deliverys, datos.listas, sedes, desde, hasta, hoy),
    [datos, sedes, desde, hasta, hoy],
  );
  const maxMotivo = i.porMotivo[0]?.cantidad ?? 0;

  return (
    <Desplegable
      icono={<Bike size={16} />}
      titulo="Viajes de Compras"
      resumen={datos.sinTabla ? <span>Falta activarlo</span> : <>
        <span>{i.viajesCompras + i.viajesDeliverys} viaje(s) · {km(i.km)}</span>
        {i.extras > 0 && <span className="font-bold text-amber-700">{i.extras} extra</span>}
        <span>gasolina <strong className="text-yayis-dark">{formatMonto(i.gasolinaCargada)}</strong></span>
      </>}
    >
      {datos.sinTabla ? (
        <p className="text-sm text-muted-foreground">Falta correr el SQL de viajes en la base de datos.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Dato etiqueta="Viajes de compras" valor={String(i.viajesCompras)} nota={i.extras > 0 ? `${i.extras} extra (más de 1 al día)` : 'Ninguno extra'} alerta={i.extras > 0} />
            <Dato etiqueta="Viajes de deliverys" valor={String(i.viajesDeliverys)} />
            <Dato etiqueta="Kilómetros" valor={km(i.km)} nota={`Compras ${km(i.kmCompras)} · deliverys ${km(i.kmDeliverys)}`} />
            <Dato etiqueta="Tiempo por viaje" valor={duracionTexto(i.minutosPromedio)} nota="Promedio, de salida a regreso" />
            <Dato etiqueta="Gasolina cargada" valor={formatMonto(i.gasolinaCargada)}
              nota={i.gasolinaAsignada > 0 ? `Se le dio ${formatMonto(i.gasolinaAsignada)} (S/ 20 por lunes)` : 'S/ 20 por semana'}
              alerta={i.gasolinaAsignada > 0 && i.gasolinaCargada > i.gasolinaAsignada} />
            <Dato etiqueta="Costo por km" valor={i.solesPorKm === null ? '—' : formatMonto(i.solesPorKm)} nota="Gasolina ÷ km" />
            <Dato etiqueta="Gasolina por S/ 100 comprados" valor={i.transportePor100 === null ? '—' : formatMonto(i.transportePor100)} nota={`Comprado: ${formatMonto(i.comprado)}`} />
            <Dato etiqueta="Viajes sin cerrar" valor={String(i.sinCerrar)} nota="De días anteriores: no marcó «Volví»" alerta={i.sinCerrar > 0} />
          </div>

          {i.porMotivo.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-bold text-yayis-dark">¿Por qué hubo viajes extra?</p>
              <div className="space-y-1.5">
                {i.porMotivo.map(m => (
                  <div key={m.motivo} className="flex items-center gap-2 text-sm">
                    <span className="w-44 shrink-0">{MOTIVO_LABEL[m.motivo]}</span>
                    <div className="h-2 flex-1 rounded-full bg-gray-100"><div className="h-2 rounded-full bg-amber-500" style={{ width: `${(m.cantidad / maxMotivo) * 100}%` }} /></div>
                    <span className="w-6 text-right font-bold">{m.cantidad}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {i.porSede.length > 0 && (
            <div>
              <p className="mb-1 text-sm font-bold text-yayis-dark">Lo que causa viajes, por sede</p>
              <p className="mb-2 text-xs text-muted-foreground">Lista tardía = se envió el mismo día de la compra (Compras debe tenerla al empezar el día).</p>
              <div className="divide-y rounded-md border text-sm">
                {i.porSede.map(f => (
                  <div key={f.sede} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                    <span className="font-medium">{f.sede}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {f.tardias} lista(s) tardía(s) · {f.urgentes} urgente(s) · <strong className={f.extras > 0 ? 'text-amber-700' : ''}>{f.extras} viaje(s) extra</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-bold text-yayis-dark">Cada viaje</p>
            {i.detalle.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay viajes anotados en este periodo.</p>
            ) : (
              <div className="divide-y rounded-md border text-sm">
                {i.detalle.map(d => (
                  <div key={d.viaje.id} className="space-y-0.5 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{fechaCorta(d.viaje.fecha)}</span>
                      <span className="text-xs text-muted-foreground">{horaCorta(d.viaje.salida_at, d.viaje.fecha)}{d.viaje.regreso_at ? ` – ${horaCorta(d.viaje.regreso_at, d.viaje.fecha)}` : d.viaje.fecha === hoy ? ' · en curso' : ' · sin cerrar'}</span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-700">{d.viaje.tipo}</span>
                      {d.viaje.es_extra && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">Extra · {d.viaje.motivo ? MOTIVO_LABEL[d.viaje.motivo] : ''}</span>}
                      <span className="ml-auto text-xs font-medium">{d.km === null ? '—' : km(d.km)} · {duracionTexto(d.minutos)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {d.proveedores.length > 0 ? d.proveedores.join(', ') : d.viaje.tipo === 'compras' ? 'Sin compras registradas en el viaje' : ''}
                      {d.compras > 0 && ` · ${d.compras} compra(s) por ${formatMonto(d.comprado)}`}
                      {d.deliverys > 0 && ` · ${d.deliverys} delivery(s)`}
                      {d.viaje.motivo_detalle && ` · «${d.viaje.motivo_detalle}»`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
          {hasta === hoy && <p className="text-[11px] text-muted-foreground">Las compras y deliverys se asocian a un viaje por la hora en que se registraron.</p>}
        </div>
      )}
    </Desplegable>
  );
}
