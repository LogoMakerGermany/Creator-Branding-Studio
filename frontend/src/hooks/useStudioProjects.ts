import { useEffect, useState } from 'react';
import { api, type StudioProjectSummary } from '@/services/api';
import type { StudioModuleKey } from '@ucbs/shared';
import { useNexterStore } from '@/v2/store/nexter-store';

export function useStudioProjects(module: StudioModuleKey) {
  const [projects, setProjects] = useState<StudioProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const lastCompletedQuote = useNexterStore((s) => s.lastCompletedQuote);

  useEffect(() => {
    setLoading(true);
    api.studio
      .list(module)
      .then((res) => setProjects(res.projects))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [module]);

  useEffect(() => {
    if (!lastCompletedQuote || lastCompletedQuote.kind !== module) return;
    setLoading(true);
    api.studio
      .list(module)
      .then((res) => setProjects(res.projects))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [lastCompletedQuote, module]);

  function refresh() {
    return api.studio.list(module).then((res) => {
      setProjects(res.projects);
      return res.projects;
    });
  }

  return { projects, loading, refresh };
}
