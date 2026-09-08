import type { CreatorDNA } from './creator-dna';
import type { StickerGenerationOptions } from './studio';
import { qualityInstructionsForStyle, resolveNexterQualityMode } from './nexter-quality';
import { NEXTER_STUDIO_PATHS } from './nexter';

export const MAX_STICKER_PROMPT_CHARS = 4000;
export const MAX_STICKER_REFERENCES = 2;
export const MAX_STICKER_TEXT_CHARS = 24;
export const STICKER_MIN_PX = 256;
export const STICKER_MAX_PX = 1024;
export const STICKER_REFERENCE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const STICKER_OUTPUT_FORMATS = ['png', 'webp', 'jpg'] as const;
export const STICKER_TRANSPARENT_FORMATS = ['png', 'webp'] as const;

export type StickerOutputFormat = (typeof STICKER_OUTPUT_FORMATS)[number];
export type StickerKind = 'sticker' | 'badge' | 'emote';
export type StickerPlatform = 'twitch' | 'tiktok' | 'youtube' | 'discord' | 'general' | 'custom';
export type StickerShape = NonNullable<StickerGenerationOptions['shape']>;
export type StickerOutline = 'none' | 'thin' | 'medium' | 'thick';
export type StickerSizePreset = 'small' | 'standard' | 'custom';

export const STICKER_KINDS: StickerKind[] = ['sticker', 'badge', 'emote'];
export const STICKER_SHAPES: StickerShape[] = ['circle', 'square', 'die-cut'];
export const STICKER_OUTLINES: StickerOutline[] = ['none', 'thin', 'medium', 'thick'];
export const STICKER_SIZE_PRESETS: Record<Exclude<StickerSizePreset, 'custom'>, { width: number; height: number; label: string }> =
  {
    small: { width: 512, height: 512, label: 'Klein 512' },
    standard: { width: 1024, height: 1024, label: 'Standard 1024' },
  };

export const STICKER_PLATFORM_SPECS: Record<
  StickerPlatform,
  { label: string; defaultSize: Exclude<StickerSizePreset, 'custom'>; defaultKind: StickerKind }
> = {
  twitch: { label: 'Twitch', defaultSize: 'standard', defaultKind: 'emote' },
  tiktok: { label: 'TikTok', defaultSize: 'standard', defaultKind: 'sticker' },
  youtube: { label: 'YouTube', defaultSize: 'standard', defaultKind: 'sticker' },
  discord: { label: 'Discord', defaultSize: 'standard', defaultKind: 'sticker' },
  general: { label: 'Allgemein', defaultSize: 'standard', defaultKind: 'sticker' },
  custom: { label: 'Custom', defaultSize: 'standard', defaultKind: 'sticker' },
};

export const STICKER_STUDIO_PLATFORMS: StickerPlatform[] = [
  'twitch',
  'tiktok',
  'youtube',
  'discord',
  'general',
  'custom',
];

export interface StickerConfig {
  kind: StickerKind;
  platform: StickerPlatform;
  width: number;
  height: number;
  sizePreset: StickerSizePreset;
  format: StickerOutputFormat;
  transparentBackground: boolean;
  shape: StickerShape;
  outline: StickerOutline;
  text: string;
  motif: string;
  colors: string[];
  style: string;
  multicolor: boolean;
  logoJobId?: string;
  logoAssetId?: string;
  referenceAssetIds: string[];
  qualityProfile: string;
  prompt?: string;
  summary: string;
  requestedCount: number;
}

export interface StickerGenerationSettings {
  type: 'sticker';
  config: StickerConfig;
  missing: string[];
  followUpQuestion: string | null;
  requestedCount: number;
}

export function stickerKindLabel(kind: StickerKind): string {
  if (kind === 'badge') return 'Badge';
  if (kind === 'emote') return 'Emote';
  return 'Sticker';
}

export function stickerShapeLabel(shape: StickerShape): string {
  if (shape === 'circle') return 'Kreis';
  if (shape === 'die-cut') return 'Freigestellt';
  return 'Quadrat';
}

