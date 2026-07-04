import type { ImprovementPreset } from './types';

/** Creator in 60 Sekunden — v1 Asset-Liste */
export const ULTIMATE_PACK_V1 = [
  { key: 'logo', label: 'Logo (MAGIK)', module: 'logo' },
  { key: 'profile-pic', label: 'Profilbild', module: 'profile-pic' },
  { key: 'banner-twitch', label: 'Twitch Banner', module: 'banner' },
  { key: 'banner-youtube', label: 'YouTube Banner', module: 'banner' },
  { key: 'facecam', label: 'Facecam', module: 'facecam' },
  { key: 'overlay', label: 'Stream Overlay', module: 'overlay' },
  { key: 'panel', label: 'Panels', module: 'panel' },
  { key: 'discord-banner', label: 'Discord Banner', module: 'banner' },
] as const;

export const ULTIMATE_WIZARD_STYLES = [
  'Ultra-Cinematic',
  'Esports',
  'Dark',
  'Neon',
  'Fire',
  'Horror',
  'Anime',
  'Cyberpunk',
  'Fantasy',
] as const;

export const ULTIMATE_PLATFORMS = [
  { id: 'twitch' as const, label: 'Twitch' },
  { id: 'youtube' as const, label: 'YouTube' },
  { id: 'tiktok' as const, label: 'TikTok' },
  { id: 'discord' as const, label: 'Discord' },
  { id: 'kick' as const, label: 'Kick' },
];

export const IMPROVEMENT_PRESETS: ImprovementPreset[] = [
  { id: 'more-depth', label: 'Mehr Tiefe', description: 'Stärkere 3D-Tiefe', magikLogoArt: 'ultra-3d', promptSuffix: 'extra depth, heavy extrusion, layered composition' },
  { id: 'more-realism', label: 'Mehr Realismus', description: 'Realistischere Materialien', magikStyle: 'Ultra Realistic', promptSuffix: 'photorealistic materials, realistic lighting' },
  { id: 'better-colors', label: 'Bessere Farben', description: 'Harmonischere Palette', promptSuffix: 'refined color harmony, cinematic color grading' },
  { id: 'more-detail', label: 'Mehr Details', description: 'Feinere Details', promptSuffix: 'micro details, intricate textures, AAA detail density' },
  { id: 'cinematic-light', label: 'Kinolicht', description: 'Filmische Beleuchtung', promptSuffix: 'cinematic lighting, volumetric rays, dramatic shadows' },
  { id: 'premium-materials', label: 'Premium-Materialien', description: 'Metall, Glas, Glow', promptSuffix: 'premium metallic materials, glass reflections, subsurface glow' },
  { id: 'sharper-edges', label: 'Schärfere Kanten', description: 'Crisp & sharp', promptSuffix: 'ultra sharp edges, crisp silhouette, high contrast' },
  { id: 'horror', label: 'Horror', description: 'Düstere Version', magikStyle: 'Horror', promptSuffix: 'horror atmosphere, dark ominous energy' },
  { id: 'anime', label: 'Anime', description: 'Anime-Stil', magikStyle: 'Anime', promptSuffix: 'anime style, bold cel-shaded energy' },
  { id: 'neon', label: 'Neon', description: 'Neon-Glow', magikStyle: 'Neon', promptSuffix: 'neon glow, electric cyber accents' },
  { id: 'aggressive', label: 'Aggressiver', description: 'Härter & kraftvoller', magikStyle: 'Gaming', promptSuffix: 'aggressive powerful look, fierce energy' },
];
