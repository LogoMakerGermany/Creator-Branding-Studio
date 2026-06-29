import type { LucideIcon } from 'lucide-react';
import {
  Home,
  Palette,
  Film,
  Bot,
  Users,
  Share2,
  FolderKanban,
  Store,
  Settings,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  description?: string;
}

/** Primary sidebar navigation — V2.0 */
export const PRIMARY_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: Home },
  { id: 'branding', label: 'Branding Studio', path: '/branding-studio', icon: Palette },
  { id: 'video', label: 'Video Studio', path: '/video-studio', icon: Film },
  { id: 'ai-creator', label: 'AI Creator', path: '/ai-creator', icon: Bot },
  { id: 'teams', label: 'Teams', path: '/teams', icon: Users },
  { id: 'social', label: 'Social Media', path: '/social-media', icon: Share2 },
  { id: 'projects', label: 'Projekte', path: '/projects', icon: FolderKanban },
  { id: 'marketplace', label: 'Marketplace', path: '/marketplace', icon: Store },
  { id: 'settings', label: 'Einstellungen', path: '/settings', icon: Settings },
];

export interface HubModule {
  id: string;
  title: string;
  description: string;
  path: string;
  accent: 'cyan' | 'purple' | 'green';
  tags?: string[];
}

export const BRANDING_MODULES: HubModule[] = [
  { id: 'logo', title: 'Logo', description: 'Gaming- & Stream-Logos', path: '/logo-studio', accent: 'cyan' },
  { id: 'banner', title: 'Banner', description: 'Twitch, YouTube, TikTok, Kick', path: '/banner-studio', accent: 'purple' },
  { id: 'facecam', title: 'Facecam', description: 'Webcam-Rahmen & Overlays', path: '/facecam-studio', accent: 'green' },
  { id: 'overlay', title: 'Overlay & Panels', description: 'HUD, Alerts, Szenen', path: '/overlay-studio', accent: 'cyan' },
  { id: 'panels', title: 'Layout Studio', description: 'Stream-Panels & Layouts', path: '/layout-studio', accent: 'purple' },
  { id: 'intro', title: 'Intro & Outro', description: 'Starting Soon, Ending Screen', path: '/intro-outro', accent: 'green' },
  { id: 'sticker', title: 'Sticker & Emotes', description: 'Emotes, Badges, Sticker', path: '/sticker-studio', accent: 'cyan' },
  { id: 'pack', title: 'Branding Pack', description: 'Komplettes Markenpaket', path: '/branding-generator', accent: 'purple' },
  { id: 'vtuber', title: 'Avatar & Mascot', description: 'VTuber & Maskottchen', path: '/vtuber-studio', accent: 'green' },
];

export const AI_CREATOR_MODULES: HubModule[] = [
  { id: 'assistant', title: 'KI Assistent', description: 'Strategie & Branding-Beratung', path: '/ai-assistant', accent: 'cyan' },
  { id: 'image', title: 'KI Bild', description: 'Logos, Banner, Assets', path: '/ai-image', accent: 'purple' },
  { id: 'video', title: 'KI Video', description: 'Clips & Animationen', path: '/ai-video', accent: 'green' },
  { id: 'voice', title: 'KI Stimme', description: 'Voice-Overs & Skripte', path: '/ai-voice', accent: 'cyan' },
  { id: 'changes', title: 'Änderungswünsche', description: 'Versionen & Anpassungen', path: '/change-request', accent: 'purple' },
];

export const TEAMS_MODULES: HubModule[] = [
  { id: 'team-dna', title: 'Team DNA', description: 'Gemeinsame Markenidentität', path: '/team-dna', accent: 'cyan' },
  { id: 'team-chat', title: 'Team Chat', description: 'Interne Kommunikation', path: '/team-chat', accent: 'purple' },
];

export const PROJECTS_MODULES: HubModule[] = [
  { id: 'files', title: 'Datei Cloud', description: 'Alle Assets & Exporte', path: '/file-cloud', accent: 'cyan' },
  { id: 'calendar', title: 'Content Kalender', description: 'Posts & Streams planen', path: '/content-calendar', accent: 'purple' },
  { id: 'dna', title: 'Creator DNA', description: 'Markenidentität verwalten', path: '/creator-dna', accent: 'green' },
];

export const SETTINGS_LINKS: HubModule[] = [
  { id: 'dna', title: 'Creator DNA', description: 'Farben, Stil, Plattformen', path: '/creator-dna', accent: 'cyan' },
  { id: 'coins', title: 'Coins & Premium', description: 'Guthaben & Zahlungen', path: '/coins', accent: 'purple' },
  { id: 'mobile', title: 'Mobile App', description: 'PWA & Installation', path: '/mobile-app', accent: 'green' },
];

export const AI_PROMPT_SUGGESTIONS = [
  'Cyberpunk Neon Logo für Twitch',
  'Anime Stream Overlay',
  'Call of Duty Clan Banner',
  'Fortnite Emote Pack',
  'Fantasy Wolf Mascot',
  'Esports Team Identity',
  'Minimal Kick Banner',
  'Dragon Viking Logo',
];
