import { useState } from 'react';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmentado } from '@/components/ui/segmentado';
import { EvidenciaInput } from '@/components/compras/EvidenciaInput';
import { useViajes } from '@/hooks/useViajes';
import { GASOLINA_SEMANAL, KM_SOSPECHOSO, MOTIVOS_VIAJE, duracionTexto, kmRecorridos, minutosDeViaje, tipoSugerido } from '@/lib/viajes';
import { horaCorta } from '@/lib/seguimiento-pedido';
import { fechaCorta } from '@/lib/compras';
import { formatMonto, parseNumericInput } from '@/lib/utils';
import { Bike, Fuel, Loader2 } from 'lucide-react';
import type { MotivoViaje, TipoViaje } from '@/types';

const formatKm = (n: number) => n.toLocaleString('es-PE', { maximumFractionDigits: 1 });

// Algunos tableros marcan millas y no se pueden cambiar: se anota lo que dice el tablero y se guarda en km.
const KM_POR_MILLA = 1.609344;
const CLAVE_MILLAS = 'yayis:tablero-millas';
const redondear1 = (n: number) => Math.round(n * 10) / 10;
function leerMillas(): boolean {
  try { return localStorage.getItem(CLAVE_MILLAS) === '1'; } catch { return false; }
}

/** Viajes de Compras en su moto: km al salir y al volver, motivo de cada viaje extra y gasolina. */
export function ControlViaje() {
  const { sedes } = useSedeActiva();
  const { addToast } = useToast();
  const v = useViajes();
  const [panel, setPanel] = useState<'salir' | 'volver' | 'gasolina' | null>(null);
  const [millas, setMillas] = useState(leerMillas);
  const [guardando, setGuardando] = useState(false);
  // Salir
  const [tipo, setTipo] = useState<TipoViaje>(tipoSugerido());
  // Si elige un tipo distinto al de la hora (deliverys en la mañana, compras en la tarde), tiene que confirmarlo.
  const [confirmaTipo, setConfirmaTipo] = useState(false);
  const [km, setKm] = useState('');
  const [motivo, setMotivo] = useState<MotivoViaje | null>(null);
  const [motivoSede, setMotivoSede] = useState('');
  const [motivoDetalle, setMotivoDetalle] = useState('');
  // Gasolina
  const [monto, setMonto] = useState('');
  const [kmGas, setKmGas] = useState('');
  const [foto, setFoto] = useState<File | null>(null);

  if (v.loading) return null;

  const unidad = millas ? 'millas' : 'km';
  /** Lo que escribe en el tablero → km (lo que se guarda). */
  const aKm = (n: number) => (millas ? redondear1(n * KM_POR_MILLA) : n);
  /** Km guardados → lo que marca su tablero. */
  const deKm = (n: number) => (millas ? redondear1(n / KM_POR_MILLA) : n);
  function cambiarMillas(valor: boolean) {
    setMillas(valor);
    setKm(''); setKmGas('');
    try { localStorage.setItem(CLAVE_MILLAS, valor ? '1' : '0'); } catch { /* sin almacenamiento: queda solo esta sesión */ }
  }
  const kmNum = aKm(parseNumericInput(km));
  const extra = v.esExtraSiSale(tipo);
  const numeroViaje = v.viajesHoy.filter(x => x.tipo === tipo).length + 1;
  const kmHoy = v.viajesHoy.reduce((t, x) => t + (kmRecorridos(x) ?? 0), 0);
  const abiertoDeOtroDia = v.abierto && v.abierto.fecha !== v.hoy;

  function abrir(p: typeof panel) {
    setPanel(actual => (actual === p ? null : p));
    setKm(''); setMotivo(null); setMotivoSede(''); setMotivoDetalle(''); setMonto(''); setKmGas(''); setFoto(null);
    setTipo(tipoSugerido());
    setConfirmaTipo(false);
  }

  // Lo que falta para poder guardar, dicho en palabras.
  const sugerido = tipoSugerido();
  const tipoInusual = tipo !== sugerido;
  const faltaSalir = !km.trim() ? 'Escribe el km que marca el tablero.'
    : tipoInusual && !confirmaTipo ? 'Confirma el tipo de viaje.'
    : extra && !motivo ? 'Elige por qué haces otro viaje.'
    : motivo === 'otro' && !motivoDetalle.trim() ? 'Escribe el motivo.'
    : null;
  const avisoSalir = km.trim() && v.ultimoKm !== null && kmNum < v.ultimoKm
    ? `Es menor que lo último anotado (${formatKm(deKm(v.ultimoKm))} ${unidad}). Revisa el tablero.` : null;

  const kmSalidaAbierto = v.abierto ? Number(v.abierto.km_salida) : 0;
  const faltaVolver = !km.trim() ? 'Escribe el km que marca el tablero.'
    : kmNum < kmSalidaAbierto ? `No puede ser menor que el de salida (${formatKm(deKm(kmSalidaAbierto))} ${unidad}).`
    : null;
  const avisoVolver = !faltaVolver && kmNum - kmSalidaAbierto > KM_SOSPECHOSO
    ? `Son ${formatKm(kmNum - kmSalidaAbierto)} km en un viaje: revisa que esté bien.` : null;

  async function guardar(accion: () => Promise<{ error: string | null }>, ok: string) {
    setGuardando(true);
    const { error } = await accion();
    setGuardando(false);
    if (error) return addToast(error, 'error');
    addToast(ok, 'success');
    setPanel(null);
  }

  return (
    <Card className={v.abierto ? 'border-blue-300 bg-blue-50/50' : ''}>
      <CardContent className="space-y-3 p-3 sm:p-4">
        {/* Estado del día */}
        <div className="flex flex-wrap items-center gap-3">
          <Bike size={18} className={v.abierto ? 'text-blue-700' : 'text-yayis-green'} />
          <div className="min-w-0 flex-1">
            {v.abierto ? (
              <>
                <p className="text-sm font-bold text-blue-900">
                  {abiertoDeOtroDia ? `Quedó abierto un viaje del ${fechaCorta(v.abierto.fecha)}` : `Viaje de ${v.abierto.tipo} en curso`}
                </p>
                <p className="text-xs text-blue-800">Salió {horaCorta(v.abierto.salida_at, v.hoy)} · tablero {formatKm(deKm(kmSalidaAbierto))} {unidad}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-yayis-dark">Tus viajes de hoy</p>
                <p className="text-xs text-muted-foreground">
                  {v.viajesHoy.length === 0 ? `Todavía no saliste. Al salir, anota los ${unidad} del tablero.` : `${v.viajesHoy.length} viaje(s) · ${formatKm(kmHoy)} km`}
                </p>
              </>
            )}
          </div>
          {v.abierto ? (
            <Button className="h-11 bg-blue-700 hover:bg-blue-800" onClick={() => abrir('volver')}>Volví</Button>
          ) : (
            <Button className="h-11" onClick={() => abrir('salir')}>Salgo</Button>
          )}
        </div>

        {/* Salir */}
        {panel === 'salir' && !v.abierto && (
          <div className="space-y-3 border-t pt-3">
            <Segmentado etiqueta="Tipo de viaje" valor={tipo} onCambiar={x => { setTipo(x as TipoViaje); setConfirmaTipo(false); }}
              opciones={[{ valor: 'compras', texto: 'Compras' }, { valor: 'deliverys', texto: 'Deliverys' }]} />
            {tipoInusual && (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3">
                <p className="text-sm text-amber-900">
                  {tipo === 'deliverys'
                    ? 'Elegiste «Deliverys» pero todavía es de mañana, cuando se hacen las compras. ¿Este viaje es para entregar deliverys?'
                    : 'Elegiste «Compras» pero ya es de tarde, cuando se hacen los deliverys. ¿Este viaje es para comprar?'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant={confirmaTipo ? 'default' : 'outline'} aria-pressed={confirmaTipo} onClick={() => setConfirmaTipo(true)}>
                    {confirmaTipo ? '✓ ' : ''}Sí, es de {tipo === 'deliverys' ? 'deliverys' : 'compras'}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => { setTipo(sugerido); setConfirmaTipo(false); }}>
                    No, es de {sugerido === 'compras' ? 'compras' : 'deliverys'}
                  </Button>
                </div>
              </div>
            )}
            <div>
              <label className="text-xs font-medium" htmlFor="viaje-km-salida">{millas ? 'Millas' : 'Km'} del tablero al salir</label>
              <Input autoFocus id="viaje-km-salida" type="number" inputMode="decimal" min="0" step="0.1" className="mt-1 h-11 text-base"
                placeholder={v.ultimoKm !== null ? `Último anotado: ${formatKm(deKm(v.ultimoKm))}` : 'Ej. 12345'} value={km} onChange={e => setKm(e.target.value)} />
              {avisoSalir && <p className="mt-1 text-xs text-amber-700">{avisoSalir}</p>}
            </div>
            {extra && (
              <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/60 p-3">
                <p className="text-sm font-medium text-amber-900">Es tu viaje de compras n.º {numeroViaje} de hoy. ¿Por qué?</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {MOTIVOS_VIAJE.map(m => (
                    <button key={m.valor} type="button" onClick={() => setMotivo(m.valor)} aria-pressed={motivo === m.valor}
                      className={`rounded-md border px-3 py-2 text-left text-sm ${motivo === m.valor ? 'border-yayis-green bg-emerald-50 font-medium' : 'border-gray-200 bg-white'}`}>
                      {m.texto}{m.ayuda && <span className="block text-xs text-muted-foreground">{m.ayuda}</span>}
                    </button>
                  ))}
                </div>
                {motivo === 'lista_tardia' && (
                  <div>
                    <p className="mb-1 text-xs font-medium">¿De qué sede?</p>
                    <Segmentado etiqueta="Sede que pidió tarde" valor={motivoSede} onCambiar={setMotivoSede} opciones={sedes.map(s => ({ valor: s.id, texto: s.nombre }))} />
                  </div>
                )}
                {(motivo === 'otro' || motivo === 'olvido' || motivo === 'no_habia') && (
                  <Input placeholder={motivo === 'otro' ? 'Escribe el motivo' : 'Detalle (opcional)'} value={motivoDetalle} onChange={e => setMotivoDetalle(e.target.value)} aria-label="Detalle del motivo" />
                )}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button className="h-11 w-full sm:w-auto" disabled={guardando || !!faltaSalir}
                onClick={() => guardar(() => v.salir({ tipo, km: kmNum, motivo, motivoSedeId: motivoSede || null, motivoDetalle }), '¡Buen viaje! Al volver toca «Volví».')}>
                {guardando && <Loader2 size={14} className="mr-1 animate-spin" />} Salir
              </Button>
              {faltaSalir && <p className="text-xs text-muted-foreground">{faltaSalir}</p>}
            </div>
          </div>
        )}

        {/* Volver */}
        {panel === 'volver' && v.abierto && (
          <div className="space-y-3 border-t pt-3">
            <div>
              <label className="text-xs font-medium" htmlFor="viaje-km-regreso">{millas ? 'Millas' : 'Km'} del tablero al volver</label>
              <Input autoFocus id="viaje-km-regreso" type="number" inputMode="decimal" min="0" step="0.1" className="mt-1 h-11 text-base"
                placeholder={`Salió con ${formatKm(deKm(kmSalidaAbierto))}`} value={km} onChange={e => setKm(e.target.value)} />
              {km.trim() && !faltaVolver && <p className="mt-1 text-xs text-muted-foreground">Recorriste {formatKm(redondear1(kmNum - kmSalidaAbierto))} km{millas ? ` (${formatKm(redondear1((kmNum - kmSalidaAbierto) / KM_POR_MILLA))} millas)` : ''} · {duracionTexto(minutosDeViaje({ salida_at: v.abierto.salida_at, regreso_at: new Date().toISOString() }))}</p>}
              {avisoVolver && <p className="mt-1 text-xs text-amber-700">{avisoVolver}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button className="h-11 w-full sm:w-auto" disabled={guardando || !!faltaVolver}
                onClick={() => guardar(() => v.volver(kmNum), 'Viaje cerrado.')}>
                {guardando && <Loader2 size={14} className="mr-1 animate-spin" />} Guardar regreso
              </Button>
              {faltaVolver && km.trim() && <p className="text-xs text-red-600">{faltaVolver}</p>}
            </div>
          </div>
        )}

        {/* Gasolina */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Fuel size={14} /> Gasolina esta semana: <strong className={v.gastadoSemana > GASOLINA_SEMANAL ? 'text-amber-700' : 'text-yayis-dark'}>{formatMonto(v.gastadoSemana)}</strong> de {formatMonto(GASOLINA_SEMANAL)}</span>
          <button type="button" className="font-medium text-yayis-green" onClick={() => abrir('gasolina')} aria-expanded={panel === 'gasolina'}>Cargué gasolina</button>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={millas} onChange={e => cambiarMillas(e.target.checked)} className="h-4 w-4" />
          <span>Mi tablero marca <strong className="text-yayis-dark">millas</strong> (la app las convierte a km sola)</span>
        </label>
        {panel === 'gasolina' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium" htmlFor="gas-monto">Cuánto cargaste (S/)</label>
                <Input autoFocus id="gas-monto" type="number" inputMode="decimal" min="0" step="0.1" className="mt-1 h-11 text-base" value={monto} onChange={e => setMonto(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium" htmlFor="gas-km">{millas ? 'Millas' : 'Km'} del tablero</label>
                <Input id="gas-km" type="number" inputMode="decimal" min="0" step="0.1" className="mt-1 h-11 text-base" placeholder="Opcional" value={kmGas} onChange={e => setKmGas(e.target.value)} />
              </div>
            </div>
            <EvidenciaInput id="gas-foto" label="Foto de la boleta (opcional)" archivo={foto} onChange={setFoto} />
            <Button className="h-11 w-full sm:w-auto" disabled={guardando || parseNumericInput(monto) <= 0}
              onClick={() => guardar(() => v.cargarGasolina({ monto: parseNumericInput(monto), km: kmGas.trim() ? aKm(parseNumericInput(kmGas)) : null, foto }), 'Gasolina anotada.')}>
              {guardando && <Loader2 size={14} className="mr-1 animate-spin" />} Guardar gasolina
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
