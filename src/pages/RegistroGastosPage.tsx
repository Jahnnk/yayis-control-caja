import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGastos } from '@/hooks/useGastos';
import { useCategorias } from '@/hooks/useCategorias';
import { useSaldoSemanal } from '@/hooks/useSaldoSemanal';
import { RecorridoDinero } from '@/components/gastos/RecorridoDinero';
import { ConsolidadoReposicion } from '@/components/gastos/ConsolidadoReposicion';
import { useConsolidadoReposicion, type CompraDeCompras } from '@/hooks/useConsolidadoReposicion';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { useToast } from '@/components/ui/toast';
import { GastoForm } from '@/components/gastos/GastoForm';
import { GastosTable } from '@/components/gastos/GastosTable';
import { ResumenDiario } from '@/components/gastos/ResumenDiario';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select-native';
import { getTodayLima, calcularSemana, getMesLabel, getSemanasDelMes } from '@/lib/dates';
import { fechaCorta } from '@/lib/compras';
import { formatMonto, roundTwo } from '@/lib/utils';
import { Search } from 'lucide-react';
import type { GastoConCategoria, GastoFormData } from '@/types';

/** Filas de compras (fecha, proveedor, total) de una lista. */
function FilasCompras({ compras }: { compras: CompraDeCompras[] }) {
  return (
    <div className="divide-y rounded-md border bg-white text-sm">
      {compras.map(c => (
        <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
          <span className="w-24 capitalize text-muted-foreground">{fechaCorta(c.fecha)}</span>
          <span className="min-w-[8rem] flex-1 font-medium">{c.proveedor}</span>
          {c.evidenciaPendiente && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Falta una foto</span>}
          <span className="font-bold">{formatMonto(c.total)}</span>
        </div>
      ))}
    </div>
  );
}

export function RegistroGastosPage() {
  const { profile } = useAuth();
  const { gastos, total, loading, fetchGastos, deleteGasto, getConstanciaUrl } = useGastos();
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
  const [filterOrigen, setFilterOrigen] = useState<'' | 'administrador' | 'compras'>('');
  const [page, setPage] = useState(0);
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

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-yayis-dark">Registro de Gastos</h1>

      <ConsolidadoReposicion datos={consolidado} sinRendir={sinRendir} responsable={responsable ?? 'el administrador'} />

      <RecorridoDinero saldo={saldoSemanal} />

      <ResumenDiario />

      {!isViewer && (
        <GastoForm
          onSaved={() => { loadGastos(); setVersionSaldo(v => v + 1); }}
          editData={editGasto ?? undefined}
          onCancelEdit={() => setEditGasto(null)}
        />
      )}

      {/* ¿Quién lo originó? */}
      <div className="flex flex-wrap gap-1" role="group" aria-label="Origen de los gastos">
        {([
          ['', 'Todos'],
          ['administrador', 'Pagados por el administrador'],
          ['compras', 'Compras'],
        ] as const).map(([valor, etiqueta]) => (
          <Button key={valor} type="button" size="sm" variant={filterOrigen === valor ? 'default' : 'outline'} aria-pressed={filterOrigen === valor}
            onClick={() => { setFilterOrigen(valor); setPage(0); }}>
            {etiqueta}
          </Button>
        ))}
      </div>

      {filterOrigen === 'compras' && (sinRendir.cantidad > 0 || sinRendir.cerradas.length > 0) && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
          <div>
            <p className="text-sm font-bold text-amber-900">Compras que Compras ya registró en el sistema</p>
            <p className="text-xs text-amber-900">
              Esto es lo que Compras <strong>ya registró</strong>, según el paso en que va: <strong>registradas</strong> (Compras todavía no rinde cuentas), <strong>rendidas</strong> (Compras ya rindió; falta que tú cierres la rendición en «Entregas y recepción») y <strong>cerradas</strong> (ya son gasto y aparecen en la lista de abajo).
              Lo que Compras gastó y <strong>todavía no registró</strong> no aparece aquí: se ve como «falta justificar» en el recorrido del dinero, arriba.
            </p>
          </div>
          {(['abierta', 'rendida'] as const).map(estado => {
            const lista = sinRendir.compras.filter(c => c.estado === estado);
            if (lista.length === 0) return null;
            return (
              <div key={estado}>
                <p className="mb-1 text-xs font-bold text-amber-900">
                  {estado === 'abierta' ? 'Registradas, Compras aún no rinde cuentas' : 'Rendidas por Compras: falta cerrar la rendición'} ({lista.length} · {formatMonto(lista.reduce((t, c) => roundTwo(t + c.total), 0))})
                </p>
                <FilasCompras compras={lista} />
              </div>
            );
          })}
          {sinRendir.cerradas.length > 0 && (
            <details className="rounded-md border bg-white">
              <summary className="cursor-pointer list-none px-3 py-2 text-xs font-bold text-yayis-dark">
                Cerradas este mes, ya son gasto ({sinRendir.cerradas.length} · {formatMonto(sinRendir.cerradas.reduce((t, c) => roundTwo(t + c.total), 0))})
              </summary>
              <div className="border-t"><FilasCompras compras={sinRendir.cerradas} /></div>
            </details>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por descripcion..."
            value={busqueda}
            onChange={e => { setBusqueda(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>
        <Select value={filterSemana} onChange={e => { setFilterSemana(e.target.value); setPage(0); }} className="w-40">
          <option value="">Todas las semanas</option>
          {semanas.map(s => (
            <option key={s.semana} value={s.semana}>Semana {s.semana}</option>
          ))}
        </Select>
        <Select value={filterCategoria} onChange={e => { setFilterCategoria(e.target.value); setPage(0); }} className="w-40">
          <option value="">Todas las categorias</option>
          {categorias.map(c => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </Select>
        <Select value={filterMetodoPago} onChange={e => { setFilterMetodoPago(e.target.value); setPage(0); }} className="w-36">
          <option value="">Todo pago</option>
          <option value="efectivo">Efectivo</option>
          <option value="cuentas">Cuentas</option>
        </Select>
        <Select value={filterEstado} onChange={e => { setFilterEstado(e.target.value); setPage(0); }} className="w-40">
          <option value="">Pendientes</option>
          <option value="todos">Todos los estados</option>
          <option value="pagado">Solo pagados</option>
        </Select>
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
        title="Eliminar gasto"
        message="Esta seguro que desea eliminar este gasto? Esta accion no se puede deshacer."
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
