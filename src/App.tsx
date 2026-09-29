import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { SedeActivaProvider } from '@/contexts/SedeActivaContext';
import { ToastProvider } from '@/components/ui/toast';
import { AppLayout } from '@/components/layout/AppLayout';
import { Loading } from '@/components/ui/loading';
import { LoginPage } from '@/pages/LoginPage';
import { RegistroGastosPage } from '@/pages/RegistroGastosPage';
import { ConfiguracionPage } from '@/pages/ConfiguracionPage';
import { UsuariosPage } from '@/pages/UsuariosPage';
import { PedidosPage } from '@/pages/PedidosPage';
import { RutaComprasPage } from '@/pages/RutaComprasPage';
import { ProveedoresPage } from '@/pages/ProveedoresPage';
import { RendicionPage } from '@/pages/RendicionPage';
import { RecepcionPage } from '@/pages/RecepcionPage';
import { SoloRoles, InicioSegunRol } from '@/components/layout/SoloRoles';

// El Resumen carga las librerias de graficos (pesadas); se descarga solo
// cuando el usuario entra a esa pestaña para que el resto de la app abra rapido.
const ResumenPage = lazy(() =>
  import('@/pages/ResumenPage').then(m => ({ default: m.ResumenPage }))
);

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SedeActivaProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AppLayout />}>
              <Route path="/inicio" element={<InicioSegunRol />} />
              <Route path="/gastos" element={<SoloRoles roles={['owner', 'admin', 'viewer']}><RegistroGastosPage /></SoloRoles>} />
              <Route path="/resumen" element={
                <SoloRoles roles={['owner', 'admin', 'viewer']}>
                  <Suspense fallback={<Loading text="Cargando resumen..." />}>
                    <ResumenPage />
                  </Suspense>
                </SoloRoles>
              } />
              <Route path="/pedidos" element={<SoloRoles roles={['owner', 'admin']}><PedidosPage /></SoloRoles>} />
              <Route path="/ruta" element={<SoloRoles roles={['owner', 'compras']}><RutaComprasPage /></SoloRoles>} />
              <Route path="/proveedores" element={<SoloRoles roles={['owner', 'compras']}><ProveedoresPage /></SoloRoles>} />
              <Route path="/rendicion" element={<SoloRoles roles={['owner', 'compras']}><RendicionPage /></SoloRoles>} />
              <Route path="/recepcion" element={<SoloRoles roles={['owner', 'admin']}><RecepcionPage /></SoloRoles>} />
              {/* Redirect old routes */}
              <Route path="/semanal" element={<Navigate to="/resumen" replace />} />
              <Route path="/mensual" element={<Navigate to="/resumen" replace />} />
              <Route path="/configuracion" element={<ConfiguracionPage />} />
              <Route path="/usuarios" element={<UsuariosPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/inicio" replace />} />
          </Routes>
        </ToastProvider>
        </SedeActivaProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
