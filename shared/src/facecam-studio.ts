import type { CreatorDNA } from './creator-dna';
import type { FacecamGenerationOptions } from './studio';
import { qualityInstructionsForStyle, resolveNexterQualityMode } from './nexter-quality';
import { NEXTER_STUDIO_PATHS } from './nexter';

export const MAX_FACECAM_PROMPT_CHARS = 4000;
export const MAX_FACECAM_REFERENCES = 2;
export const FACECAM_MIN_PX = 256;
export const FACECAM_MAX_PX = 2560;
export const FACECAM_REFERENCE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const FACECAM_OUTPUT_FORMATS = ['png', 'webp', 'jpg'] as const;
export const FACECAM_TRANSPARENT_FORMATS = ['png', 'webp'] as const;

export type FacecamOutputFormat = (typeof FACECAM_OUTPUT_FORMATS)[number];
export type FacecamPlatform = 'twitch' | 'tiktok' | 'youtube' | 'general' | 'custom';
export type FacecamAspectRatio = '16:9' | '4:3' | '1:1' | '9:16' | 'custom';
export type FacecamFrameShape = 'rectangle' | 'rounded' | 'circle' | 'hexagon' | 'stylized';
export type FacecamFrameThickness = 'thin' | 'medium' | 'thick';
export type FacecamLogoPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

/** Aspect presets that map to real pixel sizes. 17:9 is not in this product. */
export const FACECAM_ASPECT_PRESETS: Record<
  Exclude<FacecamAspectRatio, 'custom'>,
  { width: number; height: number; label: string }
> = {
  '16:9': { width: 1920, height: 1080, label: '16:9' },
  '4:3': { width: 1440, height: 1080, label: '4:3' },
  '1:1': { width: 1080, height: 1080, label: '1:1' },
  '9:16': { width: 1080, height: 1920, label: '9:16 / TikTok' },
};

export const FACECAM_PLATFORM_SPECS: Record<
  FacecamPlatform,
  { label: string; defaultAspect: Exclude<FacecamAspectRatio, 'custom'> }
> = {
  twitch: { label: 'Twitch', defaultAspect: '16:9' },
  tiktok: { label: 'TikTok', defaultAspect: '9:16' },
  youtube: { label: 'YouTube', defaultAspect: '16:9' },
  general: { label: 'OBS / Allgemein', defaultAspect: '16:9' },
  custom: { label: 'Custom', defaultAspect: '16:9' },
};

export const FACECAM_STUDIO_PLATFORMS: FacecamPlatform[] = ['twitch', 'tiktok', 'youtube', 'general', 'custom'];
export const FACECAM_ASPECT_OPTIONS: FacecamAspectRatio[] = ['16:9', '4:3', '1:1', '9:16', 'custom'];
export const FACECAM_FRAME_SHAPES: FacecamFrameShape[] = ['rectangle', 'rounded', 'circle', 'hexagon', 'stylized'];
export const FACECAM_FRAME_THICKNESSES: FacecamFrameThickness[] = ['thin', 'medium', 'thick'];
export const FACECAM_LOGO_POSITIONS: FacecamLogoPosition[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'center',
];

export interface FacecamConfig {
  platform: FacecamPlatform;
  width: number;
  height: number;
  aspectRatio: FacecamAspectRatio;
  format: FacecamOutputFormat;
  transparentBackground: boolean;
  transparentCenter: boolean;
  frameShape: FacecamFrameShape;
  frameThickness: FacecamFrameThickness;
  style: string;
  colors: string[];
  motif: string;
  logoAssetId?: string;
  logoJobId?: string;
  referenceAssetIds: string[];
  logoPosition: FacecamLogoPosition;
  decorations: string;
  qualityProfile: string;
  prompt?: string;
  summary: string;
}

export interface FacecamGenerationSettings {
  type: 'facecam';
  config: FacecamConfig;
  missing: string[];
  followUpQuestion: string | null;
  convertFromExisting: boolean;
  convertToPlatform?: FacecamPlatform;
}

