import { HubPageLayout } from '@/v2/components/HubPageLayout';
import { SETTINGS_LINKS } from '@/v2/config/navigation';

export function SettingsHubPage() {
  return (
    <HubPageLayout
      title="Einstellungen"
      description="Creator DNA, Coins, Premium und App-Einstellungen."
      modules={SETTINGS_LINKS}
    />
  );
}
