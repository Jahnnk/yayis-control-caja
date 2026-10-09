import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { usePedidos } from '@/hooks/usePedidos';
import { useEntregas, gastadoDe } from '@/hooks/useEntregas';
import { useDeliverys } from '@/hooks/useDeliverys';
import { useSaldoSemanal } from '@/hooks/useSaldoSemanal';
import { useConsolidadoReposicion } from '@/hooks/useConsolidadoReposicion';
import { useRutaCompras } from '@/hooks/useRutaCompras';
import { useFinanzas } from '@/hooks/useFinanzas';
import { useAlertasPresupuesto } from '@/hooks/useAlertasPresupuesto';
import { usePorReponerSedes } from '@/hooks/usePorReponerSedes';
import { calcularAlertas, gastadoEntrega } from '@/lib/alertas';
import { tareasDeAdministrador, tareasDeCompras, tareasDeGerencia, type IconoTarea, type Tarea, type Urgencia } from '@/lib/hoy';
import { esEfectivoPendiente } from '@/lib/deliverys';
import { fechaLarga } from '@/lib/compras';
import { getTodayLima } from '@/lib/dates';
import { formatMonto, roundTwo } from '@/lib/utils';
import type { PedidoConItems } from '@/types';
import {
  Banknote, Bike, BellRing, Camera, ChevronRight, ClipboardCheck, ClipboardList, Eye, HandCoins, LayoutDashboard,
  Loader2, PackageCheck, PartyPopper, Plus, Receipt, RotateCcw, ShoppingCart, Truck, Wallet,
} from 'lucide-react';

const ICONO: Record<IconoTarea, typeof Truck> = {
  recibir: PackageCheck, rendicion: ClipboardCheck, lista: ClipboardList, dinero: HandCoins, delivery: Bike,
  repedir: RotateCcw, ruta: Truck, foto: Camera, rendir: Wallet, alerta: BellRing, reponer: Banknote,
};

const URGENCIA: Record<Urgencia, { etiqueta: string; circulo: string; chip: string }> = {
  ahora: { etiqueta: 'Ahora', circulo: 'bg-amber-100 text-amber-700', chip: 'bg-amber-100 text-amber-800' },
  hoy: { etiqueta: 'Hoy', circulo: 'bg-emerald-50 text-yayis-green', chip: 'bg-emerald-50 text-emerald-800' },
  pronto: { etiqueta: 'Cuando puedas', circulo: 'bg-gray-100 text-gray-500', chip: 'bg-gray-100 text-gray-600' },
};

function saludo(nombre: string | undefined) {
  const hora = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Lima', hour: 'numeric', hour12: false }));
  const parte = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const primer = nombre?.trim().split(/\s+/)[0];
  return primer ? `${parte}, ${primer}` : parte;
}

/**
 * «Listo» cuando las lecturas iniciales terminaron. Se espera un instante antes de creerle a «no está cargando»
 * (las lecturas arrancan después del primer dibujo) y, como máximo, 4 s para no quedar esperando una que no corre.
 */
function useListo(cargando: boolean) {
  const [arranco, setArranco] = useState(false);
  const [tiempo, setTiempo] = useState(false);
  useEffect(() => {
    const a = window.setTimeout(() => setArranco(true), 400);
    const t = window.setTimeout(() => setTiempo(true), 4000);
    return () => { window.clearTimeout(a); window.clearTimeout(t); };
  }, []);
  return (arranco && !cargando) || tiempo;
}

function TarjetaTarea({ tarea, onIr }: { tarea: Tarea; onIr: (t: Tarea) => void }) {
  const Icono = ICONO[tarea.icono];
  const u = URGENCIA[tarea.urgencia];
  return (
    <button
      type="button"
      onClick={() => onIr(tarea)}
      className="group flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-yayis-green/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yayis-green sm:p-4"
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${u.circulo}`}><Icono size={20} /></span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-yayis-dark">{tarea.titulo}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${u.chip}`}>{u.etiqueta}</span>
        </span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{tarea.detalle}</span>
      </span>
      <span className="hidden shrink-0 items-center gap-1 rounded-lg bg-yayis-green px-3 py-2 text-sm font-medium text-white transition group-hover:bg-yayis-dark sm:inline-flex">
        {tarea.boton} <ChevronRight size={15} />
      </span>
      <ChevronRight size={20} className="shrink-0 text-gray-400 sm:hidden" />
    </button>
  );
}