export function facecamThicknessInset(thickness: FacecamFrameThickness): number {
  if (thickness === 'thin') return 0.06;
  if (thickness === 'thick') return 0.16;
  return 0.1;
}

export function applyFacecamAspectPreset(
  config: FacecamConfig,
  aspect: Exclude<FacecamAspectRatio, 'custom'>
): FacecamConfig {
  const spec = FACECAM_ASPECT_PRESETS[aspect];
  const next: FacecamConfig = {
    ...config,
    aspectRatio: aspect,
    width: spec.width,
    height: spec.height,
  };
  next.summary = buildFacecamDesignSummary(next);
  return next;
}

export function applyFacecamPlatformPreset(config: FacecamConfig, platform: FacecamPlatform): FacecamConfig {
  const spec = FACECAM_PLATFORM_SPECS[platform];
  const next = applyFacecamAspectPreset({ ...config, platform }, spec.defaultAspect);
  next.summary = buildFacecamDesignSummary(next);
  return next;
}

export function facecamConfigFromDna(
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
): Partial<FacecamConfig> {
  const raw = String(dna.platformOptimization?.[0]?.platform ?? '').toLowerCase();
  const platform: FacecamPlatform =
    raw === 'tiktok' ? 'tiktok' : raw === 'youtube' ? 'youtube' : raw === 'twitch' ? 'twitch' : 'general';
  return {
    style: dna.brandingStyle || dna.styleDirection || 'gaming',
    colors: [...(dna.primaryColors ?? []), ...(dna.secondaryColors ?? []), ...(dna.accentColors ?? [])]
      .filter(Boolean)
      .slice(0, 4),
    motif: dna.mascot || '',
    platform,
  };
}

export function defaultFacecamConfig(overrides?: Partial<FacecamConfig>): FacecamConfig {
  const platform =
    overrides?.platform && overrides.platform in FACECAM_PLATFORM_SPECS ? overrides.platform : 'twitch';
  const aspectDefault = FACECAM_PLATFORM_SPECS[platform].defaultAspect;
  const aspect: FacecamAspectRatio =
    overrides?.aspectRatio && overrides.aspectRatio !== 'custom' && overrides.aspectRatio in FACECAM_ASPECT_PRESETS
      ? overrides.aspectRatio
      : overrides?.aspectRatio === 'custom'
        ? 'custom'
        : aspectDefault;
  const preset = aspect === 'custom' ? FACECAM_ASPECT_PRESETS[aspectDefault] : FACECAM_ASPECT_PRESETS[aspect];
  const transparent = overrides?.transparentBackground ?? true;
  const format = overrides?.format ?? 'png';
  const config: FacecamConfig = {
    platform,
    width: overrides?.width ?? preset.width,
    height: overrides?.height ?? preset.height,
    aspectRatio: aspect,
    format: transparent && format === 'jpg' ? 'png' : format,
    transparentBackground: transparent,
    transparentCenter: overrides?.transparentCenter ?? true,
    frameShape: overrides?.frameShape ?? 'rectangle',
    frameThickness: overrides?.frameThickness ?? 'medium',
    style: overrides?.style || 'gaming',
    colors: overrides?.colors?.length ? overrides.colors : ['#22d3ee', '#a855f7'],
    motif: overrides?.motif ?? '',
    logoAssetId: overrides?.logoAssetId,
    logoJobId: overrides?.logoJobId,
    referenceAssetIds: overrides?.referenceAssetIds?.slice(0, MAX_FACECAM_REFERENCES) ?? [],
    logoPosition: overrides?.logoPosition ?? 'bottom-right',
    decorations: overrides?.decorations ?? '',
    qualityProfile: overrides?.qualityProfile ?? resolveNexterQualityMode(overrides?.style || 'gaming'),
    prompt: overrides?.prompt,
    summary: '',
  };
  if (config.format === 'jpg') {
    config.transparentBackground = false;
    config.transparentCenter = false;
  }
  config.summary = buildFacecamDesignSummary(config);
  return config;
}

