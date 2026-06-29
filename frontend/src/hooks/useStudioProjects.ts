import { useEffect, useState } from 'react';
import { api, type StudioProjectSummary } from '@/services/api';
import type { StudioModuleKey } from '@ucbs/shared';

export function useStudioProjects(module: StudioModuleKey) {
  const [projects, setProjects] = useState<StudioProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.studio
      .list(module)
      .then((res) => setProjects(res.projects))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [module]);

  function refresh() {
    return api.studio.list(module).then((res) => setProjects(res.projects));
  }

  return { projects, loading, refresh };
}
