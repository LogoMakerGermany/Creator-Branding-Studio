/** Ultimate Qualitäts-DNA — immer aktiv, nicht deaktivierbar. */
export const MAGIK_QUALITY_DNA = [
  'ultra-cinematic',
  'extremely detailed',
  'epic',
  'AAA game art',
  'professional esports quality',
  '3D',
  'high-end lighting',
  'volumetric light',
  'cinematic lighting',
  'dramatic shadows',
  'realistic materials',
  'ultra sharp',
  'unreal engine quality',
  'highly detailed',
  'masterpiece',
  'premium logo design',
  'dynamic composition',
  'aggressive look',
  'powerful',
  'glowing effects',
  'particles',
  'smoke',
  'energy',
  'depth',
  'cinematic colors',
  'logo without watermark',
  'centered composition',
  'perfectly readable wordmark',
  'professional gaming logo',
  'high-quality typography matching the motif',
] as const;

export const MAGIK_GAME_PRESETS = [
  'Call of Duty',
  'Fortnite',
  'Valorant',
  'Counter-Strike',
  'League of Legends',
  'Minecraft',
  'GTA',
  'Apex Legends',
  'Rust',
  'Rainbow Six',
  'PUBG',
  'Free Fire',
  'EA FC',
] as const;

export {
  LOGO_STUDIO_STYLE_PRESETS,
  LOGO_STYLE_GROUPS,
  LOGO_STYLE_DESCRIPTIONS,
  LEGACY_MAGIK_STYLE_MAP,
  normalizeMagikStyle,
  MAGIK_STYLE_PRESETS,
  DEFAULT_MAGIK_STYLE,
} from './logo-style-presets';
export type { LogoStudioStylePreset } from './logo-style-presets';

export const MAGIK_LOGO_ART = [
  { id: '2d', label: '2D' },
  { id: '3d', label: '3D' },
  { id: 'ultra-3d', label: 'Ultra 3D' },
  { id: 'ultra-cinematic-3d', label: 'Ultra Cinematic 3D' },
] as const;

export type MagikLogoArtId = (typeof MAGIK_LOGO_ART)[number]['id'];

export const MAGIK_RING_MODES = [
  { id: 'auto', label: 'Automatisch' },
  { id: 'yes', label: 'Ja' },
  { id: 'no', label: 'Nein' },
] as const;

export type MagikRingMode = (typeof MAGIK_RING_MODES)[number]['id'];

export const MAGIK_BACKGROUND_PRESETS = [
  { id: 'transparent', label: 'Transparent' },
  { id: 'dark', label: 'Dunkel' },
  { id: 'fire', label: 'Feuer' },
  { id: 'ice', label: 'Eis' },
  { id: 'lightning', label: 'Blitze' },
  { id: 'fog', label: 'Nebel' },
  { id: 'space', label: 'Weltraum' },
  { id: 'ruins', label: 'Ruinen' },
  { id: 'abstract', label: 'Abstrakt' },
  { id: 'arena', label: 'Arena' },
] as const;

export type MagikBackgroundId = (typeof MAGIK_BACKGROUND_PRESETS)[number]['id'];

export const MAGIK_CHARACTERS = [
  'Wolf',
  'Drache',
  'Alien',
  'Zecke',
  'Totenkopf',
  'Zombie',
  'Dämon',
  'Engel',
  'Samurai',
  'Ninja',
  'Wikinger',
  'Ritter',
  'Magier',
  'Phönix',
  'Tiger',
  'Löwe',
  'Bär',
  'Schlange',
  'Hai',
  'Krake',
  'Roboter',
  'Mecha',
  'Cyber Soldier',
  'Space Marine',
  'Ork',
  'Monster',
  'Hexe',
  'Reaper',
  'Soldat',
  'Anime',
  'Fantasy',
  'Sci-Fi',
  'Eigene Figur',
] as const;

export type MagikCharacter = (typeof MAGIK_CHARACTERS)[number];

export const MAGIK_COLOR_PALETTES = [
  { id: 'cyber', colors: ['#22d3ee', '#a855f7', '#0ea5e9'] },
  { id: 'fire', colors: ['#ef4444', '#f97316', '#fbbf24'] },
  { id: 'ice', colors: ['#38bdf8', '#818cf8', '#e0f2fe'] },
  { id: 'toxic', colors: ['#84cc16', '#22c55e', '#a3e635'] },
  { id: 'royal', colors: ['#7c3aed', '#c084fc', '#fbbf24'] },
  { id: 'blood', colors: ['#991b1b', '#1f2937', '#dc2626'] },
  { id: 'neon', colors: ['#ec4899', '#22d3ee', '#a855f7'] },
  { id: 'gold', colors: ['#f59e0b', '#1f2937', '#fcd34d'] },
] as const;

export const DEFAULT_MAGIK_LOGO_ART: MagikLogoArtId = 'ultra-cinematic-3d';

/** Logo Studio — Untertitel / Kontext */
export const LOGO_SUBTITLE_PRESETS = ['Gaming', 'Esports', 'Streamer', 'Clan', 'Creator'] as const;
export type LogoSubtitlePreset = (typeof LOGO_SUBTITLE_PRESETS)[number];

/** Beispielnamen für die UI */
export const LOGO_NAME_EXAMPLES = [
  'DerMax',
  'Ghostface481',
  'BlackQueen',
  'LogoMakerGermany',
  'Team WRG',
] as const;
