import { useAuth } from '@/contexts/AuthContext';
import { formatMonto } from '@/lib/utils';
import { getTodayLima } from '@/lib/dates';
import { fechaCorta } from '@/lib/compras';
import { Button } from '@/components/ui/button';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import type { GastoConCategoria, GastoFormData } from '@/types';

interface GastosTableProps {
  gastos: GastoConCategoria[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onEdit: (gasto: GastoConCategoria) => void;
  onDelete: (id: string) => void;
  onViewConstancia: (gasto: GastoConCategoria) => void;
}

export function GastosTable({ gastos, total, page, pageSize, onPageChange, onEdit, onDelete, onViewConstancia }: GastosTableProps) {
  const { profile } = useAuth();
  const isOwner = profile?.rol === 'owner';
  const today = getTodayLima();
  const totalPages = Math.ceil(total / pageSize);

  function canEdit(gasto: GastoConCategoria): boolean {
    if (isOwner) return true;
    return gasto.registrado_por === profile?.id;
  }

  function canDelete(gasto: GastoConCategoria): boolean {
    if (isOwner) return true;
    // Admin can delete their own records
    if (profile?.rol === 'admin' && gasto.registrado_por === profile?.id) return true;
    return false;
  }

  return (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      {gastos.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No hay gastos con estos filtros.</p>}
      <ul className="divide-y">
        {gastos.map(g => (
          <li key={g.id} className="flex items-start gap-3 px-4 py-3 text-sm hover:bg-gray-50/50">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-yayis-dark">{g.descripcion}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>{g.fecha === today ? 'Hoy' : fechaCorta(g.fecha)}</span>
                <span>· {g.categorias?.nombre ?? 'Sin categoría'}</span>
                <span className={`rounded-full px-1.5 py-0.5 font-medium ${g.metodo_pago === 'efectivo' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}>
                  {g.metodo_pago === 'efectivo' ? 'Efectivo' : 'Cuentas'}
                </span>
                {g.origen === 'compras' && <span className="rounded-full bg-violet-50 px-1.5 py-0.5 font-medium text-violet-700">Compras</span>}
                {g.con_monto_semanal && <span className="rounded-full bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700">Monto semanal</span>}
                {(g.numero_registro != null || g.profiles?.nombre) && <span className="hidden sm:inline">· {[g.numero_registro != null ? `#${g.numero_registro}` : null, g.profiles?.nombre].filter(Boolean).join(' · ')}</span>}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-bold tabular-nums text-yayis-dark">{formatMonto(Number(g.monto))}</p>
              <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${g.estado === 'pagado' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {g.estado === 'pagado' ? 'Repuesto' : 'Por reponer'}
              </span>
            </div>
            <div className="-my-1 flex shrink-0 items-center">
              {g.constancia_path && (
                <Button variant="ghost" size="icon" onClick={() => onViewConstancia(g)} title="Ver constancia" aria-label={`Ver constancia de ${g.descripcion}`} className="text-yayis-green">
                  <Eye size={15} />
                </Button>
              )}
              {canEdit(g) && (
                <Button variant="ghost" size="icon" onClick={() => onEdit(g)} title="Editar" aria-label={`Editar ${g.descripcion}`}>
                  <Pencil size={15} />
                </Button>
              )}
              {canDelete(g) && (
                <Button variant="ghost" size="icon" onClick={() => onDelete(g.id)} title="Eliminar" aria-label={`Eliminar ${g.descripcion}`} className="text-red-500 hover:text-red-700">
                  <Trash2 size={15} />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <p className="text-xs text-muted-foreground">{total} registros</p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
            >
              Anterior
            </Button>
            <span className="flex items-center px-3 text-sm text-muted-foreground">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages - 1}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
