import type { CreatorDNA } from './creator-dna';
import type { OverlayGenerationOptions } from './studio';
import { STREAM_LAYOUT_PRESETS, type StreamLayoutSlot } from './streamset';
import { qualityInstructionsForStyle, resolveNexterQualityMode } from './nexter-quality';
import { NEXTER_STUDIO_PATHS } from './nexter';

export const MAX_OVERLAY_PROMPT_CHARS = 4000;
export const MAX_OVERLAY_REFERENCES = 2;
export const OVERLAY_MIN_PX = 256;
export const OVERLAY_MAX_PX = 2560;
export const OVERLAY_REFERENCE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const OVERLAY_OUTPUT_FORMATS = ['png', 'webp', 'jpg'] as const;
export const OVERLAY_TRANSPARENT_FORMATS = ['png', 'webp'] as const;

export type OverlayOutputFormat = (typeof OVERLAY_OUTPUT_FORMATS)[number];
export type OverlayPlatform = 'twitch' | 'tiktok' | 'youtube' | 'general' | 'custom';
export type OverlayAspectRatio = '16:9' | '4:3' | '1:1' | '9:16' | 'custom';
export type OverlayLayoutPreset =
  | 'gameplay-full'
  | 'gameplay-facecam'
  | 'gameplay-facecam-chat'
  | 'tiktok-vertical'
  | 'chat-focused'
  | 'custom';
export type OverlayBorderStyle = 'thin' | 'medium' | 'thick' | 'none';
export type OverlayLogoPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
export type OverlayType = NonNullable<OverlayGenerationOptions['overlayType']>;

export const OVERLAY_ASPECT_PRESETS: Record<
  Exclude<OverlayAspectRatio, 'custom'>,
  { width: number; height: number; label: string }
> = {
  '16:9': { width: 1920, height: 1080, label: '16:9' },
  '4:3': { width: 1440, height: 1080, label: '4:3' },
  '1:1': { width: 1080, height: 1080, label: '1:1' },
  '9:16': { width: 1080, height: 1920, label: '9:16 / TikTok' },
};

export const OVERLAY_PLATFORM_SPECS: Record<
  OverlayPlatform,
  { label: string; defaultAspect: Exclude<OverlayAspectRatio, 'custom'>; defaultLayout: OverlayLayoutPreset }
> = {
  twitch: { label: 'Twitch', defaultAspect: '16:9', defaultLayout: 'gameplay-facecam-chat' },
  tiktok: { label: 'TikTok', defaultAspect: '9:16', defaultLayout: 'tiktok-vertical' },
  youtube: { label: 'YouTube', defaultAspect: '16:9', defaultLayout: 'gameplay-facecam' },
  general: { label: 'OBS / Allgemein', defaultAspect: '16:9', defaultLayout: 'gameplay-facecam-chat' },
  custom: { label: 'Custom', defaultAspect: '16:9', defaultLayout: 'custom' },
};

export const OVERLAY_STUDIO_PLATFORMS: OverlayPlatform[] = ['twitch', 'tiktok', 'youtube', 'general', 'custom'];
export const OVERLAY_ASPECT_OPTIONS: OverlayAspectRatio[] = ['16:9', '4:3', '1:1', '9:16', 'custom'];
export const OVERLAY_LAYOUT_PRESETS: OverlayLayoutPreset[] = [
  'gameplay-full',
  'gameplay-facecam',
  'gameplay-facecam-chat',
  'tiktok-vertical',
  'chat-focused',
  'custom',
];
export const OVERLAY_BORDER_STYLES: OverlayBorderStyle[] = ['thin', 'medium', 'thick', 'none'];
export const OVERLAY_LOGO_POSITIONS: OverlayLogoPosition[] = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'center',
];

export interface OverlayRegion {
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  transparent: boolean;
}

export interface OverlayRegions {
  gameplay: OverlayRegion;
  facecam: OverlayRegion;
  chat: OverlayRegion;
  alert: OverlayRegion;
}

export interface OverlayConfig {
  platform: OverlayPlatform;
  width: number;
  height: number;
  aspectRatio: OverlayAspectRatio;
  format: OverlayOutputFormat;
  transparentBackground: boolean;
  layoutPreset: OverlayLayoutPreset;
  overlayType: OverlayType;
  gameplayRegion: OverlayRegion;
  facecamRegion: OverlayRegion;
  chatRegion: OverlayRegion;
  alertRegion: OverlayRegion;
  style: string;
  colors: string[];
  motif: string;
  borderStyle: OverlayBorderStyle;
  decorations: string;
  logoJobId?: string;
  logoAssetId?: string;
  facecamJobId?: string;
  facecamAssetId?: string;
  referenceAssetIds: string[];
  logoPosition: OverlayLogoPosition;
  qualityProfile: string;
  prompt?: string;
  summary: string;
}

