import { NavLink } from 'react-router-dom';
import { ClipboardList, BarChart3, Settings, Users, X, ShoppingCart, Truck, Store, Wallet, PackageCheck, LayoutDashboard, Bike, Eye, Gauge } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

type Grupo = 'ver' | 'compras' | 'dinero' | 'admin';

const TITULO_GRUPO: Record<Grupo, string> = {
  ver: 'Para ver cómo vamos',
  compras: 'Compras',
  dinero: 'Dinero',
  admin: 'Administración',
};

// Orden de los grupos según quién entra: Gerencia mira primero; los demás, primero su trabajo del día.
const ORDEN_GRUPOS: Record<string, Grupo[]> = {
  owner: ['ver', 'compras', 'dinero', 'admin'],
  admin: ['compras', 'dinero', 'ver'],
  compras: ['compras', 'dinero'],
  viewer: ['dinero', 'ver'],
};

const navItems = [
  { to: '/vista-general', label: 'Vista general', icon: Eye, grupo: 'ver', roles: ['owner'] },
  { to: '/finanzas', label: 'Panel de Finanzas', icon: LayoutDashboard, grupo: 'ver', roles: ['owner'] },
  { to: '/resumen', label: 'Resumen', icon: BarChart3, grupo: 'ver', roles: ['owner', 'admin', 'viewer'] },
  { to: '/presupuesto', label: 'Presupuesto', icon: Gauge, grupo: 'ver', roles: ['owner', 'admin', 'viewer'] },
  { to: '/pedidos', label: 'Pedidos y recepción', icon: ShoppingCart, grupo: 'compras', roles: ['owner', 'admin'] },
  { to: '/ruta', label: 'Ruta de compras', icon: Truck, grupo: 'compras', roles: ['owner', 'compras'] },
  { to: '/proveedores', label: 'Proveedores', icon: Store, grupo: 'compras', roles: ['owner', 'admin', 'compras'] },
  { to: '/recepcion', label: 'Dinero de la semana', icon: PackageCheck, grupo: 'dinero', roles: ['owner', 'admin'] },
  { to: '/rendicion', label: 'Mi dinero y rendición', icon: Wallet, grupo: 'dinero', roles: ['compras'] },
  { to: '/gastos', label: 'Registro de Gastos', icon: ClipboardList, grupo: 'dinero', roles: ['owner', 'admin', 'viewer'] },
  { to: '/deliverys', label: 'Deliverys', icon: Bike, grupo: 'dinero', roles: ['owner', 'admin', 'compras'] },
  { to: '/configuracion', label: 'Configuración', icon: Settings, grupo: 'admin', roles: ['owner'] },
  { to: '/usuarios', label: 'Usuarios', icon: Users, grupo: 'admin', roles: ['owner'] },
] as const;

export function Sidebar({ open, onClose }: SidebarProps) {
  const { profile } = useAuth();
  const rol = profile?.rol ?? 'viewer';
  const grupos = (ORDEN_GRUPOS[rol] ?? ORDEN_GRUPOS.viewer!)
    .map(g => ({ g, items: navItems.filter(i => i.grupo === g && (i.roles as readonly string[]).includes(rol)) }))
    .filter(x => x.items.length > 0);

  return (
    <>
      {/* Overlay mobile */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 h-full w-64 bg-yayis-green text-white transform transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
          <div>
            <h1 className="text-xl font-black tracking-tight">Yayi's</h1>
            <p className="text-xs text-white/60">Control de Caja</p>
          </div>
          <button onClick={onClose} className="lg:hidden text-white/60 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-2 px-3">
          {grupos.map(({ g, items }) => (
            <div key={g} className="mt-3 space-y-1">
              <p className="px-3 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/45">{TITULO_GRUPO[g]}</p>
              {items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-white/15 text-white'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  <item.icon size={18} />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