export function stickerOutlineLabel(outline: StickerOutline): string {
  if (outline === 'thin') return 'dünner Rand';
  if (outline === 'thick') return 'dicker Rand';
  if (outline === 'none') return 'ohne Rand';
  return 'mittlerer Rand';
}

export function validateStickerDimensions(
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
  if (w < STICKER_MIN_PX || h < STICKER_MIN_PX) {
    return { ok: false, message: `Mindestgröße ist ${STICKER_MIN_PX}×${STICKER_MIN_PX} Pixel.` };
  }
  if (w > STICKER_MAX_PX || h > STICKER_MAX_PX) {
    return { ok: false, message: `Maximalgröße ist ${STICKER_MAX_PX}×${STICKER_MAX_PX} Pixel.` };
  }
  return { ok: true, width: w, height: h };
}

export function validateStickerFormat(
  format: unknown,
  transparent: boolean
): { ok: true; format: StickerOutputFormat } | { ok: false; message: string } {
  const raw = String(format ?? 'png').toLowerCase().replace('jpeg', 'jpg');
  if (!STICKER_OUTPUT_FORMATS.includes(raw as StickerOutputFormat)) {
    return { ok: false, message: 'Unterstützte Formate: PNG, WEBP, JPG.' };
  }
  const next = raw as StickerOutputFormat;
  if (transparent && !STICKER_TRANSPARENT_FORMATS.includes(next as (typeof STICKER_TRANSPARENT_FORMATS)[number])) {
    return { ok: false, message: 'Transparenz ist nur mit PNG oder WEBP möglich — nicht mit JPG.' };
  }
  return { ok: true, format: next };
}

export function validateStickerText(text: unknown): { ok: true; text: string } | { ok: false; message: string } {
  if (text == null) return { ok: true, text: '' };
  if (typeof text !== 'string') return { ok: false, message: 'Sticker-Text muss eine Zeichenkette sein.' };
  const cleaned = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim();
  if (cleaned.length > MAX_STICKER_TEXT_CHARS) {
    return { ok: false, message: `Sticker-Text darf höchstens ${MAX_STICKER_TEXT_CHARS} Zeichen haben.` };
  }
  return { ok: true, text: cleaned };
}

export function stickerProviderSize(): '1024x1024' {
  return '1024x1024';
}

export function applyStickerPlatformPreset(config: StickerConfig, platform: StickerPlatform): StickerConfig {
  const spec = STICKER_PLATFORM_SPECS[platform];
  const size = STICKER_SIZE_PRESETS[spec.defaultSize];
  const next: StickerConfig = {
    ...config,
    platform,
    kind: config.kind || spec.defaultKind,
    sizePreset: spec.defaultSize,
    width: size.width,
    height: size.height,
  };
  next.summary = buildStickerDesignSummary(next);
  return next;
}

export function applyStickerSizePreset(config: StickerConfig, preset: StickerSizePreset): StickerConfig {
  if (preset === 'custom') {
    return { ...config, sizePreset: 'custom', summary: buildStickerDesignSummary({ ...config, sizePreset: 'custom' }) };
  }
  const size = STICKER_SIZE_PRESETS[preset];
  const next: StickerConfig = {
    ...config,
    sizePreset: preset,
    width: size.width,
    height: size.height,
  };
  next.summary = buildStickerDesignSummary(next);
  return next;
}

export function stickerConfigFromDna(
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
): Partial<StickerConfig> {
  const raw = String(dna.platformOptimization?.[0]?.platform ?? '').toLowerCase();
  const platform: StickerPlatform =
    raw === 'tiktok'
      ? 'tiktok'
      : raw === 'youtube'
        ? 'youtube'
        : raw === 'discord'
          ? 'discord'
          : raw === 'twitch'
            ? 'twitch'
            : 'general';
  return {
    style: dna.brandingStyle || dna.styleDirection || 'gaming',
    colors: [...(dna.primaryColors ?? []), ...(dna.secondaryColors ?? []), ...(dna.accentColors ?? [])]
      .filter(Boolean)
      .slice(0, 4),
    motif: dna.mascot || '',
    platform,
  };
}

