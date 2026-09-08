import type { CreatorDNA } from './creator-dna';
import {
  BANNER_PLATFORM_SPECS,
  type BannerGenerationOptions,
  type BannerLayoutPosition,
  type BannerPlatform,
} from './studio';
import { qualityInstructionsForStyle, resolveNexterQualityMode } from './nexter-quality';
import { NEXTER_STUDIO_PATHS } from './nexter';

export const MAX_BANNER_PROMPT_CHARS = 4000;
export const MAX_BANNER_REFERENCES = 2;
export const BANNER_MIN_PX = 256;
export const BANNER_MAX_PX = 2560;
export const BANNER_REFERENCE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const BANNER_OUTPUT_FORMATS = ['png', 'webp', 'jpg'] as const;
export const BANNER_TRANSPARENT_FORMATS = ['png', 'webp'] as const;
export const BANNER_LAYOUT_POSITIONS: BannerLayoutPosition[] = ['left', 'center', 'right'];

export type BannerOutputFormat = (typeof BANNER_OUTPUT_FORMATS)[number];

/** Primary studio presets — dimensions still come from BANNER_PLATFORM_SPECS. */
export const BANNER_STUDIO_PLATFORMS: BannerPlatform[] = [
  'twitch',
  'youtube',
  'tiktok',
  'discord',
  'general',
];

/** Design aid only — not a pixel-perfect crop guarantee. */
export const BANNER_SAFE_AREAS: Record<
  BannerPlatform,
  { hint: string; cropNote: string; insetX: number; insetY: number }
> = {
  twitch: {
    hint: 'Twitch-Header 1200×480. Logo und Name im mittleren Bereich halten.',
    cropNote: 'Safe Area ist eine Designhilfe, kein pixelgenaues Crop-Versprechen.',
    insetX: 0.08,
    insetY: 0.14,
  },
  youtube: {
    hint: 'YouTube schneidet links/rechts auf Mobilgeräten stärker. Wichtige Inhalte zentral halten.',
    cropNote: 'Safe Area ist eine Designhilfe. Desktop- und Mobile-Crop unterscheiden sich — keine Garantie, dass beide identisch aussehen.',
    insetX: 0.22,
    insetY: 0.18,
  },
  tiktok: {
    hint: 'Vertikales 9:16-Banner. Motiv und Text zentral, oben/unten für UI frei lassen.',
    cropNote: 'Safe Area ist eine Designhilfe, kein pixelgenaues Crop-Versprechen.',
    insetX: 0.1,
    insetY: 0.16,
  },
  discord: {
    hint: 'Discord-Banner 16:9. Text und Logo zentriert und gut lesbar halten.',
    cropNote: 'Safe Area ist eine Designhilfe, kein pixelgenaues Crop-Versprechen.',
    insetX: 0.1,
    insetY: 0.12,
  },
  general: {
    hint: 'Allgemeines 16:9-Banner. Wichtige Inhalte mit Rand zur Bildkante halten.',
    cropNote: 'Safe Area ist eine Designhilfe, kein pixelgenaues Crop-Versprechen.',
    insetX: 0.08,
    insetY: 0.1,
  },
  kick: {
    hint: 'Kick-Header ähnlich Twitch. Motiv mittig, Seiten nicht überladen.',
    cropNote: 'Safe Area ist eine Designhilfe, kein pixelgenaues Crop-Versprechen.',
    insetX: 0.08,
    insetY: 0.14,
  },
  facebook: {
    hint: 'Facebook-Cover. Name und Logo eher mittig-links, Rand frei lassen.',
    cropNote: 'Safe Area ist eine Designhilfe, kein pixelgenaues Crop-Versprechen.',
    insetX: 0.12,
    insetY: 0.2,
  },
  instagram: {
    hint: 'Quadratisches Instagram-Banner. Motiv zentriert.',
    cropNote: 'Safe Area ist eine Designhilfe, kein pixelgenaues Crop-Versprechen.',
    insetX: 0.08,
    insetY: 0.08,
  },
  x: {
    hint: 'X-Header 3:1. Wichtige Inhalte im mittleren Drittel halten.',
    cropNote: 'Safe Area ist eine Designhilfe, kein pixelgenaues Crop-Versprechen.',
    insetX: 0.12,
    insetY: 0.18,
  },
};

