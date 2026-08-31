import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface BrandProjectState {
  activeProjectId: string | null;
  setActiveProjectId: (id: string | null) => void;
}

/** Studio/Nexter active Project (API `projects`), not Ultimate-Creator drafts. */
export const useBrandProjectStore = create<BrandProjectState>()(
  persist(
    (set) => ({
      activeProjectId: null,
      setActiveProjectId: (activeProjectId) => set({ activeProjectId }),
    }),
    { name: 'ucbs-active-brand-project' }
  )
);