export function validateFacecamDimensions(
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
  if (w < FACECAM_MIN_PX || h < FACECAM_MIN_PX) {
    return { ok: false, message: `Mindestgröße ist ${FACECAM_MIN_PX}×${FACECAM_MIN_PX} Pixel.` };
  }
  if (w > FACECAM_MAX_PX || h > FACECAM_MAX_PX) {
    return { ok: false, message: `Maximalgröße ist ${FACECAM_MAX_PX}×${FACECAM_MAX_PX} Pixel.` };
  }
  return { ok: true, width: w, height: h };
}

export function validateFacecamFormat(
  format: unknown,
  transparent: boolean
): { ok: true; format: FacecamOutputFormat } | { ok: false; message: string } {
  const raw = String(format ?? 'png').toLowerCase().replace('jpeg', 'jpg');
  if (!FACECAM_OUTPUT_FORMATS.includes(raw as FacecamOutputFormat)) {
    return { ok: false, message: 'Unterstützte Formate: PNG, WEBP, JPG.' };
  }
  const next = raw as FacecamOutputFormat;
  if (transparent && !FACECAM_TRANSPARENT_FORMATS.includes(next as (typeof FACECAM_TRANSPARENT_FORMATS)[number])) {
    return { ok: false, message: 'Transparenz ist nur mit PNG oder WEBP möglich — nicht mit JPG.' };
  }
  return { ok: true, format: next };
}

export function facecamProviderSize(width: number, height: number): '1024x1024' | '1792x1024' | '1024x1792' {
  if (height > width * 1.15) return '1024x1792';
  if (width > height * 1.15) return '1792x1024';
  return '1024x1024';
}

export function facecamConfigToGenerationOptions(config: FacecamConfig): FacecamGenerationOptions {
  return {
    style: config.style,
    shape: config.frameShape === 'rounded' || config.frameShape === 'stylized' ? config.frameShape : config.frameShape,
    animated: false,
    transparentBackground: config.transparentBackground,
    platform: config.platform,
    width: config.width,
    height: config.height,
    aspectRatio: config.aspectRatio,
    outputFormat: config.format,
    frameShape: config.frameShape,
    frameThickness: config.frameThickness,
    sourceLogoJobId: config.logoJobId,
    logoPosition: config.logoPosition,
    motif: config.motif || undefined,
    decorations: config.decorations || undefined,
    transparentCenter: config.transparentCenter,
  };
}

export function facecamConfigFromGenerationOptions(
  opts: FacecamGenerationOptions,
  extras?: Partial<FacecamConfig>
): FacecamConfig {
  const platform =
    opts.platform && opts.platform in FACECAM_PLATFORM_SPECS
      ? opts.platform
      : extras?.platform ?? 'twitch';
  const shape = opts.frameShape ?? opts.shape ?? extras?.frameShape;
  return defaultFacecamConfig({
    ...extras,
    platform,
    style: opts.style ?? extras?.style,
    frameShape: shape,
    transparentBackground: opts.transparentBackground ?? extras?.transparentBackground,
    width: opts.width ?? extras?.width,
    height: opts.height ?? extras?.height,
    aspectRatio: opts.aspectRatio ?? extras?.aspectRatio,
    format: opts.outputFormat ?? extras?.format,
    frameThickness: opts.frameThickness ?? extras?.frameThickness,
    logoJobId: opts.sourceLogoJobId ?? extras?.logoJobId,
    logoPosition: opts.logoPosition ?? extras?.logoPosition,
    motif: opts.motif ?? extras?.motif,
    decorations: opts.decorations ?? extras?.decorations,
    transparentCenter: opts.transparentCenter ?? extras?.transparentCenter,
  });
}

