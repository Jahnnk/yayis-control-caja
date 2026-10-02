import { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { useDeliverys, type DeliveryDetalle } from '@/hooks/useDeliverys';
import { useToast } from '@/components/ui/toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Loading } from '@/components/ui/loading';
import { FormularioDelivery } from '@/components/deliverys/FormularioDelivery';
import { ListaDeliverys } from '@/components/deliverys/ListaDeliverys';
import { abrirEvidencia } from '@/lib/evidencias';
import { esEfectivoPendiente, resumirDeliverys, sumarCobrado, DIAS_PARA_ENTREGAR_EFECTIVO } from '@/lib/deliverys';
import { fechaCorta, fechaLarga, sumarDias } from '@/lib/compras';
import { getTodayLima } from '@/lib/dates';
import { formatMonto, roundTwo } from '@/lib/utils';
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

/** Lista de deliverys del mes en curso y, plegado, el mes anterior. */
function ListasPorMes({ deliverys, mostrarSede, puedeBorrar, onBorrar }: {
  deliverys: DeliveryDetalle[];
  mostrarSede?: boolean;
  puedeBorrar?: (d: DeliveryDetalle) => boolean;
  onBorrar?: (d: DeliveryDetalle) => void;
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
          <ListaDeliverys deliverys={delMes} mostrarSede={mostrarSede} puedeBorrar={puedeBorrar} onBorrar={onBorrar} onVerCaptura={verCaptura} />
        </CardContent>
      </Card>
      {anteriores.length > 0 && (
        <details className="group rounded-lg border bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between p-4 text-sm font-bold text-yayis-dark">
            <span>Meses anteriores ({anteriores.length})</span>
            <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t">
            <ListaDeliverys deliverys={anteriores} mostrarSede={mostrarSede} onVerCaptura={verCaptura} />
          </div>
        </details>
      )}
    </>
  );
}

/* ───────────── Vista de Fabio (Compras) ───────────── */

function VistaCompras() {
  const { deliverys, loading, crearDelivery, eliminarDelivery } = useDeliverys('mios');
  const { addToast } = useToast();
  const [porBorrar, setPorBorrar] = useState<DeliveryDetalle | null>(null);
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

      <ListasPorMes deliverys={deliverys} mostrarSede puedeBorrar={puedeBorrar} onBorrar={setPorBorrar} />

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
  onRecibir: (ids: string[], recibido: number, nota: string) => Promise<{ error: string | null }>;
}) {
  const { addToast } = useToast();
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [recibidoTexto, setRecibidoTexto] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const elegidos = pendientes.filter(d => !excluidos.has(d.id));
  const esperado = sumarCobrado(elegidos);
  const recibido = recibidoTexto === null ? esperado : parseFloat(recibidoTexto);
  const diferencia = roundTwo(esperado - (Number.isNaN(recibido) ? 0 : recibido));
  const sinNota = diferencia !== 0 && nota.trim() === '';
  const invalido = elegidos.length === 0 || Number.isNaN(recibido) || recibido < 0 || sinNota;

  function alternar(id: string) {
    setRecibidoTexto(null); // al cambiar la selección, el monto vuelve a ser lo esperado
    setExcluidos(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function confirmar() {
    setGuardando(true);
    const { error } = await onRecibir(elegidos.map(d => d.id), recibido, nota);
    setGuardando(false);
    setConfirmando(false);
    if (error) return addToast(`Error: ${error}`, 'error');
    addToast('Efectivo registrado', 'success');
    setExcluidos(new Set()); setRecibidoTexto(null); setNota('');
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
          <p className={`pb-2 text-sm font-bold ${diferencia === 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {diferencia === 0 ? 'Cuadra' : diferencia > 0 ? `Faltan ${formatMonto(diferencia)}` : `Sobran ${formatMonto(-diferencia)}`}
          </p>
        </div>

        {diferencia !== 0 && (
          <div>
            <label className="text-xs font-medium" htmlFor="dl-nota">¿Por qué no cuadra? (obligatorio)</label>
            <Input id="dl-nota" className="mt-1" value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej. Falta el delivery de la señora Ana, lo traerá mañana" />
          </div>
        )}

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
  const { deliverys, liquidaciones, loading, recibirEfectivo } = useDeliverys('sede');
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

      {pendientes.length > 0 && <RecibirEfectivo pendientes={pendientes} onRecibir={async (ids, recibido, nota) => {
        const { error } = await recibirEfectivo(ids, recibido, nota);
        return { error };
      }} />}

      <ListasPorMes deliverys={deliverys} />

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
                  <span className="capitalize text-muted-foreground">{fechaCorta(new Date(l.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Lima' }))}</span>
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
