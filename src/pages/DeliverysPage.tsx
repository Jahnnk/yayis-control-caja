import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { useDeliverys, type DeliveryDetalle } from '@/hooks/useDeliverys';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select-native';
import { EvidenciaInput } from '@/components/compras/EvidenciaInput';
import { Loading } from '@/components/ui/loading';
import { FormularioDelivery } from '@/components/deliverys/FormularioDelivery';
import { ListaDeliverys } from '@/components/deliverys/ListaDeliverys';
import { abrirEvidencia } from '@/lib/evidencias';
import { esEfectivoPendiente, resumirDeliverys, sumarCobrado, DIAS_PARA_ENTREGAR_EFECTIVO } from '@/lib/deliverys';
import { fechaCorta, fechaLarga, sumarDias } from '@/lib/compras';
import { getTodayLima } from '@/lib/dates';
import { formatMonto, roundTwo } from '@/lib/utils';
import type { MetodoPago } from '@/types';
import { Bike, ChevronDown, HandCoins, Loader2, Wallet } from 'lucide-react';

const mesDe = (fecha: string) => fecha.slice(0, 7);

function Cifra({ icono, titulo, valor, detalle, resaltar }: { icono: React.ReactNode; titulo: string; valor: string; detalle?: string; resaltar?: boolean }) {
  return (
    <Card className={resaltar ? 'border-amber-300 bg-amber-50/50' : ''}>
      <CardContent className="p-4">
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">{icono} {titulo}</div>
        <p className="text-xl font-bold text-yayis-dark">{valor}</p>
        {detalle && <p className="text-xs text-muted-foreground">{detalle}</p>}
      </CardContent>
    </Card>
  );
}

