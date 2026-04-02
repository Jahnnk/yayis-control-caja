import { Menu, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  onMenuToggle: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const { profile, sede, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-white border-b shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={onMenuToggle} className="lg:hidden text-yayis-dark hover:text-yayis-green">
          <Menu size={22} />
        </button>
        <div className="hidden sm:block">
          <span className="text-sm font-bold text-yayis-green">{sede?.nombre ?? 'Sin sede'}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium text-yayis-dark">{profile?.nombre}</p>
          <p className="text-xs text-muted-foreground capitalize">{profile?.rol}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={signOut} title="Cerrar sesion">
          <LogOut size={18} />
        </Button>
      </div>
    </header>
  );
}