export interface BannerConfig {
  platform: BannerPlatform;
  width: number;
  height: number;
  aspect: string;
  outputFormat: BannerOutputFormat;
  backgroundMode: 'opaque' | 'transparent';
  transparentBackground: boolean;
  title: string;
  subtitle: string;
  style: string;
  colors: string[];
  motif: string;
  logoJobId?: string;
  referenceFileIds: string[];
  logoPosition: BannerLayoutPosition;
  textPosition: BannerLayoutPosition;
  qualityProfile: string;
  safeAreaHint: string;
  cropNote: string;
  prompt?: string;
  summary: string;
}

export interface BannerGenerationSettings {
  type: 'banner';
  config: BannerConfig;
  missing: string[];
  followUpQuestion: string | null;
  convertFromExisting: boolean;
  convertToPlatform?: BannerPlatform;
}

export function bannerSafeArea(platform: BannerPlatform) {
  return BANNER_SAFE_AREAS[platform] ?? BANNER_SAFE_AREAS.general;
}

export function applyBannerPlatformPreset(config: BannerConfig, platform: BannerPlatform): BannerConfig {
  const spec = BANNER_PLATFORM_SPECS[platform];
  const safe = bannerSafeArea(platform);
  const next: BannerConfig = {
    ...config,
    platform,
    width: spec.width,
    height: spec.height,
    aspect: spec.aspect,
    safeAreaHint: safe.hint,
    cropNote: safe.cropNote,
    outputFormat: config.transparentBackground ? 'png' : config.outputFormat,
  };
  next.summary = buildBannerDesignSummary(next);
  return next;
}

export function bannerConfigFromDna(
  dna: Pick<
    CreatorDNA,
    | 'name'
    | 'primaryColors'
    | 'secondaryColors'
    | 'accentColors'
    | 'styleDirection'
    | 'mascot'
    | 'brandingStyle'
    | 'platformOptimization'
  >
): Partial<BannerConfig> {
  const raw = String(dna.platformOptimization?.[0]?.platform ?? '').toLowerCase();
  const platform = (raw in BANNER_PLATFORM_SPECS ? raw : 'twitch') as BannerPlatform;
  return {
    title: dna.name,
    style: dna.brandingStyle || dna.styleDirection,
    colors: [...(dna.primaryColors ?? []), ...(dna.secondaryColors ?? []), ...(dna.accentColors ?? [])]
      .filter(Boolean)
      .slice(0, 4),
    motif: dna.mascot || '',
    platform,
  };
}

export function defaultBannerConfig(overrides?: Partial<BannerConfig>): BannerConfig {
  const platform =
    overrides?.platform && overrides.platform in BANNER_PLATFORM_SPECS ? overrides.platform : 'twitch';
  const spec = BANNER_PLATFORM_SPECS[platform];
  const safe = bannerSafeArea(platform);
  const transparent = overrides?.transparentBackground ?? false;
  const format = overrides?.outputFormat ?? 'png';
  const config: BannerConfig = {
    platform,
    width: overrides?.width ?? spec.width,
    height: overrides?.height ?? spec.height,
    aspect: overrides?.aspect ?? spec.aspect,
    outputFormat: transparent && format === 'jpg' ? 'png' : format,
    backgroundMode: transparent ? 'transparent' : 'opaque',
    transparentBackground: transparent,
    title: overrides?.title?.trim() || '',
    subtitle: overrides?.subtitle?.trim() || '',
    style: overrides?.style || 'cinematic',
    colors: overrides?.colors?.length ? overrides.colors : ['#22d3ee', '#a855f7'],
    motif: overrides?.motif ?? '',
    logoJobId: overrides?.logoJobId,
    referenceFileIds: overrides?.referenceFileIds?.slice(0, MAX_BANNER_REFERENCES) ?? [],
    logoPosition: overrides?.logoPosition ?? 'left',
    textPosition: overrides?.textPosition ?? 'center',
    qualityProfile: overrides?.qualityProfile ?? resolveNexterQualityMode(overrides?.style),
    safeAreaHint: overrides?.safeAreaHint ?? safe.hint,
    cropNote: overrides?.cropNote ?? safe.cropNote,
    prompt: overrides?.prompt,
    summary: '',
  };
  config.summary = buildBannerDesignSummary(config);
  return config;
}