export function buildFacecamDesignSummary(
  config: Pick<
    FacecamConfig,
    | 'platform'
    | 'width'
    | 'height'
    | 'aspectRatio'
    | 'frameShape'
    | 'frameThickness'
    | 'style'
    | 'colors'
    | 'logoPosition'
    | 'transparentBackground'
    | 'transparentCenter'
    | 'format'
    | 'motif'
    | 'logoJobId'
    | 'decorations'
  >
): string {
  const platform = FACECAM_PLATFORM_SPECS[config.platform]?.label ?? config.platform;
  const colors = (config.colors ?? []).filter(Boolean).slice(0, 3);
  const thickness =
    config.frameThickness === 'thin' ? 'dünner' : config.frameThickness === 'thick' ? 'dicker' : 'mittlerer';
  const shape =
    config.frameShape === 'circle'
      ? 'runder'
      : config.frameShape === 'rounded'
        ? 'abgerundeter'
        : config.frameShape === 'hexagon'
          ? 'hexagonaler'
          : config.frameShape === 'stylized'
            ? 'stilisierter'
            : 'rechteckiger';
  const bits = [
    config.transparentBackground || config.transparentCenter ? 'Transparenter' : null,
    `${config.aspectRatio === 'custom' ? `${config.width}×${config.height}` : config.aspectRatio} Facecam-Rahmen für ${platform}`,
    `${thickness} ${shape} Rahmen`,
    colors.length ? `${colors.join('/')} Creator-Farben` : null,
    config.logoJobId ? `Logo ${logoPositionLabel(config.logoPosition)}` : 'ohne Logo',
    config.motif ? `Motiv ${config.motif}` : null,
    config.decorations || null,
    config.style || 'gaming',
    config.transparentCenter ? 'transparenter Kamerabereich' : null,
    String(config.format || 'png').toUpperCase(),
  ].filter(Boolean);
  return `${bits.join(', ')}.`;
}

function logoPositionLabel(pos: FacecamLogoPosition): string {
  if (pos === 'top-left') return 'oben links';
  if (pos === 'top-right') return 'oben rechts';
  if (pos === 'bottom-left') return 'unten links';
  if (pos === 'center') return 'mittig';
  return 'unten rechts';
}

export function sanitizeFacecamStyleRequest(message: string): string {
  let t = String(message ?? '');
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  t = t.replace(
    /kopiere?\s+(exakt\s+)?(den\s+|das\s+)?(facecam|webcam[- ]?rahmen|overlay)\s+(von|des)\s+[\w.\-]+/gi,
    'im gleichen visuellen Charakter, ohne fremde Streamer-Overlays oder Markenzeichen'
  );
  t = t.replace(/exakt(?:es|e)?\s+(?:das\s+)?(?:offizielle\s+)?(?:streamer-?\s*)?(?:overlay|facecam)/gi, 'allgemeine visuelle Stimmung');
  t = t.replace(/\bxqc\b|\bpokimane\b|\bninja\b|\bshroud\b/gi, 'allgemeiner Streamer-Look');
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return t.trim().slice(0, MAX_FACECAM_PROMPT_CHARS);
}

const PLATFORM_WORDS: Array<[RegExp, FacecamPlatform]> = [
  [/\btiktok\b/i, 'tiktok'],
  [/\byoutube\b/i, 'youtube'],
  [/\btwitch\b/i, 'twitch'],
  [/\bobs\b|\bstreamlabs\b/i, 'general'],
];

function parseLogoPosition(message: string): FacecamLogoPosition | undefined {
  const lower = message.toLowerCase();
  if (/logo.{0,24}unten links|unten links.{0,16}(?:das )?logo/.test(lower)) return 'bottom-left';
  if (/logo.{0,24}unten rechts|unten rechts.{0,16}(?:das )?logo|setz mein logo unten rechts/.test(lower)) {
    return 'bottom-right';
  }
  if (/logo.{0,24}oben links|oben links.{0,16}(?:das )?logo/.test(lower)) return 'top-left';
  if (/logo.{0,24}oben rechts|oben rechts.{0,16}(?:das )?logo/.test(lower)) return 'top-right';
  if (/logo.{0,24}(mitte|mittig|zentral)/.test(lower)) return 'center';
  if (/logo.{0,16}rechts/.test(lower)) return 'bottom-right';
  if (/logo.{0,16}links/.test(lower)) return 'bottom-left';
  return undefined;
}

