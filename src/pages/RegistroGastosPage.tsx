import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGastos } from '@/hooks/useGastos';
import { useCategorias } from '@/hooks/useCategorias';
import { useSaldoSemanal } from '@/hooks/useSaldoSemanal';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useConsolidadoReposicion } from '@/hooks/useConsolidadoReposicion';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { useToast } from '@/components/ui/toast';
import { GastoForm } from '@/components/gastos/GastoForm';
import { GastosTable } from '@/components/gastos/GastosTable';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select-native';
import { getTodayLima, calcularSemana, getMesLabel, getSemanasDelMes } from '@/lib/dates';
import { formatMonto } from '@/lib/utils';
import { Search, SlidersHorizontal } from 'lucide-react';
import { Dato } from '@/components/ui/dato';
import type { GastoConCategoria, GastoFormData } from '@/types';

export function RegistroGastosPage() {
  const { profile } = useAuth();
  const { gastos, total, loading, fetchGastos, deleteGasto, getConstanciaUrl, fetchResumenDiario } = useGastos();
  const { categorias } = useCategorias();
  const { addToast } = useToast();

  const today = getTodayLima();
  const currentMes = getMesLabel(today);
  const currentSemana = calcularSemana(today);

  const [editGasto, setEditGasto] = useState<(GastoFormData & { id: string; constancia_path: string | null }) | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [versionSaldo, setVersionSaldo] = useState(0);
  const saldoSemanal = useSaldoSemanal(versionSaldo);
  const { responsable } = useSedeActiva();
  const { consolidado, sinRendir } = useConsolidadoReposicion(versionSaldo);
  // Quién originó los gastos que se ven: todos, los del administrador o las compras de Fabio.
  // Se puede llegar con ?origen=administrador|compras (desde el Consolidado del Resumen): la lista sale ya filtrada.
  const [params] = useSearchParams();
  const origenInicial = params.get('origen');
  const [filterOrigen, setFilterOrigen] = useState<'' | 'administrador' | 'compras'>(origenInicial === 'administrador' || origenInicial === 'compras' ? origenInicial : '');
  const { hash } = useLocation();
  // Con #lista-gastos se baja directo a la lista (el detalle que se vino a ver).
  useEffect(() => {
    if (hash !== '#lista-gastos') return;
    const t = window.setTimeout(() => document.getElementById('lista-gastos')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
    return () => window.clearTimeout(t);
  }, [hash]);
  const [page, setPage] = useState(0);
  // Lo gastado hoy (efectivo y cuentas).
  const [hoyResumen, setHoyResumen] = useState({ efectivo: 0, cuentas: 0, total: 0 });
  const cargarHoy = useCallback(() => { fetchResumenDiario(getTodayLima()).then(setHoyResumen); }, [fetchResumenDiario]);
  useEffect(() => { cargarHoy(); }, [cargarHoy]);
  // Filtros plegados: solo la búsqueda y el origen quedan a la vista.
  const [verFiltros, setVerFiltros] = useState(false);
  const pageSize = 20;

  // Filters
  const [filterSemana, setFilterSemana] = useState<string>('');
  const [filterCategoria, setFilterCategoria] = useState('');
  const [filterMetodoPago, setFilterMetodoPago] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const now = new Date();
  const semanas = getSemanasDelMes(now.getFullYear(), now.getMonth() + 1);

  const loadGastos = useCallback(() => {
    fetchGastos({
      semana: filterSemana ? parseInt(filterSemana) : undefined,
      mes: filterSemana ? currentMes : undefined,
      categoria_id: filterCategoria || undefined,
      metodo_pago: filterMetodoPago || undefined,
      estado: filterEstado === 'todos' ? undefined : (filterEstado || 'pendiente'),
      busqueda: busqueda || undefined,
      origen: filterOrigen || undefined,
      page,
      pageSize,
    });
  }, [fetchGastos, filterSemana, filterCategoria, filterMetodoPago, filterEstado, filterOrigen, busqueda, page, currentMes]);

  useEffect(() => {
    loadGastos();
  }, [loadGastos]);

  function handleEdit(g: GastoConCategoria) {
    setEditGasto({
      id: g.id,
      fecha: g.fecha,
      descripcion: g.descripcion,
      categoria_id: g.categoria_id,
      metodo_pago: g.metodo_pago,
      monto: String(g.monto),
      estado: g.estado,
      notas: g.notas ?? '',
      con_monto_semanal: g.con_monto_semanal === true,
      constancia_path: g.constancia_path,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDelete() {
    if (!deleteId) return;
    const { error } = await deleteGasto(deleteId);
    if (error) addToast(`Error: ${error}`, 'error');
    else {
      addToast('Gasto eliminado', 'success');
      loadGastos();
    }
    setDeleteId(null);
  }

  async function handleViewConstancia(gasto: GastoConCategoria) {
    if (!gasto.constancia_path) return;
    // Abrir la pestaña inmediatamente evita que el navegador bloquee la ventana
    // mientras se genera el enlace privado.
    const previewWindow = window.open('', '_blank');
    const { url, error } = await getConstanciaUrl(gasto.constancia_path);
    if (error || !url) {
      previewWindow?.close();
      addToast(`No se pudo abrir la constancia: ${error ?? 'archivo no disponible'}`, 'error');
      return;
    }
    if (previewWindow) {
      previewWindow.opener = null;
      previewWindow.location.href = url;
    } else {
      addToast('El navegador bloqueó la constancia. Habilita las ventanas emergentes e inténtalo nuevamente.', 'error');
    }
  }

  const isViewer = profile?.rol === 'viewer';
  // Las categorías que más aparecen en los gastos que se ven (para los botones del formulario).
  const categoriasFrecuentes = Object.entries(gastos.filter(g => g.origen !== 'compras').reduce<Record<string, number>>((m, g) => { m[g.categoria_id] = (m[g.categoria_id] ?? 0) + 1; return m; }, {}))
    .sort((a, b) => b[1] - a[1]).map(([id]) => id).slice(0, 4);
  const filtrosActivos = [filterEstado, filterSemana, filterCategoria, filterMetodoPago].filter(Boolean).length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-yayis-dark">Registro de Gastos</h1>

      {/* Cómo vas: lo de hoy, lo que se repone y lo que queda del monto semanal */}
      <section aria-label="Cómo vas" className="grid grid-cols-2 gap-2 sm:grid-cols-3 [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-1">
        <Dato etiqueta="Gastado hoy" valor={formatMonto(hoyResumen.total)} nota={`efectivo ${formatMonto(hoyResumen.efectivo)} · cuentas ${formatMonto(hoyResumen.cuentas)}`} />
        <Dato etiqueta="Gerencia te debe reponer" valor={formatMonto(consolidado.total.total)} nota={`tuyo ${formatMonto(consolidado.administrador.total)} · Compras ${formatMonto(consolidado.compras.total)}`} />
        <Dato etiqueta="Te queda del monto semanal" valor={formatMonto(saldoSemanal.queda)} nota="detalle en Dinero de la semana" alerta={saldoSemanal.queda < 0} />
      </section>

      {!isViewer && (
        <GastoForm
          onSaved={() => { loadGastos(); setVersionSaldo(v => v + 1); cargarHoy(); }}
          editData={editGasto ?? undefined}
          onCancelEdit={() => setEditGasto(null)}
          categoriasFrecuentes={categoriasFrecuentes}
        />
      )}

      {/* ¿Quién lo originó? */}
      <span id="lista-gastos" className="block scroll-mt-20" aria-hidden />
      <div className="flex flex-wrap gap-1" role="group" aria-label="Origen de los gastos">
        {([
          ['', 'Todos'],
          ['administrador', 'Del administrador'],
          ['compras', 'De Compras'],
        ] as const).map(([valor, etiqueta]) => (
          <Button key={valor} type="button" size="sm" variant={filterOrigen === valor ? 'default' : 'outline'} aria-pressed={filterOrigen === valor}
            onClick={() => { setFilterOrigen(valor); setPage(0); }}>
            {etiqueta}
          </Button>
        ))}
      </div>

      {filterOrigen === 'compras' && sinRendir.cantidad > 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Aquí solo aparecen las compras de Compras que <strong>ya son gasto</strong> (rendición cerrada). Hay {formatMonto(sinRendir.total)} en {sinRendir.cantidad} compra(s) todavía sin cerrar: míralas en <Link to="/recepcion" className="font-medium underline">Dinero de la semana</Link>.
        </p>
      )}

      {/* Búsqueda y filtros (plegados) */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar un gasto…" value={busqueda} onChange={e => { setBusqueda(e.target.value); setPage(0); }} className="pl-9" />
          </div>
          <Button type="button" variant={filtrosActivos > 0 ? 'default' : 'outline'} onClick={() => setVerFiltros(v => !v)} aria-expanded={verFiltros}>
            <SlidersHorizontal size={15} className="mr-1" /> Filtros{filtrosActivos > 0 ? ` (${filtrosActivos})` : ''}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Mostrando: <strong>{filterEstado === 'todos' ? 'todos' : filterEstado === 'pagado' ? 'solo los repuestos' : 'los que falta reponer'}</strong>
          {filterSemana ? ` · semana ${filterSemana}` : ''}{filterCategoria ? ` · ${categorias.find(c => c.id === filterCategoria)?.nombre ?? ''}` : ''}{filterMetodoPago ? ` · ${filterMetodoPago === 'efectivo' ? 'efectivo' : 'cuentas'}` : ''} · {total} gasto(s)
        </p>
        {verFiltros && (
          <div className="flex flex-wrap gap-2 rounded-md bg-gray-50 p-3">
            <Select value={filterEstado} onChange={e => { setFilterEstado(e.target.value); setPage(0); }} className="w-44 bg-white">
              <option value="">Falta reponer</option>
              <option value="todos">Todos</option>
              <option value="pagado">Solo repuestos</option>
            </Select>
            <Select value={filterSemana} onChange={e => { setFilterSemana(e.target.value); setPage(0); }} className="w-40 bg-white">
              <option value="">Todas las semanas</option>
              {semanas.map(s => <option key={s.semana} value={s.semana}>Semana {s.semana}</option>)}
            </Select>
            <Select value={filterCategoria} onChange={e => { setFilterCategoria(e.target.value); setPage(0); }} className="w-44 bg-white">
              <option value="">Todas las categorías</option>
              {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </Select>
            <Select value={filterMetodoPago} onChange={e => { setFilterMetodoPago(e.target.value); setPage(0); }} className="w-36 bg-white">
              <option value="">Todo pago</option>
              <option value="efectivo">Efectivo</option>
              <option value="cuentas">Cuentas</option>
            </Select>
            {filtrosActivos > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={() => { setFilterEstado(''); setFilterSemana(''); setFilterCategoria(''); setFilterMetodoPago(''); setPage(0); }}>Quitar filtros</Button>
            )}
          </div>
        )}
      </div>

      <GastosTable
        gastos={gastos}
        total={total}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onEdit={handleEdit}
        onDelete={id => setDeleteId(id)}
        onViewConstancia={handleViewConstancia}
      />

      <ConfirmDialog
        open={!!deleteId}
        title="¿Eliminar este gasto?"
        message="Se borrará el gasto y su constancia. No se puede deshacer."
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
