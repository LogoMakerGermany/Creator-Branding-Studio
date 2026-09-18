import type { CreatorDNA } from './creator-dna';
import type { LogoGenerationOptions } from './studio';
import { qualityInstructionsForStyle, resolveNexterQualityMode } from './nexter-quality';
import { NEXTER_STUDIO_PATHS } from './nexter';
import { DEFAULT_MAGIK_STYLE, DEFAULT_MAGIK_LOGO_ART } from './magik/constants';

export const MAX_LOGO_PROMPT_CHARS = 4000;
export const MAX_LOGO_REFERENCES = 1;
export const LOGO_MIN_PX = 64;
export const LOGO_MAX_PX = 2048;
export const LOGO_REFERENCE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const LOGO_OUTPUT_FORMATS = ['png', 'webp', 'jpg'] as const;
export const LOGO_TRANSPARENT_FORMATS = ['png', 'webp'] as const;

export type LogoOutputFormat = (typeof LOGO_OUTPUT_FORMATS)[number];
export type LogoShape = 'free' | 'ring' | 'badge';
export type LogoPlatform = 'twitch' | 'tiktok' | 'youtube' | 'discord' | 'general';
export type LogoLookPresetId =
  | 'gamer'
  | 'esports'
  | 'creator'
  | 'minimal'
  | 'cinematic'
  | '3d'
  | 'mascot'
  | 'emblem';

/** Presets that map onto MAGIK fields — not decorative labels. */
export const LOGO_LOOK_PRESETS: Array<{
  id: LogoLookPresetId;
  label: string;
  magikStyle?: string;
  magikLogoArt?: LogoGenerationOptions['magikLogoArt'];
  magikMode?: LogoGenerationOptions['magikMode'];
  shape?: LogoShape;
}> = [
  { id: 'gamer', label: 'Gamer', magikStyle: 'Gaming' },
  { id: 'esports', label: 'Esports', magikStyle: 'Esports' },
  { id: 'creator', label: 'Creator', magikStyle: 'Premium' },
  { id: 'minimal', label: 'Minimal', magikStyle: 'Minimalistisch' },
  { id: 'cinematic', label: 'Cinematic', magikStyle: 'Cinematic', magikLogoArt: 'ultra-cinematic-3d' },
  { id: '3d', label: '3D', magikLogoArt: '3d' },
  { id: 'mascot', label: 'Mascot', magikMode: 'character' },
  { id: 'emblem', label: 'Emblem', shape: 'badge', magikStyle: 'Esports' },
];

export const LOGO_PLATFORM_PRESETS: Record<
  LogoPlatform,
  { width: number; height: number; format: LogoOutputFormat; safeArea: string; label: string }
> = {
  twitch: {
    width: 400,
    height: 400,
    format: 'png',
    label: 'Twitch',
    safeArea: 'Twitch-Profil 400×400, Motiv zentriert, Rand frei für Crop',
  },
  tiktok: {
    width: 400,
    height: 400,
    format: 'png',
    label: 'TikTok',
    safeArea: 'TikTok-Avatar 400×400, klares Zentrum',
  },
  youtube: {
    width: 800,
    height: 800,
    format: 'png',
    label: 'YouTube',
    safeArea: 'YouTube-Kanalicon, quadratisch, lesbar bei kleiner Größe',
  },
  discord: {
    width: 512,
    height: 512,
    format: 'png',
    label: 'Discord',
    safeArea: 'Discord-Servericon 512×512',
  },
  general: {
    width: 1024,
    height: 1024,
    format: 'png',
    label: 'Allgemein',
    safeArea: 'Quadratisches Branding-Logo, zentriert',
  },
};

export const LOGO_400PX_PRESET = { width: 400, height: 400, label: '400×400' } as const;

export interface LogoConfig {
  name: string;
  style?: string;
  subject?: string;
  primaryColors: string[];
  secondaryColors: string[];
  shape: LogoShape;
  backgroundMode: 'transparent' | 'solid' | 'dark';
  transparentBackground: boolean;
  platform: LogoPlatform;
  width: number;
  height: number;
  outputFormat: LogoOutputFormat;
  qualityProfile: string;
  referenceFileIds: string[];
  magikStyle?: string;
  magikLogoArt?: LogoGenerationOptions['magikLogoArt'];
  magikMode?: LogoGenerationOptions['magikMode'];
  magikCharacter?: string;
  game?: string;
  prompt?: string;
  summary: string;
}

