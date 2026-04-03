import { NavLink } from 'react-router-dom';
import { ClipboardList, BarChart3, Settings, Users, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navItems = [
  { to: '/gastos', label: 'Registro de Gastos', icon: ClipboardList, roles: ['owner', 'admin', 'viewer'] },
  { to: '/resumen', label: 'Resumen', icon: BarChart3, roles: ['owner', 'admin', 'viewer'] },
  { to: '/configuracion', label: 'Configuracion', icon: Settings, roles: ['owner'] },
  { to: '/usuarios', label: 'Usuarios', icon: Users, roles: ['owner'] },
] as const;

export function Sidebar({ open, onClose }: SidebarProps) {
  const { profile } = useAuth();
  const rol = profile?.rol ?? 'viewer';

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
        <nav className="mt-4 px-3 space-y-1">
          {navItems
            .filter(item => (item.roles as readonly string[]).includes(rol))
            .map(item => (
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
        </nav>
      </aside>
    </>
  );
}
