import { useEffect, useState, useCallback, useMemo, type FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useFondos } from '@/hooks/useFondos';
import { useArqueo } from '@/hooks/useArqueo';
import { useReposiciones } from '@/hooks/useReposiciones';
import { useToast } from '@/components/ui/toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Loading } from '@/components/ui/loading';
import { formatMonto, roundTwo } from '@/lib/utils';
import { getTodayLima, calcularSemana, getMesLabel, getSemanasDelMes, getMesesDisponibles } from '@/lib/dates';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PieChart, Pie, Cell } from 'recharts';
import { DollarSign, Wallet, CreditCard, AlertTriangle, CheckCircle, Lock, Plus, Trash2, Loader2, History } from 'lucide-react';
import { useGastos } from '@/hooks/useGastos';
import type { MetodoPago, GastoConCategoria } from '@/types';

const COLORS = ['#004C40', '#098B5F', '#10B981', '#34D399', '#6EE7B7', '#F59E0B', '#DC2626', '#8B5CF6', '#EC4899', '#06B6D4'];

interface SemanaRow {
  semana: number;
  totalGastado: number;
  efectivo: number;
  cuentas: number;
  pendiente: number;
  porCategoria: Record<string, number>;
}

export function ResumenPage() {
  const { profile } = useAuth();
  const { fondos } = useFondos();
  const { arqueo, fetchArqueo, saveArqueo, cerrarSemana } = useArqueo();
  const { reposiciones, saldo, fetchSaldo, createReposicion, deleteReposicion } = useReposiciones();
  const { gastos: historicoGastos, total: historicoTotal, fetchGastos: fetchHistorico } = useGastos();
  const { addToast } = useToast();

  const today = getTodayLima();
  const meses = useMemo(() => getMesesDisponibles(), []);
  const isOwner = profile?.rol === 'owner';
  const currentYear = new Date().getFullYear();

  // Filters
  const [filterAnio, setFilterAnio] = useState(currentYear);
  const [filterMes, setFilterMes] = useState<number>(new Date().getMonth() + 1);
  const [filterSemana, setFilterSemana] = useState<number>(0); // 0 = todas

  const isAnual = filterMes === 0;
  const semanas = useMemo(() => isAnual ? [] : getSemanasDelMes(filterAnio, filterMes), [filterAnio, filterMes, isAnual]);
  const mesLabel = useMemo(() => {
    if (isAnual) return '';
    const m = meses.find(x => x.anio === filterAnio && x.mes === filterMes);
    return m?.label ?? '';
  }, [filterAnio, filterMes, meses, isAnual]);

  // Data
  const [loading, setLoading] = useState(true);
  const [semanasData, setSemanasData] = useState<SemanaRow[]>([]);
  const [totalEfectivo, setTotalEfectivo] = useState(0);
  const [totalCuentas, setTotalCuentas] = useState(0);
  const [totalGastado, setTotalGastado] = useState(0);
  const [totalPendiente, setTotalPendiente] = useState(0);
  const [totalPagado, setTotalPagado] = useState(0);
  const [topCategorias, setTopCategorias] = useState<{ nombre: string; total: number; porcentaje: number }[]>([]);
  const [topItemsPorCategoria, setTopItemsPorCategoria] = useState<Array<{
    categoria: string;
    total: number;
    items: Array<{ descripcion: string; monto: number; fecha: string; metodo: string; estado: string }>;
  }>>([]);
  const [valoresRevisar, setValoresRevisar] = useState<Array<{
    tipo: 'duplicado' | 'monto-similar';
    severidad: 'alta' | 'media';
    monto: number;
    descripcion?: string;
    gastos: Array<{ descripcion: string; monto: number; fecha: string; metodo: string; estado: string; categoria: string }>;
  }>>([]);
  const [categoriasEfectivo, setCategoriasEfectivo] = useState<{ nombre: string; total: number }[]>([]);
  const [categoriasCuentas, setCategoriasCuentas] = useState<{ nombre: string; total: number }[]>([]);
  const [catEfPagado, setCatEfPagado] = useState<{ nombre: string; total: number }[]>([]);
  const [catCtPagado, setCatCtPagado] = useState<{ nombre: string; total: number }[]>([]);
  const [totalEfPagado, setTotalEfPagado] = useState(0);
  const [totalCtPagado, setTotalCtPagado] = useState(0);
  const [totalEfPend, setTotalEfPend] = useState(0);
  const [totalCtPend, setTotalCtPend] = useState(0);
  const [allCatNames, setAllCatNames] = useState<string[]>([]);

  // Arqueo
  const [ventasPos, setVentasPos] = useState('');
  const [efectivoEntregado, setEfectivoEntregado] = useState('');
  const [showCerrar, setShowCerrar] = useState(false);

  // Reposicion form
  const [repoFecha, setRepoFecha] = useState(today);
  const [repoMetodo, setRepoMetodo] = useState<MetodoPago>('efectivo');
  const [repoMonto, setRepoMonto] = useState('');
  const [repoNotas, setRepoNotas] = useState('');
  const [repoSaving, setRepoSaving] = useState(false);

  // Historico
  const [showHistorico, setShowHistorico] = useState(false);
  const [historicoPage, setHistoricoPage] = useState(0);

  // Cuantos gastos mostrar en "Detalle por categoria": 5, 10 o 'todos'
  const [topItemsCount, setTopItemsCount] = useState<5 | 10 | 'todos'>(5);

  const fondoEf = fondos ? Number(fondos.fondo_efectivo) : 500;
  const fondoCt = fondos ? Number(fondos.fondo_cuentas) : 500;

  const loadData = useCallback(async () => {
    if (!profile?.sede_id || (!isAnual && !mesLabel)) return;
    setLoading(true);

    // Fetch gastos
    let query = supabase
      .from('gastos')
      .select('id, fecha, descripcion, monto, metodo_pago, estado, semana, categorias(nombre)')
      .eq('sede_id', profile.sede_id)
      .order('fecha', { ascending: true });

    if (isAnual) {
      // Filter by year using fecha range
      query = query.gte('fecha', `${filterAnio}-01-01`).lte('fecha', `${filterAnio}-12-31`);
    } else {
      query = query.eq('mes', mesLabel);
    }

    if (filterSemana > 0) {
      query = query.eq('semana', filterSemana);
    }

    const { data: gastosData } = await query;

    // Build period map (by semana or by month)
    const periodMap = new Map<number, SemanaRow>();
    const catTotalMap = new Map<string, number>();
    const itemsByCategoria = new Map<string, Array<{ descripcion: string; monto: number; fecha: string; metodo: string; estado: string }>>();
    const catEfectivoMap = new Map<string, number>();
    const catCuentasMap = new Map<string, number>();
    const catEfPagadoMap = new Map<string, number>();
    const catCtPagadoMap = new Map<string, number>();
    const catEfPendMap = new Map<string, number>();
    const catCtPendMap = new Map<string, number>();
    let sumEfPagado = 0, sumCtPagado = 0, sumEfPend = 0, sumCtPend = 0;
    let sumEf = 0, sumCt = 0, sumTotal = 0, sumPend = 0, sumPagado = 0;

    if (isAnual) {
      for (let m = 1; m <= 12; m++) {
        periodMap.set(m, { semana: m, totalGastado: 0, efectivo: 0, cuentas: 0, pendiente: 0, porCategoria: {} });
      }
    } else {
      for (const s of semanas) {
        periodMap.set(s.semana, { semana: s.semana, totalGastado: 0, efectivo: 0, cuentas: 0, pendiente: 0, porCategoria: {} });
      }
    }

    for (const g of (gastosData ?? []) as Array<Record<string, unknown>>) {
      const key = isAnual ? new Date(g.fecha as string).getMonth() + 1 : g.semana as number;
      const s = periodMap.get(key);
      if (!s) continue;
      const monto = Number(g.monto);
      const catName = ((g.categorias as { nombre: string } | null)?.nombre) ?? 'Otros';
      const metodo = g.metodo_pago as string;
      const estado = g.estado as string;

      s.totalGastado = roundTwo(s.totalGastado + monto);
      sumTotal = roundTwo(sumTotal + monto);

      // Desglose por metodo de pago (todos los gastos, sin importar estado)
      if (metodo === 'efectivo') {
        s.efectivo = roundTwo(s.efectivo + monto);
        sumEf = roundTwo(sumEf + monto);
        catEfectivoMap.set(catName, roundTwo((catEfectivoMap.get(catName) ?? 0) + monto));
      } else {
        s.cuentas = roundTwo(s.cuentas + monto);
        sumCt = roundTwo(sumCt + monto);
        catCuentasMap.set(catName, roundTwo((catCuentasMap.get(catName) ?? 0) + monto));
      }

      if (estado === 'pagado') {
        sumPagado = roundTwo(sumPagado + monto);
        if (metodo === 'efectivo') {
          catEfPagadoMap.set(catName, roundTwo((catEfPagadoMap.get(catName) ?? 0) + monto));
          sumEfPagado = roundTwo(sumEfPagado + monto);
        } else {
          catCtPagadoMap.set(catName, roundTwo((catCtPagadoMap.get(catName) ?? 0) + monto));
          sumCtPagado = roundTwo(sumCtPagado + monto);
        }
      } else {
        s.pendiente = roundTwo(s.pendiente + monto);
        sumPend = roundTwo(sumPend + monto);
        if (metodo === 'efectivo') {
          catEfPendMap.set(catName, roundTwo((catEfPendMap.get(catName) ?? 0) + monto));
          sumEfPend = roundTwo(sumEfPend + monto);
        } else {
          catCtPendMap.set(catName, roundTwo((catCtPendMap.get(catName) ?? 0) + monto));
          sumCtPend = roundTwo(sumCtPend + monto);
        }
      }

      s.porCategoria[catName] = roundTwo((s.porCategoria[catName] ?? 0) + monto);
      catTotalMap.set(catName, roundTwo((catTotalMap.get(catName) ?? 0) + monto));

      // Guardar gasto individual para el detalle "Top 5 por categoria"
      if (!itemsByCategoria.has(catName)) itemsByCategoria.set(catName, []);
      itemsByCategoria.get(catName)!.push({
        descripcion: (g.descripcion as string) ?? '(sin descripcion)',
        monto,
        fecha: g.fecha as string,
        metodo,
        estado,
      });
    }

    const allPeriods = Array.from(periodMap.values());
    setSemanasData(isAnual ? allPeriods.filter(p => p.totalGastado > 0) : allPeriods);
    setTotalEfectivo(sumEf);
    setTotalCuentas(sumCt);
    setTotalGastado(sumTotal);
    setTotalPendiente(sumPend);
    setTotalPagado(sumPagado);

    // Top categories
    const sorted = Array.from(catTotalMap.entries()).sort((a, b) => b[1] - a[1]);
    setTopCategorias(sorted.slice(0, 5).map(([nombre, total]) => ({
      nombre, total,
      porcentaje: sumTotal > 0 ? roundTwo((total / sumTotal) * 100) : 0,
    })));

    // Gastos PENDIENTES individuales por categoria (los que aun faltan reponerle a Luis).
    // Filtramos a estado='pendiente', calculamos un total de pendientes por categoria,
    // ordenamos por ese total y tomamos las top 5 categorias que tengan al menos 1 pendiente.
    // El slice a 5/10/todos ocurre al renderizar segun topItemsCount.
    type ItemDetalle = { descripcion: string; monto: number; fecha: string; metodo: string; estado: string };
    const pendientesPorCategoria = new Map<string, { items: ItemDetalle[]; total: number }>();
    for (const [cat, items] of itemsByCategoria) {
      const soloPendientes = items.filter(it => it.estado === 'pendiente');
      if (soloPendientes.length === 0) continue;
      const totalPend = soloPendientes.reduce((acc, it) => roundTwo(acc + it.monto), 0);
      pendientesPorCategoria.set(cat, { items: soloPendientes, total: totalPend });
    }
    const sortedPendientes = Array.from(pendientesPorCategoria.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5);
    setTopItemsPorCategoria(sortedPendientes.map(([nombre, { items, total }]) => ({
      categoria: nombre,
      total,
      items: items.slice().sort((a, b) => b.monto - a.monto),
    })));

    // ====== Deteccion de "Valores a revisar" ======
    // Tomamos todos los gastos del periodo y buscamos:
    //   1) Posibles duplicados: misma descripcion + mismo monto (>= 2 gastos)
    //   2) Mismo monto, descripcion distinta (>= 2 gastos) si monto >= 30
    type GastoFlag = { descripcion: string; monto: number; fecha: string; metodo: string; estado: string; categoria: string };
    const allGastosFlat: GastoFlag[] = [];
    for (const g of (gastosData ?? []) as Array<Record<string, unknown>>) {
      allGastosFlat.push({
        descripcion: ((g.descripcion as string) ?? '(sin descripcion)').trim(),
        monto: Number(g.monto),
        fecha: g.fecha as string,
        metodo: g.metodo_pago as string,
        estado: g.estado as string,
        categoria: ((g.categorias as { nombre: string } | null)?.nombre) ?? 'Otros',
      });
    }

    const revisar: typeof valoresRevisar = [];

    // 1) Duplicados exactos (misma descripcion + mismo monto)
    const dupMap = new Map<string, GastoFlag[]>();
    for (const g of allGastosFlat) {
      const key = `${g.descripcion.toLowerCase()}|${g.monto.toFixed(2)}`;
      if (!dupMap.has(key)) dupMap.set(key, []);
      dupMap.get(key)!.push(g);
    }
    const idsEnDuplicados = new Set<string>();
    for (const [, gs] of dupMap) {
      if (gs.length >= 2 && gs[0]) {
        const first = gs[0];
        revisar.push({
          tipo: 'duplicado',
          severidad: 'alta',
          monto: first.monto,
          descripcion: first.descripcion,
          gastos: gs.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)),
        });
        for (const g of gs) idsEnDuplicados.add(`${g.descripcion.toLowerCase()}|${g.monto.toFixed(2)}|${g.fecha}`);
      }
    }

    // 2) Mismo monto, descripcion distinta (monto >= S/ 30)
    const montoMap = new Map<string, GastoFlag[]>();
    for (const g of allGastosFlat) {
      if (g.monto < 30) continue;
      const key = g.monto.toFixed(2);
      if (!montoMap.has(key)) montoMap.set(key, []);
      montoMap.get(key)!.push(g);
    }
    for (const [, gs] of montoMap) {
      if (gs.length < 2) continue;
      const distinctDescs = new Set(gs.map(x => x.descripcion.toLowerCase()));
      if (distinctDescs.size < 2) continue; // ya cubierto por duplicado exacto
      // Filtrar gastos que ya estan en un grupo de "duplicado exacto"
      const restantes = gs.filter(g => !idsEnDuplicados.has(`${g.descripcion.toLowerCase()}|${g.monto.toFixed(2)}|${g.fecha}`));
      if (restantes.length < 2 || !restantes[0]) continue;
      revisar.push({
        tipo: 'monto-similar',
        severidad: 'media',
        monto: restantes[0].monto,
        gastos: restantes.slice().sort((a, b) => a.fecha.localeCompare(b.fecha)),
      });
    }

    // Ordenar: alta severidad primero, dentro de cada severidad por monto desc
    revisar.sort((a, b) => {
      if (a.severidad !== b.severidad) return a.severidad === 'alta' ? -1 : 1;
      return b.monto - a.monto;
    });
    setValoresRevisar(revisar);

    // Categorias por metodo de pago
    setCategoriasEfectivo(Array.from(catEfPendMap.entries()).sort((a, b) => b[1] - a[1]).map(([nombre, total]) => ({ nombre, total })));
    setCategoriasCuentas(Array.from(catCtPendMap.entries()).sort((a, b) => b[1] - a[1]).map(([nombre, total]) => ({ nombre, total })));
    setCatEfPagado(Array.from(catEfPagadoMap.entries()).sort((a, b) => b[1] - a[1]).map(([nombre, total]) => ({ nombre, total })));
    setCatCtPagado(Array.from(catCtPagadoMap.entries()).sort((a, b) => b[1] - a[1]).map(([nombre, total]) => ({ nombre, total })));
    setTotalEfPagado(sumEfPagado);
    setTotalCtPagado(sumCtPagado);
    setTotalEfectivo(sumEf);
    setTotalCuentas(sumCt);
    setTotalEfPend(sumEfPend);
    setTotalCtPend(sumCtPend);
    setAllCatNames(sorted.map(([n]) => n));

    // Arqueo (only when specific week selected)
    if (filterSemana > 0) {
      await fetchArqueo(filterSemana, mesLabel, filterAnio, profile.sede_id);
    }

    // Saldo reposiciones (global)
    await fetchSaldo(profile.sede_id);

    setLoading(false);
  }, [profile, mesLabel, filterSemana, filterAnio, isAnual, semanas, fetchArqueo, fetchSaldo]);

  useEffect(() => { loadData(); }, [loadData]);

  // Set arqueo form values when arqueo loads
  useEffect(() => {
    if (arqueo) {
      setVentasPos(String(arqueo.ventas_efectivo_pos || ''));
      setEfectivoEntregado(String(arqueo.efectivo_entregado_luis || ''));
    }
  }, [arqueo]);

  // Ensure arqueo record exists for selected week
  useEffect(() => {
    if (!profile?.sede_id || !fondos || loading || filterSemana === 0) return;
    if (arqueo) return;

    const semanaInfo = semanas.find(s => s.semana === filterSemana);
    if (!semanaInfo) return;

    saveArqueo({
      sede_id: profile.sede_id,
      semana: filterSemana,
      mes: mesLabel,
      anio: filterAnio,
      fecha_inicio: semanaInfo.inicio,
      fecha_fin: semanaInfo.fin,
      fondo_inicial_efectivo: fondoEf,
      fondo_inicial_cuentas: fondoCt,
      total_gastado_efectivo: 0, total_gastado_cuentas: 0,
      ventas_efectivo_pos: 0, efectivo_entregado_luis: 0,
      monto_reponer_efectivo: 0, monto_reponer_cuentas: 0,
      diferencia_caja: 0,
      cerrado: false, cerrado_por: null, cerrado_at: null,
    }).then(() => fetchArqueo(filterSemana, mesLabel, filterAnio, profile.sede_id ?? undefined));
  }, [arqueo, profile, fondos, loading, filterSemana, mesLabel, filterAnio, semanas, fondoEf, fondoCt, saveArqueo, fetchArqueo]);

  // Arqueo calculations
  const gastadoEfSemana = totalEfectivo;
  const gastadoCtSemana = totalCuentas;
  const ventasNum = parseFloat(ventasPos) || 0;
  const entregadoNum = parseFloat(efectivoEntregado) || 0;
  const efectivoUsadoDeVentas = roundTwo(Math.max(0, gastadoEfSemana - fondoEf));
  const debiaEntregar = roundTwo(ventasNum - efectivoUsadoDeVentas);
  const diferenciaCaja = roundTwo(entregadoNum - debiaEntregar);

  async function handleCerrarSemana() {
    if (!arqueo?.id || !fondos) return;
    const { error } = await cerrarSemana(
      arqueo.id, ventasNum, entregadoNum,
      fondoEf, gastadoEfSemana, gastadoCtSemana, fondoCt,
    );
    if (error) addToast(`Error: ${error}`, 'error');
    else { addToast('Semana cerrada', 'success'); loadData(); }
    setShowCerrar(false);
  }

  // Caja de Luis
  const cajaEfectivo = roundTwo(fondoEf - saldo.deudaEfectivo + saldo.repuestoEfectivo);
  const cajaCuentas = roundTwo(fondoCt - saldo.deudaCuentas + saldo.repuestoCuentas);

  // Load historico when opened or filters change
  useEffect(() => {
    if (!showHistorico) return;
    fetchHistorico({
      semana: (!isAnual && filterSemana > 0) ? filterSemana : undefined,
      mes: isAnual ? undefined : mesLabel,
      estado: 'pagado',
      page: historicoPage,
      pageSize: 20,
    });
  }, [showHistorico, filterSemana, mesLabel, isAnual, historicoPage, fetchHistorico]);

  if (loading) return <Loading text="Cargando resumen..." />;

  const barData = filterSemana === 0
    ? semanasData.map(s => {
        const name = isAnual
          ? new Date(filterAnio, s.semana - 1, 1).toLocaleDateString('es-PE', { month: 'short' }).replace(/^./, c => c.toUpperCase())
          : `Sem ${s.semana}`;
        return { name, 'Total Gastado': s.totalGastado };
      })
    : topCategorias.map(c => ({ name: c.nombre, 'Total Gastado': c.total }));

  const stackedData = semanasData.map(s => {
    const name = isAnual
      ? new Date(filterAnio, s.semana - 1, 1).toLocaleDateString('es-PE', { month: 'short' }).replace(/^./, c => c.toUpperCase())
      : `Sem ${s.semana}`;
    return { name, ...s.porCategoria };
  });

  const ultimaReposicion = reposiciones[0];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header + Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-yayis-dark">Resumen</h1>
        <div className="flex flex-wrap gap-2">
          <Select value={filterAnio} onChange={e => setFilterAnio(parseInt(e.target.value))} className="w-24">
            <option value={currentYear}>{currentYear}</option>
            <option value={currentYear - 1}>{currentYear - 1}</option>
          </Select>
          <Select value={filterMes} onChange={e => { setFilterMes(parseInt(e.target.value)); setFilterSemana(0); }} className="w-44">
            <option value={0}>Todo el Año</option>
            {Array.from({ length: 12 }, (_, i) => {
              const d = new Date(filterAnio, i, 1);
              const label = d.toLocaleDateString('es-PE', { month: 'long' });
              return <option key={i + 1} value={i + 1}>{label.charAt(0).toUpperCase() + label.slice(1)}</option>;
            })}
          </Select>
          {!isAnual && (
            <Select value={filterSemana} onChange={e => setFilterSemana(parseInt(e.target.value))} className="w-52">
              <option value={0}>Todas las semanas</option>
              {semanas.map(s => (
                <option key={s.semana} value={s.semana}>Semana {s.semana} ({s.inicio.slice(5)} al {s.fin.slice(5)})</option>
              ))}
            </Select>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><DollarSign size={16} className="text-yayis-accent" /><span className="text-xs text-muted-foreground">Total Gastado</span></div>
            <p className="text-xl font-bold">{formatMonto(totalGastado)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><CheckCircle size={16} className="text-emerald-500" /><span className="text-xs text-muted-foreground">Total Pagado</span></div>
            <p className="text-xl font-bold text-emerald-600">{formatMonto(totalPagado)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><AlertTriangle size={16} className="text-amber-500" /><span className="text-xs text-muted-foreground">Total Pendiente</span></div>
            <p className="text-xl font-bold text-amber-600">{formatMonto(totalPendiente)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1"><DollarSign size={16} className="text-muted-foreground" /><span className="text-xs text-muted-foreground">Gastado Efectivo / Cuentas</span></div>
            <p className="text-lg font-bold">{formatMonto(totalEfectivo)} <span className="text-muted-foreground">/</span> {formatMonto(totalCuentas)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Reponer + Caja de Luis */}
      {isOwner && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-yayis-green/30 bg-yayis-cream">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><Wallet size={16} className="text-yayis-green" /><span className="text-xs font-medium text-yayis-green">Reponer Efectivo</span></div>
              <p className="text-xl font-bold text-yayis-green">{formatMonto(saldo.deudaEfectivo)}</p>
              <p className="text-xs text-muted-foreground">Pendiente en efectivo</p>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><CreditCard size={16} className="text-blue-600" /><span className="text-xs font-medium text-blue-600">Reponer Cuentas</span></div>
              <p className="text-xl font-bold text-blue-600">{formatMonto(saldo.deudaCuentas)}</p>
              <p className="text-xs text-muted-foreground">Pendiente en cuentas</p>
            </CardContent>
          </Card>
          <Card className={`border-2 ${cajaEfectivo >= fondoEf ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><Wallet size={16} /><span className="text-xs font-medium">Caja Luis Efectivo</span></div>
              <p className={`text-xl font-bold ${cajaEfectivo >= fondoEf ? 'text-emerald-700' : 'text-amber-700'}`}>{formatMonto(cajaEfectivo)}</p>
              <p className="text-xs text-muted-foreground">Fondo: {formatMonto(fondoEf)}</p>
            </CardContent>
          </Card>
          <Card className={`border-2 ${cajaCuentas >= fondoCt ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1"><CreditCard size={16} /><span className="text-xs font-medium">Caja Luis Cuentas</span></div>
              <p className={`text-xl font-bold ${cajaCuentas >= fondoCt ? 'text-emerald-700' : 'text-amber-700'}`}>{formatMonto(cajaCuentas)}</p>
              <p className="text-xs text-muted-foreground">Fondo: {formatMonto(fondoCt)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Desglose por categoria: Ya repuesto (pagado) */}
      {isOwner && (totalEfPagado > 0 || totalCtPagado > 0) && (
        <div>
          <h3 className="text-base font-bold text-yayis-dark mb-3">Desglose de lo Repuesto (gastos ya pagados)</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {catEfPagado.length > 0 && (
              <Card className="border-emerald-200 bg-emerald-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wallet size={18} className="text-emerald-600" />
                    Repuesto Efectivo: {formatMonto(totalEfPagado)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b"><th className="text-left py-1.5 font-medium">Categoria</th><th className="text-right py-1.5 font-medium">Monto</th><th className="text-right py-1.5 font-medium">%</th></tr></thead>
                    <tbody>
                      {catEfPagado.map(c => (
                        <tr key={c.nombre} className="border-b">
                          <td className="py-1.5">{c.nombre}</td>
                          <td className="text-right py-1.5 font-medium">{formatMonto(c.total)}</td>
                          <td className="text-right py-1.5 text-muted-foreground">{totalEfPagado > 0 ? roundTwo((c.total / totalEfPagado) * 100) : 0}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
            {catCtPagado.length > 0 && (
              <Card className="border-emerald-200 bg-emerald-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard size={18} className="text-emerald-600" />
                    Repuesto Cuentas: {formatMonto(totalCtPagado)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b"><th className="text-left py-1.5 font-medium">Categoria</th><th className="text-right py-1.5 font-medium">Monto</th><th className="text-right py-1.5 font-medium">%</th></tr></thead>
                    <tbody>
                      {catCtPagado.map(c => (
                        <tr key={c.nombre} className="border-b">
                          <td className="py-1.5">{c.nombre}</td>
                          <td className="text-right py-1.5 font-medium">{formatMonto(c.total)}</td>
                          <td className="text-right py-1.5 text-muted-foreground">{totalCtPagado > 0 ? roundTwo((c.total / totalCtPagado) * 100) : 0}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Desglose por categoria: Pendiente (aun no repuesto) */}
      {isOwner && (categoriasEfectivo.length > 0 || categoriasCuentas.length > 0) && (
        <div>
          <h3 className="text-base font-bold text-amber-700 mb-3">Desglose Pendiente por Reponer</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {categoriasEfectivo.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wallet size={18} className="text-amber-600" />
                    Pendiente Efectivo: {formatMonto(totalEfPend)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b"><th className="text-left py-1.5 font-medium">Categoria</th><th className="text-right py-1.5 font-medium">Monto</th><th className="text-right py-1.5 font-medium">%</th></tr></thead>
                    <tbody>
                      {categoriasEfectivo.map(c => (
                        <tr key={c.nombre} className="border-b">
                          <td className="py-1.5">{c.nombre}</td>
                          <td className="text-right py-1.5 font-medium">{formatMonto(c.total)}</td>
                          <td className="text-right py-1.5 text-muted-foreground">{totalEfPend > 0 ? roundTwo((c.total / totalEfPend) * 100) : 0}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
            {categoriasCuentas.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CreditCard size={18} className="text-amber-600" />
                    Pendiente Cuentas: {formatMonto(totalCtPend)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead><tr className="border-b"><th className="text-left py-1.5 font-medium">Categoria</th><th className="text-right py-1.5 font-medium">Monto</th><th className="text-right py-1.5 font-medium">%</th></tr></thead>
                    <tbody>
                      {categoriasCuentas.map(c => (
                        <tr key={c.nombre} className="border-b">
                          <td className="py-1.5">{c.nombre}</td>
                          <td className="text-right py-1.5 font-medium">{formatMonto(c.total)}</td>
                          <td className="text-right py-1.5 text-muted-foreground">{totalCtPend > 0 ? roundTwo((c.total / totalCtPend) * 100) : 0}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Valores a revisar (deteccion de duplicados y montos sospechosos) */}
      {valoresRevisar.length > 0 && (
        <Card className="border-orange-300 bg-orange-50/40">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={20} className="text-orange-600" />
                <CardTitle className="text-orange-800">Valores a Revisar</CardTitle>
                <span className="text-xs bg-orange-200 text-orange-800 rounded-full px-2 py-0.5 font-medium">{valoresRevisar.length}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Posibles duplicados o gastos con el mismo monto. Verifica in situ si son errores o pagos independientes legitimos.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {valoresRevisar.map((v, idx) => {
                const isAlta = v.severidad === 'alta';
                return (
                  <div
                    key={idx}
                    className={`rounded-lg border-2 p-3 ${isAlta ? 'border-red-300 bg-red-50/60' : 'border-amber-300 bg-amber-50/60'}`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${isAlta ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}>
                          {isAlta ? 'Posible duplicado' : 'Mismo monto'}
                        </span>
                        {v.tipo === 'duplicado' && v.descripcion && (
                          <span className="text-sm font-semibold text-yayis-dark">"{v.descripcion}"</span>
                        )}
                        <span className="text-xs text-muted-foreground">— {v.gastos.length} gastos a {formatMonto(v.monto)} c/u</span>
                      </div>
                      <span className={`text-sm font-bold ${isAlta ? 'text-red-700' : 'text-amber-700'}`}>
                        Total: {formatMonto(roundTwo(v.monto * v.gastos.length))}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {isAlta
                        ? 'Misma descripcion y mismo monto — probablemente es un duplicado o un pago recurrente. Verifica.'
                        : 'Mismo monto exacto en gastos con descripciones distintas — revisa si son pagos independientes.'}
                    </p>
                    <table className="w-full text-xs">
                      <tbody>
                        {v.gastos.map((g, gi) => (
                          <tr key={gi} className="border-b last:border-b-0">
                            <td className="py-1.5 pr-2 text-muted-foreground w-6 text-center">{gi + 1}</td>
                            <td className="py-1.5 pr-2">
                              <div className="font-medium text-yayis-dark">{g.descripcion}</div>
                              <div className="text-[10px] text-muted-foreground">{g.fecha} · {g.categoria} · {g.metodo === 'efectivo' ? 'Efectivo' : 'Cuentas'} · {g.estado === 'pagado' ? 'Pagado' : 'Pendiente'}</div>
                            </td>
                            <td className="py-1.5 text-right font-bold whitespace-nowrap">{formatMonto(g.monto)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabla por semana (solo si no se filtro por semana) */}
      {filterSemana === 0 && (
        <Card>
          <CardHeader><CardTitle>{isAnual ? 'Resumen por Mes' : 'Resumen por Semana'}</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">{isAnual ? 'Mes' : 'Semana'}</th>
                    <th className="text-right py-2 font-medium">Total Gastado</th>
                    <th className="text-right py-2 font-medium">Efectivo</th>
                    <th className="text-right py-2 font-medium">Cuentas</th>
                    <th className="text-right py-2 font-medium">Pendiente</th>
                  </tr>
                </thead>
                <tbody>
                  {semanasData.map(s => {
                    const periodLabel = isAnual
                      ? new Date(filterAnio, s.semana - 1, 1).toLocaleDateString('es-PE', { month: 'long' }).replace(/^./, c => c.toUpperCase())
                      : `Semana ${s.semana}`;
                    return (
                    <tr key={s.semana} className={`border-b ${!isAnual ? 'hover:bg-gray-50 cursor-pointer' : ''}`} onClick={() => { if (!isAnual) setFilterSemana(s.semana); }}>
                      <td className="py-2 text-yayis-accent font-medium">{periodLabel}</td>
                      <td className="text-right py-2 font-medium">{formatMonto(s.totalGastado)}</td>
                      <td className="text-right py-2">{formatMonto(s.efectivo)}</td>
                      <td className="text-right py-2">{formatMonto(s.cuentas)}</td>
                      <td className="text-right py-2 text-amber-600">{formatMonto(s.pendiente)}</td>
                    </tr>
                  );})}
                  <tr className="font-bold border-t-2">
                    <td className="py-2">Total</td>
                    <td className="text-right py-2">{formatMonto(totalGastado)}</td>
                    <td className="text-right py-2">{formatMonto(totalEfectivo)}</td>
                    <td className="text-right py-2">{formatMonto(totalCuentas)}</td>
                    <td className="text-right py-2 text-amber-600">{formatMonto(totalPendiente)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>{filterSemana === 0 ? (isAnual ? 'Gasto por Mes' : 'Gasto por Semana') : 'Gasto por Categoria'}</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(v: number) => formatMonto(v)} />
                <Bar dataKey="Total Gastado" fill="#004C40" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        {filterSemana === 0 && (
          <Card>
            <CardHeader><CardTitle>{isAnual ? 'Categorias por Mes' : 'Categorias por Semana'}</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={stackedData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(v: number) => formatMonto(v)} />
                  <Legend />
                  {allCatNames.slice(0, 8).map((cat, i) => (
                    <Bar key={cat} dataKey={cat} stackId="a" fill={COLORS[i % COLORS.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        {filterSemana > 0 && topCategorias.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Distribucion</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={topCategorias.map(c => ({ name: c.nombre, value: c.total }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {topCategorias.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatMonto(v)} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Top 5 */}
      {topCategorias.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Top 5 Categorias</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topCategorias.map((c, i) => (
                  <div key={c.nombre} className="flex items-center gap-4">
                    <span className="text-sm font-bold text-muted-foreground w-6">#{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-medium">{c.nombre}</span>
                        <span className="text-sm font-bold">{formatMonto(c.total)} ({c.porcentaje}%)</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2">
                        <div className="h-2 rounded-full" style={{ width: `${c.porcentaje}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Detalle: top N gastos PENDIENTES individuales por categoria */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Detalle: {topItemsCount === 'todos' ? 'Todos los' : `Top ${topItemsCount}`} Gastos por Categoria</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{topItemsCount === 'todos' ? 'Todos los gastos pendientes por categoria (faltan reponer a Luis)' : `Los ${topItemsCount} gastos pendientes mas costosos por categoria (faltan reponer a Luis)`}</p>
                </div>
                  <div className="inline-flex rounded-md border border-gray-200 bg-white shrink-0" role="group">
                    <button
                      type="button"
                      onClick={() => setTopItemsCount(5)}
                      className={`px-3 py-1 text-xs font-medium rounded-l-md transition-colors ${topItemsCount === 5 ? 'bg-yayis-green text-white' : 'text-muted-foreground hover:bg-gray-50'}`}
                    >
                      Top 5
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopItemsCount(10)}
                      className={`px-3 py-1 text-xs font-medium border-l border-gray-200 transition-colors ${topItemsCount === 10 ? 'bg-yayis-green text-white' : 'text-muted-foreground hover:bg-gray-50'}`}
                    >
                      Top 10
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopItemsCount('todos')}
                      className={`px-3 py-1 text-xs font-medium rounded-r-md border-l border-gray-200 transition-colors ${topItemsCount === 'todos' ? 'bg-yayis-green text-white' : 'text-muted-foreground hover:bg-gray-50'}`}
                    >
                      Todos
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {topItemsPorCategoria.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">No hay gastos pendientes por reponer en este periodo</p>
                ) : (
                  <div className="space-y-5">
                    {topItemsPorCategoria.map((cat, i) => {
                      const visibleItems = topItemsCount === 'todos' ? cat.items : cat.items.slice(0, topItemsCount);
                      return (
                        <div key={cat.categoria}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                              <span className="text-sm font-bold">{cat.categoria}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">Total: <strong className="text-yayis-dark">{formatMonto(cat.total)}</strong></span>
                          </div>
                          {visibleItems.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic pl-5">Sin gastos pendientes en el periodo</p>
                          ) : (
                            <table className="w-full text-xs">
                              <tbody>
                                {visibleItems.map((it, idx) => (
                                  <tr key={`${cat.categoria}-${idx}`} className="border-b last:border-b-0">
                                    <td className="py-1.5 pr-2 text-muted-foreground w-6 text-center">{idx + 1}</td>
                                    <td className="py-1.5 pr-2">
                                      <div className="font-medium text-yayis-dark">{it.descripcion}</div>
                                      <div className="text-[10px] text-muted-foreground">{it.fecha} · {it.metodo === 'efectivo' ? 'Efectivo' : 'Cuentas'} · {it.estado === 'pagado' ? 'Pagado' : 'Pendiente'}</div>
                                    </td>
                                    <td className="py-1.5 text-right font-bold whitespace-nowrap">{formatMonto(it.monto)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          {topItemsCount !== 'todos' && cat.items.length > topItemsCount && (
                            <p className="text-[10px] text-muted-foreground italic mt-1 pl-5">+{cat.items.length - topItemsCount} gastos pendientes mas en esta categoria</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
        </div>
      )}

      {/* Historico de gastos pagados */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Historico de Gastos</CardTitle>
          <Button variant="outline" size="sm" onClick={() => { setShowHistorico(!showHistorico); setHistoricoPage(0); }}>
            <History size={16} className="mr-2" />
            {showHistorico ? 'Ocultar' : 'Ver Historico'}
          </Button>
        </CardHeader>
        {showHistorico && (
          <CardContent className="space-y-5">
            {/* Ultima reposicion registrada */}
            {ultimaReposicion && (
              <div className="border border-emerald-200 bg-emerald-50/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-bold text-emerald-800 flex items-center gap-2">
                    <CheckCircle size={16} /> Ultima reposicion registrada
                  </h4>
                  <span className="text-xs text-emerald-700">{ultimaReposicion.fecha}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ultimaReposicion.metodo_pago === 'efectivo' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                    {ultimaReposicion.metodo_pago === 'efectivo' ? 'Efectivo' : 'Cuentas'}
                  </span>
                  <span className="font-bold text-emerald-800 text-lg">{formatMonto(Number(ultimaReposicion.monto))}</span>
                  {ultimaReposicion.notas && (
                    <span className="text-xs text-muted-foreground italic">"{ultimaReposicion.notas}"</span>
                  )}
                </div>
              </div>
            )}

            {/* Desglose Pendiente por Reponer (copia para registrar gastos en otro lado) */}
            {(categoriasEfectivo.length > 0 || categoriasCuentas.length > 0) && (
              <div className="border border-amber-200 bg-amber-50/30 rounded-lg p-4">
                <h4 className="text-sm font-bold text-amber-700 mb-1">Desglose Pendiente por Reponer</h4>
                <p className="text-xs text-muted-foreground mb-3">Lo que aun queda por reponer — util si necesitas registrar tus gastos en otro sistema.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {categoriasEfectivo.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-amber-700 mb-2 flex items-center gap-1.5">
                        <Wallet size={14} /> Efectivo: {formatMonto(totalEfPend)}
                      </div>
                      <table className="w-full text-xs">
                        <tbody>
                          {categoriasEfectivo.map(c => (
                            <tr key={c.nombre} className="border-b">
                              <td className="py-1">{c.nombre}</td>
                              <td className="py-1 text-right font-medium">{formatMonto(c.total)}</td>
                              <td className="py-1 text-right text-muted-foreground w-12">{totalEfPend > 0 ? roundTwo((c.total / totalEfPend) * 100) : 0}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {categoriasCuentas.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-amber-700 mb-2 flex items-center gap-1.5">
                        <CreditCard size={14} /> Cuentas: {formatMonto(totalCtPend)}
                      </div>
                      <table className="w-full text-xs">
                        <tbody>
                          {categoriasCuentas.map(c => (
                            <tr key={c.nombre} className="border-b">
                              <td className="py-1">{c.nombre}</td>
                              <td className="py-1 text-right font-medium">{formatMonto(c.total)}</td>
                              <td className="py-1 text-right text-muted-foreground w-12">{totalCtPend > 0 ? roundTwo((c.total / totalCtPend) * 100) : 0}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">Gastos ya pagados{!isAnual ? ` - ${mesLabel}` : ` - ${filterAnio}`}{filterSemana > 0 ? ` - Semana ${filterSemana}` : ''}</p>
            {historicoGastos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No hay gastos pagados en este periodo</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-3 py-2 font-medium">Fecha</th>
                        <th className="text-left px-3 py-2 font-medium">Descripcion</th>
                        <th className="text-left px-3 py-2 font-medium">Categoria</th>
                        <th className="text-left px-3 py-2 font-medium">Pago</th>
                        <th className="text-right px-3 py-2 font-medium">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historicoGastos.map(g => (
                        <tr key={g.id} className="border-b">
                          <td className="px-3 py-2 whitespace-nowrap">{g.fecha}</td>
                          <td className="px-3 py-2">{g.descripcion}</td>
                          <td className="px-3 py-2">{g.categorias?.nombre ?? '-'}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${g.metodo_pago === 'efectivo' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                              {g.metodo_pago === 'efectivo' ? 'Efectivo' : 'Cuentas'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-medium">{formatMonto(Number(g.monto))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {historicoTotal > 20 && (
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-xs text-muted-foreground">{historicoTotal} registros</p>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => setHistoricoPage(p => Math.max(0, p - 1))} disabled={historicoPage === 0}>Anterior</Button>
                      <span className="flex items-center px-2 text-xs">{historicoPage + 1} / {Math.ceil(historicoTotal / 20)}</span>
                      <Button variant="outline" size="sm" onClick={() => setHistoricoPage(p => p + 1)} disabled={historicoPage >= Math.ceil(historicoTotal / 20) - 1}>Siguiente</Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* Arqueo Semanal - solo cuando se selecciona semana especifica */}
      {isOwner && filterSemana > 0 && (
        <Card>
          <CardHeader><CardTitle>Arqueo Semanal</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {arqueo?.cerrado && (
              <div className="flex items-center gap-2 text-emerald-700 font-bold"><CheckCircle size={18} /> Semana Cerrada</div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b"><td className="py-2 text-muted-foreground">Fondo caja chica</td><td className="py-2 text-right font-medium">{formatMonto(fondoEf)}</td></tr>
                  <tr className="border-b"><td className="py-2 text-muted-foreground">Fondo cuentas</td><td className="py-2 text-right font-medium">{formatMonto(fondoCt)}</td></tr>
                  <tr className="border-b bg-red-50/50"><td className="py-2 font-medium">Gastado efectivo</td><td className="py-2 text-right font-bold text-red-600">{formatMonto(gastadoEfSemana)}</td></tr>
                  <tr className="border-b bg-red-50/50"><td className="py-2 font-medium">Gastado cuentas</td><td className="py-2 text-right font-bold text-red-600">{formatMonto(gastadoCtSemana)}</td></tr>
                  {efectivoUsadoDeVentas > 0 && (
                    <tr className="border-b bg-amber-50"><td className="py-2 text-amber-700">Luis uso de ventas para gastos</td><td className="py-2 text-right font-bold text-amber-700">{formatMonto(efectivoUsadoDeVentas)}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {!arqueo?.cerrado && (
              <div className="border-t pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Ventas en efectivo (S/)</label>
                    <Input type="number" step="0.01" placeholder="0.00" value={ventasPos} onChange={e => setVentasPos(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Efectivo que Luis entrega (S/)</label>
                    <Input type="number" step="0.01" placeholder="0.00" value={efectivoEntregado} onChange={e => setEfectivoEntregado(e.target.value)} className="mt-1" />
                  </div>
                </div>
                {ventasNum > 0 && (
                  <div className="bg-white border rounded-lg p-4 space-y-2 text-sm">
                    <p>Luis deberia entregar: <strong>{formatMonto(debiaEntregar)}</strong></p>
                    {entregadoNum > 0 && (
                      <p className={diferenciaCaja >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                        {diferenciaCaja === 0 ? 'Caja cuadrada' : diferenciaCaja > 0 ? `Sobrante: ${formatMonto(diferenciaCaja)}` : `Faltante: ${formatMonto(Math.abs(diferenciaCaja))}`}
                      </p>
                    )}
                  </div>
                )}
                <Button onClick={() => setShowCerrar(true)} className="bg-yayis-green hover:bg-yayis-green/90">
                  <Lock size={16} className="mr-2" /> Cerrar Semana
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reposiciones */}
      {isOwner && (
        <Card>
          <CardHeader><CardTitle>Reposiciones a Luis</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            {/* Saldo */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                <p className="text-xs text-red-600 font-medium">Deuda Total</p>
                <p className="text-lg font-bold text-red-700">{formatMonto(roundTwo(saldo.deudaEfectivo + saldo.deudaCuentas))}</p>
                <p className="text-xs text-muted-foreground">Ef: {formatMonto(saldo.deudaEfectivo)} | Ct: {formatMonto(saldo.deudaCuentas)}</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                <p className="text-xs text-emerald-600 font-medium">Repuesto Total</p>
                <p className="text-lg font-bold text-emerald-700">{formatMonto(roundTwo(saldo.repuestoEfectivo + saldo.repuestoCuentas))}</p>
                <p className="text-xs text-muted-foreground">Ef: {formatMonto(saldo.repuestoEfectivo)} | Ct: {formatMonto(saldo.repuestoCuentas)}</p>
              </div>
              <div className={`border-2 rounded-lg p-3 text-center ${saldo.saldoEfectivo + saldo.saldoCuentas <= 0 ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
                <p className="text-xs font-medium">Saldo Pendiente</p>
                <p className={`text-lg font-bold ${saldo.saldoEfectivo + saldo.saldoCuentas <= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {formatMonto(roundTwo(Math.max(0, saldo.saldoEfectivo) + Math.max(0, saldo.saldoCuentas)))}
                </p>
                <p className="text-xs text-muted-foreground">Ef: {formatMonto(Math.max(0, saldo.saldoEfectivo))} | Ct: {formatMonto(Math.max(0, saldo.saldoCuentas))}</p>
              </div>
            </div>

            {/* Formulario */}
            <div className="border-t pt-4">
              <h4 className="text-sm font-bold mb-3">Registrar Reposicion</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div><label className="text-xs font-medium">Fecha</label><Input type="date" value={repoFecha} onChange={e => setRepoFecha(e.target.value)} className="mt-1" /></div>
                <div><label className="text-xs font-medium">Tipo</label>
                  <Select value={repoMetodo} onChange={e => setRepoMetodo(e.target.value as MetodoPago)} className="mt-1">
                    <option value="efectivo">Efectivo</option><option value="cuentas">Cuentas</option>
                  </Select>
                </div>
                <div><label className="text-xs font-medium">Monto (S/)</label><Input type="number" step="0.01" min="0.01" placeholder="0.00" value={repoMonto} onChange={e => setRepoMonto(e.target.value)} className="mt-1" /></div>
                <div><label className="text-xs font-medium">Notas</label><Input placeholder="Opcional..." value={repoNotas} onChange={e => setRepoNotas(e.target.value)} className="mt-1" /></div>
              </div>
              <Button className="mt-3" disabled={repoSaving || !repoMonto || parseFloat(repoMonto) <= 0} onClick={async () => {
                setRepoSaving(true);
                const { error } = await createReposicion(repoFecha, repoMetodo, parseFloat(repoMonto), repoNotas);
                if (error) addToast(`Error: ${error}`, 'error');
                else { addToast('Reposicion registrada', 'success'); setRepoMonto(''); setRepoNotas(''); loadData(); }
                setRepoSaving(false);
              }}>
                {repoSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus size={16} className="mr-2" />}
                Registrar Reposicion
              </Button>
            </div>

            {/* Historial */}
            {reposiciones.length > 0 && (
              <div className="border-t pt-4">
                <h4 className="text-sm font-bold mb-3">Historial</h4>
                <table className="w-full text-sm">
                  <thead><tr className="border-b"><th className="text-left py-2">Fecha</th><th className="text-left py-2">Tipo</th><th className="text-right py-2">Monto</th><th className="text-left py-2">Notas</th><th></th></tr></thead>
                  <tbody>
                    {reposiciones.map(r => (
                      <tr key={r.id} className="border-b">
                        <td className="py-2">{r.fecha}</td>
                        <td className="py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.metodo_pago === 'efectivo' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>{r.metodo_pago === 'efectivo' ? 'Efectivo' : 'Cuentas'}</span></td>
                        <td className="py-2 text-right font-medium">{formatMonto(Number(r.monto))}</td>
                        <td className="py-2 text-xs text-muted-foreground">{r.notas ?? '-'}</td>
                        <td className="py-2"><Button variant="ghost" size="icon" className="text-red-500" onClick={async () => {
                          const { error } = await deleteReposicion(r.id);
                          if (error) addToast(`Error: ${error}`, 'error');
                          else { addToast('Eliminada', 'success'); loadData(); }
                        }}><Trash2 size={14} /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog open={showCerrar} title="Cerrar Semana" message="Una vez cerrada, los registros no podran modificarse." confirmLabel="Cerrar Semana" onConfirm={handleCerrarSemana} onCancel={() => setShowCerrar(false)} />
    </div>
  );
}
