export enum ModuleId {
  DASHBOARD = 'dashboard',
  CREATOR_DNA = 'creator-dna',
  LOGO_STUDIO = 'logo-studio',
  CHANGE_REQUEST = 'change-request',
  BRANDING_GENERATOR = 'branding-generator',
  LAYOUT_STUDIO = 'layout-studio',
  AI_ASSISTANT = 'ai-assistant',
  TEAM_DNA = 'team-dna',
  AGENCY_DNA = 'agency-dna',
  AGENCY_MANAGEMENT = 'agency-management',
  VIDEO_STUDIO = 'video-studio',
  INTRO_OUTRO = 'intro-outro',
  VTUBER_STUDIO = 'vtuber-studio',
  AI_IMAGE = 'ai-image',
  AI_VIDEO = 'ai-video',
  AI_MUSIC = 'ai-music',
  AI_VOICE = 'ai-voice',
  SOCIAL_MEDIA = 'social-media',
  CONTENT_CALENDAR = 'content-calendar',
  TEAM_CHAT = 'team-chat',
  CLIENT_PORTAL = 'client-portal',
  FILE_CLOUD = 'file-cloud',
  MARKETPLACE = 'marketplace',
  COINS = 'coins',
  WHITE_LABEL = 'white-label',
  BANNER_STUDIO = 'banner-studio',
  FACECAM_STUDIO = 'facecam-studio',
  OVERLAY_STUDIO = 'overlay-studio',
  STICKER_STUDIO = 'sticker-studio',
  MOBILE_APP = 'mobile-app',
  LIVE_STREAMING = 'live-streaming',
}

export interface ModuleDefinition {
  id: ModuleId;
  name: string;
  description: string;
  icon: string;
  path: string;
  phase: 1 | 2 | 3 | 4 | 5;
  category: ModuleCategory;
  requiredPermission?: string;
}

export type ModuleCategory =
  | 'core'
  | 'studio'
  | 'ai'
  | 'social'
  | 'team'
  | 'agency'
  | 'commerce'
  | 'mobile'
  | 'streaming';

