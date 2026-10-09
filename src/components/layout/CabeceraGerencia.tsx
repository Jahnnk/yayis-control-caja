import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

// Las pantallas «para ver» de Gerencia: cada una responde UNA pregunta. Se enlazan entre sí para no buscar en el menú.
const PANTALLAS = [
  { to: '/vista-general', titulo: 'Vista general', pregunta: '¿Qué pasó?' },
  { to: '/finanzas', titulo: 'Panel de Finanzas', pregunta: '¿Qué tengo que resolver?' },
  { to: '/resumen', titulo: 'Resumen', pregunta: '¿Cuánto repongo a cada caja?' },
] as const;

/** Título de una pantalla de Gerencia con la pregunta que responde y acceso a las otras dos. */
export function CabeceraGerencia({ titulo, explicacion, acciones }: { titulo: string; explicacion: ReactNode; acciones?: ReactNode }) {
  const { pathname } = useLocation();
  const { profile } = useAuth();
  const actual = PANTALLAS.find(p => p.to === pathname);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-yayis-dark">{titulo}</h1>
          <p className="text-sm text-muted-foreground">
            {actual && profile?.rol === 'owner' && <strong className="font-semibold text-yayis-dark">{actual.pregunta} </strong>}
            {explicacion}
          </p>
        </div>
        {acciones}
      </div>
      {profile?.rol === 'owner' && (
        <nav aria-label="Otras pantallas de Gerencia" className="flex flex-wrap gap-2">
          {PANTALLAS.filter(p => p.to !== pathname).map(p => (
            <Link key={p.to} to={p.to} className="rounded-full border bg-white px-3 py-1 text-xs text-muted-foreground transition hover:border-yayis-green/40 hover:text-yayis-dark">
              {p.pregunta} <span className="font-medium text-yayis-green">{p.titulo} →</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