export function validateBannerDimensions(
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
  if (w < BANNER_MIN_PX || h < BANNER_MIN_PX) {
    return { ok: false, message: `Mindestgröße ist ${BANNER_MIN_PX}×${BANNER_MIN_PX} Pixel.` };
  }
  if (w > BANNER_MAX_PX || h > BANNER_MAX_PX) {
    return { ok: false, message: `Maximalgröße ist ${BANNER_MAX_PX}×${BANNER_MAX_PX} Pixel.` };
  }
  return { ok: true, width: w, height: h };
}

export function validateBannerFormat(
  format: unknown,
  transparent: boolean
): { ok: true; format: BannerOutputFormat } | { ok: false; message: string } {
  const raw = String(format ?? 'png').toLowerCase().replace('jpeg', 'jpg');
  if (!BANNER_OUTPUT_FORMATS.includes(raw as BannerOutputFormat)) {
    return { ok: false, message: 'Unterstützte Formate: PNG, WEBP, JPG.' };
  }
  const next = raw as BannerOutputFormat;
  if (transparent && !BANNER_TRANSPARENT_FORMATS.includes(next as (typeof BANNER_TRANSPARENT_FORMATS)[number])) {
    return { ok: false, message: 'Transparenz ist nur mit PNG oder WEBP möglich — nicht mit JPG.' };
  }
  return { ok: true, format: next };
}

export function bannerProviderSize(width: number, height: number): '1024x1024' | '1792x1024' | '1024x1792' {
  if (height > width * 1.15) return '1024x1792';
  if (width > height * 1.15) return '1792x1024';
  return '1024x1024';
}

export function bannerLayoutPrompt(position: BannerLayoutPosition, kind: 'logo' | 'text'): string {
  const slot =
    position === 'left' ? 'left third' : position === 'right' ? 'right third' : 'horizontal center';
  return `${kind} placed in the ${slot}, inside the safe area, not cropped at edges`;
}

export function bannerConfigToGenerationOptions(config: BannerConfig): BannerGenerationOptions {
  return {
    platform: config.platform,
    title: config.title || undefined,
    subtitle: config.subtitle || undefined,
    style: config.style,
    width: config.width,
    height: config.height,
    outputFormat: config.outputFormat,
    transparentBackground: config.transparentBackground,
    logoPosition: config.logoPosition,
    textPosition: config.textPosition,
    sourceLogoJobId: config.logoJobId,
    motif: config.motif || undefined,
  };
}

export function bannerConfigFromGenerationOptions(
  opts: BannerGenerationOptions,
  extras?: Partial<BannerConfig>
): BannerConfig {
  const platform = opts.platform && opts.platform in BANNER_PLATFORM_SPECS ? opts.platform : extras?.platform ?? 'twitch';
  return defaultBannerConfig({
    ...extras,
    platform,
    title: opts.title ?? extras?.title,
    subtitle: opts.subtitle ?? extras?.subtitle,
    style: opts.style ?? extras?.style,
    width: opts.width ?? extras?.width,
    height: opts.height ?? extras?.height,
    outputFormat: opts.outputFormat ?? extras?.outputFormat,
    transparentBackground: opts.transparentBackground ?? extras?.transparentBackground,
    logoPosition: opts.logoPosition ?? extras?.logoPosition,
    textPosition: opts.textPosition ?? extras?.textPosition,
    logoJobId: opts.sourceLogoJobId ?? extras?.logoJobId,
    motif: opts.motif ?? extras?.motif,
  });
}

export function buildBannerDesignSummary(
  config: Pick<
    BannerConfig,
    | 'platform'
    | 'width'
    | 'height'
    | 'title'
    | 'subtitle'
    | 'style'
    | 'colors'
    | 'logoPosition'
    | 'textPosition'
    | 'transparentBackground'
    | 'outputFormat'
    | 'motif'
    | 'logoJobId'
  >
): string {
  const spec = BANNER_PLATFORM_SPECS[config.platform];
  const colors = (config.colors ?? []).filter(Boolean).slice(0, 3);
  const bits = [
    `${spec?.label ?? config.platform}-Banner`,
    `${config.width}×${config.height}`,
    config.logoJobId ? `Logo ${config.logoPosition}` : 'ohne Logo',
    config.title ? `Name ${config.title} ${config.textPosition}` : null,
    config.subtitle ? `Tagline ${config.subtitle}` : null,
    config.motif ? `Motiv ${config.motif}` : null,
    colors.length ? colors.join('/') : null,
    config.style || 'cinematic',
    config.transparentBackground ? 'transparenter Hintergrund' : null,
    String(config.outputFormat || 'png').toUpperCase(),
    'wichtige Inhalte innerhalb der Safe Area',
  ].filter(Boolean);
  return `${bits.join(', ')}.`;
}

