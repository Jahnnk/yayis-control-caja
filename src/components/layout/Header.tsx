import { Menu, LogOut, MapPin } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSedeActiva } from '@/contexts/SedeActivaContext';
import { Button } from '@/components/ui/button';
import { ROL_LABEL } from '@/lib/roles';

interface HeaderProps {
  onMenuToggle: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { profile, signOut } = useAuth();
  const { sedeId, sedeActiva, sedes, puedeCambiarSede, cambiarSede } = useSedeActiva();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-white border-b shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={onMenuToggle} className="lg:hidden text-yayis-dark hover:text-yayis-green">
          <Menu size={22} />
        </button>
        {puedeCambiarSede ? (
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
            {profile?.rol === 'compras' ? 'Todas las sedes' : sedeActiva?.nombre ?? 'Sin sede'}
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
