import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useArqueo } from '@/hooks/useArqueo';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select-native';
import { Loading } from '@/components/ui/loading';
import { formatMonto, roundTwo } from '@/lib/utils';
import { getMesesDisponibles, getSemanasDelMes } from '@/lib/dates';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Wallet, CreditCard, DollarSign, AlertTriangle } from 'lucide-react';
import { useFondos } from '@/hooks/useFondos';
import type { ArqueoSemanal } from '@/types';

interface SemanaResumen {
  semana: number;
  totalGastado: number;
  totalPagado: number;
  totalPendiente: number;
  montoRepuesto: number;
  porCategoria: Record<string, number>;
}

export function ResumenMensualPage() {
  const { profile } = useAuth();
  const { fetchArqueosMes } = useArqueo();
  const { fondos } = useFondos();
  const meses = getMesesDisponibles();
  const isOwner = profile?.rol === 'owner';

  const [selectedMes, setSelectedMes] = useState(() => {
    const d = new Date();
    return { anio: d.getFullYear(), mes: d.getMonth() + 1, label: meses[0]?.label ?? '' };
  });
  const [loading, setLoading] = useState(true);
  const [semanasData, setSemanasData] = useState<SemanaResumen[]>([]);
  const [arqueos, setArqueos] = useState<ArqueoSemanal[]>([]);
  const [topCategorias, setTopCategorias] = useState<{ nombre: string; total: number; porcentaje: number }[]>([]);
  const [allCatNames, setAllCatNames] = useState<string[]>([]);
  const [totalEfectivo, setTotalEfectivo] = useState(0);
  const [totalCuentas, setTotalCuentas] = useState(0);

  const loadData = useCallback(async () => {
    if (!profile?.sede_id) return;
    setLoading(true);

    const mesLabel = selectedMes.label;
    const semanas = getSemanasDelMes(selectedMes.anio, selectedMes.mes);

    // Fetch all gastos for this month
    const { data: gastosData } = await supabase
      .from('gastos')
      .select('*, categorias(nombre)')
      .eq('sede_id', profile.sede_id)
      .eq('mes', mesLabel)
      .order('semana');

    const arq = await fetchArqueosMes(mesLabel, selectedMes.anio, profile.sede_id);
    setArqueos(arq);

    // Group by semana
    const semanaMap = new Map<number, SemanaResumen>();
    const catTotalMap = new Map<string, number>();

    for (const s of semanas) {
      semanaMap.set(s.semana, {
        semana: s.semana,
        totalGastado: 0,
        totalPagado: 0,
        totalPendiente: 0,
        montoRepuesto: 0,
        porCategoria: {},
      });
    }

    let sumEfectivo = 0;
    let sumCuentas = 0;

    for (const g of gastosData ?? []) {
      const s = semanaMap.get(g.semana);
      if (!s) continue;
      const monto = Number(g.monto);
      const catName = (g.categorias as { nombre: string } | null)?.nombre ?? 'Otros';

      s.totalGastado = roundTwo(s.totalGastado + monto);
      if (g.estado === 'pagado') {
        s.totalPagado = roundTwo(s.totalPagado + monto);
        if (g.metodo_pago === 'efectivo') sumEfectivo = roundTwo(sumEfectivo + monto);
        else sumCuentas = roundTwo(sumCuentas + monto);
      } else {
        s.totalPendiente = roundTwo(s.totalPendiente + monto);
      }

      s.porCategoria[catName] = roundTwo((s.porCategoria[catName] ?? 0) + monto);
      catTotalMap.set(catName, roundTwo((catTotalMap.get(catName) ?? 0) + monto));
    }

    setTotalEfectivo(sumEfectivo);
    setTotalCuentas(sumCuentas);

    // Add arqueo data
    for (const a of arq) {
      const s = semanaMap.get(a.semana);
      if (s) {
        s.montoRepuesto = roundTwo(Number(a.monto_reponer_efectivo) + Number(a.monto_reponer_cuentas));
      }
    }

    const result = Array.from(semanaMap.values());
    setSemanasData(result);

    // Top 5 categories
    const totalGastoMes = Array.from(catTotalMap.values()).reduce((s, v) => s + v, 0);
    const sorted = Array.from(catTotalMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([nombre, total]) => ({
        nombre,
        total,
        porcentaje: totalGastoMes > 0 ? roundTwo((total / totalGastoMes) * 100) : 0,
      }));
    setTopCategorias(sorted);

    // All category names for stacked chart
    setAllCatNames(Array.from(catTotalMap.keys()).sort((a, b) => (catTotalMap.get(b) ?? 0) - (catTotalMap.get(a) ?? 0)));

    setLoading(false);
  }, [profile, selectedMes, fetchArqueosMes]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) return <Loading text="Cargando resumen mensual..." />;

  const COLORS = ['#004C40', '#098B5F', '#10B981', '#F59E0B', '#DC2626', '#8B5CF6', '#EC4899', '#06B6D4', '#6EE7B7', '#A7F3D0'];

  const barData = semanasData.map(s => ({
    name: `Sem ${s.semana}`,
    'Total Gastado': s.totalGastado,
    'Total Pagado': s.totalPagado,
    'Total Pendiente': s.totalPendiente,
  }));

  const stackedData = semanasData.map(s => ({
    name: `Sem ${s.semana}`,
    ...s.porCategoria,
  }));

  const totales = {
    gastado: semanasData.reduce((s, d) => roundTwo(s + d.totalGastado), 0),
    pagado: semanasData.reduce((s, d) => roundTwo(s + d.totalPagado), 0),
    pendiente: semanasData.reduce((s, d) => roundTwo(s + d.totalPendiente), 0),
    repuesto: semanasData.reduce((s, d) => roundTwo(s + d.montoRepuesto), 0),
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-yayis-dark">Resumen Mensual</h1>
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
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={18} className="text-yayis-accent" />
              <span className="text-xs text-muted-foreground">Total Gastado</span>
            </div>
            <p className="text-xl font-bold text-yayis-dark">{formatMonto(totales.gastado)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={18} className="text-amber-500" />
              <span className="text-xs text-muted-foreground">Total Pendiente</span>
            </div>
            <p className="text-xl font-bold text-amber-600">{formatMonto(totales.pendiente)}</p>
          </CardContent>
        </Card>
        {isOwner && (
          <Card className="border-yayis-green/30 bg-yayis-cream">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wallet size={18} className="text-yayis-green" />
                <span className="text-xs font-medium text-yayis-green">Reponer Efectivo</span>
              </div>
              <p className="text-xl font-bold text-yayis-green">{formatMonto(fondos ? Number(fondos.fondo_efectivo) : 500)}</p>
              <p className="text-xs text-muted-foreground mt-1">Gastado: {formatMonto(totalEfectivo)}</p>
            </CardContent>
          </Card>
        )}
        {isOwner && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard size={18} className="text-blue-600" />
                <span className="text-xs font-medium text-blue-600">Reponer Cuentas</span>
              </div>
              <p className="text-xl font-bold text-blue-600">{formatMonto(totalCuentas)}</p>
              <p className="text-xs text-muted-foreground mt-1">Gastado en transferencias</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Table by week */}
      <Card>
        <CardHeader>
          <CardTitle>Resumen por Semana</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Semana</th>
                  <th className="text-right py-2 font-medium">Total Gastado</th>
                  <th className="text-right py-2 font-medium">Total Pagado</th>
                  <th className="text-right py-2 font-medium">Total Pendiente</th>
                  <th className="text-right py-2 font-medium">Monto Repuesto</th>
                </tr>
              </thead>
              <tbody>
                {semanasData.map(s => (
                  <tr key={s.semana} className="border-b">
                    <td className="py-2">Semana {s.semana}</td>
                    <td className="text-right py-2">{formatMonto(s.totalGastado)}</td>
                    <td className="text-right py-2 text-emerald-600">{formatMonto(s.totalPagado)}</td>
                    <td className="text-right py-2 text-amber-600">{formatMonto(s.totalPendiente)}</td>
                    <td className="text-right py-2">{formatMonto(s.montoRepuesto)}</td>
                  </tr>
                ))}
                <tr className="font-bold border-t-2">
                  <td className="py-2">Total Mes</td>
                  <td className="text-right py-2">{formatMonto(totales.gastado)}</td>
                  <td className="text-right py-2 text-emerald-600">{formatMonto(totales.pagado)}</td>
                  <td className="text-right py-2 text-amber-600">{formatMonto(totales.pendiente)}</td>
                  <td className="text-right py-2">{formatMonto(totales.repuesto)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar chart by week */}
        <Card>
          <CardHeader>
            <CardTitle>Gasto por Semana</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(v: number) => formatMonto(v)} />
                <Legend />
                <Bar dataKey="Total Gastado" fill="#004C40" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Stacked bar by category */}
        <Card>
          <CardHeader>
            <CardTitle>Categorias por Semana</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
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
      </div>

      {/* Top 5 categories */}
      <Card>
        <CardHeader>
          <CardTitle>Top 5 Categorias del Mes</CardTitle>
        </CardHeader>
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
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${c.porcentaje}%`, backgroundColor: COLORS[i % COLORS.length] }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
