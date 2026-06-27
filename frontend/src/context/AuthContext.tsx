import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { User } from 'firebase/auth';
import {
  isFirebaseConfigured,
  loginWithGoogle,
  loginWithOAuth,
  loginWithEmail,
  registerWithEmail,
  logoutFirebase,
  subscribeToAuth,
  OAUTH_PROVIDERS,
} from '@/lib/firebase';
import { api, setAuthToken, type UserProfile, type CreatorDNA } from '@/services/api';

interface AuthContextValue {
  user: UserProfile | null;
  activeDna: CreatorDNA | null;
  loading: boolean;
  isDevMode: boolean;
  loginGoogle: () => Promise<void>;
  loginOAuth: (provider: keyof typeof OAUTH_PROVIDERS) => Promise<void>;
  loginEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (email: string, password: string) => Promise<void>;
  loginDev: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeDna, setActiveDna] = useState<CreatorDNA | null>(null);
  const [loading, setLoading] = useState(true);
  const isDevMode = !isFirebaseConfigured();

  const refreshUser = useCallback(async () => {
    try {
      const { user: profile, activeDna: dna } = await api.auth.me();
      setUser(profile);
      setActiveDna(dna);
    } catch {
      setUser(null);
      setActiveDna(null);
      setAuthToken(null);
    }
  }, []);

  useEffect(() => {
    async function init() {
      const storedToken = localStorage.getItem('auth_token');
      if (storedToken) {
        await refreshUser();
        setLoading(false);
        return;
      }

      if (isFirebaseConfigured()) {
        const unsub = subscribeToAuth(async (firebaseUser) => {
          if (firebaseUser) {
            const token = await firebaseUser.getIdToken();
            setAuthToken(token);
            await api.auth.sync(firebaseUser.displayName || undefined, 'firebase');
            await refreshUser();
          } else {
            setUser(null);
            setActiveDna(null);
          }
          setLoading(false);
        });

        const refreshInterval = setInterval(async () => {
          const a = (await import('@/lib/firebase')).getFirebaseAuth();
          if (a?.currentUser) {
            const token = await a.currentUser.getIdToken(true);
            setAuthToken(token);
          }
        }, 55 * 60 * 1000);

        return () => {
          unsub();
          clearInterval(refreshInterval);
        };
      }

      setLoading(false);
    }

    const cleanup = init();
    return () => {
      cleanup?.then?.((unsub) => unsub?.());
    };
  }, [refreshUser]);

  async function handleFirebaseLogin(loginFn: () => Promise<User>) {
    const firebaseUser = await loginFn();
    const token = await firebaseUser.getIdToken();
    setAuthToken(token);
    await api.auth.sync(firebaseUser.displayName || undefined, 'firebase');
    await refreshUser();
  }

  const loginGoogle = async () => {
    await handleFirebaseLogin(loginWithGoogle);
  };

  const loginOAuth = async (provider: keyof typeof OAUTH_PROVIDERS) => {
    await handleFirebaseLogin(() => loginWithOAuth(OAUTH_PROVIDERS[provider]));
  };

  const loginEmail = async (email: string, password: string) => {
    await handleFirebaseLogin(() => loginWithEmail(email, password));
  };

  const registerEmail = async (email: string, password: string) => {
    await handleFirebaseLogin(() => registerWithEmail(email, password));
  };

  const loginDev = async () => {
    const { token, user: profile } = await api.auth.devLogin(undefined, 'Dev Creator');
    setAuthToken(token);
    setUser(profile);
    const { activeDna: dna } = await api.auth.me();
    setActiveDna(dna);
  };

  const logout = async () => {
    await logoutFirebase();
    setAuthToken(null);
    setUser(null);
    setActiveDna(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeDna,
        loading,
        isDevMode,
        loginGoogle,
        loginOAuth,
        loginEmail,
        registerEmail,
        loginDev,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