/** Ventana para corregir un delivery mal registrado: el día y/o cómo pagó el cliente. Los montos no se cambian. */
function CorregirDelivery({ delivery, onCorregir, onCerrar }: {
  delivery: DeliveryDetalle;
  onCorregir: (d: DeliveryDetalle, cambios: { fecha: string; metodo_cobro: MetodoPago | null; captura: File | null }) => Promise<{ error: string | null }>;
  onCerrar: () => void;
}) {
  const { addToast } = useToast();
  const hoy = getTodayLima();
  const [fecha, setFecha] = useState(delivery.fecha);
  const [metodo, setMetodo] = useState<MetodoPago | null>(delivery.metodo_cobro);
  const [captura, setCaptura] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cambiaMetodo = delivery.metodo_cobro !== null && metodo !== delivery.metodo_cobro;
  const faltaCaptura = cambiaMetodo && metodo === 'cuentas' && !captura;
  const hayCambios = fecha !== delivery.fecha || cambiaMetodo;

  async function guardar() {
    setGuardando(true);
    const { error } = await onCorregir(delivery, { fecha, metodo_cobro: metodo, captura });
    setGuardando(false);
    if (error) return addToast(error, 'error');
    addToast('Delivery corregido', 'success');
    onCerrar();
  }

  return (
    <Modal open onClose={onCerrar} title="Corregir el delivery">
      <div className="space-y-4">
        <p className="text-sm">
          <strong>{delivery.cliente}</strong> · {formatMonto(Number(delivery.monto_producto))} de producto + {formatMonto(Number(delivery.monto_delivery))} de delivery.
          Registrado: <strong className="capitalize">{fechaCorta(delivery.fecha)}</strong>
          {delivery.metodo_cobro && <> · cobrado en <strong>{delivery.metodo_cobro === 'efectivo' ? 'efectivo' : 'Yape o transferencia'}</strong></>}.
          Los montos no se pueden cambiar aquí.
        </p>
        <div>
          <label className="text-xs font-medium" htmlFor="dl-nueva-fecha">Fecha correcta</label>
          <Input id="dl-nueva-fecha" type="date" className="mt-1 w-44" value={fecha} max={hoy} onChange={e => setFecha(e.target.value)} />
        </div>
        {delivery.metodo_cobro !== null && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium" htmlFor="dl-nuevo-metodo">¿Cómo te pagó?</label>
              <Select id="dl-nuevo-metodo" className="mt-1 sm:w-64" value={metodo ?? 'efectivo'} onChange={e => setMetodo(e.target.value as MetodoPago)}>
                <option value="efectivo">Efectivo</option>
                <option value="cuentas">Yape o transferencia</option>
              </Select>
            </div>
            {cambiaMetodo && metodo === 'cuentas' && (
              <EvidenciaInput id="dl-nueva-captura" label="Captura del Yape o transferencia" archivo={captura} onChange={setCaptura} requerido />
            )}
            {cambiaMetodo && metodo === 'efectivo' && (
              <p className="text-xs text-amber-900">Pasará a «efectivo por entregar» a tu cargo y la captura anterior se borra.</p>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando || !fecha || fecha > hoy || !hayCambios || faltaCaptura}>
            {guardando ? <Loader2 size={14} className="mr-1 animate-spin" /> : null} Guardar cambios
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Lista de deliverys del mes en curso y, plegado, el mes anterior. */
function ListasPorMes({ deliverys, mostrarSede, puedeBorrar, onBorrar, puedeCambiarFecha, onCambiarFecha }: {
  deliverys: DeliveryDetalle[];
  mostrarSede?: boolean;
  puedeBorrar?: (d: DeliveryDetalle) => boolean;
  onBorrar?: (d: DeliveryDetalle) => void;
  puedeCambiarFecha?: (d: DeliveryDetalle) => boolean;
  onCambiarFecha?: (d: DeliveryDetalle) => void;
}) {
  const { addToast } = useToast();
  const mesActual = mesDe(getTodayLima());
  const delMes = deliverys.filter(d => mesDe(d.fecha) === mesActual);
  const anteriores = deliverys.filter(d => mesDe(d.fecha) < mesActual);

  async function verCaptura(path: string) {
    const error = await abrirEvidencia(path);
    if (error) addToast(error, 'error');
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-0"><CardTitle className="text-base">Deliverys de este mes ({delMes.length})</CardTitle></CardHeader>
        <CardContent className="px-0 pb-2">
          <ListaDeliverys deliverys={delMes} mostrarSede={mostrarSede} puedeBorrar={puedeBorrar} onBorrar={onBorrar} puedeCambiarFecha={puedeCambiarFecha} onCambiarFecha={onCambiarFecha} onVerCaptura={verCaptura} />
        </CardContent>
      </Card>
      {anteriores.length > 0 && (
        <details className="group rounded-lg border bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-bold text-yayis-dark">
            <span>Meses anteriores ({anteriores.length})</span>
            <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t">
            <ListaDeliverys deliverys={anteriores} mostrarSede={mostrarSede} puedeCambiarFecha={puedeCambiarFecha} onCambiarFecha={onCambiarFecha} onVerCaptura={verCaptura} />
          </div>
        </details>
      )}
    </>
  );
}

/* ───────────── Vista de Fabio (Compras) ───────────── */

function VistaCompras() {
  const { deliverys, loading, crearDelivery, eliminarDelivery, corregirDelivery } = useDeliverys('mios');
  const { addToast } = useToast();
  const [porBorrar, setPorBorrar] = useState<DeliveryDetalle | null>(null);
  const [porCambiarFecha, setPorCambiarFecha] = useState<DeliveryDetalle | null>(null);
  const hoy = getTodayLima();

  const pendientes = deliverys.filter(esEfectivoPendiente);
  const porSede = useMemo(() => {
    const mapa = new Map<string, { nombre: string; total: number; cantidad: number; desde: string }>();
    for (const d of pendientes) {
      const acc = mapa.get(d.sede_id) ?? { nombre: d.sedes?.nombre ?? '—', total: 0, cantidad: 0, desde: d.fecha };
      acc.total = roundTwo(acc.total + Number(d.cobrado));
      acc.cantidad += 1;
      if (d.fecha < acc.desde) acc.desde = d.fecha;
      mapa.set(d.sede_id, acc);
    }
    return Array.from(mapa.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [pendientes]);
  const resumenMes = resumirDeliverys(deliverys.filter(d => mesDe(d.fecha) === mesDe(hoy)));

  async function confirmarBorrar() {
    if (!porBorrar) return;
    const d = porBorrar;
    setPorBorrar(null);
    const { error } = await eliminarDelivery(d);
    if (error) addToast(`Error: ${error}`, 'error');
    else addToast('Delivery borrado', 'success');
  }

  // Puede borrar lo suyo mientras sea de hoy o ayer y su efectivo no se haya entregado.
  const puedeBorrar = (d: DeliveryDetalle) => d.liquidacion_id === null && Date.now() - new Date(d.created_at).getTime() < 24 * 3600 * 1000;

  if (loading && deliverys.length === 0) return <Loading text="Cargando tus deliverys..." />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-yayis-dark">Mis deliverys</h1>
        <p className="mt-1 text-sm capitalize text-muted-foreground">{fechaLarga(hoy)}</p>
      </div>

      <Card className={pendientes.length > 0 ? 'border-amber-300 bg-amber-50/40' : ''}>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Wallet size={16} className="text-amber-700" /> Efectivo que tengo por entregar</CardTitle>
        </CardHeader>
        <CardContent>
          {pendientes.length === 0 ? (
            <p className="text-sm text-emerald-700">No tienes efectivo de deliverys pendiente de entregar.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-2xl font-bold text-yayis-dark">{formatMonto(sumarCobrado(pendientes))}</p>
              {porSede.map(s => (
                <p key={s.nombre} className="text-sm">
                  Entrégaselo al administrador de <strong>{s.nombre}</strong>: <strong>{formatMonto(s.total)}</strong>
                  <span className="text-xs text-muted-foreground"> · {s.cantidad} delivery(s), desde el <span className="capitalize">{fechaCorta(s.desde)}</span></span>
                </p>
              ))}
              <p className="text-xs text-muted-foreground">Lo ideal es entregarlo máximo en {DIAS_PARA_ENTREGAR_EFECTIVO} días. El administrador lo cuenta y lo registra en su pantalla.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <FormularioDelivery onGuardar={crearDelivery} />

      <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
        <Bike size={15} className="mt-0.5 shrink-0" />
        <span>Este mes llevas <strong className="text-yayis-dark">{resumenMes.cantidad}</strong> delivery(s) · {formatMonto(resumenMes.totalDelivery)} de delivery.</span>
      </p>

      <ListasPorMes deliverys={deliverys} mostrarSede puedeBorrar={puedeBorrar} onBorrar={setPorBorrar} puedeCambiarFecha={puedeBorrar} onCambiarFecha={setPorCambiarFecha} />
      {porCambiarFecha && <CorregirDelivery delivery={porCambiarFecha} onCorregir={corregirDelivery} onCerrar={() => setPorCambiarFecha(null)} />}

      <ConfirmDialog
        open={porBorrar !== null}
        title="¿Borrar este delivery?"
        message="Úsalo solo si lo registraste mal. Si ya cobraste dinero, deja de contar como efectivo por entregar."
        confirmLabel="Sí, borrar"
        variant="destructive"
        onConfirm={confirmarBorrar}
        onCancel={() => setPorBorrar(null)}
      />
    </div>
  );
}

/* ───────────── Vista del administrador y de Gerencia (una sede) ───────────── */

function RecibirEfectivo({ pendientes, onRecibir }: {
  pendientes: DeliveryDetalle[];
  onRecibir: (ids: string[], recibido: number, nota: string, fechaEntrega?: string) => Promise<{ error: string | null }>;
}) {
  const { addToast } = useToast();
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [recibidoTexto, setRecibidoTexto] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const hoy = getTodayLima();
  const [fechaEntrega, setFechaEntrega] = useState(hoy);
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const elegidos = pendientes.filter(d => !excluidos.has(d.id));
  const esperado = sumarCobrado(elegidos);
  const recibido = recibidoTexto === null ? esperado : parseFloat(recibidoTexto);
  const diferencia = roundTwo(esperado - (Number.isNaN(recibido) ? 0 : recibido));
  const sinNota = diferencia !== 0 && nota.trim() === '';
  // Fabio no pudo entregar el efectivo antes de hacer el delivery más reciente que se está entregando.
  const masReciente = elegidos.reduce((max, d) => (d.fecha > max ? d.fecha : max), '');
  const fechaMala = !fechaEntrega || fechaEntrega > hoy || (masReciente !== '' && fechaEntrega < masReciente);
  const invalido = elegidos.length === 0 || Number.isNaN(recibido) || recibido < 0 || sinNota || fechaMala;

  function alternar(id: string) {
    setRecibidoTexto(null); // al cambiar la selección, el monto vuelve a ser lo esperado
    setExcluidos(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function confirmar() {
    setGuardando(true);
    const { error } = await onRecibir(elegidos.map(d => d.id), recibido, nota, fechaEntrega);
    setGuardando(false);
    setConfirmando(false);
    if (error) return addToast(`Error: ${error}`, 'error');
    addToast('Efectivo registrado', 'success');
    setExcluidos(new Set()); setRecibidoTexto(null); setNota(''); setFechaEntrega(hoy);
  }

  return (
    <Card className="border-amber-300">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><HandCoins size={17} className="text-amber-700" /> Efectivo por recibir de Compras</CardTitle>
        <p className="text-xs text-muted-foreground">Fabio cobró este efectivo en deliverys de tu sede. Cuando te lo entregue, cuéntalo y confírmalo aquí.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="divide-y rounded-md border text-sm">
          {pendientes.map(d => (
            <label key={d.id} className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 hover:bg-gray-50">
              <input type="checkbox" checked={!excluidos.has(d.id)} onChange={() => alternar(d.id)} />
              <span className="w-20 capitalize text-muted-foreground">{fechaCorta(d.fecha)}</span>
              <span className="min-w-[8rem] flex-1 font-medium">{d.cliente}</span>
              <span className="font-bold">{formatMonto(Number(d.cobrado))}</span>
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Debería entregarte</p>
            <p className="text-lg font-bold text-yayis-dark">{formatMonto(esperado)}</p>
          </div>
          <div>
            <label className="text-xs font-medium" htmlFor="dl-recibido">Dinero que contaste (S/)</label>
            <Input id="dl-recibido" type="number" inputMode="decimal" min="0" step="0.01" className="mt-1 w-36"
              value={recibidoTexto ?? String(esperado)} onChange={e => setRecibidoTexto(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium" htmlFor="dl-fecha-entrega">Día en que Fabio te lo entregó</label>
            <Input id="dl-fecha-entrega" type="date" className="mt-1 w-40" value={fechaEntrega} max={hoy} min={masReciente || undefined}
              onChange={e => setFechaEntrega(e.target.value)} />
          </div>
          <p className={`pb-2 text-sm font-bold ${diferencia === 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {diferencia === 0 ? 'Cuadra' : diferencia > 0 ? `Faltan ${formatMonto(diferencia)}` : `Sobran ${formatMonto(-diferencia)}`}
          </p>
        </div>

        <div>
          <label className="text-xs font-medium" htmlFor="dl-nota">{diferencia !== 0 ? '¿Por qué no cuadra? (obligatorio)' : 'Nota (opcional)'}</label>
          <Input id="dl-nota" className="mt-1" value={nota} onChange={e => setNota(e.target.value)}
            placeholder={diferencia !== 0 ? 'Ej. Falta el delivery de la señora Ana, lo traerá mañana' : 'Ej. Fabio lo entregó ayer a caja y me lo pasaron hoy'} />
        </div>
        {fechaMala && <p className="text-xs text-red-600">El día de entrega no puede ser futuro ni anterior al delivery más reciente ({masReciente ? fechaCorta(masReciente) : '—'}).</p>}

        <Button onClick={() => setConfirmando(true)} disabled={invalido}>Confirmar que recibí el efectivo</Button>
        {sinNota && <p className="text-xs text-red-600">Escribe la razón de la diferencia para poder confirmar.</p>}
      </CardContent>

      <ConfirmDialog
        open={confirmando}
        title="¿Confirmas que recibiste el efectivo?"
        message={`Recibiste ${formatMonto(Number.isNaN(recibido) ? 0 : recibido)} de ${formatMonto(esperado)} esperados (${elegidos.length} delivery(s)).${diferencia !== 0 ? ` Queda registrada una diferencia de ${formatMonto(Math.abs(diferencia))}.` : ''} Esto no se puede deshacer.`}
        confirmLabel={guardando ? 'Guardando...' : 'Sí, confirmar'}
        onConfirm={confirmar}
        onCancel={() => setConfirmando(false)}
      />
    </Card>
  );
}

function VistaSede() {
  const { sedeActiva } = useSedeActiva();
  const { deliverys, liquidaciones, loading, recibirEfectivo, corregirDelivery } = useDeliverys('sede');
  const { profile } = useAuth();
  // Gerencia puede corregir la fecha de un delivery mientras su efectivo no se haya recibido.
  const [porCambiarFecha, setPorCambiarFecha] = useState<DeliveryDetalle | null>(null);
  const puedeCambiarFecha = (d: DeliveryDetalle) => profile?.rol === 'owner' && d.liquidacion_id === null;
  const hoy = getTodayLima();

  const pendientes = useMemo(() => deliverys.filter(esEfectivoPendiente).sort((a, b) => a.fecha.localeCompare(b.fecha)), [deliverys]);
  const mes = resumirDeliverys(deliverys.filter(d => mesDe(d.fecha) === mesDe(hoy)));
  const resumenPendiente = resumirDeliverys(pendientes);
  const viejo = resumenPendiente.pendienteDesde !== null && resumenPendiente.pendienteDesde <= sumarDias(hoy, -DIAS_PARA_ENTREGAR_EFECTIVO);

  if (loading && deliverys.length === 0) return <Loading text="Cargando deliverys..." />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-yayis-dark">Deliverys{sedeActiva ? ` · ${sedeActiva.nombre}` : ''}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Los deliverys que Compras hizo con pedidos de esta sede y el dinero que cobró por ellos.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Cifra icono={<Bike size={16} className="text-yayis-green" />} titulo="Deliverys del mes" valor={String(mes.cantidad)} />
        <Cifra icono={<Bike size={16} className="text-blue-600" />} titulo="Delivery cobrado del mes" valor={formatMonto(mes.totalDelivery)} detalle="Suma del delivery de cada entrega" />
        <Cifra icono={<Wallet size={16} className="text-yayis-green" />} titulo="Productos llevados" valor={formatMonto(mes.totalProductos)} detalle="Valor de lo entregado en el mes" />
        <Cifra
          icono={<HandCoins size={16} className="text-amber-700" />} titulo="Efectivo por recibir"
          valor={formatMonto(resumenPendiente.efectivoPendiente)} resaltar={resumenPendiente.cantidadPendiente > 0}
          detalle={resumenPendiente.cantidadPendiente === 0 ? 'Nada pendiente' : `${resumenPendiente.cantidadPendiente} delivery(s)${viejo ? ' · hace días' : ''}`}
        />
      </div>

      {pendientes.length > 0 && <RecibirEfectivo pendientes={pendientes} onRecibir={async (ids, recibido, nota, fechaEntrega) => {
        const { error } = await recibirEfectivo(ids, recibido, nota, fechaEntrega);
        return { error };
      }} />}

      <ListasPorMes deliverys={deliverys} puedeCambiarFecha={puedeCambiarFecha} onCambiarFecha={setPorCambiarFecha} />
      {porCambiarFecha && <CorregirDelivery delivery={porCambiarFecha} onCorregir={corregirDelivery} onCerrar={() => setPorCambiarFecha(null)} />}

      {liquidaciones.length > 0 && (
        <details className="group rounded-lg border bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-bold text-yayis-dark">
            <span>Efectivo recibido de Compras ({liquidaciones.length})</span>
            <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="divide-y border-t text-sm">
            {liquidaciones.map(l => {
              const dif = roundTwo(Number(l.esperado) - Number(l.recibido));
              return (
                <div key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-2">
                  <span className="capitalize text-muted-foreground" title="Día en que Fabio entregó el efectivo">{fechaCorta(l.fecha_entrega ?? new Date(l.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Lima' }))}</span>
                  {l.fecha_entrega && l.fecha_entrega !== new Date(l.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Lima' }) && (
                    <span className="text-[11px] text-muted-foreground">(confirmado el {fechaCorta(new Date(l.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Lima' }))})</span>
                  )}
                  <span>Esperado {formatMonto(Number(l.esperado))} · recibido {formatMonto(Number(l.recibido))}</span>
                  {l.nota && <span className="text-xs text-muted-foreground">“{l.nota}”</span>}
                  <span className={`ml-auto text-xs font-bold ${dif === 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                    {dif === 0 ? 'Cuadró' : dif > 0 ? `Faltaron ${formatMonto(dif)}` : `Sobraron ${formatMonto(-dif)}`}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

export function DeliverysPage() {
  const { profile } = useAuth();
  if (!profile) return <Loader2 className="animate-spin" />;
  return profile.rol === 'compras' ? <VistaCompras /> : <VistaSede />;
}