export const MODULES: ModuleDefinition[] = [
  {
    id: ModuleId.DASHBOARD,
    name: 'Dashboard',
    description: 'Übersicht und Statistiken',
    icon: 'LayoutDashboard',
    path: '/dashboard',
    phase: 1,
    category: 'core',
  },
  {
    id: ModuleId.CREATOR_DNA,
    name: 'Creator DNA Engine',
    description: 'Analyse und Erstellung deiner einzigartigen Creator DNA',
    icon: 'Dna',
    path: '/creator-dna',
    phase: 1,
    category: 'core',
  },
  {
    id: ModuleId.LOGO_STUDIO,
    name: 'Logo Studio',
    description: 'Gaming, Streamer, Musiker und Team Logos erstellen',
    icon: 'PenTool',
    path: '/logo-studio',
    phase: 1,
    category: 'studio',
  },
  {
    id: ModuleId.BANNER_STUDIO,
    name: 'Banner Studio',
    description: 'Profilbanner und Header-Grafiken generieren',
    icon: 'Image',
    path: '/banner-studio',
    phase: 1,
    category: 'studio',
  },
  {
    id: ModuleId.FACECAM_STUDIO,
    name: 'Facecam Studio',
    description: 'Facecam-Rahmen und Overlays erstellen',
    icon: 'Camera',
    path: '/facecam-studio',
    phase: 1,
    category: 'studio',
  },
  {
    id: ModuleId.OVERLAY_STUDIO,
    name: 'Overlay Studio',
    description: 'Stream-Overlays, HUDs und Alerts',
    icon: 'Layers',
    path: '/overlay-studio',
    phase: 1,
    category: 'studio',
  },
  {
    id: ModuleId.STICKER_STUDIO,
    name: 'Sticker Studio',
    description: 'Emotes, Sticker und Badges — PNG & SVG',
    icon: 'Sticker',
    path: '/sticker-studio',
    phase: 1,
    category: 'studio',
  },
  {
    id: ModuleId.BRANDING_GENERATOR,
    name: 'Branding Generator',
    description: 'Automatische Generierung aller Branding-Assets',
    icon: 'Sparkles',
    path: '/branding-generator',
    phase: 1,
    category: 'studio',
  },
  {
    id: ModuleId.CHANGE_REQUEST,
    name: 'Änderungswunsch-System',
    description: 'KI-gestützte Design-Anpassungen mit Versionsverwaltung',
    icon: 'RefreshCw',
    path: '/change-request',
    phase: 2,
    category: 'studio',
  },
  {
    id: ModuleId.LAYOUT_STUDIO,
    name: 'Layout Studio',
    description: 'Drag-and-Drop Editor für Stream-Layouts',
    icon: 'Layout',
    path: '/layout-studio',
    phase: 2,
    category: 'studio',
  },
  {
    id: ModuleId.AI_ASSISTANT,
    name: 'KI Creator Assistent',
    description: 'Persönlicher Assistent für Branding und Strategie',
    icon: 'Bot',
    path: '/ai-assistant',
    phase: 2,
    category: 'ai',
  },
  {
    id: ModuleId.TEAM_DNA,
    name: 'Team & Clan DNA',
    description: 'Gemeinsame Markenidentität für Teams',
    icon: 'Users',
    path: '/team-dna',
    phase: 2,
    category: 'team',
  },
  {
    id: ModuleId.AGENCY_DNA,
    name: 'Agentur DNA',
    description: 'Agentur-spezifische Markenidentität',
    icon: 'Building2',
    path: '/agency-dna',
    phase: 2,
    category: 'agency',
  },
  {
    id: ModuleId.VIDEO_STUDIO,
    name: 'Video Studio',
    description: 'KI-gestützte Videobearbeitung',
    icon: 'Film',
    path: '/video-studio',
    phase: 3,
    category: 'studio',
  },
  {
    id: ModuleId.INTRO_OUTRO,
    name: 'Intro / Outro Generator',
    description: 'Automatische Intro- und Outro-Erstellung',
    icon: 'Play',
    path: '/intro-outro',
    phase: 3,
    category: 'studio',
  },
  {
    id: ModuleId.VTUBER_STUDIO,
    name: 'VTuber Studio',
    description: 'Charaktere, Avatare und Emotes generieren',
    icon: 'Smile',
    path: '/vtuber-studio',
    phase: 3,
    category: 'studio',
  },
  {
    id: ModuleId.AI_IMAGE,
    name: 'KI Bildgenerator',
    description: 'Logos, Banner, Overlays und Charaktere',
    icon: 'ImagePlus',
    path: '/ai-image',
    phase: 1,
    category: 'ai',
  },
  {
    id: ModuleId.AI_VIDEO,
    name: 'KI Video Generator',
    description: 'Werbevideos, Shorts und Social Media Videos',
    icon: 'Video',
    path: '/ai-video',
    phase: 3,
    category: 'ai',
  },
  {
    id: ModuleId.AI_MUSIC,
    name: 'KI Musik Generator',
    description: 'Intromusik, Hintergrundmusik und Jingles',
    icon: 'Music',
    path: '/ai-music',
    phase: 3,
    category: 'ai',
  },
  {
    id: ModuleId.AI_VOICE,
    name: 'KI Sprecherstimmen',
    description: 'Voiceovers, Ansagen und Stream Intros',
    icon: 'Mic',
    path: '/ai-voice',
    phase: 3,
    category: 'ai',
  },
  {
    id: ModuleId.SOCIAL_MEDIA,
    name: 'Social Media Center',
    description: 'Planung, Veröffentlichung und Analyse',
    icon: 'Share2',
    path: '/social-media',
    phase: 4,
    category: 'social',
  },
  {
    id: ModuleId.CONTENT_CALENDAR,
    name: 'Content Kalender',
    description: 'Posts, Videos, Livestreams und Kampagnen',
    icon: 'Calendar',
    path: '/content-calendar',
    phase: 4,
    category: 'social',
  },
  {
    id: ModuleId.AGENCY_MANAGEMENT,
    name: 'Agenturverwaltung',
    description: 'Mitarbeiter, Kunden, Projekte und Aufträge',
    icon: 'Briefcase',
    path: '/agency-management',
    phase: 4,
    category: 'agency',
  },
  {
    id: ModuleId.TEAM_CHAT,
    name: 'Team Chat',
    description: 'Interne Kommunikation und Aufgaben',
    icon: 'MessageSquare',
    path: '/team-chat',
    phase: 4,
    category: 'team',
  },
  {
    id: ModuleId.CLIENT_PORTAL,
    name: 'Kundenportal',
    description: 'Projekte, Feedback und Auftragsverfolgung',
    icon: 'UserCheck',
    path: '/client-portal',
    phase: 4,
    category: 'agency',
  },
  {
    id: ModuleId.FILE_CLOUD,
    name: 'Datei Cloud',
    description: 'Speicherung von Logos, Videos und Projekten',
    icon: 'Cloud',
    path: '/file-cloud',
    phase: 1,
    category: 'core',
  },
  {
    id: ModuleId.MARKETPLACE,
    name: 'Marketplace',
    description: 'Templates, Logos, Overlays und Sounds handeln',
    icon: 'Store',
    path: '/marketplace',
    phase: 4,
    category: 'commerce',
  },
  {
    id: ModuleId.COINS,
    name: 'Coin System',
    description: 'Coins kaufen und verwalten',
    icon: 'Coins',
    path: '/coins',
    phase: 1,
    category: 'commerce',
  },
  {
    id: ModuleId.WHITE_LABEL,
    name: 'White Label',
    description: 'Eigene Domain, Farben und Plattform',
    icon: 'Palette',
    path: '/white-label',
    phase: 4,
    category: 'agency',
  },
  {
    id: ModuleId.MOBILE_APP,
    name: 'Web App',
    description: 'Im Browser nutzen oder als PWA auf dem Homescreen installieren',
    icon: 'Smartphone',
    path: '/mobile-app',
    phase: 5,
    category: 'mobile',
  },
  {
    id: ModuleId.LIVE_STREAMING,
    name: 'Live Streaming Tools',
    description: 'Kommt in einem späteren Update — RTMP, Overlays, Alerts',
    icon: 'Radio',
    path: '/live-streaming',
    phase: 5,
    category: 'streaming',
  },
];

