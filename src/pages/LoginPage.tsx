import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

export function LoginPage() {
  const { user, loading: authLoading, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (authLoading) return null;
  if (user) return <Navigate to="/gastos" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await signIn(email, password);
    if (result.error) {
      setError('Credenciales incorrectas. Verifica tu email y contrasena.');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-yayis-cream flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-yayis-green mb-4">
            <span className="text-2xl font-black text-white">Y's</span>
          </div>
          <h1 className="text-2xl font-black text-yayis-green">Yayi's</h1>
          <p className="text-sm text-muted-foreground mt-1">Control de Caja</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-yayis-dark" htmlFor="email">
              Email
            </label>
            <Input
              id="email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-yayis-dark" htmlFor="password">
              Contrasena
            </label>
            <Input
              id="password"
              type="password"
              placeholder="********"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="mt-1"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-md p-2">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Iniciar Sesion
          </Button>
        </form>
      </div>
    </div>
  );
}