export interface LogoGenerationSettings {
  type: 'logo';
  config: LogoConfig;
  missing: string[];
  followUpQuestion: string | null;
}

export function logoConfigFromDna(dna: Pick<
  CreatorDNA,
  | 'name'
  | 'primaryColors'
  | 'secondaryColors'
  | 'accentColors'
  | 'styleDirection'
  | 'mascot'
  | 'brandingStyle'
  | 'fonts'
  | 'favoriteGenres'
  | 'platformOptimization'
  | 'gamingStyle'
>): Partial<LogoConfig> {
  const platform = (dna.platformOptimization?.[0]?.platform as LogoPlatform | undefined) ?? 'general';
  const spec = LOGO_PLATFORM_PRESETS[platform] ?? LOGO_PLATFORM_PRESETS.general;
  return {
    name: dna.name,
    style: dna.brandingStyle || dna.styleDirection,
    subject: dna.mascot || undefined,
    primaryColors: dna.primaryColors?.length ? dna.primaryColors.slice(0, 3) : [],
    secondaryColors: dna.secondaryColors?.length ? dna.secondaryColors.slice(0, 3) : dna.accentColors?.slice(0, 2) ?? [],
    platform: platform in LOGO_PLATFORM_PRESETS ? platform : 'general',
    width: spec.width,
    height: spec.height,
    magikStyle: dna.styleDirection === 'minimal' || dna.styleDirection === 'clean' ? 'Minimalistisch' : dna.styleDirection === 'esports' ? 'Esports' : dna.styleDirection === 'cinematic' ? 'Cinematic' : 'Gaming',
    magikCharacter: dna.mascot || undefined,
    magikMode: dna.mascot ? 'character' : 'name',
    game: dna.favoriteGenres?.[0],
  };
}

export function defaultLogoConfig(overrides?: Partial<LogoConfig>): LogoConfig {
  const platform = overrides?.platform ?? 'general';
  const spec = LOGO_PLATFORM_PRESETS[platform];
  const transparent = overrides?.transparentBackground ?? true;
  const format = overrides?.outputFormat ?? (transparent ? 'png' : spec.format);
  const config: LogoConfig = {
    name: overrides?.name?.trim() || '',
    style: overrides?.style,
    subject: overrides?.subject,
    primaryColors: overrides?.primaryColors?.length ? overrides.primaryColors : ['#22d3ee'],
    secondaryColors: overrides?.secondaryColors?.length ? overrides.secondaryColors : ['#a855f7'],
    shape: overrides?.shape ?? 'free',
    backgroundMode: transparent ? 'transparent' : overrides?.backgroundMode ?? 'dark',
    transparentBackground: transparent,
    platform,
    width: overrides?.width ?? spec.width,
    height: overrides?.height ?? spec.height,
    outputFormat: format,
    qualityProfile: overrides?.qualityProfile ?? resolveNexterQualityMode(overrides?.style ?? overrides?.magikStyle),
    referenceFileIds: overrides?.referenceFileIds?.slice(0, MAX_LOGO_REFERENCES) ?? [],
    magikStyle: overrides?.magikStyle ?? DEFAULT_MAGIK_STYLE,
    magikLogoArt: overrides?.magikLogoArt ?? DEFAULT_MAGIK_LOGO_ART,
    magikMode: overrides?.magikMode ?? 'name',
    magikCharacter: overrides?.magikCharacter,
    game: overrides?.game,
    prompt: overrides?.prompt,
    summary: '',
  };
  config.summary = buildLogoDesignSummary(config);
  return config;
}

export function applyLogoStylePreset(config: LogoConfig, presetId: LogoLookPresetId): LogoConfig {
  const preset = LOGO_LOOK_PRESETS.find((p) => p.id === presetId);
  if (!preset) return config;
  const next: LogoConfig = {
    ...config,
    magikStyle: preset.magikStyle ?? config.magikStyle,
    magikLogoArt: preset.magikLogoArt ?? config.magikLogoArt,
    magikMode: preset.magikMode ?? config.magikMode,
    shape: preset.shape ?? config.shape,
    style: preset.magikStyle ?? config.style,
  };
  next.qualityProfile = resolveNexterQualityMode(next.magikStyle ?? next.style);
  next.summary = buildLogoDesignSummary(next);
  return next;
}

