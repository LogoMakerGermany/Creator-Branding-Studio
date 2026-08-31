import type { LucideIcon } from 'lucide-react';
import {
  Home,
  Bot,
  Dna,
  PenTool,
  Layers,
  Sparkles,
  Film,
  Smartphone,
  Share2,
  Type,
  Shirt,
  FolderKanban,
  Cloud,
  LayoutTemplate,
  Settings,
  Coins,
  Shield,
} from 'lucide-react';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
  description?: string;
  badge?: string;
  group?: 'core' | 'studios' | 'library';
}

export const PRIMARY_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: Home, group: 'core' },
  { id: 'nexter', label: 'Nexter Assistent', path: '/nexter', icon: Bot, group: 'core' },
  { id: 'dna', label: 'Creator DNA', path: '/creator-dna', icon: Dna, group: 'core' },
  { id: 'logo', label: 'Logo Studio', path: '/logo-studio', icon: PenTool, group: 'studios' },
  { id: 'streamset', label: 'Streamset Studio', path: '/streamset-studio', icon: Layers, group: 'studios' },
  { id: 'animation', label: 'Animation Studio', path: '/animation-studio', icon: Sparkles, group: 'studios' },
  { id: 'video', label: 'Video Studio', path: '/video-studio', icon: Film, group: 'studios' },
  { id: 'shorts', label: 'Shorts Studio', path: '/shorts-studio', icon: Smartphone, group: 'studios' },
  { id: 'social', label: 'Social Studio', path: '/social-studio', icon: Share2, group: 'studios' },
  { id: 'text', label: 'Text Studio', path: '/text-studio', icon: Type, group: 'studios' },
  { id: 'mockup', label: 'Mockup Studio', path: '/mockup-studio', icon: Shirt, group: 'studios', badge: 'NEU' },
  { id: 'projects', label: 'Projekte', path: '/projects', icon: FolderKanban, group: 'library' },
  { id: 'files', label: 'Dateien', path: '/file-cloud', icon: Cloud, group: 'library' },
  { id: 'templates', label: 'Vorlagen', path: '/templates', icon: LayoutTemplate, group: 'library' },
  { id: 'settings', label: 'Einstellungen', path: '/settings', icon: Settings, group: 'library' },
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
  { id: 'streamset', title: 'Streamset', description: 'Komplettes Stream-Paket', path: '/streamset-studio', accent: 'purple' },
  { id: 'banner', title: 'Banner', description: 'Twitch, YouTube, TikTok, Kick', path: '/banner-studio', accent: 'purple' },
  { id: 'facecam', title: 'Facecam', description: 'Webcam-Rahmen & Overlays', path: '/facecam-studio', accent: 'green' },
  { id: 'overlay', title: 'Overlay & Panels', description: 'HUD, Alerts, Szenen', path: '/overlay-studio', accent: 'cyan' },
  { id: 'intro', title: 'Intro & Outro', description: 'Starting Soon, Ending Screen', path: '/intro-outro', accent: 'green' },
  { id: 'sticker', title: 'Sticker & Emotes', description: 'Emotes, Badges, Sticker', path: '/sticker-studio', accent: 'cyan' },
  { id: 'mockup', title: 'Mockup', description: 'Design auf realen Produkten', path: '/mockup-studio', accent: 'purple' },
];

export const AI_CREATOR_MODULES: HubModule[] = [
  { id: 'assistant', title: 'Nexter', description: 'Steuerung, Beratung, Aktionen', path: '/nexter', accent: 'cyan' },
  { id: 'text', title: 'Text Studio', description: 'Titel, Captions, Bios', path: '/text-studio', accent: 'purple' },
  { id: 'animation', title: 'Animation', description: 'Intro, Outro, Stinger', path: '/animation-studio', accent: 'green' },
  { id: 'changes', title: 'Änderungswünsche', description: 'Versionen & Anpassungen', path: '/change-request', accent: 'purple' },
];

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
  { id: 'coins', title: 'Guthaben & Zahlung', description: 'Coins, Quotes & Stripe', path: '/coins', accent: 'purple' },
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

export { Coins, Shield };
