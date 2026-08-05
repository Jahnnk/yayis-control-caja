import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile, Sede } from '@/types';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  sede: Sede | null;
  loading: boolean;
  profileError: string | null;
  authError: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sede, setSede] = useState<Sede | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  async function fetchProfile(userId: string) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      setProfileError(`No se pudo cargar el perfil: ${error.message}`);
      return;
    }

    if (data) {
      setProfile(data as Profile);
      setProfileError(null);
      if (data.sede_id) {
        const { data: sedeData } = await supabase
          .from('sedes')
          .select('*')
          .eq('id', data.sede_id)
          .single();
        if (sedeData) setSede(sedeData as Sede);
      }
    } else {
      setProfileError('No se encontro un perfil para este usuario.');
    }
  }

  useEffect(() => {
    let settled = false;

    // Si getSession() se queda colgada (ej. un token guardado en el navegador
    // quedo dañado, o hay un corte de red), no dejamos la app cargando para
    // siempre: a los 8s mostramos una salida en vez de un spinner infinito.
    const timeoutId = setTimeout(() => {
      if (!settled) {
        setAuthError('La verificación de tu sesión está tardando demasiado. Puede ser un problema de conexión o una sesión guardada dañada en este navegador.');
        setLoading(false);
      }
    }, 8000);

    supabase.auth.getSession()
      .then(({ data: { session: s } }) => {
        settled = true;
        clearTimeout(timeoutId);
        setAuthError(null);
        setSession(s);
        setUser(s?.user ?? null);
        if (s?.user) {
          fetchProfile(s.user.id).finally(() => setLoading(false));
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        settled = true;
        clearTimeout(timeoutId);
        console.error('Error al verificar sesion:', err);
        setAuthError('No se pudo verificar tu sesión. Intenta recargar la página.');
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        setProfile(null);
        setSede(null);
      }
    });

    return () => {
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setSede(null);
  }

  return (
    <AuthContext.Provider value={{ user, session, profile, sede, loading, profileError, authError, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