function Dato({ etiqueta, valor, nota, alerta }: { etiqueta: string; valor: string; nota?: string; alerta?: boolean }) {
  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${alerta ? 'text-red-600' : 'text-yayis-dark'}`}>{valor}</p>
      {nota && <p className="text-[11px] leading-tight text-muted-foreground">{nota}</p>}
    </div>
  );
}

function Atajo({ to, icono: Icono, texto }: { to: string; icono: typeof Truck; texto: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm font-medium text-yayis-dark shadow-sm transition hover:border-yayis-green/40 hover:bg-emerald-50/50">
      <Icono size={16} className="text-yayis-green" /> {texto}
    </Link>
  );
}

/** Esqueleto común: saludo, lo que hay que hacer, los números de la semana y los atajos. */
function Hoy({ subtitulo, tareas, listo, datos, atajos }: {
  subtitulo: string;
  tareas: Tarea[];
  listo: boolean;
  datos: ReactNode;
  atajos: ReactNode;
}) {
  const { profile } = useAuth();
  const { cambiarSede } = useSedeActiva();
  const navigate = useNavigate();
  const ahora = tareas.filter(t => t.urgencia === 'ahora').length;

  function ir(t: Tarea) {
    if (t.sedeId) cambiarSede(t.sedeId);
    navigate(t.ir);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-yayis-dark sm:text-3xl">{saludo(profile?.nombre)}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitulo.charAt(0).toUpperCase() + subtitulo.slice(1)}</p>
      </header>

      <section aria-labelledby="que-hacer" className="space-y-3">
        {!listo ? (
          <p className="flex items-center gap-2 rounded-xl border bg-white p-4 text-sm text-muted-foreground shadow-sm">
            <Loader2 size={16} className="animate-spin" /> Revisando tus pendientes…
          </p>
        ) : tareas.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-yayis-green text-white"><PartyPopper size={20} /></span>
            <div>
              <h2 id="que-hacer" className="font-semibold text-emerald-900">Todo al día</h2>
              <p className="text-sm text-emerald-800">No tienes nada pendiente. Cuando haya algo que hacer, aparecerá aquí.</p>
            </div>
          </div>
        ) : (
          <>
            <h2 id="que-hacer" className="text-base font-semibold text-yayis-dark">
              {tareas.length === 1 ? 'Tienes 1 cosa por hacer' : `Tienes ${tareas.length} cosas por hacer`}
              {ahora > 0 && <span className="font-normal text-muted-foreground"> · {ahora === 1 ? '1 es para ahora' : `${ahora} son para ahora`}</span>}
            </h2>
            <div className="space-y-2">{tareas.map(t => <TarjetaTarea key={t.clave} tarea={t} onIr={ir} />)}</div>
          </>
        )}
      </section>

      <section aria-label="Cómo vas" className="grid grid-cols-2 gap-2 sm:grid-cols-3 [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-1">{datos}</section>

      <section aria-label="Atajos" className="flex flex-wrap gap-2">{atajos}</section>
    </div>
  );
}

function HoyAdministrador() {
  const hoy = getTodayLima();
  const { sedeActiva } = useSedeActiva();
  const { pedidos, loading: l1 } = usePedidos();
  const { entregas, loading: l2 } = useEntregas('sede');
  const { deliverys, loading: l3 } = useDeliverys('sede');
  const saldo = useSaldoSemanal();
  const { consolidado } = useConsolidadoReposicion();
  const listo = useListo(l1 || l2 || l3);

  const tareas = useMemo(() => tareasDeAdministrador({
    hoy, sede: sedeActiva ? { nombre: sedeActiva.nombre, dias_compra: sedeActiva.dias_compra ?? [] } : null,
    pedidos, entregas, deliverys, quedaSemanal: saldo.queda,
  }), [hoy, sedeActiva, pedidos, entregas, deliverys, saldo.queda]);
  const enManos = roundTwo(entregas.filter(e => e.estado === 'abierta').reduce((s, e) => s + Number(e.monto) - gastadoDe(e), 0));

  return (
    <Hoy
      subtitulo={`${fechaLarga(hoy)} · ${sedeActiva?.nombre ?? ''}`}
      tareas={tareas}
      listo={listo}
      datos={<>
        <Dato etiqueta="Te queda del monto semanal" valor={formatMonto(saldo.queda)} nota={saldo.montoSemanal > 0 ? `de ${formatMonto(saldo.montoSemanal)}` : 'Sin monto semanal'} alerta={saldo.queda < 0} />
        <Dato etiqueta="Compras tiene de tu sede" valor={formatMonto(enManos)} nota="por gastar o devolver" />
        <Dato etiqueta="Gerencia te debe reponer" valor={formatMonto(consolidado.total.total)} nota={`${consolidado.total.cantidad} gasto(s) pendiente(s)`} />
      </>}
      atajos={<>
        <Atajo to="/gastos" icono={Plus} texto="Anotar un gasto" />
        <Atajo to="/pedidos" icono={ShoppingCart} texto="Mis listas" />
        <Atajo to="/recepcion" icono={HandCoins} texto="Dinero de la semana" />
      </>}
    />
  );
}

function HoyCompras() {
  const hoy = getTodayLima();
  const { pedidos: ruta, loading: l1 } = useRutaCompras(hoy);
  const { entregas, loading: l2 } = useEntregas('mias');
  const { deliverys, loading: l3 } = useDeliverys('mios');
  const listo = useListo(l1 || l2 || l3);

  const tareas = useMemo(() => tareasDeCompras({ hoy, ruta: ruta as unknown as PedidoConItems[], entregas, deliverys }), [hoy, ruta, entregas, deliverys]);
  const abiertas = entregas.filter(e => e.estado === 'abierta');
  const enMano = roundTwo(abiertas.reduce((s, e) => s + Number(e.monto) - gastadoDe(e), 0));
  const porComprar = ruta.filter(p => p.estado === 'enviado').reduce((n, p) => n + p.pedido_items.filter(i => i.estado === 'pendiente').length, 0);
  const efectivo = deliverys.filter(esEfectivoPendiente).reduce((s, d) => roundTwo(s + Number(d.cobrado)), 0);
  const porSede = Array.from(abiertas.reduce((m, e) => m.set(e.sedes?.nombre ?? '', roundTwo((m.get(e.sedes?.nombre ?? '') ?? 0) + Number(e.monto) - gastadoDe(e))), new Map<string, number>()));

  return (
    <Hoy
      subtitulo={fechaLarga(hoy)}
      tareas={tareas}
      listo={listo}
      datos={<>
        <Dato etiqueta="Tienes por gastar o devolver" valor={formatMonto(enMano)} nota={porSede.map(([n, v]) => `${n} ${formatMonto(v)}`).join(' · ') || 'Ninguna sede te entregó dinero'} alerta={enMano < 0} />
        <Dato etiqueta="Productos por comprar" valor={String(porComprar)} nota="hoy y atrasados" />
        <Dato etiqueta="Efectivo de deliverys" valor={formatMonto(efectivo)} nota="por entregar a las sedes" />
      </>}
      atajos={<>
        <Atajo to="/ruta" icono={Truck} texto="Ruta de compras" />
        <Atajo to="/rendicion" icono={Wallet} texto="Mi dinero y rendición" />
        <Atajo to="/deliverys" icono={Bike} texto="Registrar delivery" />
      </>}
    />
  );
}

function HoyGerencia() {
  const hoy = getTodayLima();
  const finanzas = useFinanzas();
  const presupuesto = useAlertasPresupuesto(hoy);
  const { porReponer, loading: l2 } = usePorReponerSedes(true);
  const listo = useListo(finanzas.loading || l2);

  const alertas = useMemo(() => calcularAlertas({ ...finanzas, presupuesto }, hoy), [finanzas, presupuesto, hoy]);
  const tareas = useMemo(() => tareasDeGerencia({ alertas, porReponer }), [alertas, porReponer]);
  const totalReponer = porReponer.reduce((s, x) => roundTwo(s + x.total), 0);
  const enCompras = roundTwo(finanzas.entregas.filter(e => e.estado === 'abierta').reduce((s, e) => s + Number(e.monto) - gastadoEntrega(e), 0));
  const altas = alertas.filter(a => a.nivel === 'alta').length;

  return (
    <Hoy
      subtitulo={`${fechaLarga(hoy)} · las 3 sedes`}
      tareas={tareas}
      listo={listo}
      datos={<>
        <Dato etiqueta="Por reponer a las sedes" valor={formatMonto(totalReponer)} nota={porReponer.map(s => `${s.nombre} ${formatMonto(s.total)}`).join(' · ') || 'Nada pendiente'} />
        <Dato etiqueta="Compras tiene en mano" valor={formatMonto(enCompras)} nota="dinero entregado sin rendir" />
        <Dato etiqueta="Alertas importantes" valor={String(altas)} nota={`${alertas.length} en total`} alerta={altas > 0} />
      </>}
      atajos={<>
        <Atajo to="/vista-general" icono={Eye} texto="Vista general" />
        <Atajo to="/finanzas" icono={LayoutDashboard} texto="Panel de Finanzas" />
        <Atajo to="/resumen" icono={Receipt} texto="Reponer (Resumen)" />
      </>}
    />
  );
}

/** «Hoy»: la primera pantalla de cada rol. Dice qué hay que hacer y lleva directo a donde se hace. */
export function HoyPage() {
  const { profile } = useAuth();
  if (profile?.rol === 'owner') return <HoyGerencia />;
  if (profile?.rol === 'compras') return <HoyCompras />;
  return <HoyAdministrador />;
}
