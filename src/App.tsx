import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/components/ui/toast';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoginPage } from '@/pages/LoginPage';
import { RegistroGastosPage } from '@/pages/RegistroGastosPage';
import { ResumenSemanalPage } from '@/pages/ResumenSemanalPage';
import { ResumenMensualPage } from '@/pages/ResumenMensualPage';
import { ConfiguracionPage } from '@/pages/ConfiguracionPage';
import { UsuariosPage } from '@/pages/UsuariosPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<AppLayout />}>
              <Route path="/gastos" element={<RegistroGastosPage />} />
              <Route path="/semanal" element={<ResumenSemanalPage />} />
              <Route path="/mensual" element={<ResumenMensualPage />} />
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