export function applyLogoPlatformPreset(config: LogoConfig, platform: LogoPlatform): LogoConfig {
  const spec = LOGO_PLATFORM_PRESETS[platform];
  const next: LogoConfig = {
    ...config,
    platform,
    width: spec.width,
    height: spec.height,
    outputFormat: config.transparentBackground ? 'png' : spec.format,
  };
  next.summary = buildLogoDesignSummary(next);
  return next;
}

export function validateLogoDimensions(
  width: unknown,
  height: unknown
): { ok: true; width: number; height: number } | { ok: false; message: string } {
  const w = typeof width === 'number' ? width : Number(width);
  const h = typeof height === 'number' ? height : Number(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isInteger(w) || !Number.isInteger(h)) {
    return { ok: false, message: 'Breite und Höhe müssen ganze Pixelwerte sein.' };
  }
  if (w <= 0 || h <= 0) {
    return { ok: false, message: 'Dimensionen müssen größer als 0 Pixel sein.' };
  }
  if (w < LOGO_MIN_PX || h < LOGO_MIN_PX) {
    return { ok: false, message: `Mindestgröße ist ${LOGO_MIN_PX}×${LOGO_MIN_PX} Pixel.` };
  }
  if (w > LOGO_MAX_PX || h > LOGO_MAX_PX) {
    return { ok: false, message: `Maximalgröße ist ${LOGO_MAX_PX}×${LOGO_MAX_PX} Pixel.` };
  }
  return { ok: true, width: w, height: h };
}

export function validateLogoFormat(
  format: unknown,
  transparent: boolean
): { ok: true; format: LogoOutputFormat } | { ok: false; message: string } {
  const raw = String(format ?? 'png').toLowerCase().replace('jpeg', 'jpg');
  if (!LOGO_OUTPUT_FORMATS.includes(raw as LogoOutputFormat)) {
    return { ok: false, message: 'Unterstützte Formate: PNG, WEBP, JPG.' };
  }
  const next = raw as LogoOutputFormat;
  if (transparent && !LOGO_TRANSPARENT_FORMATS.includes(next as (typeof LOGO_TRANSPARENT_FORMATS)[number])) {
    return { ok: false, message: 'Transparenz ist nur mit PNG oder WEBP möglich — nicht mit JPG.' };
  }
  return { ok: true, format: next };
}

export function logoProviderSize(width: number, height: number): '1024x1024' | '1792x1024' | '1024x1792' {
  if (width > height * 1.4) return '1792x1024';
  if (height > width * 1.4) return '1024x1792';
  return '1024x1024';
}

export function shapeToRingMode(shape: LogoShape): 'yes' | 'no' | 'auto' {
  if (shape === 'ring' || shape === 'badge') return 'yes';
  return 'no';
}

export function ringModeToShape(mode?: 'yes' | 'no' | 'auto', ringLogo?: boolean): LogoShape {
  if (mode === 'yes' || ringLogo) return 'ring';
  if (mode === 'no') return 'free';
  return 'ring';
}

export function logoConfigToGenerationOptions(config: LogoConfig): LogoGenerationOptions {
  const transparent = config.transparentBackground && LOGO_TRANSPARENT_FORMATS.includes(config.outputFormat as (typeof LOGO_TRANSPARENT_FORMATS)[number]);
  return {
    logoName: config.name,
    style: config.style,
    magikStyle: config.magikStyle ?? config.style,
    magikLogoArt: config.magikLogoArt,
    magikMode: config.magikMode ?? 'name',
    magikCharacter: config.magikCharacter,
    game: config.game,
    platform: config.platform,
    selectedColors: [...config.primaryColors, ...config.secondaryColors].filter(Boolean).slice(0, 6),
    primaryColor: config.primaryColors[0],
    secondaryColor: config.secondaryColors[0],
    transparentBackground: transparent,
    magikBackground: transparent ? 'transparent' : 'dark',
    ringLogoMode: shapeToRingMode(config.shape),
    ringLogo: config.shape !== 'free',
    customPromptOverride: config.prompt,
  };
}

