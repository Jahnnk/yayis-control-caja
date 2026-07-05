import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/components/ui/toast';
import { AppLayout } from '@/components/layout/AppLayout';
import { Loading } from '@/components/ui/loading';
import { LoginPage } from '@/pages/LoginPage';
import { RegistroGastosPage } from '@/pages/RegistroGastosPage';
import { ConfiguracionPage } from '@/pages/ConfiguracionPage';
import { UsuariosPage } from '@/pages/UsuariosPage';

// El Resumen carga las librerias de graficos (pesadas); se descarga solo
// cuando el usuario entra a esa pestaña para que el resto de la app abra rapido.
const ResumenPage = lazy(() =>
  import('@/pages/ResumenPage').then(m => ({ default: m.ResumenPage }))
);

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AppLayout />}>
              <Route path="/gastos" element={<RegistroGastosPage />} />
              <Route path="/resumen" element={
                <Suspense fallback={<Loading text="Cargando resumen..." />}>
                  <ResumenPage />
                </Suspense>
              } />
              {/* Redirect old routes */}
              <Route path="/semanal" element={<Navigate to="/resumen" replace />} />
              <Route path="/mensual" element={<Navigate to="/resumen" replace />} />
              <Route path="/configuracion" element={<ConfiguracionPage />} />
              <Route path="/usuarios" element={<UsuariosPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/gastos" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
