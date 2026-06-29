import { HubPageLayout } from '@/v2/components/HubPageLayout';
import { PROJECTS_MODULES } from '@/v2/config/navigation';

export function ProjectsHubPage() {
  return (
    <HubPageLayout
      title="Projekte"
      description="Alle Assets, Versionen und Dateien projektorientiert — Logo, Banner, Videos, Cloud und Kalender."
      modules={PROJECTS_MODULES}
    />
  );
}
