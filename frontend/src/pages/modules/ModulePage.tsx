import { useLocation } from 'react-router-dom';
import { CREATOR_MODULES } from '@ucbs/shared';
import { PageHeader, Badge, ModulePlaceholder } from '@/components/ui';
import { getModuleIcon } from '@/config/navigation';

interface ModulePageConfig {
  features?: string[];
}

const moduleExtras: Record<string, ModulePageConfig> = {
  'creator-dna': {
    features: [
      'Logo & Profilbild Analyse',
      'Farbpalette extrahieren',
      'Schriftarten erkennen',
      'Stilrichtung bestimmen',
      'Zielgruppenprofil',
      'Plattform-Optimierung',
    ],
  },
  'logo-studio': {
    features: ['Gaming & Esports', '2D / 3D / Anime', 'PNG / SVG / PDF Export', 'Stil: Neon, Horror, Fantasy'],
  },
  'banner-studio': {
    features: ['Twitch Banner', 'YouTube Header', 'Discord Banner', 'Social Media Covers'],
  },
  'facecam-studio': {
    features: ['Facecam-Rahmen', 'Overlay-Designs', 'Stream-Panels', 'Alert-Styling'],
  },
  'branding-generator': {
    features: ['Profilbilder', 'Banner & Overlays', 'Stream Start/Ende', 'Intro & Outro', 'Panels'],
  },
  'change-request': {
    features: ['Natürliche Sprache', 'Versionsverwaltung', 'Vorher/Nachher', 'Wiederherstellung'],
  },
  'layout-studio': {
    features: ['Drag & Drop Editor', 'OBS Export', 'Streamlabs Export', 'TikTok Live Studio'],
  },
  'ai-assistant': {
    features: ['Branding-Analyse', 'Kanal-Analyse', 'Content-Strategie', 'Verbesserungsvorschläge'],
  },
  'team-dna': {
    features: ['Teamfarben', 'Teambanner', 'Teamlogos', 'Rollenverwaltung'],
  },
  'agency-dna': {
    features: ['Agenturprofil', 'Agenturbanner', 'Vorlagen', 'Team-Branding'],
  },
  'agency-management': {
    features: ['Mitarbeiter', 'Kunden', 'Projekte', 'Rollen & Rechte', 'Statistiken'],
  },
  'video-studio': {
    features: ['Videos schneiden', 'Shorts erstellen', 'Highlight-Erkennung', 'Untertitel', 'Effekte'],
  },
  'intro-outro': {
    features: ['Intros', 'Outros', 'Stream Starts', 'Übergänge', 'DNA-basiert'],
  },
  'vtuber-studio': {
    features: ['Charaktere', 'Avatare', 'Emotes', 'Live2D Export', 'Maskottchen'],
  },
  'ai-image': {
    features: ['Logos', 'Banner', 'Overlays', 'Charaktere', 'Hintergründe'],
  },
  'ai-video': {
    features: ['Werbevideos', 'Social Media', 'Shorts', 'Intros'],
  },
  'ai-music': {
    features: ['Intromusik', 'Hintergrundmusik', 'Jingles', 'Outromusik'],
  },
  'ai-voice': {
    features: ['Voiceovers', 'Ansagen', 'Stream Intros', 'Werbetexte'],
  },
  'social-media': {
    features: ['TikTok', 'Twitch', 'YouTube', 'Instagram', 'Planung & Analyse'],
  },
  'content-calendar': {
    features: ['Posts', 'Videos', 'Livestreams', 'Kampagnen'],
  },
  'team-chat': {
    features: ['Chats', 'Dateien', 'Aufgaben', 'Kommentare'],
  },
  'client-portal': {
    features: ['Projekte einsehen', 'Downloads', 'Feedback', 'Auftragsverfolgung'],
  },
  'file-cloud': {
    features: ['Logos', 'Videos', 'Banner', 'Projekte', 'Cloud-Speicher'],
  },
  marketplace: {
    features: ['Templates', 'Logos', 'Overlays', 'Emotes', 'Sounds'],
  },
  coins: {
    features: ['Coins kaufen', 'Stripe & PayPal', 'Transaktionshistorie', 'Pakete'],
  },
  'white-label': {
    features: ['Eigene Domain', 'Eigene Farben', 'Eigenes Logo', 'Eigene Plattform'],
  },
  'mobile-app': {
    features: ['Im Browser nutzen', 'PWA installieren', 'Desktop & Mobil', 'Kein App Store nötig'],
  },
  'live-streaming': {
    features: ['RTMP Setup', 'Stream Key', 'Overlays & Alerts', 'Multistream', 'Go-Live Checkliste'],
  },
};

export function ModulePage() {
  const { pathname } = useLocation();
  const module = CREATOR_MODULES.find((m) => m.path === pathname);

  if (!module) {
    return (
      <div className="text-center text-zinc-400">
        Modul nicht gefunden
      </div>
    );
  }

  const Icon = getModuleIcon(module.icon);
  const extras = moduleExtras[module.id] ?? {};

  return (
    <div>
      <PageHeader
        title={module.name}
        description={module.description}
        badge={
          <Badge variant={module.phase === 1 ? 'brand' : 'phase'}>
            Phase {module.phase}
          </Badge>
        }
      />
      <ModulePlaceholder
        title={module.name}
        description={module.description}
        phase={module.phase}
        features={extras.features}
        icon={<Icon className="h-8 w-8" />}
      />
    </div>
  );
}