function parseShape(message: string): FacecamFrameShape | undefined {
  const lower = message.toLowerCase();
  if (/kreis|rund(?!et)|circle/.test(lower)) return 'circle';
  if (/hexagon|sechseck/.test(lower)) return 'hexagon';
  if (/abgerundet|rounded/.test(lower)) return 'rounded';
  if (/stilisiert|stylized|ornament/.test(lower)) return 'stylized';
  if (/rechteck|eckig|rectangle/.test(lower)) return 'rectangle';
  return undefined;
}

function parseThickness(message: string): FacecamFrameThickness | undefined {
  const lower = message.toLowerCase();
  if (/dünn|thinner|thin|schmal/.test(lower)) return 'thin';
  if (/dick|thick|breit(er)?er rahmen|dicker rahmen/.test(lower)) return 'thick';
  if (/mittel|medium/.test(lower)) return 'medium';
  return undefined;
}

function parseAspect(message: string): Exclude<FacecamAspectRatio, 'custom'> | undefined {
  const lower = message.toLowerCase();
  if (/9\s*[:/]\s*16|hochformat|vertikal/.test(lower)) return '9:16';
  if (/1\s*[:/]\s*1|quadrat/.test(lower)) return '1:1';
  if (/4\s*[:/]\s*3/.test(lower)) return '4:3';
  if (/16\s*[:/]\s*9/.test(lower)) return '16:9';
  return undefined;
}