export function sanitizeBannerStyleRequest(message: string): string {
  let t = String(message ?? '');
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  t = t.replace(
    /kopiere?\s+(exakt\s+)?(das\s+)?(banner|kanalbanner|header)\s+(von|des)\s+[\w.\-]+/gi,
    'im gleichen visuellen Charakter, ohne fremde Markenzeichen'
  );
  t = t.replace(/exakt(?:es|e)?\s+(?:das\s+)?(?:offizielle\s+)?(?:game-?\s*)?(?:banner|logo)/gi, 'allgemeine visuelle Stimmung');
  t = t.replace(/\bcall[\s-]?of[\s-]?duty\b/gi, 'militärisch-taktische Stimmung');
  t = t.replace(/\bfortnite\b/gi, 'bunte, dynamische Battle-Royale-Stimmung');
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return t.trim().slice(0, MAX_BANNER_PROMPT_CHARS);
}

const PLATFORM_WORDS: Array<[RegExp, BannerPlatform]> = [
  [/\byoutube\b/i, 'youtube'],
  [/\btiktok\b/i, 'tiktok'],
  [/\bdiscord\b/i, 'discord'],
  [/\btwitch\b/i, 'twitch'],
  [/\bkick\b/i, 'kick'],
  [/\binstagram\b/i, 'instagram'],
  [/\bfacebook\b/i, 'facebook'],
  [/\btwitter\b|\bx\b/i, 'x'],
];