/** Module excluded from creator edition (no agency / white-label). */
export const AGENCY_MODULE_IDS: ModuleId[] = [
  ModuleId.AGENCY_DNA,
  ModuleId.AGENCY_MANAGEMENT,
  ModuleId.CLIENT_PORTAL,
  ModuleId.WHITE_LABEL,
];

/** Deferred to a future update — hidden from navigation and hub. */
export const DEFERRED_MODULE_IDS: ModuleId[] = [ModuleId.LIVE_STREAMING];

/** Active modules for the creator web app (matches infographic, minus agency & deferred). */
export const CREATOR_MODULES = MODULES.filter(
  (m) => !AGENCY_MODULE_IDS.includes(m.id) && !DEFERRED_MODULE_IDS.includes(m.id)
);

/** Infographic module numbers (1–14, agency slots omitted). */
export const INFOGRAPHIC_MODULE_NUMBERS: Partial<Record<ModuleId, number>> = {
  [ModuleId.CREATOR_DNA]: 1,
  [ModuleId.LOGO_STUDIO]: 2,
  [ModuleId.CHANGE_REQUEST]: 3,
  [ModuleId.BRANDING_GENERATOR]: 4,
  [ModuleId.LAYOUT_STUDIO]: 5,
  [ModuleId.AI_ASSISTANT]: 6,
  [ModuleId.TEAM_DNA]: 9,
  [ModuleId.VIDEO_STUDIO]: 10,
  [ModuleId.VTUBER_STUDIO]: 11,
  [ModuleId.MARKETPLACE]: 13,
  [ModuleId.COINS]: 14,
};