export interface OverlayGenerationSettings {
  type: 'overlay';
  config: OverlayConfig;
  missing: string[];
  followUpQuestion: string | null;
  convertFromExisting: boolean;
  convertToPlatform?: OverlayPlatform;
}

function hiddenRegion(): OverlayRegion {
  return { visible: false, x: 0, y: 0, width: 1, height: 1, transparent: false };
}

function slotToRegion(
  slot: StreamLayoutSlot | undefined,
  transparent: boolean,
  canvasW: number,
  canvasH: number,
  presetW: number,
  presetH: number
): OverlayRegion {
  if (!slot) return hiddenRegion();
  const sx = presetW > 0 ? canvasW / presetW : 1;
  const sy = presetH > 0 ? canvasH / presetH : 1;
  const x = Math.max(0, Math.round(slot.x * sx));
  const y = Math.max(0, Math.round(slot.y * sy));
  const width = Math.max(1, Math.round(slot.width * sx));
  const height = Math.max(1, Math.round(slot.height * sy));
  return {
    visible: true,
    x,
    y,
    width: Math.min(width, Math.max(1, canvasW - x)),
    height: Math.min(height, Math.max(1, canvasH - y)),
    transparent,
  };
}

export function overlayLayoutLabel(preset: OverlayLayoutPreset): string {
  if (preset === 'gameplay-full') return 'Gameplay Full';
  if (preset === 'gameplay-facecam') return 'Gameplay + Facecam';
  if (preset === 'gameplay-facecam-chat') return 'Gameplay + Facecam + Chat';
  if (preset === 'tiktok-vertical') return 'Vertical TikTok Gaming';
  if (preset === 'chat-focused') return 'Chat-focused';
  return 'Custom';
}

export function regionsForOverlayLayout(
  preset: OverlayLayoutPreset,
  width: number,
  height: number
): OverlayRegions {
  if (preset === 'tiktok-vertical') {
    const p = STREAM_LAYOUT_PRESETS.tiktok;
    return {
      gameplay: slotToRegion(p.slots.find((s) => s.type === 'gameplay'), true, width, height, p.width, p.height),
      facecam: slotToRegion(p.slots.find((s) => s.type === 'facecam'), true, width, height, p.width, p.height),
      chat: slotToRegion(p.slots.find((s) => s.type === 'chat'), true, width, height, p.width, p.height),
      alert: { visible: false, x: 40, y: 40, width: Math.min(360, width), height: Math.min(100, height), transparent: false },
    };
  }
  if (preset === 'gameplay-facecam-chat') {
    const p = STREAM_LAYOUT_PRESETS.twitch;
    return {
      gameplay: slotToRegion(p.slots.find((s) => s.type === 'gameplay'), true, width, height, p.width, p.height),
      facecam: slotToRegion(p.slots.find((s) => s.type === 'facecam'), true, width, height, p.width, p.height),
      chat: slotToRegion(p.slots.find((s) => s.type === 'chat'), true, width, height, p.width, p.height),
      alert: {
        visible: true,
        x: Math.max(0, width - Math.round(width * 0.23)),
        y: Math.round(height * 0.03),
        width: Math.round(width * 0.21),
        height: Math.round(height * 0.1),
        transparent: false,
      },
    };
  }
  if (preset === 'gameplay-facecam') {
    const p = STREAM_LAYOUT_PRESETS.youtube;
    return {
      gameplay: slotToRegion(p.slots.find((s) => s.type === 'gameplay'), true, width, height, p.width, p.height),
      facecam: slotToRegion(p.slots.find((s) => s.type === 'facecam'), true, width, height, p.width, p.height),
      chat: hiddenRegion(),
      alert: {
        visible: false,
        x: Math.max(0, width - Math.round(width * 0.23)),
        y: Math.round(height * 0.03),
        width: Math.round(width * 0.21),
        height: Math.round(height * 0.1),
        transparent: false,
      },
    };
  }
  if (preset === 'chat-focused') {
    return {
      gameplay: { visible: true, x: 0, y: 0, width: Math.round(width * 0.62), height, transparent: true },
      facecam: hiddenRegion(),
      chat: {
        visible: true,
        x: Math.round(width * 0.64),
        y: Math.round(height * 0.08),
        width: Math.round(width * 0.34),
        height: Math.round(height * 0.84),
        transparent: true,
      },
      alert: { visible: true, x: Math.round(width * 0.64), y: 16, width: Math.round(width * 0.34), height: 90, transparent: false },
    };
  }
  return {
    gameplay: { visible: true, x: 0, y: 0, width, height, transparent: true },
    facecam: hiddenRegion(),
    chat: hiddenRegion(),
    alert: hiddenRegion(),
  };
}