export function logoConfigFromGenerationOptions(
  opts: LogoGenerationOptions,
  extras?: Partial<LogoConfig>
): LogoConfig {
  const transparent = Boolean(opts.transparentBackground || opts.magikBackground === 'transparent');
  const platform = (['twitch', 'tiktok', 'youtube', 'discord', 'general'] as const).includes(
    String(opts.platform) as LogoPlatform
  )
    ? (opts.platform as LogoPlatform)
    : extras?.platform ?? 'general';
  return defaultLogoConfig({
    ...extras,
    name: opts.logoName?.trim() || extras?.name || '',
    style: opts.magikStyle ?? opts.style,
    subject: opts.magikCharacter || opts.customCharacter || extras?.subject,
    primaryColors: opts.selectedColors?.length
      ? opts.selectedColors.slice(0, 3)
      : [opts.primaryColor, opts.accentColor].filter(Boolean) as string[],
    secondaryColors: [opts.secondaryColor, opts.glowColor].filter(Boolean) as string[],
    shape: ringModeToShape(opts.ringLogoMode, opts.ringLogo),
    transparentBackground: transparent,
    backgroundMode: transparent ? 'transparent' : 'dark',
    platform,
    magikStyle: opts.magikStyle,
    magikLogoArt: opts.magikLogoArt,
    magikMode: opts.magikMode,
    magikCharacter: opts.magikCharacter,
    game: opts.game,
    prompt: opts.customPromptOverride,
    referenceFileIds: extras?.referenceFileIds,
    width: extras?.width,
    height: extras?.height,
    outputFormat: extras?.outputFormat,
  });
}

export function buildLogoDesignSummary(config: Pick<
  LogoConfig,
  | 'name'
  | 'width'
  | 'height'
  | 'style'
  | 'magikStyle'
  | 'magikLogoArt'
  | 'platform'
  | 'shape'
  | 'transparentBackground'
  | 'primaryColors'
  | 'secondaryColors'
  | 'outputFormat'
  | 'subject'
>): string {
  const style = config.magikStyle || config.style || 'Gaming';
  const art = config.magikLogoArt === '2d' ? '2D' : config.magikLogoArt === '3d' ? '3D' : 'cinematic 3D';
  const shape =
    config.shape === 'ring' ? 'Ring-Emblem' : config.shape === 'badge' ? 'Badge/Emblem' : 'freies Format';
  const colors = [...(config.primaryColors ?? []), ...(config.secondaryColors ?? [])].filter(Boolean).slice(0, 3);
  const bits = [
    `${config.width}×${config.height}`,
    `${style}-Logo`,
    config.platform !== 'general' ? `für ${LOGO_PLATFORM_PRESETS[config.platform].label}` : null,
    shape,
    config.name ? `Name ${config.name}` : null,
    config.subject ? `Motiv ${config.subject}` : null,
    colors.length ? colors.join('/') : null,
    art,
    config.transparentBackground ? 'transparenter Hintergrund' : null,
    String(config.outputFormat || 'png').toUpperCase(),
  ].filter(Boolean);
  return `${bits.join(', ')}.`;
}

export function sanitizeLogoStyleRequest(message: string): string {
  let t = String(message ?? '');
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  t = t.replace(/kopiere?\s+(exakt\s+)?(das\s+)?(logo|markenlogo)\s+(von|des)\s+[\w.\-]+/gi, 'im gleichen visuellen Charakter, ohne fremde Markenzeichen');
  t = t.replace(/exakt(?:es|e)?\s+(?:das\s+)?(?:offizielle\s+)?(?:game-?\s*)?logo/gi, 'allgemeine visuelle Stimmung');
  t = t.replace(/\bcall[\s-]?of[\s-]?duty\b/gi, 'militärisch-taktische Stimmung');
  t = t.replace(/\bfortnite\b/gi, 'bunte, dynamische Battle-Royale-Stimmung');
  t = t.replace(/\bvalorant\b/gi, 'präzise taktische Neon-Stimmung');
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return t.trim().slice(0, MAX_LOGO_PROMPT_CHARS);
}