function extractBannerTitle(message: string): string | undefined {
  const original = String(message ?? '');
  const quoted = original.match(/[„"]([^"„”\n]{2,40})[“"]/);
  if (quoted?.[1]) return quoted[1].trim();
  const named = original.match(/(?:name[ns]?|heißt|namens)\s+([A-Za-zÄÖÜäöüß0-9][\wÄÖÜäöüß-]{1,39})/i);
  if (named?.[1]) return named[1].trim();
  return undefined;
}

function parseLayoutPosition(message: string, kind: 'logo' | 'text' | 'name'): BannerLayoutPosition | undefined {
  const lower = message.toLowerCase();
  if (kind === 'logo') {
    if (/logo.{0,24}links|links.{0,16}(?:das )?logo/.test(lower) || /setz mein logo links/.test(lower)) return 'left';
    if (/logo.{0,24}rechts|rechts.{0,16}(?:das )?logo/.test(lower)) return 'right';
    if (/logo.{0,24}(mitte|mittig|zentral)/.test(lower)) return 'center';
    return undefined;
  }
  if (/name[ns]?.{0,24}(mitte|mittig|zentral)|in die mitte/.test(lower)) return 'center';
  if (/(?:text|titel|schrift).{0,16}links|name[ns]?.{0,16}links/.test(lower)) return 'left';
  if (/(?:text|titel|schrift).{0,16}rechts|name[ns]?.{0,16}rechts/.test(lower)) return 'right';
  return undefined;
}

export function parseBannerIntent(
  message: string,
  ctx?: {
    dnaName?: string;
    primaryColors?: string[];
    styleDirection?: string;
    mascot?: string;
    lastLogoId?: string;
    lastBannerId?: string;
    preferredPlatform?: string;
  }
): BannerGenerationSettings {
  const original = sanitizeBannerStyleRequest(message);
  const lower = original.toLowerCase();
  const preferred = String(ctx?.preferredPlatform ?? '').toLowerCase();
  const defaultPlatform =
    preferred in BANNER_PLATFORM_SPECS ? (preferred as BannerPlatform) : undefined;

  let config = defaultBannerConfig({
    title: extractBannerTitle(original) || ctx?.dnaName || '',
    colors: ctx?.primaryColors?.length ? ctx.primaryColors.slice(0, 4) : undefined,
    style: ctx?.styleDirection,
    motif: ctx?.mascot,
    platform: defaultPlatform ?? 'twitch',
  });

  let mentionedPlatform: BannerPlatform | undefined;
  for (const [re, platform] of PLATFORM_WORDS) {
    if (re.test(lower)) {
      mentionedPlatform = platform;
      config = applyBannerPlatformPreset(config, platform);
      break;
    }
  }

  const convertMatch = lower.match(
    /aus (?:meinem |dem )?(twitch|youtube|tiktok|discord|kick)[- ]?banner.{0,40}(youtube|twitch|tiktok|discord|kick)[- ]?banner/
  ) || lower.match(/mach daraus einen? (youtube|twitch|tiktok|discord)[- ]?banner/);
  const convertToPlatform = convertMatch
    ? ((convertMatch[2] || convertMatch[1]) as BannerPlatform)
    : undefined;
  const convertFromExisting = Boolean(
    convertToPlatform || /aus meinem .{0,20}banner|passend zu meinem (twitch|youtube)[- ]?banner/.test(lower)
  );
  if (convertToPlatform && convertToPlatform in BANNER_PLATFORM_SPECS) {
    config = applyBannerPlatformPreset(config, convertToPlatform);
    mentionedPlatform = convertToPlatform;
  }

  const logoPos = parseLayoutPosition(lower, 'logo');
  if (logoPos) config.logoPosition = logoPos;
  const textPos = parseLayoutPosition(lower, 'name') || parseLayoutPosition(lower, 'text');
  if (textPos) config.textPosition = textPos;

  const px = lower.match(/(\d{3,4})\s*(?:x|×)\s*(\d{3,4})/);
  if (px) {
    const dims = validateBannerDimensions(Number(px[1]), Number(px[2]));
    if (dims.ok) {
      config.width = dims.width;
      config.height = dims.height;
      config.platform = 'general';
      config.aspect = `${dims.width}:${dims.height}`;
    }
  }

  if (/transparent/i.test(lower)) {
    config.transparentBackground = true;
    config.backgroundMode = 'transparent';
    config.outputFormat = 'png';
  }
  if (/\bjpg\b|\bjpeg\b/.test(lower)) config.outputFormat = 'jpg';
  if (/\bwebp\b/.test(lower)) config.outputFormat = 'webp';
  if (/\bpng\b/.test(lower)) config.outputFormat = 'png';

  if (/blau|blue/.test(lower) && !config.colors.includes('#1E40AF')) {
    config.colors = ['#1E40AF', ...config.colors].slice(0, 4);
  }
  if (/violett|lila|purple/.test(lower)) {
    config.colors = [...config.colors.filter((c) => c !== '#7C3AED'), '#7C3AED'].slice(0, 4);
  }
  if (/dunkler|aggressiv|cinematic/.test(lower)) {
    config.style = /aggressiv/.test(lower) ? 'esports' : config.style || 'cinematic';
  }

  if ((/passend zu meinem logo|mit meinem logo|mein vorhandenes logo/.test(lower) || /logo links|logo in/.test(lower)) && ctx?.lastLogoId) {
    config.logoJobId = ctx.lastLogoId;
  }

  const fmt = validateBannerFormat(config.outputFormat, config.transparentBackground);
  if (fmt.ok) config.outputFormat = fmt.format;
  else if (config.transparentBackground) config.outputFormat = 'png';

  config.prompt = original.slice(0, MAX_BANNER_PROMPT_CHARS);
  config.qualityProfile = resolveNexterQualityMode(config.style);
  config.summary = buildBannerDesignSummary(config);

  const missing: string[] = [];
  if (!mentionedPlatform && !convertToPlatform && !defaultPlatform) missing.push('platform');
  const followUpQuestion = missing.includes('platform')
    ? 'Für welches Banner — Twitch, YouTube, TikTok oder Discord? Logo ist optional, DNA-Farben übernehme ich als Defaults.'
    : null;

  return {
    type: 'banner',
    config,
    missing,
    followUpQuestion,
    convertFromExisting,
    convertToPlatform,
  };
}

export function bannerNeedsFollowUp(
  message: string,
  ctx?: { hasDna?: boolean; dnaName?: string; preferredPlatform?: string; lastBannerId?: string }
): boolean {
  const lower = String(message ?? '').toLowerCase();
  if (!/\bbanner\b/.test(lower)) return false;
  if (/öffne|open|geh(e)? zu/.test(lower)) return false;
  if (/dunkler|heller|kleiner|größer|aggressiv|änder|variante/.test(lower) && (ctx?.lastBannerId || /mein(em)? banner/.test(lower))) {
    return false;
  }
  const parsed = parseBannerIntent(message, {
    dnaName: ctx?.dnaName,
    preferredPlatform: ctx?.preferredPlatform,
  });
  return parsed.missing.includes('platform');
}

export function applyBannerChangeRequest(config: BannerConfig, request: string): BannerConfig {
  const parsed = parseBannerIntent(request, {
    dnaName: config.title,
    primaryColors: config.colors,
    styleDirection: config.style,
    mascot: config.motif,
  });
  const lower = request.toLowerCase();
  const next: BannerConfig = { ...config };
  if (parsed.convertToPlatform) {
    Object.assign(next, applyBannerPlatformPreset(next, parsed.convertToPlatform));
  }
  if (/logo kleiner/.test(lower)) {
    next.prompt = `${next.prompt ?? ''} Smaller logo, more margin around the mark.`.trim();
  }
  if (/name größer|text größer|schrift größer/.test(lower)) {
    next.prompt = `${next.prompt ?? ''} Larger, more readable creator name.`.trim();
  }
  if (/hintergrund dunkler|dunkler/.test(lower)) {
    next.prompt = `${next.prompt ?? ''} Darker background, richer contrast.`.trim();
  }
  if (/mehr blau|blau/.test(lower)) {
    next.colors = parsed.config.colors;
  }
  if (/weiter rechts|figur.{0,12}rechts/.test(lower)) {
    next.logoPosition = 'right';
    next.prompt = `${next.prompt ?? ''} Motif shifted to the right third, still inside the safe area.`.trim();
  }
  if (/aggressiv/.test(lower)) {
    next.style = 'esports';
  }
  if (/transparent/.test(lower)) {
    next.transparentBackground = true;
    next.backgroundMode = 'transparent';
    next.outputFormat = 'png';
  }
  const logoPos = parseLayoutPosition(lower, 'logo');
  if (logoPos) next.logoPosition = logoPos;
  const textPos = parseLayoutPosition(lower, 'name');
  if (textPos) next.textPosition = textPos;
  const fmt = validateBannerFormat(next.outputFormat, next.transparentBackground);
  if (fmt.ok) next.outputFormat = fmt.format;
  next.prompt = sanitizeBannerStyleRequest(`${next.prompt ?? ''} ${request}`.trim());
  next.qualityProfile = resolveNexterQualityMode(next.style);
  next.summary = buildBannerDesignSummary(next);
  return next;
}

export function bannerDownloadFilename(input: {
  creatorName: string;
  platform: string;
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
      .slice(0, 40) || 'creator';
  const ext = (input.ext || 'png').replace(/[^a-z0-9]/gi, '').slice(0, 4) || 'png';
  const version = Number.isFinite(input.version) && input.version > 0 ? Math.floor(input.version) : 1;
  return `${slug(input.creatorName)}-${slug(input.platform)}-banner-v${version}.${ext}`;
}

export function bannerPromptComposition(config: BannerConfig): string {
  const spec = BANNER_PLATFORM_SPECS[config.platform];
  const safe = bannerSafeArea(config.platform);
  return [
    `exact aspect ${spec.aspect} (${config.width}x${config.height}px)`,
    `keep primary brand marks inside the safe area (${Math.round(safe.insetX * 100)}% side inset, ${Math.round(safe.insetY * 100)}% vertical inset)`,
    bannerLayoutPrompt(config.logoPosition, 'logo'),
    bannerLayoutPrompt(config.textPosition, 'text'),
    config.transparentBackground ? 'transparent background, PNG-ready alpha' : 'opaque banner background',
    safe.cropNote,
  ].join('; ');
}

export function bannerPromptConstraints(config: BannerConfig): string {
  return [
    config.subtitle ? `tagline mood: ${config.subtitle}` : null,
    config.motif ? `motif: ${config.motif}` : null,
    config.logoJobId ? 'integrate the creator’s own logo as a reference, do not invent a third-party brand mark' : 'no third-party logos',
    qualityInstructionsForStyle(config.style),
    'readable at small header sizes, no watermark',
  ]
    .filter(Boolean)
    .join('; ');
}

export function bannerStudioPath(): string {
  return NEXTER_STUDIO_PATHS.banner;
}