export function validateOverlayRegion(
  region: OverlayRegion,
  canvasW: number,
  canvasH: number,
  name: string
): { ok: true } | { ok: false; message: string } {
  if (!region.visible) return { ok: true };
  const fields = [region.x, region.y, region.width, region.height];
  if (fields.some((n) => !Number.isFinite(n))) {
    return { ok: false, message: `${name}: Position und Größe müssen endliche Zahlen sein.` };
  }
  if (!Number.isInteger(region.x) || !Number.isInteger(region.y) || !Number.isInteger(region.width) || !Number.isInteger(region.height)) {
    return { ok: false, message: `${name}: Koordinaten müssen ganze Pixelwerte sein.` };
  }
  if (region.x < 0 || region.y < 0) {
    return { ok: false, message: `${name}: Position darf nicht negativ sein.` };
  }
  if (region.width <= 0 || region.height <= 0) {
    return { ok: false, message: `${name}: Größe muss größer als 0 sein.` };
  }
  if (region.x + region.width > canvasW || region.y + region.height > canvasH) {
    return { ok: false, message: `${name}: Bereich liegt außerhalb der Canvas (${canvasW}×${canvasH}).` };
  }
  return { ok: true };
}

export function validateOverlayRegions(
  config: Pick<OverlayConfig, 'width' | 'height' | 'gameplayRegion' | 'facecamRegion' | 'chatRegion' | 'alertRegion'>
): { ok: true } | { ok: false; message: string } {
  const checks: Array<[OverlayRegion, string]> = [
    [config.gameplayRegion, 'Gameplay'],
    [config.facecamRegion, 'Facecam'],
    [config.chatRegion, 'Chat'],
    [config.alertRegion, 'Alert'],
  ];
  for (const [region, name] of checks) {
    const next = validateOverlayRegion(region, config.width, config.height, name);
    if (!next.ok) return next;
  }
  return { ok: true };
}

export function validateOverlayDimensions(
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
  if (w < OVERLAY_MIN_PX || h < OVERLAY_MIN_PX) {
    return { ok: false, message: `Mindestgröße ist ${OVERLAY_MIN_PX}×${OVERLAY_MIN_PX} Pixel.` };
  }
  if (w > OVERLAY_MAX_PX || h > OVERLAY_MAX_PX) {
    return { ok: false, message: `Maximalgröße ist ${OVERLAY_MAX_PX}×${OVERLAY_MAX_PX} Pixel.` };
  }
  return { ok: true, width: w, height: h };
}

export function validateOverlayFormat(
  format: unknown,
  transparent: boolean
): { ok: true; format: OverlayOutputFormat } | { ok: false; message: string } {
  const raw = String(format ?? 'png').toLowerCase().replace('jpeg', 'jpg');
  if (!OVERLAY_OUTPUT_FORMATS.includes(raw as OverlayOutputFormat)) {
    return { ok: false, message: 'Unterstützte Formate: PNG, WEBP, JPG.' };
  }
  const next = raw as OverlayOutputFormat;
  if (transparent && !OVERLAY_TRANSPARENT_FORMATS.includes(next as (typeof OVERLAY_TRANSPARENT_FORMATS)[number])) {
    return { ok: false, message: 'Transparenz ist nur mit PNG oder WEBP möglich — nicht mit JPG.' };
  }
  return { ok: true, format: next };
}

export function overlayProviderSize(width: number, height: number): '1024x1024' | '1792x1024' | '1024x1792' {
  if (height > width * 1.15) return '1024x1792';
  if (width > height * 1.15) return '1792x1024';
  return '1024x1024';
}

export function applyOverlayLayoutPreset(config: OverlayConfig, preset: OverlayLayoutPreset): OverlayConfig {
  const regions = regionsForOverlayLayout(preset, config.width, config.height);
  const next: OverlayConfig = {
    ...config,
    layoutPreset: preset,
    gameplayRegion: regions.gameplay,
    facecamRegion: regions.facecam,
    chatRegion: regions.chat,
    alertRegion: regions.alert,
    overlayType: preset === 'chat-focused' ? 'panel' : config.overlayType === 'starting-soon' ? 'hud' : config.overlayType || 'hud',
  };
  if (preset === 'tiktok-vertical') {
    next.aspectRatio = '9:16';
    next.width = OVERLAY_ASPECT_PRESETS['9:16'].width;
    next.height = OVERLAY_ASPECT_PRESETS['9:16'].height;
    const scaled = regionsForOverlayLayout(preset, next.width, next.height);
    next.gameplayRegion = scaled.gameplay;
    next.facecamRegion = scaled.facecam;
    next.chatRegion = scaled.chat;
    next.alertRegion = scaled.alert;
  }
  next.summary = buildOverlayDesignSummary(next);
  return next;
}

export function applyOverlayPlatformPreset(config: OverlayConfig, platform: OverlayPlatform): OverlayConfig {
  const spec = OVERLAY_PLATFORM_SPECS[platform];
  const aspect = spec.defaultAspect;
  const size = OVERLAY_ASPECT_PRESETS[aspect];
  let next: OverlayConfig = {
    ...config,
    platform,
    aspectRatio: aspect,
    width: size.width,
    height: size.height,
  };
  next = applyOverlayLayoutPreset(next, spec.defaultLayout);
  next.summary = buildOverlayDesignSummary(next);
  return next;
}

