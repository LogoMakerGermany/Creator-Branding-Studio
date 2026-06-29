import { create } from 'zustand';

interface UiState {
  sidebarCollapsed: boolean;
  mobileNavOpen: boolean;
  searchOpen: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  setMobileNavOpen: (v: boolean) => void;
  setSearchOpen: (v: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  mobileNavOpen: false,
  searchOpen: false,
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setMobileNavOpen: (mobileNavOpen) => set({ mobileNavOpen }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
}));