export function parseFacecamIntent(
  message: string,
  ctx?: {
    dnaName?: string;
    primaryColors?: string[];
    styleDirection?: string;
    mascot?: string;
    lastLogoId?: string;
    lastFacecamId?: string;
    preferredPlatform?: string;
  }
): FacecamGenerationSettings {
  const original = sanitizeFacecamStyleRequest(message);
  const lower = original.toLowerCase();
  const preferred = String(ctx?.preferredPlatform ?? '').toLowerCase();
  const defaultPlatform: FacecamPlatform | undefined =
    preferred === 'tiktok'
      ? 'tiktok'
      : preferred === 'youtube'
        ? 'youtube'
        : preferred === 'twitch'
          ? 'twitch'
          : preferred === 'obs' || preferred === 'general'
            ? 'general'
            : undefined;

  let config = defaultFacecamConfig({
    colors: ctx?.primaryColors?.length ? ctx.primaryColors.slice(0, 4) : undefined,
    style: ctx?.styleDirection,
    motif: ctx?.mascot,
    platform: defaultPlatform ?? 'twitch',
  });

  let mentionedPlatform: FacecamPlatform | undefined;
  for (const [re, platform] of PLATFORM_WORDS) {
    if (re.test(lower)) {
      mentionedPlatform = platform;
      config = applyFacecamPlatformPreset(config, platform);
      break;
    }
  }

  const convertMatch =
    lower.match(
      /aus (?:meiner |der )?(twitch|youtube|tiktok|obs)[- ]?facecam.{0,40}(youtube|twitch|tiktok)[- ]?(facecam|version)/
    ) || lower.match(/mach daraus eine[n]? (youtube|twitch|tiktok)[- ]?facecam/);
  const convertToPlatform = convertMatch
    ? ((convertMatch[2] && convertMatch[2] !== 'facecam' && convertMatch[2] !== 'version'
        ? convertMatch[2]
        : convertMatch[1]) as FacecamPlatform)
    : undefined;
  const convertFromExisting = Boolean(convertToPlatform || /aus meiner .{0,20}facecam/.test(lower));
  if (convertToPlatform && convertToPlatform in FACECAM_PLATFORM_SPECS) {
    config = applyFacecamPlatformPreset(config, convertToPlatform);
    mentionedPlatform = convertToPlatform;
  }

  const aspect = parseAspect(lower);
  if (aspect) config = applyFacecamAspectPreset(config, aspect);

  const shape = parseShape(lower);
  if (shape) config.frameShape = shape;
  const thickness = parseThickness(lower);
  if (thickness) config.frameThickness = thickness;
  const logoPos = parseLogoPosition(lower);
  if (logoPos) config.logoPosition = logoPos;

  const px = lower.match(/(\d{3,4})\s*(?:x|×)\s*(\d{3,4})/);
  if (px) {
    const dims = validateFacecamDimensions(Number(px[1]), Number(px[2]));
    if (dims.ok) {
      config.width = dims.width;
      config.height = dims.height;
      config.aspectRatio = 'custom';
    }
  }

  if (/transparent/.test(lower)) {
    config.transparentBackground = true;
    config.transparentCenter = true;
    config.format = 'png';
  }
  if (/\bjpg\b|\bjpeg\b/.test(lower)) config.format = 'jpg';
  if (/\bwebp\b/.test(lower)) config.format = 'webp';
  if (/\bpng\b/.test(lower)) config.format = 'png';

  if (/blau|blue/.test(lower) && !config.colors.includes('#1E40AF')) {
    config.colors = ['#1E40AF', ...config.colors].slice(0, 4);
  }
  if (/violett|lila|purple/.test(lower)) {
    config.colors = [...config.colors.filter((c) => c !== '#7C3AED'), '#7C3AED'].slice(0, 4);
  }
  if (/figur kleiner|50\s*% kleiner/.test(lower)) {
    config.prompt = `${config.prompt ?? ''} Smaller character/mascot inside the decorative frame, keep the camera cutout large.`.trim();
  }
  if (/weniger effekte|weniger glow/.test(lower)) {
    config.decorations = 'minimal accents, no heavy glow';
  }
  if (/aggressiv/.test(lower)) {
    config.style = 'esports';
  }

  if (
    (/passend zu meinem logo|mit meinem logo|mein vorhandenes logo/.test(lower) || /setz mein logo/.test(lower)) &&
    ctx?.lastLogoId
  ) {
    config.logoJobId = ctx.lastLogoId;
    config.logoAssetId = ctx.lastLogoId;
  }
  if (/ohne logo|kein logo/.test(lower)) {
    config.logoJobId = undefined;
    config.logoAssetId = undefined;
  }

  const fmt = validateFacecamFormat(config.format, config.transparentBackground || config.transparentCenter);
  if (fmt.ok) config.format = fmt.format;
  else if (config.transparentBackground || config.transparentCenter) config.format = 'png';
  if (config.format === 'jpg') {
    config.transparentBackground = false;
    config.transparentCenter = false;
  }

  config.prompt = original.slice(0, MAX_FACECAM_PROMPT_CHARS);
  config.qualityProfile = resolveNexterQualityMode(config.style || 'gaming');
  config.summary = buildFacecamDesignSummary(config);

  const missing: string[] = [];
  if (!mentionedPlatform && !convertToPlatform && !defaultPlatform) missing.push('platform');
  const followUpQuestion = missing.includes('platform')
    ? 'Für welche Plattform — Twitch, TikTok, YouTube oder OBS? Logo ist optional. DNA-Farben und Stil übernehme ich als Defaults, wenn vorhanden.'
    : null;

  return {
    type: 'facecam',
    config,
    missing,
    followUpQuestion,
    convertFromExisting,
    convertToPlatform,
  };
}

export function facecamNeedsFollowUp(
  message: string,
  ctx?: { hasDna?: boolean; dnaName?: string; preferredPlatform?: string; lastFacecamId?: string }
): boolean {
  const lower = String(message ?? '').toLowerCase();
  if (!/\bfacecam|webcam[- ]?rahmen/.test(lower)) return false;
  if (/öffne|open|geh(e)? zu/.test(lower)) return false;
  if (
    /dünn|dick|kleiner|größer|aggressiv|änder|variante|mehr blau|logo/.test(lower) &&
    (ctx?.lastFacecamId || /mein(e[rn]?)? facecam/.test(lower))
  ) {
    return false;
  }
  const parsed = parseFacecamIntent(message, {
    dnaName: ctx?.dnaName,
    preferredPlatform: ctx?.preferredPlatform,
  });
  return parsed.missing.includes('platform');
}

