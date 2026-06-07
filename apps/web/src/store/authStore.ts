import { create } from 'zustand';
import api from '../lib/api';

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
  fetchUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  fetchUser: async () => {
    try {
      const { data } = await api.get('/auth/me');
      set({ user: data.user, loading: false });
    } catch {
      set({ user: null, loading: false });
    }
  },
  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    set({ user: data.user });
  },
  register: async (email, name, password) => {
    const { data } = await api.post('/auth/register', { email, name, password });
    set({ user: data.user });
  },
  logout: async () => {
    await api.post('/auth/logout');
    set({ user: null });
  },
}));