const PLATFORM_WORDS: Array<[RegExp, LogoPlatform]> = [
  [/\btwitch\b/i, 'twitch'],
  [/\btiktok\b/i, 'tiktok'],
  [/\byoutube\b/i, 'youtube'],
  [/\bdiscord\b/i, 'discord'],
];

const PRESET_WORDS: Array<[RegExp, LogoLookPresetId]> = [
  [/\besports?\b/i, 'esports'],
  [/\bgamer|gaming\b/i, 'gamer'],
  [/\bminimal/i, 'minimal'],
  [/\bcinematic|filmisch\b/i, 'cinematic'],
  [/\b3d\b|dreidimensional/i, '3d'],
  [/\bmaskottchen|mascot|figur\b/i, 'mascot'],
  [/\bemblem|wappen|badge\b/i, 'emblem'],
  [/\bcreator|streamer\b/i, 'creator'],
];

function extractLogoName(message: string): string | undefined {
  const original = String(message ?? '');
  const quoted = original.match(/[„"]([^"„”\n]{2,40})[“"]/);
  if (quoted?.[1]) return quoted[1].trim();
  const named = original.match(/(?:name[ns]?|heißt|namens)\s+([A-Za-zÄÖÜäöüß0-9][\wÄÖÜäöüß-]{1,39})/i);
  if (named?.[1]) return named[1].trim();
  const forName = original.match(/\bmit(?:\s+dem)?\s+(?:namen|namen)\s+([A-Za-zÄÖÜäöüß0-9][\wÄÖÜäöüß-]{1,39})/i);
  if (forName?.[1]) return forName[1].trim();
  const mitNamen = original.match(/\bmein(?:em|en)?\s+namen\s+([A-Za-zÄÖÜäöüß0-9][\wÄÖÜäöüß-]{1,39})/i);
  if (mitNamen?.[1]) return mitNamen[1].trim();
  return undefined;
}

export function parseLogoIntent(
  message: string,
  ctx?: { dnaName?: string; primaryColors?: string[]; styleDirection?: string; mascot?: string; addressAs?: string }
): LogoGenerationSettings {
  const original = sanitizeLogoStyleRequest(message);
  const lower = original.toLowerCase();
  let config = defaultLogoConfig({
    name: extractLogoName(original) || ctx?.dnaName || '',
    primaryColors: ctx?.primaryColors?.length ? ctx.primaryColors.slice(0, 3) : undefined,
    style: ctx?.styleDirection,
    subject: ctx?.mascot,
    magikCharacter: ctx?.mascot,
    magikMode: ctx?.mascot ? 'character' : 'name',
  });

  for (const [re, platform] of PLATFORM_WORDS) {
    if (re.test(lower)) {
      config = applyLogoPlatformPreset(config, platform);
      break;
    }
  }
  for (const [re, preset] of PRESET_WORDS) {
    if (re.test(lower)) {
      config = applyLogoStylePreset(config, preset);
      break;
    }
  }

  const px = lower.match(/(\d{2,4})\s*(?:x|×)\s*(\d{2,4})/) || lower.match(/(\d{2,4})\s*(?:px|pixel)/);
  if (px) {
    const w = Number(px[1]);
    const h = Number(px[2] ?? px[1]);
    const dims = validateLogoDimensions(w, h);
    if (dims.ok) {
      config.width = dims.width;
      config.height = dims.height;
    }
  } else if (/\b400\b/.test(lower) && /pixel|px|logo/.test(lower)) {
    config.width = 400;
    config.height = 400;
  }

  if (/im ring|ring[- ]?logo|kreis|rund/i.test(lower)) config.shape = 'ring';
  if (/badge|emblem|wappen/i.test(lower)) config.shape = 'badge';
  if (/frei(es)?\s+format|ohne ring/i.test(lower)) config.shape = 'free';

  if (/transparent/i.test(lower)) {
    config.transparentBackground = true;
    config.backgroundMode = 'transparent';
    config.outputFormat = 'png';
  }
  if (/\bjpg\b|\bjpeg\b/.test(lower)) config.outputFormat = 'jpg';
  if (/\bwebp\b/.test(lower)) config.outputFormat = 'webp';
  if (/\bpng\b/.test(lower)) config.outputFormat = 'png';

  if (/blau|blue/.test(lower) && !config.primaryColors.includes('#1E40AF')) {
    config.primaryColors = ['#1E40AF', ...config.primaryColors].slice(0, 3);
  }
  if (/violett|lila|purple/.test(lower)) {
    config.secondaryColors = ['#7C3AED', ...config.secondaryColors].slice(0, 3);
  }
  if (/aggressiv|härter|dunkler/.test(lower) && !config.magikStyle) {
    config.magikStyle = 'Esports';
  }

  const fmt = validateLogoFormat(config.outputFormat, config.transparentBackground);
  if (fmt.ok) config.outputFormat = fmt.format;
  else if (config.transparentBackground) config.outputFormat = 'png';

  config.prompt = original.slice(0, MAX_LOGO_PROMPT_CHARS);
  config.qualityProfile = resolveNexterQualityMode(config.magikStyle ?? config.style);
  config.summary = buildLogoDesignSummary(config);

  const missing: string[] = [];
  if (!config.name.trim()) missing.push('name');
  const followUpQuestion = missing.includes('name')
    ? 'Für ein Logo brauche ich mindestens den Namen. Farben und Stil übernehme ich aus deiner Creator DNA, falls vorhanden.'
    : null;

  return { type: 'logo', config, missing, followUpQuestion };
}

export function logoNeedsFollowUp(
  message: string,
  ctx?: { hasDna?: boolean; dnaName?: string; addressAs?: string }
): boolean {
  const lower = String(message ?? '').toLowerCase();
  if (!/\blogo\b|gamerlogo|gaminglogo/.test(lower)) return false;
  if (/öffne|open|geh(e)? zu/.test(lower)) return false;
  const parsed = parseLogoIntent(message, {
    dnaName: ctx?.dnaName,
    addressAs: ctx?.addressAs,
  });
  if (parsed.config.name.trim()) return false;
  if (ctx?.hasDna && ctx.dnaName) return false;
  return true;
}

export function applyLogoChangeRequest(config: LogoConfig, request: string): LogoConfig {
  const parsed = parseLogoIntent(request, {
    dnaName: config.name,
    primaryColors: config.primaryColors,
    styleDirection: config.style,
    mascot: config.subject,
  });
  const next: LogoConfig = {
    ...config,
    width: parsed.config.width !== defaultLogoConfig().width || /\d+\s*(px|pixel|x|×)/i.test(request) ? parsed.config.width : config.width,
    height: parsed.config.height !== defaultLogoConfig().height || /\d+\s*(px|pixel|x|×)/i.test(request) ? parsed.config.height : config.height,
    shape: /ring|kreis|badge|emblem|frei/.test(request.toLowerCase()) ? parsed.config.shape : config.shape,
    transparentBackground: /transparent/.test(request.toLowerCase()) ? true : config.transparentBackground,
    outputFormat: /\b(png|jpg|jpeg|webp)\b/i.test(request) ? parsed.config.outputFormat : config.outputFormat,
    magikStyle: parsed.config.magikStyle && /aggressiv|3d|minimal|cinematic|esports|gamer/.test(request.toLowerCase())
      ? parsed.config.magikStyle
      : config.magikStyle,
    magikLogoArt: /mehr 3d|3d/.test(request.toLowerCase()) ? parsed.config.magikLogoArt ?? '3d' : config.magikLogoArt,
    primaryColors: /blau|rot|grün|lila|violett|dunkler/.test(request.toLowerCase())
      ? parsed.config.primaryColors
      : config.primaryColors,
    prompt: sanitizeLogoStyleRequest(`${config.prompt ?? ''} ${request}`.trim()),
  };
  if (/text größer|schrift größer/i.test(request)) {
    next.prompt = `${next.prompt ?? ''}. Larger, more readable wordmark.`.trim();
  }
  if (/figur kleiner|motiv kleiner/i.test(request)) {
    next.prompt = `${next.prompt ?? ''}. Smaller central figure, more space around the mascot.`.trim();
  }
  if (/ring breiter/i.test(request)) {
    next.shape = 'ring';
    next.prompt = `${next.prompt ?? ''}. Wider metallic ring emblem.`.trim();
  }
  const fmt = validateLogoFormat(next.outputFormat, next.transparentBackground);
  if (fmt.ok) next.outputFormat = fmt.format;
  else next.outputFormat = 'png';
  next.backgroundMode = next.transparentBackground ? 'transparent' : next.backgroundMode;
  next.summary = buildLogoDesignSummary(next);
  next.qualityProfile = resolveNexterQualityMode(next.magikStyle ?? next.style);
  return next;
}

export function logoDownloadFilename(input: {
  creatorName: string;
  version: number;
  ext?: string;
}): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/\.\./g, '')
      .replace(/[\\/]/g, '')
      .slice(0, 48) || 'creator';
  const ext = (input.ext || 'png').replace(/[^a-z0-9]/gi, '').slice(0, 4) || 'png';
  const version = Number.isFinite(input.version) && input.version > 0 ? Math.floor(input.version) : 1;
  return `${slug(input.creatorName)}-logo-v${version}.${ext}`;
}

