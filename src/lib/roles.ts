import type { Rol } from '@/types';

// En la base de datos los roles tienen nombre tecnico; en pantalla, el nombre del puesto.
export const ROL_LABEL: Record<Rol, string> = {
  owner: 'Gerencia',
  admin: 'Administrador de sede',
  compras: 'Compras',
  viewer: 'Solo lectura',
};

// Roles que se pueden asignar hoy desde Usuarios. "compras" se habilita con el modulo de Compras.
export const ROLES_ASIGNABLES: Rol[] = ['owner', 'admin', 'viewer'];
