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
import { Wallet, CreditCard, DollarSign, AlertTriangle, CheckCircle } from 'lucide-react';
import { useFondos } from '@/hooks/useFondos';
import type { ArqueoSemanal } from '@/types';

interface PeriodoResumen {
  label: string;
  totalGastado: number;
  totalPagado: number;
  totalPendiente: number;
  efectivo: number;
  cuentas: number;
  montoRepuesto: number;
  porCategoria: Record<string, number>;
}

export function ResumenMensualPage() {
  const { profile } = useAuth();
  const { fetchArqueosMes } = useArqueo();
  const { fondos } = useFondos();
  const meses = getMesesDisponibles();
  const isOwner = profile?.rol === 'owner';

  // "0-0" = todo el ano, "YYYY-MM" = mes especifico
  const [selectedPeriodo, setSelectedPeriodo] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth() + 1}`;
  });
  const [loading, setLoading] = useState(true);
  const [periodosData, setPeriodosData] = useState<PeriodoResumen[]>([]);
  const [topCategorias, setTopCategorias] = useState<{ nombre: string; total: number; porcentaje: number }[]>([]);
  const [allCatNames, setAllCatNames] = useState<string[]>([]);
  const [totalEfectivo, setTotalEfectivo] = useState(0);
  const [totalCuentas, setTotalCuentas] = useState(0);

  const isAnual = selectedPeriodo === '0-0';
  const currentYear = new Date().getFullYear();

  const loadData = useCallback(async () => {
    if (!profile?.sede_id) return;
    setLoading(true);

    if (isAnual) {
      // Load all months of current year
      const allPeriodos: PeriodoResumen[] = [];
      const catTotalMap = new Map<string, number>();
      let sumEf = 0, sumCt = 0;

      for (const m of meses.filter(x => x.anio === currentYear)) {
        const result = await supabase
          .from('gastos')
          .select('*, categorias(nombre)')
          .eq('sede_id', profile.sede_id)
          .eq('mes', m.label)
          .order('semana');
        const gastosData = result.data as Array<Record<string, unknown>> | null;

        const periodo: PeriodoResumen = {
          label: m.label,
          totalGastado: 0, totalPagado: 0, totalPendiente: 0,
          efectivo: 0, cuentas: 0, montoRepuesto: 0, porCategoria: {},
        };

        for (const g of gastosData ?? []) {
          const monto = Number(g.monto);
          const catName = (g.categorias as { nombre: string } | null)?.nombre ?? 'Otros';

          periodo.totalGastado = roundTwo(periodo.totalGastado + monto);
          if (g.estado === 'pagado') {
            periodo.totalPagado = roundTwo(periodo.totalPagado + monto);
            if (g.metodo_pago === 'efectivo') {
              periodo.efectivo = roundTwo(periodo.efectivo + monto);
              sumEf = roundTwo(sumEf + monto);
            } else {
              periodo.cuentas = roundTwo(periodo.cuentas + monto);
              sumCt = roundTwo(sumCt + monto);
            }
          } else {
            periodo.totalPendiente = roundTwo(periodo.totalPendiente + monto);
          }
          periodo.porCategoria[catName] = roundTwo((periodo.porCategoria[catName] ?? 0) + monto);
          catTotalMap.set(catName, roundTwo((catTotalMap.get(catName) ?? 0) + monto));
        }

        if (periodo.totalGastado > 0) allPeriodos.push(periodo);
      }

      setPeriodosData(allPeriodos.reverse());
      setTotalEfectivo(sumEf);
      setTotalCuentas(sumCt);

      const totalGasto = Array.from(catTotalMap.values()).reduce((s, v) => s + v, 0);
      setTopCategorias(
        Array.from(catTotalMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([nombre, total]) => ({ nombre, total, porcentaje: totalGasto > 0 ? roundTwo((total / totalGasto) * 100) : 0 }))
      );
      setAllCatNames(Array.from(catTotalMap.keys()).sort((a, b) => (catTotalMap.get(b) ?? 0) - (catTotalMap.get(a) ?? 0)));
    } else {
      // Load single month (existing logic)
      const [aStr, mStr] = selectedPeriodo.split('-');
      const anio = parseInt(aStr!);
      const mes = parseInt(mStr!);
      const mesObj = meses.find(x => x.anio === anio && x.mes === mes);
      if (!mesObj) { setLoading(false); return; }

      const mesLabel = mesObj.label;
      const semanas = getSemanasDelMes(anio, mes);

      const { data: gastosData } = await supabase
        .from('gastos')
        .select('*, categorias(nombre)')
        .eq('sede_id', profile.sede_id)
        .eq('mes', mesLabel)
        .order('semana');

      const arq = await fetchArqueosMes(mesLabel, anio, profile.sede_id);

      const semanaMap = new Map<number, PeriodoResumen>();
      const catTotalMap = new Map<string, number>();
      let sumEf = 0, sumCt = 0;

      for (const s of semanas) {
        semanaMap.set(s.semana, {
          label: `Semana ${s.semana}`,
          totalGastado: 0, totalPagado: 0, totalPendiente: 0,
          efectivo: 0, cuentas: 0, montoRepuesto: 0, porCategoria: {},
        });
      }

      for (const g of gastosData ?? []) {
        const s = semanaMap.get(g.semana);
        if (!s) continue;
        const monto = Number(g.monto);
        const catName = (g.categorias as { nombre: string } | null)?.nombre ?? 'Otros';

        s.totalGastado = roundTwo(s.totalGastado + monto);
        if (g.estado === 'pagado') {
          s.totalPagado = roundTwo(s.totalPagado + monto);
          if (g.metodo_pago === 'efectivo') {
            s.efectivo = roundTwo(s.efectivo + monto);
            sumEf = roundTwo(sumEf + monto);
          } else {
            s.cuentas = roundTwo(s.cuentas + monto);
            sumCt = roundTwo(sumCt + monto);
          }
        } else {
          s.totalPendiente = roundTwo(s.totalPendiente + monto);
        }
        s.porCategoria[catName] = roundTwo((s.porCategoria[catName] ?? 0) + monto);
        catTotalMap.set(catName, roundTwo((catTotalMap.get(catName) ?? 0) + monto));
      }

      for (const a of arq) {
        const s = semanaMap.get(a.semana);
        if (s) s.montoRepuesto = roundTwo(Number(a.monto_reponer_efectivo) + Number(a.monto_reponer_cuentas));
      }

      setPeriodosData(Array.from(semanaMap.values()));
      setTotalEfectivo(sumEf);
      setTotalCuentas(sumCt);

      const totalGasto = Array.from(catTotalMap.values()).reduce((s, v) => s + v, 0);
      setTopCategorias(
        Array.from(catTotalMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([nombre, total]) => ({ nombre, total, porcentaje: totalGasto > 0 ? roundTwo((total / totalGasto) * 100) : 0 }))
      );
      setAllCatNames(Array.from(catTotalMap.keys()).sort((a, b) => (catTotalMap.get(b) ?? 0) - (catTotalMap.get(a) ?? 0)));
    }

    setLoading(false);
  }, [profile, selectedPeriodo, isAnual, fetchArqueosMes, meses, currentYear]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) return <Loading text="Cargando resumen..." />;

  const COLORS = ['#004C40', '#098B5F', '#10B981', '#F59E0B', '#DC2626', '#8B5CF6', '#EC4899', '#06B6D4', '#6EE7B7', '#A7F3D0'];

  const barData = periodosData.map(s => ({
    name: s.label.replace('Semana ', 'Sem '),
    'Total Gastado': s.totalGastado,
  }));

  const stackedData = periodosData.map(s => ({
    name: s.label.replace('Semana ', 'Sem '),
    ...s.porCategoria,
  }));

  const totales = {
    gastado: periodosData.reduce((s, d) => roundTwo(s + d.totalGastado), 0),
    pagado: periodosData.reduce((s, d) => roundTwo(s + d.totalPagado), 0),
    pendiente: periodosData.reduce((s, d) => roundTwo(s + d.totalPendiente), 0),
    repuesto: periodosData.reduce((s, d) => roundTwo(s + d.montoRepuesto), 0),
  };

  const fondoEf = fondos ? Number(fondos.fondo_efectivo) : 500;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-yayis-dark">
          {isAnual ? `Resumen Anual ${currentYear}` : 'Resumen Mensual'}
        </h1>
        <Select
          value={selectedPeriodo}
          onChange={e => setSelectedPeriodo(e.target.value)}
          className="w-52"
        >
          <option value="0-0">Todo el Ano {currentYear}</option>
          {meses.map(m => (
            <option key={`${m.anio}-${m.mes}`} value={`${m.anio}-${m.mes}`}>{m.label}</option>
          ))}
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
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
              <CheckCircle size={18} className="text-emerald-500" />
              <span className="text-xs text-muted-foreground">Total Pagado</span>
            </div>
            <p className="text-xl font-bold text-emerald-600">{formatMonto(totales.pagado)}</p>
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
      </div>

      {/* Reposicion Cards */}
      {isOwner && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-yayis-green/30 bg-yayis-cream">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wallet size={18} className="text-yayis-green" />
                <span className="text-xs font-medium text-yayis-green">Reponer Efectivo</span>
              </div>
              <p className="text-xl font-bold text-yayis-green">{formatMonto(fondoEf)}</p>
              <p className="text-xs text-muted-foreground mt-1">Caja chica completa</p>
            </CardContent>
          </Card>
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
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wallet size={18} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Gastado Efectivo</span>
              </div>
              <p className="text-xl font-bold text-yayis-dark">{formatMonto(totalEfectivo)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard size={18} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Gastado Cuentas</span>
              </div>
              <p className="text-xl font-bold text-yayis-dark">{formatMonto(totalCuentas)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Resumen por {isAnual ? 'Mes' : 'Semana'}</CardTitle>
        </CardHeader>
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
                {periodosData.map(s => (
                  <tr key={s.label} className="border-b">
                    <td className="py-2">{s.label}</td>
                    <td className="text-right py-2 font-medium">{formatMonto(s.totalGastado)}</td>
                    <td className="text-right py-2">{formatMonto(s.efectivo)}</td>
                    <td className="text-right py-2">{formatMonto(s.cuentas)}</td>
                    <td className="text-right py-2 text-amber-600">{formatMonto(s.totalPendiente)}</td>
                  </tr>
                ))}
                <tr className="font-bold border-t-2">
                  <td className="py-2">Total</td>
                  <td className="text-right py-2">{formatMonto(totales.gastado)}</td>
                  <td className="text-right py-2">{formatMonto(totalEfectivo)}</td>
                  <td className="text-right py-2">{formatMonto(totalCuentas)}</td>
                  <td className="text-right py-2 text-amber-600">{formatMonto(totales.pendiente)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Gasto por {isAnual ? 'Mes' : 'Semana'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={isAnual ? -45 : 0} textAnchor={isAnual ? 'end' : 'middle'} height={isAnual ? 80 : 30} />
                <YAxis />
                <Tooltip formatter={(v: number) => formatMonto(v)} />
                <Bar dataKey="Total Gastado" fill="#004C40" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Categorias por {isAnual ? 'Mes' : 'Semana'}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stackedData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={isAnual ? -45 : 0} textAnchor={isAnual ? 'end' : 'middle'} height={isAnual ? 80 : 30} />
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
          <CardTitle>Top 5 Categorias</CardTitle>
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
