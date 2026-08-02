import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  isFirebaseConfigured,
  loginWithProvider,
  loginWithEmail,
  registerWithEmail,
  logoutFirebase,
  subscribeToAuth,
  completeRedirectLogin,
  resetPassword,
  type AuthProviderId,
} from '@/lib/firebase';
import { resolveAuthProvider } from '@/lib/auth-providers';
import { formatAuthError } from '@/lib/auth-errors';
import { api, setAuthToken, type UserProfile, type CreatorDNA } from '@/services/api';

const PENDING_INVITE_KEY = 'pending_invite_code';

interface AuthContextValue {
  user: UserProfile | null;
  activeDna: CreatorDNA | null;
  loading: boolean;
  isDevMode: boolean;
  loginProvider: (provider: AuthProviderId) => Promise<void>;
  loginEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (email: string, password: string, inviteCode?: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  loginDev: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function syncProfile(displayName?: string, authProvider?: string) {
  const inviteCode = sessionStorage.getItem(PENDING_INVITE_KEY) || undefined;
  try {
    await api.auth.sync(displayName, authProvider, inviteCode);
    sessionStorage.removeItem(PENDING_INVITE_KEY);
  } catch (err) {
    const msg = formatAuthError(err);
    if (msg.toLowerCase().includes('einladung') || msg.toLowerCase().includes('registrierung')) {
      sessionStorage.setItem('auth_error', msg);
      await logoutFirebase();
      setAuthToken(null);
    }
    throw err;
  }
}

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
            try {
              await syncProfile(
                firebaseUser.displayName || undefined,
                resolveAuthProvider(firebaseUser)
              );
              await refreshUser();
            } catch {
              setUser(null);
              setActiveDna(null);
            }
          } else {
            setUser(null);
            setActiveDna(null);
          }
          setLoading(false);
        });

        try {
          const redirectUser = await completeRedirectLogin();
          if (redirectUser) {
            const token = await redirectUser.getIdToken();
            setAuthToken(token);
            await syncProfile(
              redirectUser.displayName || undefined,
              resolveAuthProvider(redirectUser)
            );
            await refreshUser();
          }
        } catch (err) {
          sessionStorage.setItem('auth_error', formatAuthError(err));
          setLoading(false);
        }

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

  async function handleFirebaseLogin(loginFn: () => Promise<import('firebase/auth').User>) {
    const firebaseUser = await loginFn();
    const token = await firebaseUser.getIdToken();
    setAuthToken(token);
    await syncProfile(firebaseUser.displayName || undefined, resolveAuthProvider(firebaseUser));
    await refreshUser();
  }

  const loginProvider = async (provider: AuthProviderId) => {
    await handleFirebaseLogin(() => loginWithProvider(provider));
  };

  const loginEmail = async (email: string, password: string) => {
    await handleFirebaseLogin(() => loginWithEmail(email, password));
  };

  const registerEmail = async (email: string, password: string, inviteCode?: string) => {
    if (inviteCode) {
      sessionStorage.setItem(PENDING_INVITE_KEY, inviteCode.trim());
    }
    await handleFirebaseLogin(() => registerWithEmail(email, password));
  };

  const requestPasswordReset = async (email: string) => {
    await resetPassword(email);
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
    sessionStorage.removeItem(PENDING_INVITE_KEY);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeDna,
        loading,
        isDevMode,
        loginProvider,
        loginEmail,
        registerEmail,
        requestPasswordReset,
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
