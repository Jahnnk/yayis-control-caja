import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGastos } from '@/hooks/useGastos';
import { useCategorias } from '@/hooks/useCategorias';
import { useToast } from '@/components/ui/toast';
import { GastoForm } from '@/components/gastos/GastoForm';
import { GastosTable } from '@/components/gastos/GastosTable';
import { ResumenDiario } from '@/components/gastos/ResumenDiario';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select-native';
import { getTodayLima, calcularSemana, getMesLabel, getSemanasDelMes } from '@/lib/dates';
import { Search } from 'lucide-react';
import type { GastoConCategoria, GastoFormData } from '@/types';

export function RegistroGastosPage() {
  const { profile } = useAuth();
  const { gastos, total, loading, fetchGastos, deleteGasto } = useGastos();
  const { categorias } = useCategorias();
  const { addToast } = useToast();

  const today = getTodayLima();
  const currentMes = getMesLabel(today);
  const currentSemana = calcularSemana(today);

  const [editGasto, setEditGasto] = useState<(GastoFormData & { id: string }) | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
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
      estado: filterEstado || undefined,
      busqueda: busqueda || undefined,
      page,
      pageSize,
    });
  }, [fetchGastos, filterSemana, filterCategoria, filterMetodoPago, filterEstado, busqueda, page, currentMes]);

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

  const isViewer = profile?.rol === 'viewer';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-yayis-dark">Registro de Gastos</h1>

      <ResumenDiario />

      {!isViewer && (
        <GastoForm
          onSaved={loadGastos}
          editData={editGasto ?? undefined}
          onCancelEdit={() => setEditGasto(null)}
        />
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
        <Select value={filterEstado} onChange={e => { setFilterEstado(e.target.value); setPage(0); }} className="w-36">
          <option value="">Todo estado</option>
          <option value="pagado">Pagado</option>
          <option value="pendiente">Pendiente</option>
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