export function defaultStickerConfig(overrides?: Partial<StickerConfig>): StickerConfig {
  const platform =
    overrides?.platform && overrides.platform in STICKER_PLATFORM_SPECS ? overrides.platform : 'twitch';
  const spec = STICKER_PLATFORM_SPECS[platform];
  const sizePreset: StickerSizePreset =
    overrides?.sizePreset && overrides.sizePreset !== 'custom' && overrides.sizePreset in STICKER_SIZE_PRESETS
      ? overrides.sizePreset
      : overrides?.sizePreset === 'custom'
        ? 'custom'
        : spec.defaultSize;
  const preset = sizePreset === 'custom' ? STICKER_SIZE_PRESETS[spec.defaultSize] : STICKER_SIZE_PRESETS[sizePreset];
  const width = overrides?.width ?? preset.width;
  const height = overrides?.height ?? preset.height;
  const transparent = overrides?.transparentBackground ?? true;
  const format = overrides?.format ?? 'png';
  const text = typeof overrides?.text === 'string' ? overrides.text : '';
  const config: StickerConfig = {
    kind: overrides?.kind ?? spec.defaultKind,
    platform,
    width,
    height,
    sizePreset,
    format: transparent && format === 'jpg' ? 'png' : format,
    transparentBackground: transparent,
    shape: overrides?.shape ?? (overrides?.kind === 'badge' ? 'circle' : 'square'),
    outline: overrides?.outline ?? 'medium',
    text,
    motif: overrides?.motif ?? '',
    colors: overrides?.colors?.length ? overrides.colors : ['#22d3ee', '#a855f7'],
    style: overrides?.style || 'gaming',
    multicolor: overrides?.multicolor ?? true,
    logoJobId: overrides?.logoJobId,
    logoAssetId: overrides?.logoAssetId,
    referenceAssetIds: overrides?.referenceAssetIds?.slice(0, MAX_STICKER_REFERENCES) ?? [],
    qualityProfile: overrides?.qualityProfile ?? resolveNexterQualityMode(overrides?.style || 'gaming'),
    prompt: overrides?.prompt,
    summary: '',
    requestedCount: Math.max(1, Math.min(12, overrides?.requestedCount ?? 1)),
  };
  if (config.format === 'jpg') config.transparentBackground = false;
  config.summary = buildStickerDesignSummary(config);
  return config;
}

export function stickerConfigToGenerationOptions(config: StickerConfig): StickerGenerationOptions {
  return {
    name: config.text || stickerKindLabel(config.kind),
    style: config.style,
    multicolor: config.multicolor,
    shape: config.shape,
    transparentBackground: config.transparentBackground,
    kind: config.kind,
    platform: config.platform,
    width: config.width,
    height: config.height,
    outputFormat: config.format,
    outline: config.outline,
    text: config.text,
    motif: config.motif || undefined,
    sourceLogoJobId: config.logoJobId,
  };
}

export function stickerConfigFromGenerationOptions(
  opts: StickerGenerationOptions,
  extras?: Partial<StickerConfig>
): StickerConfig {
  const platform =
    opts.platform && opts.platform in STICKER_PLATFORM_SPECS ? opts.platform : extras?.platform ?? 'twitch';
  return defaultStickerConfig({
    ...extras,
    platform,
    kind: opts.kind ?? extras?.kind,
    style: opts.style ?? extras?.style,
    shape: opts.shape ?? extras?.shape,
    transparentBackground: opts.transparentBackground ?? extras?.transparentBackground,
    width: opts.width ?? extras?.width,
    height: opts.height ?? extras?.height,
    format: opts.outputFormat ?? extras?.format,
    outline: opts.outline ?? extras?.outline,
    text: opts.text ?? extras?.text,
    motif: opts.motif ?? extras?.motif,
    logoJobId: opts.sourceLogoJobId ?? extras?.logoJobId,
    multicolor: opts.multicolor ?? extras?.multicolor,
  });
}

export function buildStickerDesignSummary(config: StickerConfig): string {
  const parts = [
    config.transparentBackground ? 'Transparenter' : 'Opaker',
    STICKER_PLATFORM_SPECS[config.platform].label,
    stickerKindLabel(config.kind),
    `${config.width}×${config.height}`,
    stickerShapeLabel(config.shape),
    config.motif ? `Motiv ${config.motif}` : null,
    config.colors.slice(0, 2).join('/'),
    stickerOutlineLabel(config.outline),
    config.text ? `Text ${config.text}` : 'ohne Text',
  ].filter(Boolean);
  return parts.join(', ') + '.';
}

