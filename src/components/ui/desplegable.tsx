import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

/**
 * Sección plegada con su resumen siempre a la vista (revelación progresiva):
 * se ve la conclusión y el detalle se abre con un toque.
 */
export function Desplegable({ icono, titulo, resumen, children, abierto }: {
  icono?: ReactNode;
  titulo: string;
  resumen?: ReactNode;
  children: ReactNode;
  /** Abierto al cargar (por ejemplo, cuando hay algo que revisar). */
  abierto?: boolean;
}) {
  return (
    <details className="group rounded-lg border bg-white shadow-sm" open={abierto}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 p-4">
        <span className="flex items-center gap-2 text-sm font-bold text-yayis-dark">{icono} {titulo}</span>
        {resumen && <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">{resumen}</span>}
        <ChevronDown size={16} className="ml-auto transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t p-4">{children}</div>
    </details>
  );
}
