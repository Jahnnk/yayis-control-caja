import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Loading } from '@/components/ui/loading';
import { Button } from '@/components/ui/button';

export function AppLayout() {
  const { user, profile, loading, profileError, signOut } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) return <Loading text="Cargando..." />;
  if (!user) return <Navigate to="/login" replace />;

  // User is logged in but profile failed to load
  if (!profile) {
    return (
      <div className="min-h-screen bg-yayis-cream flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <span className="text-2xl">!</span>
          </div>
          <h2 className="text-xl font-bold text-yayis-dark mb-2">Error al cargar perfil</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {profileError ?? 'No se encontro un perfil asociado a tu cuenta. Contacta al administrador.'}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            Usuario: {user.email}
          </p>
          <Button variant="outline" onClick={signOut}>Cerrar Sesion</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