export function sanitizeStickerStyleRequest(message: string): string {
  let t = String(message ?? '');
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  t = t.replace(
    /kopiere?\s+(exakt\s+)?(das\s+|den\s+)?(sticker|emote|badge)\s+(von|des)\s+[\w.\-]+/gi,
    'im gleichen visuellen Charakter, ohne fremde Streamer-Sticker oder Markenzeichen'
  );
  t = t.replace(/\bxqc\b|\bpokimane\b|\bninja\b|\bshroud\b/gi, 'allgemeiner Creator-Look');
  return t.trim().slice(0, MAX_STICKER_PROMPT_CHARS);
}

const PLATFORM_WORDS: Array<[RegExp, StickerPlatform]> = [
  [/\btiktok\b/i, 'tiktok'],
  [/\bdiscord\b/i, 'discord'],
  [/\byoutube\b/i, 'youtube'],
  [/\btwitch\b/i, 'twitch'],
];

function parseKind(lower: string): StickerKind | undefined {
  if (/\bbadge\b/.test(lower)) return 'badge';
  if (/\bemote\b/.test(lower)) return 'emote';
  if (/\bsticker\b/.test(lower)) return 'sticker';
  return undefined;
}

function parseCount(lower: string): number {
  const m = lower.match(
    /\b(\d{1,2})\s*(?:tiktok[- ]|twitch[- ]|discord[- ]|youtube[- ])?(sticker|emotes?|badges?)\b/
  );
  if (m) return Math.max(1, Math.min(12, Number(m[1])));
  if (/\b(sechs|6er)\b/.test(lower) && /\bsticker|emote|badge/.test(lower)) return 6;
  return 1;
}

