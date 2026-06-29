import { HubPageLayout } from '@/v2/components/HubPageLayout';
import { TEAMS_MODULES } from '@/v2/config/navigation';

export function TeamsHubPage() {
  return (
    <HubPageLayout
      title="Teams"
      description="Clans, eSport-Teams und Creator-Gruppen — gemeinsame DNA, Chat und Zusammenarbeit."
      modules={TEAMS_MODULES}
    />
  );
}
