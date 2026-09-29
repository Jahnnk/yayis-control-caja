import type { Rol } from '@/types';

// En la base de datos los roles tienen nombre tecnico; en pantalla, el nombre del puesto.
export const ROL_LABEL: Record<Rol, string> = {
  owner: 'Gerencia',
  admin: 'Administrador de sede',
  compras: 'Compras',
  viewer: 'Solo lectura',
};

export const ROLES_ASIGNABLES: Rol[] = ['owner', 'admin', 'compras', 'viewer'];