export function parseStickerIntent(
  message: string,
  ctx?: {
    dnaName?: string;
    primaryColors?: string[];
    styleDirection?: string;
    mascot?: string;
    lastLogoId?: string;
    lastStickerId?: string;
    preferredPlatform?: string;
  }
): StickerGenerationSettings {
  const original = sanitizeStickerStyleRequest(message);
  const lower = original.toLowerCase();
  const preferred = String(ctx?.preferredPlatform ?? '').toLowerCase();
  const defaultPlatform: StickerPlatform | undefined =
    preferred === 'tiktok'
      ? 'tiktok'
      : preferred === 'youtube'
        ? 'youtube'
        : preferred === 'discord'
          ? 'discord'
          : preferred === 'twitch'
            ? 'twitch'
            : undefined;

  let config = defaultStickerConfig({
    colors: ctx?.primaryColors?.length ? ctx.primaryColors.slice(0, 4) : undefined,
    style: ctx?.styleDirection,
    motif: ctx?.mascot,
    platform: defaultPlatform ?? 'twitch',
  });

  let mentionedPlatform: StickerPlatform | undefined;
  for (const [re, platform] of PLATFORM_WORDS) {
    if (re.test(lower)) {
      mentionedPlatform = platform;
      config = applyStickerPlatformPreset(config, platform);
      break;
    }
  }

  const kind = parseKind(lower);
  if (kind) config.kind = kind;
  if (kind === 'badge' && !/\bkreis|circle|quadrat|square/.test(lower)) config.shape = 'circle';
  if (kind === 'emote' && !/\bkreis|circle/.test(lower)) config.shape = 'square';

  if (/\bkreis|circle/.test(lower)) config.shape = 'circle';
  if (/\bquadrat|square/.test(lower)) config.shape = 'square';
  if (/die[- ]?cut|freigestellt/.test(lower)) config.shape = 'die-cut';

  if (/ohne rand|no outline|kein rand/.test(lower)) config.outline = 'none';
  else if (/weißer rand|weissen rand|weißen rand|white (outline|border)|mittlerer rand/.test(lower)) config.outline = 'medium';
  else if (/dünn|thin/.test(lower)) config.outline = 'thin';
  else if (/dick|thick|dicker rand/.test(lower)) config.outline = 'thick';

  if (/transparent/.test(lower)) {
    config.transparentBackground = true;
    config.format = 'png';
  }
  if (/\bjpg\b|\bjpeg\b/.test(lower)) config.format = 'jpg';
  if (/\bwebp\b/.test(lower)) config.format = 'webp';
  if (/\bpng\b/.test(lower)) config.format = 'png';

  if (/klein|512/.test(lower)) config = applyStickerSizePreset(config, 'small');
  if (/1024|standard/.test(lower) && !/klein|512/.test(lower)) config = applyStickerSizePreset(config, 'standard');

  const textMatch =
    lower.match(/\b(gg|live|hype|lol|omg|brb|w|l)\b/) ||
    original.match(/text\s+[„"]([^"„”]{1,24})[""”]/i) ||
    original.match(/\b(?:badge|sticker|emote)\s+([A-Z]{2,8})\b/);
  if (textMatch) {
    const rawText = textMatch[1] ?? textMatch[0];
    const checked = validateStickerText(rawText);
    if (checked.ok) config.text = checked.text.toUpperCase();
  }
  if (/ohne text|text entfernen|kein text/.test(lower)) config.text = '';

  if (/blau|blue/.test(lower) && !config.colors.includes('#1E40AF')) {
    config.colors = ['#1E40AF', ...config.colors].slice(0, 4);
  }
  if (/violett|lila|purple/.test(lower)) {
    config.colors = [...config.colors.filter((c) => c !== '#7C3AED'), '#7C3AED'].slice(0, 4);
  }

  if ((/passend zu meinem logo|mit meinem logo|mein logo/.test(lower) || /zu meinem logo/.test(lower)) && ctx?.lastLogoId) {
    config.logoJobId = ctx.lastLogoId;
    config.logoAssetId = ctx.lastLogoId;
  }
  if (/ohne logo|kein logo/.test(lower)) {
    config.logoJobId = undefined;
    config.logoAssetId = undefined;
  }

  const px = lower.match(/(\d{3,4})\s*(?:x|×)\s*(\d{3,4})/);
  if (px) {
    const dims = validateStickerDimensions(Number(px[1]), Number(px[2]));
    if (dims.ok) {
      config.width = dims.width;
      config.height = dims.height;
      config.sizePreset = 'custom';
    }
  }

  const fmt = validateStickerFormat(config.format, config.transparentBackground);
  if (fmt.ok) config.format = fmt.format;
  else if (config.transparentBackground) config.format = 'png';
  if (config.format === 'jpg') config.transparentBackground = false;

  config.requestedCount = parseCount(lower);
  config.prompt = original.slice(0, MAX_STICKER_PROMPT_CHARS);
  config.qualityProfile = resolveNexterQualityMode(config.style || 'gaming');
  config.summary = buildStickerDesignSummary(config);

  const missing: string[] = [];
  if (!mentionedPlatform && !defaultPlatform) missing.push('platform');
  if (config.requestedCount > 1) missing.push('batch');
  const followUpQuestion = missing.includes('batch')
    ? `Ich starte nicht automatisch ${config.requestedCount} kostenpflichtige Jobs. Soll ich zuerst einen ${stickerKindLabel(config.kind)} für ${STICKER_PLATFORM_SPECS[config.platform].label} anbieten?`
    : missing.includes('platform')
      ? 'Sticker, Badge oder Emote — und für welche Plattform (Twitch, TikTok, YouTube, Discord)? Logo ist optional. DNA-Farben übernehme ich als Defaults, wenn vorhanden.'
      : null;

  return {
    type: 'sticker',
    config,
    missing,
    followUpQuestion,
    requestedCount: config.requestedCount,
  };
}

