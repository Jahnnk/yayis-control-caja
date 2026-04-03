import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGastos } from '@/hooks/useGastos';
import { useFondos } from '@/hooks/useFondos';
import { useArqueo } from '@/hooks/useArqueo';
import { useCategorias } from '@/hooks/useCategorias';
import { useToast } from '@/components/ui/toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Loading } from '@/components/ui/loading';
import { formatMonto, roundTwo } from '@/lib/utils';
import { getTodayLima, calcularSemana, getMesLabel, getSemanasDelMes, getMesesDisponibles } from '@/lib/dates';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { DollarSign, Wallet, CreditCard, AlertTriangle, CheckCircle, Lock } from 'lucide-react';
import type { GastoConCategoria, ResumenSemanalData } from '@/types';

const COLORS = ['#004C40', '#098B5F', '#10B981', '#34D399', '#6EE7B7', '#A7F3D0', '#F59E0B', '#DC2626', '#8B5CF6', '#EC4899', '#06B6D4'];

export function ResumenSemanalPage() {
  const { profile } = useAuth();
  const { fetchGastos, gastos } = useGastos();
  const { fondos, fetchFondosParaFecha } = useFondos();
  const { arqueo, fetchArqueo, saveArqueo, cerrarSemana } = useArqueo();
  const { categorias } = useCategorias();
  const { addToast } = useToast();

  const today = getTodayLima();
  const meses = getMesesDisponibles();
  const isOwner = profile?.rol === 'owner';

  const [selectedMes, setSelectedMes] = useState(() => {
    const d = new Date();
    return { anio: d.getFullYear(), mes: d.getMonth() + 1, label: getMesLabel(today) };
  });
  const [semanas, setSemanas] = useState(getSemanasDelMes(selectedMes.anio, selectedMes.mes));
  const [selectedSemana, setSelectedSemana] = useState<number>(() => calcularSemana(today));
  const [resumen, setResumen] = useState<ResumenSemanalData | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  // Arqueo form
  const [ventasPos, setVentasPos] = useState('');
  const [efectivoEntregado, setEfectivoEntregado] = useState('');
  const [showCerrar, setShowCerrar] = useState(false);

  useEffect(() => {
    const s = getSemanasDelMes(selectedMes.anio, selectedMes.mes);
    setSemanas(s);
    if (selectedSemana > s.length) setSelectedSemana(1);
  }, [selectedMes]);

  const loadData = useCallback(async () => {
    setLoadingData(true);
    const mesLabel = selectedMes.label;

    await fetchGastos({
      semana: selectedSemana === 0 ? undefined : selectedSemana,
      mes: mesLabel,
      pageSize: 500,
    });

    if (selectedSemana > 0) {
      await fetchArqueo(selectedSemana, mesLabel, selectedMes.anio, profile?.sede_id ?? undefined);
    }
    setLoadingData(false);
  }, [selectedSemana, selectedMes, fetchGastos, fetchArqueo, profile]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculate resumen when gastos change
  useEffect(() => {
    if (loadingData) return;

    const fondoEfectivo = fondos ? Number(fondos.fondo_efectivo) : 500;
    const fondoCuentas = fondos ? Number(fondos.fondo_cuentas) : 500;

    let totalGastado = 0, totalPagado = 0, totalPendiente = 0;
    let pagadoEfectivo = 0, pagadoCuentas = 0;

    const catMap = new Map<string, { efectivo: number; cuentas: number; total: number; efectivoPend: number; cuentasPend: number; totalPend: number }>();

    for (const g of gastos) {
      const monto = Number(g.monto);
      const catNombre = g.categorias?.nombre ?? 'Sin categoria';

      if (!catMap.has(catNombre)) {
        catMap.set(catNombre, { efectivo: 0, cuentas: 0, total: 0, efectivoPend: 0, cuentasPend: 0, totalPend: 0 });
      }
      const cat = catMap.get(catNombre)!;

      totalGastado = roundTwo(totalGastado + monto);

      if (g.estado === 'pagado') {
        totalPagado = roundTwo(totalPagado + monto);
        if (g.metodo_pago === 'efectivo') {
          pagadoEfectivo = roundTwo(pagadoEfectivo + monto);
          cat.efectivo = roundTwo(cat.efectivo + monto);
        } else {
          pagadoCuentas = roundTwo(pagadoCuentas + monto);
          cat.cuentas = roundTwo(cat.cuentas + monto);
        }
        cat.total = roundTwo(cat.total + monto);
      } else {
        totalPendiente = roundTwo(totalPendiente + monto);
        if (g.metodo_pago === 'efectivo') {
          cat.efectivoPend = roundTwo(cat.efectivoPend + monto);
        } else {
          cat.cuentasPend = roundTwo(cat.cuentasPend + monto);
        }
        cat.totalPend = roundTwo(cat.totalPend + monto);
      }
    }

    const gastosPorCategoria = Array.from(catMap.entries())
      .filter(([, v]) => v.total > 0)
      .map(([cat, v]) => ({
        categoria: cat,
        efectivo: v.efectivo,
        cuentas: v.cuentas,
        total: v.total,
        porcentaje: totalPagado > 0 ? roundTwo((v.total / totalPagado) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);

    const pendientesPorCategoria = Array.from(catMap.entries())
      .filter(([, v]) => v.totalPend > 0)
      .map(([cat, v]) => ({
        categoria: cat,
        efectivo: v.efectivoPend,
        cuentas: v.cuentasPend,
        total: v.totalPend,
      }))
      .sort((a, b) => b.total - a.total);

    setResumen({
      totalGastado,
      totalPagado,
      totalPendiente,
      disponibleEfectivo: roundTwo(fondoEfectivo - pagadoEfectivo),
      disponibleCuentas: roundTwo(fondoCuentas - pagadoCuentas),
      gastosPorCategoria,
      pendientesPorCategoria,
    });
  }, [gastos, fondos, loadingData]);

  // Calculated arqueo values
  const fondoEf = fondos ? Number(fondos.fondo_efectivo) : 500;
  const fondoCt = fondos ? Number(fondos.fondo_cuentas) : 500;
  const gastadoEfectivo = resumen ? roundTwo(fondoEf - resumen.disponibleEfectivo) : 0;
  const gastadoCuentas = resumen ? roundTwo(fondoCt - resumen.disponibleCuentas) : 0;
  const ventasNum = parseFloat(ventasPos) || 0;
  const entregadoNum = parseFloat(efectivoEntregado) || 0;
  const efectivoUsadoDeVentas = roundTwo(Math.max(0, gastadoEfectivo - fondoEf));
  const debiaEntregar = roundTwo(ventasNum - efectivoUsadoDeVentas);
  const diferenciaCaja = roundTwo(entregadoNum - debiaEntregar);

  async function handleCerrarSemana() {
    if (!arqueo?.id || !resumen || !fondos) return;

    const { error } = await cerrarSemana(
      arqueo.id, ventasNum, entregadoNum,
      fondoEf, gastadoEfectivo, gastadoCuentas, fondoCt,
    );
    if (error) addToast(`Error: ${error}`, 'error');
    else {
      addToast('Semana cerrada exitosamente', 'success');
      loadData();
    }
    setShowCerrar(false);
  }

  // Ensure arqueo record exists for this week
  useEffect(() => {
    if (!profile?.sede_id || !fondos || loadingData || selectedSemana === 0) return;
    if (arqueo) {
      setVentasPos(String(arqueo.ventas_efectivo_pos || ''));
      setEfectivoEntregado(String(arqueo.efectivo_entregado_luis || ''));
      return;
    }

    const semanaInfo = semanas.find(s => s.semana === selectedSemana);
    if (!semanaInfo) return;

    saveArqueo({
      sede_id: profile.sede_id,
      semana: selectedSemana,
      mes: selectedMes.label,
      anio: selectedMes.anio,
      fecha_inicio: semanaInfo.inicio,
      fecha_fin: semanaInfo.fin,
      fondo_inicial_efectivo: Number(fondos.fondo_efectivo),
      fondo_inicial_cuentas: Number(fondos.fondo_cuentas),
      total_gastado_efectivo: 0,
      total_gastado_cuentas: 0,
      ventas_efectivo_pos: 0,
      efectivo_entregado_luis: 0,
      monto_reponer_efectivo: 0,
      monto_reponer_cuentas: 0,
      diferencia_caja: 0,
      cerrado: false,
      cerrado_por: null,
      cerrado_at: null,
    }).then(() => {
      fetchArqueo(selectedSemana, selectedMes.label, selectedMes.anio, profile.sede_id ?? undefined);
    });
  }, [arqueo, profile, fondos, loadingData, selectedSemana, selectedMes, semanas]);

  if (loadingData || !resumen) return <Loading text="Cargando resumen..." />;

  const pieData = resumen.gastosPorCategoria.map(c => ({ name: c.categoria, value: c.total }));

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-yayis-dark">Resumen Semanal</h1>
        <div className="flex gap-3">
          <Select
            value={`${selectedMes.anio}-${selectedMes.mes}`}
            onChange={e => {
              const [a, m] = e.target.value.split('-');
              const mesObj = meses.find(x => x.anio === parseInt(a!) && x.mes === parseInt(m!));
              if (mesObj) setSelectedMes({ anio: mesObj.anio, mes: mesObj.mes, label: mesObj.label });
            }}
            className="w-48"
          >
            {meses.map(m => (
              <option key={`${m.anio}-${m.mes}`} value={`${m.anio}-${m.mes}`}>{m.label}</option>
            ))}
          </Select>
          <Select
            value={selectedSemana}
            onChange={e => setSelectedSemana(parseInt(e.target.value))}
            className="w-48"
          >
            <option value={0}>Todas las semanas</option>
            {semanas.map(s => (
              <option key={s.semana} value={s.semana}>
                Semana {s.semana} ({s.inicio.slice(5)} al {s.fin.slice(5)})
              </option>
            ))}
          </Select>
        </div>
      </div>

      {arqueo?.cerrado && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700">
          <Lock size={16} />
          Semana cerrada. Los registros de esta semana no pueden modificarse.
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={18} className="text-yayis-accent" />
              <span className="text-xs text-muted-foreground">Total Gastado</span>
            </div>
            <p className="text-xl font-bold text-yayis-dark">{formatMonto(resumen.totalGastado)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={18} className="text-emerald-500" />
              <span className="text-xs text-muted-foreground">Total Pagado</span>
            </div>
            <p className="text-xl font-bold text-emerald-600">{formatMonto(resumen.totalPagado)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={18} className="text-amber-500" />
              <span className="text-xs text-muted-foreground">Total Pendiente</span>
            </div>
            <p className="text-xl font-bold text-amber-600">{formatMonto(resumen.totalPendiente)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Wallet size={18} className="text-yayis-green" />
              <span className="text-xs text-muted-foreground">Disponible Efectivo</span>
            </div>
            <p className={`text-xl font-bold ${resumen.disponibleEfectivo < 0 ? 'text-red-600' : 'text-yayis-green'}`}>
              {formatMonto(resumen.disponibleEfectivo)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard size={18} className="text-blue-500" />
              <span className="text-xs text-muted-foreground">Disponible Cuentas</span>
            </div>
            <p className={`text-xl font-bold ${resumen.disponibleCuentas < 0 ? 'text-red-600' : 'text-blue-600'}`}>
              {formatMonto(resumen.disponibleCuentas)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Desglose por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">Categoria</th>
                    <th className="text-right py-2 font-medium">Efectivo</th>
                    <th className="text-right py-2 font-medium">Cuentas</th>
                    <th className="text-right py-2 font-medium">Total</th>
                    <th className="text-right py-2 font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.gastosPorCategoria.map(c => (
                    <tr key={c.categoria} className="border-b">
                      <td className="py-2">{c.categoria}</td>
                      <td className="text-right py-2">{formatMonto(c.efectivo)}</td>
                      <td className="text-right py-2">{formatMonto(c.cuentas)}</td>
                      <td className="text-right py-2 font-medium">{formatMonto(c.total)}</td>
                      <td className="text-right py-2 text-muted-foreground">{c.porcentaje}%</td>
                    </tr>
                  ))}
                  {resumen.gastosPorCategoria.length > 0 && (
                    <tr className="font-bold">
                      <td className="py-2">Total</td>
                      <td className="text-right py-2">{formatMonto(resumen.gastosPorCategoria.reduce((s, c) => s + c.efectivo, 0))}</td>
                      <td className="text-right py-2">{formatMonto(resumen.gastosPorCategoria.reduce((s, c) => s + c.cuentas, 0))}</td>
                      <td className="text-right py-2">{formatMonto(resumen.totalPagado)}</td>
                      <td className="text-right py-2">100%</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Distribucion del Gasto</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatMonto(value)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-12">Sin datos para esta semana</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pendientes */}
      {resumen.pendientesPorCategoria.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-amber-600">Pendientes por Pagar</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Categoria</th>
                  <th className="text-right py-2 font-medium">Efectivo</th>
                  <th className="text-right py-2 font-medium">Cuentas</th>
                  <th className="text-right py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {resumen.pendientesPorCategoria.map(c => (
                  <tr key={c.categoria} className="border-b">
                    <td className="py-2">{c.categoria}</td>
                    <td className="text-right py-2">{formatMonto(c.efectivo)}</td>
                    <td className="text-right py-2">{formatMonto(c.cuentas)}</td>
                    <td className="text-right py-2 font-medium text-amber-600">{formatMonto(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Arqueo Semanal - solo en semana individual */}
      {isOwner && selectedSemana > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Arqueo Semanal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Situacion de la semana */}
            <div>
              <h4 className="text-sm font-bold text-yayis-dark mb-3">Situacion de la Semana</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b">
                      <td className="py-2 text-muted-foreground">Fondo caja chica (efectivo)</td>
                      <td className="py-2 text-right font-medium">{formatMonto(fondoEf)}</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 text-muted-foreground">Fondo cuentas (Yape/Plin/Transferencia)</td>
                      <td className="py-2 text-right font-medium">{formatMonto(fondoCt)}</td>
                    </tr>
                    <tr className="border-b bg-red-50/50">
                      <td className="py-2 font-medium">Total gastado en efectivo</td>
                      <td className="py-2 text-right font-bold text-red-600">{formatMonto(gastadoEfectivo)}</td>
                    </tr>
                    <tr className="border-b bg-red-50/50">
                      <td className="py-2 font-medium">Total gastado en cuentas</td>
                      <td className="py-2 text-right font-bold text-red-600">{formatMonto(gastadoCuentas)}</td>
                    </tr>
                    {gastadoEfectivo > fondoEf && (
                      <tr className="border-b bg-amber-50">
                        <td className="py-2 text-amber-700">Luis uso de las ventas para cubrir gastos</td>
                        <td className="py-2 text-right font-bold text-amber-700">{formatMonto(efectivoUsadoDeVentas)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {!arqueo?.cerrado && (
              <div className="border-t pt-4 space-y-4">
                <h4 className="text-sm font-bold text-yayis-dark">Datos para el Cierre</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Ventas en efectivo de la semana (S/)</label>
                    <p className="text-xs text-muted-foreground mb-1">Monto total de ventas cobradas en efectivo</p>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={ventasPos}
                      onChange={e => setVentasPos(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Efectivo que Luis entrega (S/)</label>
                    <p className="text-xs text-muted-foreground mb-1">Dinero fisico que Luis te devuelve</p>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={efectivoEntregado}
                      onChange={e => setEfectivoEntregado(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>

                {ventasNum > 0 && (
                  <div className="bg-white border-2 border-yayis-green/20 rounded-lg p-5 space-y-3">
                    <h4 className="text-sm font-bold text-yayis-green">Resultado del Arqueo</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          <tr className="border-b">
                            <td className="py-2">Ventas en efectivo</td>
                            <td className="py-2 text-right font-medium">{formatMonto(ventasNum)}</td>
                          </tr>
                          {efectivoUsadoDeVentas > 0 && (
                            <tr className="border-b">
                              <td className="py-2 text-amber-700">(-) Usado de ventas para cubrir gastos</td>
                              <td className="py-2 text-right font-medium text-amber-700">- {formatMonto(efectivoUsadoDeVentas)}</td>
                            </tr>
                          )}
                          <tr className="border-b bg-blue-50">
                            <td className="py-2 font-medium">Luis deberia entregar</td>
                            <td className="py-2 text-right font-bold text-blue-700">{formatMonto(debiaEntregar)}</td>
                          </tr>
                          {entregadoNum > 0 && (
                            <>
                              <tr className="border-b">
                                <td className="py-2">Luis entrego</td>
                                <td className="py-2 text-right font-medium">{formatMonto(entregadoNum)}</td>
                              </tr>
                              <tr className={`border-b ${diferenciaCaja === 0 ? 'bg-emerald-50' : diferenciaCaja > 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                                <td className="py-2 font-medium">
                                  {diferenciaCaja === 0 ? 'Caja cuadrada' : diferenciaCaja > 0 ? 'Sobrante en caja' : 'Faltante en caja'}
                                </td>
                                <td className={`py-2 text-right font-bold ${diferenciaCaja >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                  {formatMonto(Math.abs(diferenciaCaja))}
                                </td>
                              </tr>
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="border-t pt-3 mt-3">
                      <h5 className="text-xs font-bold text-muted-foreground uppercase mb-2">Tu debes reponer</h5>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-yayis-cream rounded-lg p-3 text-center">
                          <p className="text-xs text-muted-foreground">Reponer Efectivo</p>
                          <p className="text-xl font-bold text-yayis-green">{formatMonto(fondoEf)}</p>
                          <p className="text-xs text-muted-foreground">Para dejar caja chica completa</p>
                        </div>
                        <div className="bg-yayis-cream rounded-lg p-3 text-center">
                          <p className="text-xs text-muted-foreground">Reponer Cuentas</p>
                          <p className="text-xl font-bold text-yayis-green">{formatMonto(gastadoCuentas)}</p>
                          <p className="text-xs text-muted-foreground">Lo gastado en transferencias</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <Button onClick={() => setShowCerrar(true)} className="bg-yayis-green hover:bg-yayis-green/90">
                  <Lock size={16} className="mr-2" />
                  Cerrar Semana
                </Button>
              </div>
            )}

            {arqueo?.cerrado && (
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center gap-2 text-emerald-700 font-bold">
                  <CheckCircle size={18} />
                  Semana Cerrada
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <tbody>
                      <tr className="border-b">
                        <td className="py-2 text-muted-foreground">Ventas en efectivo</td>
                        <td className="py-2 text-right font-medium">{formatMonto(Number(arqueo.ventas_efectivo_pos))}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 text-muted-foreground">Efectivo entregado por Luis</td>
                        <td className="py-2 text-right font-medium">{formatMonto(Number(arqueo.efectivo_entregado_luis))}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 text-muted-foreground">Gastado en efectivo</td>
                        <td className="py-2 text-right font-medium">{formatMonto(Number(arqueo.total_gastado_efectivo))}</td>
                      </tr>
                      <tr className="border-b">
                        <td className="py-2 text-muted-foreground">Gastado en cuentas</td>
                        <td className="py-2 text-right font-medium">{formatMonto(Number(arqueo.total_gastado_cuentas))}</td>
                      </tr>
                      <tr className={`border-b ${Number(arqueo.diferencia_caja) >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                        <td className="py-2 font-medium">
                          {Number(arqueo.diferencia_caja) === 0 ? 'Caja cuadrada' : Number(arqueo.diferencia_caja) > 0 ? 'Sobrante' : 'Faltante'}
                        </td>
                        <td className={`py-2 text-right font-bold ${Number(arqueo.diferencia_caja) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {formatMonto(Math.abs(Number(arqueo.diferencia_caja)))}
                        </td>
                      </tr>
                      <tr className="border-b bg-yayis-cream">
                        <td className="py-2 font-bold">Repuesto efectivo</td>
                        <td className="py-2 text-right font-bold text-yayis-green">{formatMonto(Number(arqueo.monto_reponer_efectivo))}</td>
                      </tr>
                      <tr className="bg-yayis-cream">
                        <td className="py-2 font-bold">Repuesto cuentas</td>
                        <td className="py-2 text-right font-bold text-yayis-green">{formatMonto(Number(arqueo.monto_reponer_cuentas))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={showCerrar}
        title="Cerrar Semana"
        message="Esta seguro? Una vez cerrada la semana, los registros no podran modificarse."
        confirmLabel="Cerrar Semana"
        onConfirm={handleCerrarSemana}
        onCancel={() => setShowCerrar(false)}
      />
    </div>
  );
}
