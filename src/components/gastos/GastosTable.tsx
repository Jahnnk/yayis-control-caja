import { useAuth } from '@/contexts/AuthContext';
import { formatMonto } from '@/lib/utils';
import { getTodayLima } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2 } from 'lucide-react';
import type { GastoConCategoria, GastoFormData } from '@/types';

interface GastosTableProps {
  gastos: GastoConCategoria[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onEdit: (gasto: GastoConCategoria) => void;
  onDelete: (id: string) => void;
}

export function GastosTable({ gastos, total, page, pageSize, onPageChange, onEdit, onDelete }: GastosTableProps) {
  const { profile } = useAuth();
  const isOwner = profile?.rol === 'owner';
  const today = getTodayLima();
  const totalPages = Math.ceil(total / pageSize);

  function canEdit(gasto: GastoConCategoria): boolean {
    if (isOwner) return true;
    return gasto.registrado_por === profile?.id;
  }

  return (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">#</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Fecha</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Descripcion</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Categoria</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Pago</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Monto</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Registrado por</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {gastos.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-8 text-muted-foreground">
                  No hay gastos registrados
                </td>
              </tr>
            )}
            {gastos.map(g => (
              <tr key={g.id} className="border-b hover:bg-gray-50/50">
                <td className="px-4 py-3 text-muted-foreground">#{g.numero_registro}</td>
                <td className="px-4 py-3 whitespace-nowrap">{g.fecha}</td>
                <td className="px-4 py-3 max-w-xs truncate">{g.descripcion}</td>
                <td className="px-4 py-3 whitespace-nowrap">{g.categorias?.nombre ?? '-'}</td>
                <td className="px-4 py-3 whitespace-nowrap capitalize">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    g.metodo_pago === 'efectivo' ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'
                  }`}>
                    {g.metodo_pago === 'efectivo' ? 'Efectivo' : 'Cuentas'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-medium whitespace-nowrap">{formatMonto(Number(g.monto))}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    g.estado === 'pagado' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {g.estado === 'pagado' ? 'Pagado' : 'Pendiente'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{g.profiles?.nombre ?? '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {canEdit(g) && (
                      <Button variant="ghost" size="icon" onClick={() => onEdit(g)} title="Editar">
                        <Pencil size={14} />
                      </Button>
                    )}
                    {isOwner && (
                      <Button variant="ghost" size="icon" onClick={() => onDelete(g.id)} title="Eliminar" className="text-red-500 hover:text-red-700">
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