export function stickerNeedsFollowUp(
  message: string,
  ctx?: { hasDna?: boolean; dnaName?: string; preferredPlatform?: string; lastStickerId?: string }
): boolean {
  const lower = String(message ?? '').toLowerCase();
  if (!/\bsticker|emote|\bbadge\b/.test(lower)) return false;
  if (/öffne|open|geh(e)? zu/.test(lower)) return false;
  if (
    /kleiner|größer|änder|variante|mehr blau|transparent|rand|text/.test(lower) &&
    (ctx?.lastStickerId || /mein(em)? (sticker|emote|badge)/.test(lower))
  ) {
    return false;
  }
  const parsed = parseStickerIntent(message, {
    dnaName: ctx?.dnaName,
    preferredPlatform: ctx?.preferredPlatform,
  });
  return parsed.missing.includes('platform') || parsed.missing.includes('batch');
}

export function applyStickerChangeRequest(config: StickerConfig, request: string): StickerConfig {
  const parsed = parseStickerIntent(request, {
    primaryColors: config.colors,
    styleDirection: config.style,
    mascot: config.motif,
  });
  const lower = request.toLowerCase();
  let next: StickerConfig = { ...config };
  if (parsed.config.kind && /\bbadge|emote|sticker/.test(lower)) next.kind = parsed.config.kind;
  if (parsed.config.shape && /kreis|quadrat|die[- ]?cut|circle|square/.test(lower)) next.shape = parsed.config.shape;
  if (/ohne rand|kein rand/.test(lower)) next.outline = 'none';
  else if (/rand dicker|dicker rand|dick/.test(lower)) next.outline = 'thick';
  else if (/dünn|thin/.test(lower)) next.outline = 'thin';
  else if (/weißer rand|mittlerer rand/.test(lower)) next.outline = 'medium';
  if (/figur kleiner|kleiner/.test(lower)) next.motif = next.motif ? `${next.motif}, smaller subject` : 'smaller subject';
  if (/mehr blau|blau/.test(lower)) next.colors = parsed.config.colors;
  if (/transparent/.test(lower)) {
    next.transparentBackground = true;
    next.format = 'png';
  }
  if (/ohne text|text entfernen/.test(lower)) next.text = '';
  else if (parsed.config.text && parsed.config.text !== config.text) next.text = parsed.config.text;
  const fmt = validateStickerFormat(next.format, next.transparentBackground);
  if (fmt.ok) next.format = fmt.format;
  next.prompt = sanitizeStickerStyleRequest(`${next.prompt ?? ''} ${request}`.trim());
  next.qualityProfile = resolveNexterQualityMode(next.style);
  next.summary = buildStickerDesignSummary(next);
  return next;
}

export function stickerDownloadFilename(input: {
  creatorName: string;
  platform: string;
  kind?: string;
  text?: string;
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
  const text = input.text ? `-${slug(input.text)}` : '';
  const kind = slug(input.kind || 'sticker');
  return `${slug(input.creatorName)}-${slug(input.platform)}${text}-${kind}-v${version}.${ext}`;
}

export function stickerPromptComposition(config: StickerConfig): string {
  return [
    `exact square canvas ${config.width}x${config.height}px`,
    `${stickerKindLabel(config.kind)} for ${STICKER_PLATFORM_SPECS[config.platform].label}`,
    `shape ${stickerShapeLabel(config.shape)}`,
    config.transparentBackground
      ? 'MAIN SUBJECT isolated cutout; CONTOUR/OUTLINE around the motif only; BACKGROUND fully transparent alpha 0, never fill with scenery'
      : 'opaque badge background allowed, still keep the motif centered',
    config.outline === 'none' ? 'no extra outline' : `${stickerOutlineLabel(config.outline)} around the cutout`,
    config.text ? `optional short text "${config.text}" integrated as badge lettering, not a paragraph` : 'no lettering unless a tiny brand mark',
    config.logoJobId ? 'use the creator’s own logo as reference, never invent another streamer’s mark' : 'no third-party logos',
  ].join('; ');
}

export function stickerPromptConstraints(config: StickerConfig): string {
  return [
    config.motif ? `motif: ${config.motif}` : null,
    config.multicolor !== false ? 'multicolor vibrant but readable at emoji size' : 'limited color palette',
    qualityInstructionsForStyle(config.style),
    'die-cut sticker/emote, no watermark, not a photo of a phone screen',
  ]
    .filter(Boolean)
    .join('; ');
}

export function stickerStudioPath(): string {
  return NEXTER_STUDIO_PATHS.sticker;
}