export function applyFacecamChangeRequest(config: FacecamConfig, request: string): FacecamConfig {
  const parsed = parseFacecamIntent(request, {
    primaryColors: config.colors,
    styleDirection: config.style,
    mascot: config.motif,
  });
  const lower = request.toLowerCase();
  const next: FacecamConfig = { ...config };
  if (parsed.convertToPlatform) {
    Object.assign(next, applyFacecamPlatformPreset(next, parsed.convertToPlatform));
  }
  const shape = parseShape(lower);
  if (shape) next.frameShape = shape;
  const thickness = parseThickness(lower);
  if (thickness) next.frameThickness = thickness;
  const logoPos = parseLogoPosition(lower);
  if (logoPos) next.logoPosition = logoPos;
  const aspect = parseAspect(lower);
  if (aspect) Object.assign(next, applyFacecamAspectPreset(next, aspect));
  if (/mehr blau|blau/.test(lower)) next.colors = parsed.config.colors;
  if (/violett|lila/.test(lower)) next.colors = parsed.config.colors;
  if (/aggressiv/.test(lower)) next.style = 'esports';
  if (/weniger effekte/.test(lower)) next.decorations = 'minimal accents';
  if (/figur kleiner|50\s*% kleiner/.test(lower)) {
    next.prompt = `${next.prompt ?? ''} Character 50 percent smaller, larger transparent camera cutout.`.trim();
  }
  if (/logo kleiner/.test(lower)) {
    next.prompt = `${next.prompt ?? ''} Smaller logo, more margin around the mark.`.trim();
  }
  if (/transparent/.test(lower)) {
    next.transparentBackground = true;
    next.transparentCenter = true;
    next.format = 'png';
  }
  const fmt = validateFacecamFormat(next.format, next.transparentBackground || next.transparentCenter);
  if (fmt.ok) next.format = fmt.format;
  next.prompt = sanitizeFacecamStyleRequest(`${next.prompt ?? ''} ${request}`.trim());
  next.qualityProfile = resolveNexterQualityMode(next.style);
  next.summary = buildFacecamDesignSummary(next);
  return next;
}

export function facecamDownloadFilename(input: {
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
  return `${slug(input.creatorName)}-${slug(input.platform)}-facecam-v${version}.${ext}`;
}

export function facecamPromptComposition(config: FacecamConfig): string {
  const inset = Math.round(facecamThicknessInset(config.frameThickness) * 100);
  const shape =
    config.frameShape === 'circle'
      ? 'circular webcam frame'
      : config.frameShape === 'hexagon'
        ? 'hexagonal webcam overlay frame'
        : config.frameShape === 'rounded'
          ? 'rounded-rectangle webcam frame'
          : config.frameShape === 'stylized'
            ? 'stylized decorative webcam frame with original ornaments'
            : 'rectangular webcam overlay frame';
  return [
    `exact aspect ${config.aspectRatio} (${config.width}x${config.height}px)`,
    `DESIGN AREA: ${config.frameThickness} ${shape} only — decorative border about ${inset}% inset from the outer edge`,
    'TRANSPARENT CAMERA INTERIOR: the inner webcam/gameplay cutout MUST stay fully transparent (alpha 0). Never fill the camera hole with generated background, scenery, texture, or color',
    config.transparentBackground
      ? 'outside the decorative frame also transparent, PNG/WebP alpha-ready overlay'
      : 'opaque canvas only outside the intended overlay if format requires it; still keep the camera interior empty',
    config.logoJobId
      ? `place the creator’s own logo ${config.logoPosition.replace('-', ' ')}, small, on the frame, never covering the camera hole`
      : 'no third-party logos',
    config.decorations ? `subtle decorations: ${config.decorations}` : 'restrained streamer-frame accents',
  ].join('; ');
}

export function facecamPromptConstraints(config: FacecamConfig): string {
  return [
    config.motif ? `motif on the frame only: ${config.motif}` : null,
    config.logoJobId
      ? 'integrate the creator’s own logo as a reference, do not invent a third-party or other streamer’s brand mark'
      : 'no third-party logos, no famous streamer overlays',
    qualityInstructionsForStyle(config.style),
    'readable as a live webcam overlay, no watermark, not a full-screen scene',
  ]
    .filter(Boolean)
    .join('; ');
}

export function facecamStudioPath(): string {
  return NEXTER_STUDIO_PATHS.facecam;
}
