import { Menu, LogOut, MapPin } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { Button } from '@/components/ui/button';
import { ROL_LABEL } from '@/lib/roles';

// Pantallas que muestran las 3 sedes juntas (tienen su propio filtro de sede): el selector de arriba no aplica.
const PANTALLAS_DE_TODAS_LAS_SEDES = ['/hoy', '/vista-general', '/finanzas', '/ruta', '/rendicion'];

interface HeaderProps {
  onMenuToggle: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { profile, signOut } = useAuth();
  const { sedeId, sedeActiva, sedes, puedeCambiarSede, cambiarSede } = useSedeActiva();
  const { pathname } = useLocation();
  // «Hoy» es de todas las sedes solo para Gerencia; el administrador ve la suya.
  const todasLasSedes = PANTALLAS_DE_TODAS_LAS_SEDES.includes(pathname) && (pathname !== '/hoy' || profile?.rol === 'owner');

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-white border-b shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={onMenuToggle} className="lg:hidden text-yayis-dark hover:text-yayis-green">
          <Menu size={22} />
        </button>
        {puedeCambiarSede && !todasLasSedes ? (
          <label className="flex items-center gap-2">
            <MapPin size={16} className="text-yayis-green shrink-0" />
            <span className="sr-only">Sede</span>
            <select
              value={sedeId ?? ''}
              onChange={e => cambiarSede(e.target.value)}
              className="rounded-md border border-yayis-green/40 bg-yayis-cream px-2 py-1 text-sm font-bold text-yayis-green focus:outline-none focus:ring-2 focus:ring-yayis-green/40"
              aria-label="Sede que estás viendo"
            >
              {sedes.map(s => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </label>
        ) : (
          <span className="flex items-center gap-1.5 text-sm font-bold text-yayis-green">
            <MapPin size={16} className="shrink-0" />
            {profile?.rol === 'compras' || todasLasSedes ? 'Todas las sedes' : sedeActiva?.nombre ?? 'Sin sede'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-yayis-dark">{profile?.nombre}</p>
          <p className="text-xs text-muted-foreground">{profile ? ROL_LABEL[profile.rol] : ''}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={signOut} title="Cerrar sesión">
          <LogOut size={18} />
        </Button>
      </div>
    </header>
  );
}
