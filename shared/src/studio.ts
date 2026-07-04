/** Platform banner dimensions (width × height px). */
export const BANNER_PLATFORM_SPECS = {
  twitch: { width: 1200, height: 480, label: 'Twitch', aspect: '5:2' },
  youtube: { width: 2560, height: 1440, label: 'YouTube', aspect: '16:9' },
  tiktok: { width: 1080, height: 1920, label: 'TikTok', aspect: '9:16' },
  discord: { width: 960, height: 540, label: 'Discord', aspect: '16:9' },
  kick: { width: 1200, height: 480, label: 'Kick', aspect: '5:2' },
  facebook: { width: 820, height: 312, label: 'Facebook', aspect: '2.6:1' },
  instagram: { width: 1080, height: 1080, label: 'Instagram', aspect: '1:1' },
  x: { width: 1500, height: 500, label: 'X (Twitter)', aspect: '3:1' },
} as const;

export type BannerPlatform = keyof typeof BANNER_PLATFORM_SPECS;

export const LOGO_STYLE_PRESETS = [
  '2D',
  '3D',
  'Realistisch',
  'Cartoon',
  'Anime',
  'Neon',
  'Ultra Cinematic',
  'Esports',
  'Horror',
  'Fantasy',
] as const;

export interface LogoLightingSettings {
  glow: number;
  light: number;
  shadow: number;
  reflections: number;
  bloom: number;
  hdr: number;
  lensFlare: number;
  rimLight: number;
  ambientLight: number;
}

export interface LogoCameraSettings {
  zoom: number;
  rotation: number;
  perspective: number;
  angle: number;
  depthOfField: number;
}

export interface LogoDetailsSettings {
  detail: number;
  realism: number;
  sharpness: number;
  contrast: number;
  saturation: number;
  texture: number;
}

export interface LogoTypographySettings {
  fontFamily: string;
  size: number;
  weight: number;
  outline: number;
  glow: number;
  letterSpacing: number;
}

export interface LogoAiSettings {
  creativity: number;
  promptStrength: number;
  styleAdherence: number;
  variation: number;
  coherence: number;
  qualityFocus: number;
}

export interface LogoGenerationOptions {
  logoName?: string;
  clanName?: string;
  slogan?: string;
  style?: string;
  game?: string;
  platform?: string;
  symbol?: string;
  dimension?: '2d' | '3d';
  ringLogo?: boolean;
  transparentBackground?: boolean;
  backgroundType?: 'transparent' | 'solid' | 'gradient' | 'dark';
  backgroundColor?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  glowColor?: string;
  /** Farbverlauf im Logo / Hintergrund */
  logoGradientEnabled?: boolean;
  logoGradientFrom?: string;
  logoGradientTo?: string;
  logoGradientAngle?: number;
  threeD?: boolean;
  realistic?: boolean;
  cartoon?: boolean;
  anime?: boolean;
  neon?: boolean;
  ultraCinematic?: boolean;
  customColors?: string[];
  /** MAGIK PROMPT SYSTEM */
  magikMode?: 'name' | 'character';
  magikCharacter?: string;
  customCharacter?: string;
  magikStyle?: string;
  magikLogoArt?: '2d' | '3d' | 'ultra-3d' | 'ultra-cinematic-3d';
  ringLogoMode?: 'yes' | 'no' | 'auto';
  magikBackground?: string;
  selectedColors?: string[];
  customPromptOverride?: string;
  magikVariant?: 'a' | 'b';
  /** Optionaler Kontext: Gaming, Esports, Streamer, Clan, Creator */
  logoSubtitle?: string;
  /** Logo Studio Schritt 4 — Beleuchtung (0–100 je Regler) */
  logoLighting?: Partial<LogoLightingSettings>;
  /** Logo Studio Schritt 5 — Material (siehe LOGO_MATERIAL_PRESETS) */
  logoMaterial?: string;
  /** Materialstärke 0–100 */
  logoMaterialIntensity?: number;
  /** Logo Studio Schritt 6 — Effekte (IDs aus LOGO_EFFECT_PRESETS) */
  logoEffects?: string[];
  /** Logo Studio Schritt 7 — Hintergrund */
  logoBackground?: string;
  logoBackgroundUpload?: string;
  logoBackgroundUploadName?: string;
  /** Logo Studio Schritt 8 — Kamera (0–100 je Regler) */
  logoCamera?: Partial<LogoCameraSettings>;
  /** Logo Studio Schritt 9 — Logo-Details (0–100 je Regler) */
  logoDetails?: Partial<LogoDetailsSettings>;
  /** Logo Studio Schritt 10 — Schrift / Typografie */
  logoTypography?: Partial<LogoTypographySettings>;
  /** Logo Studio Schritt 11 — KI-Einstellungen (0–100 je Regler) */
  logoAiSettings?: Partial<LogoAiSettings>;
}

export interface BannerGenerationOptions {
  platform: BannerPlatform;
  title?: string;
  subtitle?: string;
  style?: string;
}

export interface FacecamGenerationOptions {
  style?: string;
  shape?: 'rectangle' | 'circle' | 'hexagon';
  animated?: boolean;
  transparentBackground?: boolean;
}

export interface OverlayGenerationOptions {
  style?: string;
  overlayType?: 'hud' | 'alert' | 'panel' | 'starting-soon' | 'brb' | 'full-scene';
  transparentBackground?: boolean;
  animated?: boolean;
}

export interface StickerGenerationOptions {
  name?: string;
  style?: string;
  multicolor?: boolean;
  shape?: 'circle' | 'square' | 'die-cut';
  transparentBackground?: boolean;
}

export type StudioModuleKey = 'logo' | 'banner' | 'facecam' | 'overlay' | 'sticker';

export interface StudioProjectSummary {
  id: string;
  status: string;
  imageUrl?: string;
  exports?: StudioExportUrls;
  provider?: string;
  createdAt: string;
  completedAt?: string;
}

export interface StudioExportUrls {
  png: string;
  hd?: string;
  svg?: string;
}