export function overlayConfigFromDna(
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
): Partial<OverlayConfig> {
  const raw = String(dna.platformOptimization?.[0]?.platform ?? '').toLowerCase();
  const platform: OverlayPlatform =
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

export function defaultOverlayConfig(overrides?: Partial<OverlayConfig>): OverlayConfig {
  const platform =
    overrides?.platform && overrides.platform in OVERLAY_PLATFORM_SPECS ? overrides.platform : 'twitch';
  const spec = OVERLAY_PLATFORM_SPECS[platform];
  const aspect: OverlayAspectRatio =
    overrides?.aspectRatio && overrides.aspectRatio !== 'custom' && overrides.aspectRatio in OVERLAY_ASPECT_PRESETS
      ? overrides.aspectRatio
      : overrides?.aspectRatio === 'custom'
        ? 'custom'
        : spec.defaultAspect;
  const preset = aspect === 'custom' ? OVERLAY_ASPECT_PRESETS[spec.defaultAspect] : OVERLAY_ASPECT_PRESETS[aspect];
  const width = overrides?.width ?? preset.width;
  const height = overrides?.height ?? preset.height;
  const layout = overrides?.layoutPreset ?? spec.defaultLayout;
  const regions = regionsForOverlayLayout(layout === 'custom' ? spec.defaultLayout : layout, width, height);
  const transparent = overrides?.transparentBackground ?? true;
  const format = overrides?.format ?? 'png';
  const config: OverlayConfig = {
    platform,
    width,
    height,
    aspectRatio: aspect,
    format: transparent && format === 'jpg' ? 'png' : format,
    transparentBackground: transparent,
    layoutPreset: layout,
    overlayType: overrides?.overlayType ?? 'hud',
    gameplayRegion: overrides?.gameplayRegion ?? regions.gameplay,
    facecamRegion: overrides?.facecamRegion ?? regions.facecam,
    chatRegion: overrides?.chatRegion ?? regions.chat,
    alertRegion: overrides?.alertRegion ?? regions.alert,
    style: overrides?.style || 'gaming',
    colors: overrides?.colors?.length ? overrides.colors : ['#22d3ee', '#a855f7'],
    motif: overrides?.motif ?? '',
    borderStyle: overrides?.borderStyle ?? 'medium',
    decorations: overrides?.decorations ?? '',
    logoJobId: overrides?.logoJobId,
    logoAssetId: overrides?.logoAssetId,
    facecamJobId: overrides?.facecamJobId,
    facecamAssetId: overrides?.facecamAssetId,
    referenceAssetIds: overrides?.referenceAssetIds?.slice(0, MAX_OVERLAY_REFERENCES) ?? [],
    logoPosition: overrides?.logoPosition ?? 'top-left',
    qualityProfile: overrides?.qualityProfile ?? resolveNexterQualityMode(overrides?.style || 'gaming'),
    prompt: overrides?.prompt,
    summary: '',
  };
  if (config.format === 'jpg') {
    config.transparentBackground = false;
    config.gameplayRegion = { ...config.gameplayRegion, transparent: false };
    config.facecamRegion = { ...config.facecamRegion, transparent: false };
  }
  config.summary = buildOverlayDesignSummary(config);
  return config;
}

export function overlayConfigToGenerationOptions(config: OverlayConfig): OverlayGenerationOptions {
  return {
    style: config.style,
    overlayType: config.overlayType,
    transparentBackground: config.transparentBackground,
    animated: false,
    platform: config.platform,
    width: config.width,
    height: config.height,
    aspectRatio: config.aspectRatio,
    outputFormat: config.format,
    layoutPreset: config.layoutPreset,
    sourceLogoJobId: config.logoJobId,
    sourceFacecamJobId: config.facecamJobId,
    gameplayRegion: config.gameplayRegion,
    facecamRegion: config.facecamRegion,
    chatRegion: config.chatRegion,
    alertRegion: config.alertRegion,
    logoPosition: config.logoPosition,
    motif: config.motif || undefined,
    decorations: config.decorations || undefined,
    borderStyle: config.borderStyle,
  };
}

export function overlayConfigFromGenerationOptions(
  opts: OverlayGenerationOptions,
  extras?: Partial<OverlayConfig>
): OverlayConfig {
  const platform =
    opts.platform && opts.platform in OVERLAY_PLATFORM_SPECS ? opts.platform : extras?.platform ?? 'twitch';
  return defaultOverlayConfig({
    ...extras,
    platform,
    style: opts.style ?? extras?.style,
    overlayType: opts.overlayType ?? extras?.overlayType,
    transparentBackground: opts.transparentBackground ?? extras?.transparentBackground,
    width: opts.width ?? extras?.width,
    height: opts.height ?? extras?.height,
    aspectRatio: opts.aspectRatio ?? extras?.aspectRatio,
    format: opts.outputFormat ?? extras?.format,
    layoutPreset: opts.layoutPreset ?? extras?.layoutPreset,
    logoJobId: opts.sourceLogoJobId ?? extras?.logoJobId,
    facecamJobId: opts.sourceFacecamJobId ?? extras?.facecamJobId,
    gameplayRegion: opts.gameplayRegion ?? extras?.gameplayRegion,
    facecamRegion: opts.facecamRegion ?? extras?.facecamRegion,
    chatRegion: opts.chatRegion ?? extras?.chatRegion,
    alertRegion: opts.alertRegion ?? extras?.alertRegion,
    logoPosition: opts.logoPosition ?? extras?.logoPosition,
    motif: opts.motif ?? extras?.motif,
    decorations: opts.decorations ?? extras?.decorations,
    borderStyle: opts.borderStyle ?? extras?.borderStyle,
  });
}

function regionSummary(region: OverlayRegion, label: string): string | null {
  if (!region.visible) return null;
  return `${label} ${region.x},${region.y} ${region.width}×${region.height}${region.transparent ? ' transparent' : ''}`;
}

export function buildOverlayDesignSummary(config: OverlayConfig): string {
  const platform = OVERLAY_PLATFORM_SPECS[config.platform]?.label ?? config.platform;
  const colors = (config.colors ?? []).filter(Boolean).slice(0, 3);
  const bits = [
    config.layoutPreset === 'tiktok-vertical' ? 'Vertikales TikTok-Gaming-Overlay' : `${overlayLayoutLabel(config.layoutPreset)} Overlay für ${platform}`,
    `${config.width}×${config.height}`,
    regionSummary(config.facecamRegion, 'Facecam'),
    regionSummary(config.gameplayRegion, 'Gameplay'),
    regionSummary(config.chatRegion, 'Chat'),
    regionSummary(config.alertRegion, 'Alert'),
    colors.length ? `${colors.join('/')} Creator-Farben` : null,
    config.logoJobId ? `Logo ${logoPositionLabel(config.logoPosition)}` : 'ohne Logo',
    config.facecamJobId ? 'eigene Facecam' : config.facecamRegion.visible ? 'Facecam-Bereich' : null,
    config.motif ? `Motiv ${config.motif}` : null,
    config.style || 'gaming',
    config.gameplayRegion.transparent ? 'transparentes Gameplay-Fenster' : null,
    config.transparentBackground ? 'transparenter Overlay-Hintergrund' : null,
    String(config.format || 'png').toUpperCase(),
  ].filter(Boolean);
  return `${bits.join(', ')}.`;
}

function logoPositionLabel(pos: OverlayLogoPosition): string {
  if (pos === 'top-right') return 'oben rechts';
  if (pos === 'bottom-left') return 'unten links';
  if (pos === 'bottom-right') return 'unten rechts';
  if (pos === 'center') return 'mittig';
  return 'oben links';
}

export function sanitizeOverlayStyleRequest(message: string): string {
  let t = String(message ?? '');
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  t = t.replace(
    /kopiere?\s+(exakt\s+)?(das\s+|den\s+)?(overlay|layout|hud)\s+(von|des)\s+[\w.\-]+/gi,
    'im gleichen visuellen Charakter, ohne fremde Streamer-Overlays oder Markenzeichen'
  );
  t = t.replace(/exakt(?:es|e)?\s+(?:das\s+)?(?:offizielle\s+)?(?:streamer-?\s*)?(?:overlay|hud|layout)/gi, 'allgemeine visuelle Stimmung');
  t = t.replace(/\bxqc\b|\bpokimane\b|\bninja\b|\bshroud\b/gi, 'allgemeiner Streamer-Look');
  return t.trim().slice(0, MAX_OVERLAY_PROMPT_CHARS);
}

const PLATFORM_WORDS: Array<[RegExp, OverlayPlatform]> = [
  [/\btiktok\b/i, 'tiktok'],
  [/\byoutube\b/i, 'youtube'],
  [/\btwitch\b/i, 'twitch'],
  [/\bobs\b|\bstreamlabs\b/i, 'general'],
];

function parseLogoPosition(message: string): OverlayLogoPosition | undefined {
  const lower = message.toLowerCase();
  if (/logo.{0,24}oben links|oben links.{0,16}(?:das )?logo|mein logo oben links/.test(lower)) return 'top-left';
  if (/logo.{0,24}oben rechts|oben rechts.{0,16}(?:das )?logo|logo nach rechts/.test(lower)) return 'top-right';
  if (/logo.{0,24}unten links/.test(lower)) return 'bottom-left';
  if (/logo.{0,24}unten rechts/.test(lower)) return 'bottom-right';
  if (/logo.{0,24}(mitte|mittig)/.test(lower)) return 'center';
  return undefined;
}

function parseLayout(message: string): OverlayLayoutPreset | undefined {
  const lower = message.toLowerCase();
  if (/oben facecam.{0,40}gameplay.{0,40}chat|facecam oben.{0,20}gameplay.{0,20}chat|vertikal|9\s*[:/]\s*16/.test(lower)) {
    return 'tiktok-vertical';
  }
  if (/chat[- ]focused|nur chat|chat in den vordergrund/.test(lower)) return 'chat-focused';
  if (/gameplay.{0,20}facecam.{0,20}chat|facecam.{0,20}chat|chat.{0,20}facecam/.test(lower)) {
    return 'gameplay-facecam-chat';
  }
  if (/gameplay.{0,16}facecam|facecam.{0,16}gameplay/.test(lower)) return 'gameplay-facecam';
  if (/nur gameplay|gameplay full|vollflächig/.test(lower)) return 'gameplay-full';
  if (/tiktok gaming layout|vertikales? (gaming[- ]?)?layout/.test(lower)) return 'tiktok-vertical';
  return undefined;
}

function scaleRegion(region: OverlayRegion, factor: number, canvasW: number, canvasH: number): OverlayRegion {
  if (!region.visible) return region;
  const width = Math.max(32, Math.round(region.width * factor));
  const height = Math.max(32, Math.round(region.height * factor));
  const x = Math.min(region.x, Math.max(0, canvasW - width));
  const y = Math.min(region.y, Math.max(0, canvasH - height));
  return {
    ...region,
    width: Math.min(width, canvasW - x),
    height: Math.min(height, canvasH - y),
    x,
    y,
  };
}

function moveRegion(region: OverlayRegion, dx: number, dy: number, canvasW: number, canvasH: number): OverlayRegion {
  if (!region.visible) return region;
  const x = Math.max(0, Math.min(canvasW - region.width, region.x + dx));
  const y = Math.max(0, Math.min(canvasH - region.height, region.y + dy));
  return { ...region, x, y };
}

export function parseOverlayIntent(
  message: string,
  ctx?: {
    dnaName?: string;
    primaryColors?: string[];
    styleDirection?: string;
    mascot?: string;
    lastLogoId?: string;
    lastFacecamId?: string;
    lastOverlayId?: string;
    preferredPlatform?: string;
  }
): OverlayGenerationSettings {
  const original = sanitizeOverlayStyleRequest(message);
  const lower = original.toLowerCase();
  const preferred = String(ctx?.preferredPlatform ?? '').toLowerCase();
  const defaultPlatform: OverlayPlatform | undefined =
    preferred === 'tiktok'
      ? 'tiktok'
      : preferred === 'youtube'
        ? 'youtube'
        : preferred === 'twitch'
          ? 'twitch'
          : preferred === 'obs' || preferred === 'general'
            ? 'general'
            : undefined;

  let config = defaultOverlayConfig({
    colors: ctx?.primaryColors?.length ? ctx.primaryColors.slice(0, 4) : undefined,
    style: ctx?.styleDirection,
    motif: ctx?.mascot,
    platform: defaultPlatform ?? 'twitch',
  });

  let mentionedPlatform: OverlayPlatform | undefined;
  for (const [re, platform] of PLATFORM_WORDS) {
    if (re.test(lower)) {
      mentionedPlatform = platform;
      config = applyOverlayPlatformPreset(config, platform);
      break;
    }
  }

  const convertMatch =
    lower.match(
      /aus (?:meinem |dem )?(twitch|youtube|tiktok|obs)[- ]?overlay.{0,40}(youtube|twitch|tiktok)[- ]?(overlay|version|layout)/
    ) || lower.match(/mach daraus eine[n]? (youtube|twitch|tiktok)[- ]?(overlay|version|layout)/);
  const convertToPlatform = convertMatch
    ? ((convertMatch[2] && !/overlay|version|layout/.test(convertMatch[2]) ? convertMatch[2] : convertMatch[1]) as OverlayPlatform)
    : undefined;
  const convertFromExisting = Boolean(convertToPlatform || /aus meinem .{0,20}overlay/.test(lower));
  if (convertToPlatform && convertToPlatform in OVERLAY_PLATFORM_SPECS) {
    config = applyOverlayPlatformPreset(config, convertToPlatform);
    mentionedPlatform = convertToPlatform;
  }

  const layout = parseLayout(lower);
  if (layout) {
    if (layout === 'tiktok-vertical' && !mentionedPlatform && !convertToPlatform) {
      config = applyOverlayPlatformPreset(config, 'tiktok');
      mentionedPlatform = 'tiktok';
    }
    config = applyOverlayLayoutPreset(config, layout);
  }

  const logoPos = parseLogoPosition(lower);
  if (logoPos) config.logoPosition = logoPos;

  if (/starting soon|startbildschirm/.test(lower)) {
    config.overlayType = 'starting-soon';
    config.transparentBackground = false;
    config = applyOverlayLayoutPreset(config, 'gameplay-full');
    config.gameplayRegion = { ...config.gameplayRegion, transparent: false };
  }
  if (/\bbrb\b|be right back/.test(lower)) config.overlayType = 'brb';
  if (/\boffline\b/.test(lower)) config.overlayType = 'offline';
  if (/\bhud\b/.test(lower)) config.overlayType = 'hud';

  if (/transparent/.test(lower)) {
    config.transparentBackground = true;
    config.gameplayRegion = { ...config.gameplayRegion, transparent: true };
    if (config.facecamRegion.visible) config.facecamRegion = { ...config.facecamRegion, transparent: true };
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
  if (/dünn|thinner|thin/.test(lower)) config.borderStyle = 'thin';
  if (/dick|thick/.test(lower)) config.borderStyle = 'thick';
  if (/weniger effekte/.test(lower)) config.decorations = 'minimal accents';

  if ((/passend zu meinem logo|mit meinem logo|mein logo/.test(lower) || /logo oben/.test(lower)) && ctx?.lastLogoId) {
    config.logoJobId = ctx.lastLogoId;
    config.logoAssetId = ctx.lastLogoId;
  }
  if (/ohne logo|kein logo/.test(lower)) {
    config.logoJobId = undefined;
    config.logoAssetId = undefined;
  }
  if (/mit meiner facecam|eigene facecam/.test(lower) && ctx?.lastFacecamId) {
    config.facecamJobId = ctx.lastFacecamId;
    config.facecamAssetId = ctx.lastFacecamId;
  }
  if (/ohne facecam|keine facecam/.test(lower)) {
    config.facecamJobId = undefined;
    config.facecamAssetId = undefined;
  }

  const px = lower.match(/(\d{3,4})\s*(?:x|×)\s*(\d{3,4})/);
  if (px) {
    const dims = validateOverlayDimensions(Number(px[1]), Number(px[2]));
    if (dims.ok) {
      config.width = dims.width;
      config.height = dims.height;
      config.aspectRatio = 'custom';
    }
  }

  const fmt = validateOverlayFormat(
    config.format,
    config.transparentBackground || config.gameplayRegion.transparent || config.facecamRegion.transparent
  );
  if (fmt.ok) config.format = fmt.format;
  else if (config.transparentBackground) config.format = 'png';
  if (config.format === 'jpg') {
    config.transparentBackground = false;
    config.gameplayRegion = { ...config.gameplayRegion, transparent: false };
    config.facecamRegion = { ...config.facecamRegion, transparent: false };
  }

  config.prompt = original.slice(0, MAX_OVERLAY_PROMPT_CHARS);
  config.qualityProfile = resolveNexterQualityMode(config.style || 'gaming');
  config.summary = buildOverlayDesignSummary(config);

  const missing: string[] = [];
  if (!mentionedPlatform && !convertToPlatform && !defaultPlatform && !layout) missing.push('platform');
  const followUpQuestion = missing.includes('platform')
    ? 'Für welche Plattform — Twitch, TikTok, YouTube oder OBS? Logo und Facecam sind optional. DNA-Farben übernehme ich als Defaults, wenn vorhanden.'
    : null;

  return {
    type: 'overlay',
    config,
    missing,
    followUpQuestion,
    convertFromExisting,
    convertToPlatform,
  };
}

export function overlayNeedsFollowUp(
  message: string,
  ctx?: { hasDna?: boolean; dnaName?: string; preferredPlatform?: string; lastOverlayId?: string }
): boolean {
  const lower = String(message ?? '').toLowerCase();
  if (!/\boverlay|gaming[- ]?layout|stream[- ]?layout|twitch layout|tiktok layout/.test(lower)) return false;
  if (/öffne|open|geh(e)? zu/.test(lower)) return false;
  if (
    /kleiner|größer|höher|unten|änder|variante|mehr blau|transparent/.test(lower) &&
    (ctx?.lastOverlayId || /mein(em)? overlay/.test(lower))
  ) {
    return false;
  }
  if (/oben facecam.{0,40}gameplay.{0,40}chat|facecam oben.{0,20}gameplay/.test(lower)) return false;
  const parsed = parseOverlayIntent(message, {
    dnaName: ctx?.dnaName,
    preferredPlatform: ctx?.preferredPlatform,
  });
  return parsed.missing.includes('platform');
}

export function applyOverlayChangeRequest(config: OverlayConfig, request: string): OverlayConfig {
  const parsed = parseOverlayIntent(request, {
    primaryColors: config.colors,
    styleDirection: config.style,
    mascot: config.motif,
  });
  const lower = request.toLowerCase();
  let next: OverlayConfig = { ...config };
  if (parsed.convertToPlatform) {
    next = applyOverlayPlatformPreset(next, parsed.convertToPlatform);
  }
  const layout = parseLayout(lower);
  if (layout && !parsed.convertToPlatform) next = applyOverlayLayoutPreset(next, layout);
  const logoPos = parseLogoPosition(lower);
  if (logoPos) next.logoPosition = logoPos;
  if (/facecam kleiner/.test(lower)) {
    next.facecamRegion = scaleRegion(next.facecamRegion, 0.85, next.width, next.height);
    next.layoutPreset = 'custom';
  }
  if (/gameplay größer/.test(lower)) {
    next.gameplayRegion = scaleRegion(next.gameplayRegion, 1.08, next.width, next.height);
    next.layoutPreset = 'custom';
  }
  if (/chat höher/.test(lower)) {
    next.chatRegion = moveRegion(next.chatRegion, 0, -80, next.width, next.height);
    next.layoutPreset = 'custom';
  }
  if (/chat.{0,16}unten|weiter nach unten/.test(lower)) {
    next.chatRegion = moveRegion(next.chatRegion, 0, 80, next.width, next.height);
    next.layoutPreset = 'custom';
  }
  if (/mehr blau|blau/.test(lower)) next.colors = parsed.config.colors;
  if (/weniger effekte/.test(lower)) next.decorations = 'minimal accents';
  if (/rahmen dünner|dünn/.test(lower)) next.borderStyle = 'thin';
  if (/transparent/.test(lower)) {
    next.transparentBackground = true;
    next.gameplayRegion = { ...next.gameplayRegion, transparent: true };
    if (next.facecamRegion.visible) next.facecamRegion = { ...next.facecamRegion, transparent: true };
    next.format = 'png';
  }
  const fmt = validateOverlayFormat(
    next.format,
    next.transparentBackground || next.gameplayRegion.transparent || next.facecamRegion.transparent
  );
  if (fmt.ok) next.format = fmt.format;
  next.prompt = sanitizeOverlayStyleRequest(`${next.prompt ?? ''} ${request}`.trim());
  next.qualityProfile = resolveNexterQualityMode(next.style);
  next.summary = buildOverlayDesignSummary(next);
  return next;
}

export function overlayDownloadFilename(input: {
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
  return `${slug(input.creatorName)}-${slug(input.platform)}-overlay-v${version}.${ext}`;
}

function regionPrompt(region: OverlayRegion, name: string, hole: string): string | null {
  if (!region.visible) return `${name} region hidden`;
  return `${name} at ${region.x},${region.y} size ${region.width}x${region.height}${
    region.transparent ? `; TRANSPARENT ${hole}: keep this rectangle fully transparent (alpha 0), never fill with generated scenery` : ''
  }`;
}

export function overlayPromptComposition(config: OverlayConfig): string {
  return [
    `exact canvas ${config.aspectRatio} (${config.width}x${config.height}px)`,
    `layout ${overlayLayoutLabel(config.layoutPreset)}`,
    'DESIGN ELEMENTS: decorative frames, HUD chrome, borders, logo and alerts live ONLY outside transparent content holes',
    regionPrompt(config.gameplayRegion, 'gameplay', 'CONTENT AREA / GAMEPLAY WINDOW'),
    regionPrompt(config.facecamRegion, 'facecam', 'CAMERA INTERIOR'),
    regionPrompt(config.chatRegion, 'chat', 'CHAT WINDOW'),
    regionPrompt(config.alertRegion, 'alert', 'ALERT SLOT'),
    config.transparentBackground
      ? 'outside designed chrome also transparent PNG/WebP overlay for OBS'
      : 'full-screen graphic only when this is a starting/BRB/offline screen',
    `border style ${config.borderStyle}`,
    config.logoJobId
      ? `place the creator’s own logo ${config.logoPosition.replace('-', ' ')}, never covering transparent content holes`
      : 'no third-party logos',
    config.facecamJobId ? 'compose around the creator’s own facecam frame as reference, do not invent another streamer’s cam' : null,
    config.decorations ? `subtle decorations: ${config.decorations}` : 'restrained streaming HUD accents',
  ]
    .filter(Boolean)
    .join('; ');
}

export function overlayPromptConstraints(config: OverlayConfig): string {
  return [
    config.motif ? `motif on chrome only: ${config.motif}` : null,
    config.logoJobId
      ? 'integrate the creator’s own logo as a reference, do not invent a third-party or other streamer’s brand mark'
      : 'no third-party logos, no famous streamer overlays',
    qualityInstructionsForStyle(config.style),
    'OBS/Streamlabs compatible overlay, no watermark, not a photo of a monitor',
  ]
    .filter(Boolean)
    .join('; ');
}

export function overlayStudioPath(): string {
  return NEXTER_STUDIO_PATHS.overlay;
}