export function logoStudioPath(config?: Partial<LogoConfig>): string {
  const params = new URLSearchParams();
  if (config?.name) params.set('name', config.name);
  if (config?.platform) params.set('platform', config.platform);
  if (config?.width && config?.height) params.set('size', `${config.width}x${config.height}`);
  const q = params.toString();
  return q ? `${NEXTER_STUDIO_PATHS.logo}?${q}` : NEXTER_STUDIO_PATHS.logo;
}

export function logoQualityHint(style?: string): string {
  return qualityInstructionsForStyle(style);
}

export const LOGO_CONFIG_PREVIEW_LABEL = 'Konfigurationsvorschau — kein KI-Ergebnis';
export const LOGO_GENERATED_RESULT_LABEL = 'Generiertes Logo';
export const LOGO_FAILED_PREVIEW_LABEL = 'Generierung fehlgeschlagen';
export const LOGO_CONFIG_PREVIEW_GLYPH = 'Vorschau';

export interface LogoResultCandidate {
  id: string;
  status?: string;
  imageUrl?: string;
  fileMissing?: boolean;
  createdAt?: string;
  completedAt?: string;
  error?: string;
}

export function isCompletedLogoResult(job: LogoResultCandidate): boolean {
  return job.status === 'completed' && Boolean(job.imageUrl) && job.fileMissing !== true;
}

