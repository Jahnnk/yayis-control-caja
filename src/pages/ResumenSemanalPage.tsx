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
  const [selectedSemana, setSelectedSemana] = useState(() => calcularSemana(today));
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
      semana: selectedSemana,
      mes: mesLabel,
      pageSize: 500,
    });

    await fetchArqueo(selectedSemana, mesLabel, selectedMes.anio, profile?.sede_id ?? undefined);
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

  async function handleCerrarSemana() {
    if (!arqueo?.id || !resumen || !fondos) return;
    const ventas = parseFloat(ventasPos) || 0;
    const entregado = parseFloat(efectivoEntregado) || 0;
    const fondoInicialEf = Number(fondos.fondo_efectivo);
    const totalGastadoEf = fondoInicialEf - resumen.disponibleEfectivo;

    const { error } = await cerrarSemana(arqueo.id, ventas, entregado, fondoInicialEf, totalGastadoEf);
    if (error) addToast(`Error: ${error}`, 'error');
    else {
      addToast('Semana cerrada exitosamente', 'success');
      loadData();
    }
    setShowCerrar(false);
  }

  // Ensure arqueo record exists for this week
  useEffect(() => {
    if (!profile?.sede_id || !fondos || loadingData) return;
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
            className="w-40"
          >
            {semanas.map(s => (
              <option key={s.semana} value={s.semana}>
                Semana {s.semana}
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

      {/* Arqueo Semanal */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>Arqueo Semanal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-muted-foreground">Fondo Efectivo</p>
                <p className="font-bold text-lg">{formatMonto(fondos ? Number(fondos.fondo_efectivo) : 500)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-muted-foreground">Fondo Cuentas</p>
                <p className="font-bold text-lg">{formatMonto(fondos ? Number(fondos.fondo_cuentas) : 500)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-muted-foreground">Gastado Efectivo</p>
                <p className="font-bold text-lg">{formatMonto(roundTwo((fondos ? Number(fondos.fondo_efectivo) : 500) - resumen.disponibleEfectivo))}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-muted-foreground">Gastado Cuentas</p>
                <p className="font-bold text-lg">{formatMonto(roundTwo((fondos ? Number(fondos.fondo_cuentas) : 500) - resumen.disponibleCuentas))}</p>
              </div>
            </div>

            {!arqueo?.cerrado && (
              <div className="border-t pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Ventas en efectivo (POS/Byte)</label>
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
                    <label className="text-sm font-medium">Efectivo entregado por Luis</label>
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

                {ventasPos && (
                  <div className="bg-yayis-cream rounded-lg p-4 space-y-2 text-sm">
                    <p><strong>Monto a reponer efectivo:</strong> {formatMonto(roundTwo((fondos ? Number(fondos.fondo_efectivo) : 500) - resumen.disponibleEfectivo - (parseFloat(ventasPos) || 0)))}</p>
                    <p><strong>Monto a reponer cuentas:</strong> {formatMonto(roundTwo((fondos ? Number(fondos.fondo_cuentas) : 500) - resumen.disponibleCuentas))}</p>
                    {efectivoEntregado && (
                      <p><strong>Diferencia de caja:</strong> {formatMonto(roundTwo((parseFloat(efectivoEntregado) || 0) - resumen.disponibleEfectivo))}</p>
                    )}
                  </div>
                )}

                <Button onClick={() => setShowCerrar(true)} className="bg-yayis-green hover:bg-yayis-green/90">
                  <Lock size={16} className="mr-2" />
                  Cerrar Semana
                </Button>
              </div>
            )}

            {arqueo?.cerrado && (
              <div className="border-t pt-4 bg-emerald-50 rounded-lg p-4 space-y-2 text-sm">
                <p className="font-bold text-emerald-700 mb-2">Semana Cerrada</p>
                <p>Ventas en efectivo: {formatMonto(Number(arqueo.ventas_efectivo_pos))}</p>
                <p>Efectivo entregado: {formatMonto(Number(arqueo.efectivo_entregado_luis))}</p>
                <p>Monto repuesto efectivo: {formatMonto(Number(arqueo.monto_reponer_efectivo))}</p>
                <p>Monto repuesto cuentas: {formatMonto(Number(arqueo.monto_reponer_cuentas))}</p>
                <p>Diferencia de caja: {formatMonto(Number(arqueo.diferencia_caja))}</p>
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
