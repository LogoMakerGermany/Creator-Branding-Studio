import { HubPageLayout } from '@/v2/components/HubPageLayout';
import { BRANDING_MODULES } from '@/v2/config/navigation';

export function BrandingStudioHubPage() {
  return (
    <HubPageLayout
      title="Branding Studio"
      description="Alle Branding-Generatoren an einem Ort. Einheitliche Markenidentität durch Creator DNA — Live-Vorschau in jedem Modul."
      modules={BRANDING_MODULES}
    />
  );
}
