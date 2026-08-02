import type { LucideIcon } from 'lucide-react';
import {
  Home,
  Palette,
  Film,
  Bot,
  FolderKanban,
  Settings,
  Coins,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  description?: string;
}

/** Primary sidebar — core creator product only (marketplace/agency/social deferred). */
export const PRIMARY_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: Home },
  { id: 'branding', label: 'Branding Studio', path: '/branding-studio', icon: Palette },
  { id: 'video', label: 'Video Studio', path: '/video-studio', icon: Film },
  { id: 'ai-creator', label: 'AI Creator', path: '/ai-creator', icon: Bot },
  { id: 'projects', label: 'Meine Projekte', path: '/projects', icon: FolderKanban },
  { id: 'coins', label: 'Guthaben', path: '/coins', icon: Coins },
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
];

export const AI_CREATOR_MODULES: HubModule[] = [
  { id: 'assistant', title: 'KI Assistent', description: 'Strategie & Branding-Beratung', path: '/ai-assistant', accent: 'cyan' },
  { id: 'prompts', title: 'Prompt Studio', description: 'Strukturierte Generierungs-Prompts', path: '/prompt-studio', accent: 'purple' },
  { id: 'image', title: 'KI Bild', description: 'Logos, Banner, Assets', path: '/ai-image', accent: 'purple' },
  { id: 'video', title: 'Animation / KI Video', description: 'Bild-zu-Video Animationen', path: '/ai-video', accent: 'green' },
  { id: 'changes', title: 'Änderungswünsche', description: 'Versionen & Anpassungen', path: '/change-request', accent: 'purple' },
];

/** Deferred from core nav — keep exports for orphan pages / future phases. */
export const TEAMS_MODULES: HubModule[] = [
  { id: 'team-dna', title: 'Team DNA', description: 'Gemeinsame Markenidentität', path: '/team-dna', accent: 'cyan', tags: ['Später'] },
  { id: 'team-chat', title: 'Team Chat', description: 'Interne Kommunikation', path: '/team-chat', accent: 'purple', tags: ['Später'] },
];

export const PROJECTS_MODULES: HubModule[] = [
  { id: 'manage', title: 'Projektverwaltung', description: 'Projekte, Papierkorb & Export', path: '/projects', accent: 'cyan' },
  { id: 'files', title: 'Datei Cloud', description: 'Alle Assets & Exporte', path: '/file-cloud', accent: 'cyan' },
  { id: 'dna', title: 'Creator DNA', description: 'Markenidentität verwalten', path: '/creator-dna', accent: 'green' },
];

export const SETTINGS_LINKS: HubModule[] = [
  { id: 'dna', title: 'Creator DNA', description: 'Farben, Stil, Plattformen', path: '/creator-dna', accent: 'cyan' },
  { id: 'coins', title: 'Guthaben & Zahlung', description: 'Euro-Guthaben, Quotes & Stripe', path: '/coins', accent: 'purple' },
];

export const AI_PROMPT_SUGGESTIONS = [
  'Cyberpunk Neon Logo für Twitch',
  'Anime Stream Overlay',
  'Call of Duty Clan Banner',
  'Fantasy Wolf Mascot',
  'Esports Team Identity',
  'Minimal Kick Banner',
  'Dragon Viking Logo',
];
