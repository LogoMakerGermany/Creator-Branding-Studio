import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UltimateCreatorProject } from '@ucbs/shared';

interface ProjectState {
  projects: UltimateCreatorProject[];
  activeProjectId: string | null;
  setProjects: (projects: UltimateCreatorProject[]) => void;
  setActiveProjectId: (id: string | null) => void;
  upsertProject: (project: UltimateCreatorProject) => void;
  activeProject: () => UltimateCreatorProject | null;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projects: [],
      activeProjectId: null,
      setProjects: (projects) => set({ projects }),
      setActiveProjectId: (activeProjectId) => set({ activeProjectId }),
      upsertProject: (project) =>
        set((s) => {
          const idx = s.projects.findIndex((p) => p.id === project.id);
          const projects =
            idx >= 0 ? s.projects.map((p, i) => (i === idx ? project : p)) : [project, ...s.projects];
          return { projects, activeProjectId: project.id };
        }),
      activeProject: () => {
        const { projects, activeProjectId } = get();
        return projects.find((p) => p.id === activeProjectId) ?? null;
      },
    }),
    { name: 'ucbs-active-project' }
  )
);
