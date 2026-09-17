import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
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
import { resolveAuthProvider, isBridgeOAuthProvider, isFirebaseHostedOAuth } from '@/lib/auth-providers';
import { formatAuthError } from '@/lib/auth-errors';
import { api, ApiError, setAuthToken, type UserProfile, type CreatorDNA } from '@/services/api';
import { applyNexterAppearance, resetNexterAppearance } from '@/lib/nexter-appearance';
import { AUTH_TOKEN_STORAGE_KEY } from '@/lib/auth-session';

const PENDING_INVITE_KEY = 'pending_invite_code';
const PENDING_LEGAL_KEY = 'pending_legal_acceptance';
const PENDING_OAUTH_PROVIDER_KEY = 'pending_oauth_provider';

interface AuthContextValue {
  user: UserProfile | null;
  activeDna: CreatorDNA | null;
  loading: boolean;
  isDevMode: boolean;
  hasFirebaseSession: boolean;
  profileLoadError: string | null;
  loginProvider: (provider: AuthProviderId) => Promise<void>;
  loginEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (email: string, password: string, inviteCode?: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  loginDev: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

function applyMeProfile(
  profile: UserProfile,
  me: {
    needsEmailVerification?: boolean;
    emailVerified?: boolean;
    signInProvider?: string | null;
  }
): UserProfile {
  return {
    ...profile,
    needsEmailVerification: me.needsEmailVerification === true,
    emailVerified: me.emailVerified === true,
    signInProvider: me.signInProvider ?? undefined,
  };
}

function isFatalAuthError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  return (
    err.status === 401 ||
    err.code === 'AUTH_REQUIRED' ||
    err.code === 'INVALID_TOKEN' ||
    err.code === 'ACCESS_DENIED' ||
    err.code === 'ACCOUNT_DISABLED'
  );
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function syncProfile(displayName?: string, authProvider?: string) {
  const inviteCode = sessionStorage.getItem(PENDING_INVITE_KEY) || undefined;
  const pendingOAuth = sessionStorage.getItem(PENDING_OAUTH_PROVIDER_KEY) || undefined;
  const resolvedProvider = pendingOAuth || authProvider;
  let legal: { termsVersion: string; privacyVersion: string } | undefined;
  try {
    const raw = sessionStorage.getItem(PENDING_LEGAL_KEY);
    if (raw) legal = JSON.parse(raw) as { termsVersion: string; privacyVersion: string };
  } catch {
    legal = undefined;
  }
  try {
    await api.auth.sync(displayName, resolvedProvider, inviteCode, legal);
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    sessionStorage.removeItem(PENDING_LEGAL_KEY);
    sessionStorage.removeItem(PENDING_OAUTH_PROVIDER_KEY);
  } catch (err) {
    sessionStorage.removeItem(PENDING_OAUTH_PROVIDER_KEY);
    const msg = formatAuthError(err);
    const code = err instanceof ApiError ? err.code : '';
    if (
      code === 'ACCESS_DENIED' ||
      code === 'LEGAL_ACCEPTANCE_REQUIRED' ||
      code === 'INVITE_REQUIRED' ||
      code === 'INVITE_INVALID' ||
      code === 'INVITE_EXPIRED' ||
      code === 'INVITE_EXHAUSTED' ||
      code === 'INVITE_EMAIL_REQUIRED' ||
      code === 'INVITE_EMAIL_MISMATCH' ||
      msg.toLowerCase().includes('einladung') ||
      msg.toLowerCase().includes('registrierung') ||
      msg.toLowerCase().includes('nutzungsbedingungen')
    ) {
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
  const [hasFirebaseSession, setHasFirebaseSession] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const isDevMode = !isFirebaseConfigured();

  const refreshUser = useCallback(async () => {
    try {
      const me = await api.auth.me();
      setUser(applyMeProfile(me.user, me));
      setActiveDna(me.activeDna);
      setProfileLoadError(null);
      applyNexterAppearance(me.user.nexterPreferences);
    } catch (err) {
      if (isFatalAuthError(err)) {
        setUser(null);
        setActiveDna(null);
        setAuthToken(null);
        setProfileLoadError(null);
        resetNexterAppearance();
        return;
      }
      setProfileLoadError(formatAuthError(err));
    }
  }, []);

  const lastFirebaseUid = useRef<string | null>(null);

  useEffect(() => {
    const prefs = user?.nexterPreferences;
    applyNexterAppearance(prefs);
    if (prefs?.uiTheme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyNexterAppearance(prefs);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [user?.nexterPreferences]);

  useEffect(() => {
    let cancelled = false;

    async function init(): Promise<(() => void) | void> {
      if (isFirebaseConfigured()) {
        const unsub = subscribeToAuth(async (firebaseUser) => {
          if (cancelled) return;

          if (firebaseUser) {
            setHasFirebaseSession(true);
            const uidChanged = lastFirebaseUid.current !== firebaseUser.uid;
            lastFirebaseUid.current = firebaseUser.uid;
            if (uidChanged) {
              setAuthToken(null);
              try {
                await syncProfile(
                  firebaseUser.displayName || undefined,
                  resolveAuthProvider(firebaseUser)
                );
                await refreshUser();
              } catch (err) {
                if (isFatalAuthError(err)) {
                  setUser(null);
                  setActiveDna(null);
                  setProfileLoadError(null);
                } else {
                  setProfileLoadError(formatAuthError(err));
                }
              }
            }
          } else {
            lastFirebaseUid.current = null;
            setHasFirebaseSession(false);
            setUser(null);
            setActiveDna(null);
            setAuthToken(null);
            setProfileLoadError(null);
            resetNexterAppearance();
          }
          setLoading(false);
        });

        try {
          await completeRedirectLogin();
        } catch (err) {
          sessionStorage.setItem('auth_error', formatAuthError(err));
        }

        return () => {
          unsub();
        };
      }

      const storedToken = localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
      if (storedToken) {
        await refreshUser();
      }
      if (!cancelled) setLoading(false);
    }

    const cleanupPromise = init();
    return () => {
      cancelled = true;
      void cleanupPromise.then((unsub) => unsub?.());
    };
  }, [refreshUser]);

  async function handleFirebaseLogin(loginFn: () => Promise<import('firebase/auth').User>) {
    const firebaseUser = await loginFn();
    lastFirebaseUid.current = firebaseUser.uid;
    setHasFirebaseSession(true);
    setAuthToken(null);
    await syncProfile(firebaseUser.displayName || undefined, resolveAuthProvider(firebaseUser));
    await refreshUser();
  }

  const loginProvider = async (provider: AuthProviderId) => {
    if (isBridgeOAuthProvider(provider)) {
      const params = new URLSearchParams();
      const invite = sessionStorage.getItem(PENDING_INVITE_KEY);
      if (invite) {
        params.set('inviteCode', invite);
        params.set('intent', 'register');
      } else {
        params.set('intent', 'login');
      }
      try {
        const raw = sessionStorage.getItem(PENDING_LEGAL_KEY);
        if (raw) {
          const legal = JSON.parse(raw) as { termsVersion?: string; privacyVersion?: string };
          if (legal.termsVersion) params.set('termsVersion', legal.termsVersion);
          if (legal.privacyVersion) params.set('privacyVersion', legal.privacyVersion);
        }
      } catch {
        /* ignore malformed legal payload */
      }
      window.location.assign(`/api/v1/auth/oauth/${provider}/start?${params.toString()}`);
      throw new Error('Weiterleitung zum Anbieter …');
    }
    if (!isFirebaseHostedOAuth(provider)) {
      const err = new Error('Dieser Anmeldeanbieter ist derzeit nicht verfügbar.');
      (err as { code?: string }).code = 'auth/operation-not-allowed';
      throw err;
    }
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
    const { token } = await api.auth.devLogin(undefined, 'Dev Creator');
    setAuthToken(token);
    await refreshUser();
  };

  const logout = async () => {
    lastFirebaseUid.current = null;
    setHasFirebaseSession(false);
    setProfileLoadError(null);
    await logoutFirebase();
    setAuthToken(null);
    setUser(null);
    setActiveDna(null);
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    sessionStorage.removeItem(PENDING_LEGAL_KEY);
    sessionStorage.removeItem('nexter-onboarding-draft');
    sessionStorage.removeItem('nexter-setup-draft');
    resetNexterAppearance();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeDna,
        loading,
        isDevMode,
        hasFirebaseSession,
        profileLoadError,
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