export function pickLatestCompletedLogoResult<T extends LogoResultCandidate>(
  jobs: T[],
  preferredIds?: string[]
): T | null {
  const completed = jobs.filter(isCompletedLogoResult);
  if (preferredIds?.length) {
    const byId = new Map(completed.map((job) => [job.id, job]));
    for (const id of preferredIds) {
      const hit = byId.get(id);
      if (hit) return hit;
    }
    return null;
  }
  return (
    completed
      .slice()
      .sort((a, b) =>
        String(b.completedAt || b.createdAt || '').localeCompare(String(a.completedAt || a.createdAt || ''))
      )[0] ?? null
  );
}

export function resolveLogoStudioPreview<T extends LogoResultCandidate>(input: {
  selected?: T | null;
  jobs: T[];
  preferredJobIds?: string[];
}): { mode: 'generated' | 'configuration' | 'failed'; job: T | null } {
  if (input.preferredJobIds?.length) {
    const preferredCompleted = pickLatestCompletedLogoResult(input.jobs, input.preferredJobIds);
    if (preferredCompleted) return { mode: 'generated', job: preferredCompleted };
    const preferredFailed = input.jobs.find(
      (candidate) =>
        input.preferredJobIds!.includes(candidate.id) &&
        (candidate.status === 'failed' || candidate.fileMissing === true || !candidate.imageUrl)
    );
    if (preferredFailed) return { mode: 'failed', job: preferredFailed };
  }
  const selectedOk = input.selected && isCompletedLogoResult(input.selected) ? input.selected : null;
  if (selectedOk) return { mode: 'generated', job: selectedOk };
  const latest = pickLatestCompletedLogoResult(input.jobs);
  if (latest) return { mode: 'generated', job: latest };
  return { mode: 'configuration', job: null };
}

export function logoStudioPreviewLabel(mode: 'generated' | 'configuration' | 'failed'): string {
  if (mode === 'generated') return LOGO_GENERATED_RESULT_LABEL;
  if (mode === 'failed') return LOGO_FAILED_PREVIEW_LABEL;
  return LOGO_CONFIG_PREVIEW_LABEL;
}
