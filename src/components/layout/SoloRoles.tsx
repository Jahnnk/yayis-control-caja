import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { Rol } from '@/types';

/** Muestra la pantalla solo a ciertos roles; al resto lo lleva a su pantalla de inicio. */
export function SoloRoles({ roles, children }: { roles: Rol[]; children: ReactNode }) {
  const { profile } = useAuth();
  if (!profile) return null;
  if (!roles.includes(profile.rol)) return <Navigate to="/inicio" replace />;
  return <>{children}</>;
}

/** Cada rol arranca donde trabaja: Compras en su ruta del día, el resto en el registro de gastos. */
export function InicioSegunRol() {
  const { profile } = useAuth();
  if (!profile) return null;
  return <Navigate to={profile.rol === 'compras' ? '/ruta' : '/gastos'} replace />;
}
