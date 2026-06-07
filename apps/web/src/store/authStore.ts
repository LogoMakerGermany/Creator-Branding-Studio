import { create } from 'zustand';
import api from '../lib/api';
import {
  firebaseLogin,
  firebaseRegister,
  firebaseResetPassword,
  getFirebaseConfigError,
  isFirebaseClientConfigured,
} from '../lib/firebase';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'moderator' | 'user' | 'tester';
  coins?: number;
  isTester?: boolean;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  authReady: boolean;
  authError: string | null;
  fetchUser: () => Promise<void>;
  checkAuthConfig: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
}

async function exchangeFirebaseToken(idToken: string): Promise<User> {
  const { data } = await api.post('/auth/firebase', { idToken });
  return data.user;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  authReady: false,
  authError: null,

  checkAuthConfig: async () => {
    const clientError = getFirebaseConfigError();
    if (clientError) {
      set({ authReady: false, authError: clientError, loading: false });
      return;
    }
    try {
      const { data } = await api.get('/auth/status');
      if (!data.ready) {
        set({
          authReady: false,
          authError: data.message || 'Firebase Auth ist auf dem Server nicht konfiguriert.',
          loading: false,
        });
        return;
      }
      set({ authReady: true, authError: null });
    } catch {
      set({
        authReady: false,
        authError: 'Auth-Server nicht erreichbar. Bitte später erneut versuchen.',
        loading: false,
      });
    }
  },

  fetchUser: async () => {
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data.user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },

  login: async (email, password) => {
    if (!isFirebaseClientConfigured()) {
      throw new Error(getFirebaseConfigError() || 'Firebase nicht konfiguriert');
    }
    const idToken = await firebaseLogin(email, password);
    const user = await exchangeFirebaseToken(idToken);
    set({ user });
  },

  register: async (email, name, password) => {
    if (!isFirebaseClientConfigured()) {
      throw new Error(getFirebaseConfigError() || 'Firebase nicht konfiguriert');
    }
    const idToken = await firebaseRegister(email, password, name);
    const user = await exchangeFirebaseToken(idToken);
    set({ user });
  },

  resetPassword: async (email) => {
    if (!isFirebaseClientConfigured()) {
      throw new Error(getFirebaseConfigError() || 'Firebase nicht konfiguriert');
    }
    await firebaseResetPassword(email);
  },

  logout: async () => {
    await api.post('/auth/logout');
    set({ user: null });
  },
}));
