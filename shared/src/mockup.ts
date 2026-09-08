import { resolveNexterQualityMode } from './nexter-quality';
import { NEXTER_STUDIO_PATHS } from './nexter';

export type MockupProductCategory =
  | 'mug'
  | 'tshirt'
  | 'hoodie'
  | 'cap'
  | 'phone'
  | 'poster'
  | 'tote';

export const MOCKUP_CATEGORIES: { id: MockupProductCategory; label: string }[] = [
  { id: 'mug', label: 'Tassen' },
  { id: 'tshirt', label: 'T-Shirts' },
  { id: 'hoodie', label: 'Hoodies' },
  { id: 'cap', label: 'Caps' },
  { id: 'phone', label: 'Phone Cases' },
  { id: 'poster', label: 'Poster' },
  { id: 'tote', label: 'Mehr' },
];

export const MOCKUP_COLORS = [
  { id: 'white', hex: '#F5F5F5', label: 'Weiß' },
  { id: 'black', hex: '#111111', label: 'Schwarz' },
  { id: 'gray', hex: '#3F3F46', label: 'Grau' },
  { id: 'purple', hex: '#7C3AED', label: 'Lila' },
  { id: 'magenta', hex: '#C026D3', label: 'Magenta' },
] as const;

export const MOCKUP_MODELS: Record<MockupProductCategory, string[]> = {
  mug: ['Classic 11oz', 'Latte'],
  tshirt: ['Unisex Classic', 'Oversize'],
  hoodie: ['Pullover', 'Zip'],
  cap: ['Snapback', 'Dad Cap'],
  phone: ['iPhone', 'Universal'],
  poster: ['A3 Hochformat', 'Quadrat'],
  tote: ['Canvas Bag', 'Shopper'],
};

export type MockupPlacement = 'front' | 'wrap' | 'corner' | 'center';
export const MOCKUP_PLACEMENTS: MockupPlacement[] = ['front', 'center', 'wrap', 'corner'];

export type MockupMode = 'local' | 'lifestyle';
export type MockupOutputFormat = 'svg' | 'png' | 'webp' | 'jpg';
export type MockupSourceKind = 'logo' | 'sticker' | 'banner' | 'file';

export const MOCKUP_SCALE_MIN = 40;
export const MOCKUP_SCALE_MAX = 140;
export const MOCKUP_OUTPUT_PX = 800;
export const MOCKUP_OUTPUT_MIN = 512;
export const MOCKUP_OUTPUT_MAX = 1024;
export const MOCKUP_REFERENCE_MIMES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;
export const MAX_MOCKUP_PROMPT_CHARS = 4000;

export const PRODUCT_LABEL: Record<MockupProductCategory, string> = {
  mug: 'Keramiktasse',
  tshirt: 'T-Shirt',
  hoodie: 'Hoodie',
  cap: 'Cap',
  phone: 'Phone Case',
  poster: 'Poster',
  tote: 'Tote Bag',
};

export interface MockupConfig {
  mode: MockupMode;
  category: MockupProductCategory;
  colorId: string;
  modelLabel: string;
  placement: MockupPlacement;
  scalePercent: number;
  sourceKind?: MockupSourceKind;
  sourceLogoJobId?: string;
  sourceStickerJobId?: string;
  sourceBannerJobId?: string;
  sourceFileId?: string;
  outputWidth: number;
  outputHeight: number;
  outputFormat: MockupOutputFormat;
  qualityProfile: string;
  scene?: string;
  summary: string;
}

export interface MockupGenerateInput {
  category: MockupProductCategory;
  colorId: string;
  modelLabel: string;
  placement: MockupPlacement;
  scalePercent: number;
  designUrl?: string;
  sourceLogoJobId?: string;
  sourceStickerJobId?: string;
  sourceBannerJobId?: string;
  sourceFileId?: string;
  lifestyle?: boolean;
  projectId?: string;
  parentJobId?: string;
  request?: string;
}

export interface MockupJob {
  id: string;
  userId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  category: MockupProductCategory;
  colorId: string;
  modelLabel: string;
  placement: MockupPlacement;
  scalePercent: number;
  designUrl: string;
  imageUrl?: string;
  previewUrl?: string;
  lifestyle: boolean;
  mode?: MockupMode;
  provider?: string;
  error?: string;
  projectId?: string;
  fileId?: string;
  generationJobId?: string;
  parentJobId?: string;
  version?: number;
  downloadName?: string;
  fileMissing?: boolean;
  sourceMissing?: boolean;
  config?: MockupConfig;
  sourceLogoJobId?: string;
  sourceStickerJobId?: string;
  sourceBannerJobId?: string;
  sourceFileId?: string;
  createdAt: string;
  completedAt?: string;
}

export interface MockupIntent {
  category: MockupProductCategory;
  colorId: string;
  lifestyle?: boolean;
  placement?: MockupPlacement;
  scalePercent?: number;
  sourceLogoJobId?: string;
  sourceStickerJobId?: string;
  mentionedProduct?: boolean;
  missing?: string[];
  followUpQuestion?: string | null;
  summary?: string;
  mode?: MockupMode;
}

export function mockupColorHex(colorId: string): string {
  return MOCKUP_COLORS.find((c) => c.id === colorId)?.hex ?? '#F5F5F5';
}

export function mockupColorLabel(colorId: string): string {
  return MOCKUP_COLORS.find((c) => c.id === colorId)?.label ?? 'Weiß';
}

export function mockupPlacementLabel(placement: MockupPlacement): string {
  if (placement === 'corner') return 'oben/Ecke';
  if (placement === 'wrap') return 'umlaufend';
  if (placement === 'center') return 'mittig';
  return 'vorne mittig';
}

export function validateMockupScale(value: unknown): { ok: true; scale: number } | { ok: false; message: string } {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, message: 'Größe muss eine positive Zahl sein.' };
  }
  if (n < MOCKUP_SCALE_MIN || n > MOCKUP_SCALE_MAX) {
    return { ok: false, message: `Größe muss zwischen ${MOCKUP_SCALE_MIN} und ${MOCKUP_SCALE_MAX} Prozent liegen.` };
  }
  return { ok: true, scale: Math.round(n) };
}

export function validateMockupPlacement(value: unknown): { ok: true; placement: MockupPlacement } | { ok: false; message: string } {
  if (typeof value === 'string' && MOCKUP_PLACEMENTS.includes(value as MockupPlacement)) {
    return { ok: true, placement: value as MockupPlacement };
  }
  return { ok: false, message: 'Platzierung: vorne, mitte, umlaufend oder Ecke.' };
}

export function validateMockupDimensions(
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
  if (w < MOCKUP_OUTPUT_MIN || h < MOCKUP_OUTPUT_MIN) {
    return { ok: false, message: `Mindestgröße ist ${MOCKUP_OUTPUT_MIN}×${MOCKUP_OUTPUT_MIN} Pixel.` };
  }
  if (w > MOCKUP_OUTPUT_MAX || h > MOCKUP_OUTPUT_MAX) {
    return { ok: false, message: `Maximalgröße ist ${MOCKUP_OUTPUT_MAX}×${MOCKUP_OUTPUT_MAX} Pixel.` };
  }
  return { ok: true, width: w, height: h };
}

export function validateMockupFormat(
  format: unknown,
  mode: MockupMode
): { ok: true; format: MockupOutputFormat } | { ok: false; message: string } {
  const raw = String(format ?? (mode === 'local' ? 'svg' : 'png')).toLowerCase().replace('jpeg', 'jpg');
  const allowed: MockupOutputFormat[] = mode === 'local' ? ['svg', 'png'] : ['png', 'webp', 'jpg'];
  if (!allowed.includes(raw as MockupOutputFormat)) {
    return {
      ok: false,
      message:
        mode === 'local'
          ? 'Lokale Composites unterstützen SVG oder PNG.'
          : 'Lifestyle-Mockups unterstützen PNG, WEBP oder JPG.',
    };
  }
  return { ok: true, format: raw as MockupOutputFormat };
}

export function defaultMockupConfig(overrides?: Partial<MockupConfig>): MockupConfig {
  const category = overrides?.category && MOCKUP_MODELS[overrides.category] ? overrides.category : 'mug';
  const mode = overrides?.mode === 'lifestyle' ? 'lifestyle' : 'local';
  const scale = validateMockupScale(overrides?.scalePercent ?? 100);
  const placement = validateMockupPlacement(overrides?.placement ?? 'front');
  const format = validateMockupFormat(overrides?.outputFormat, mode);
  const config: MockupConfig = {
    mode,
    category,
    colorId: MOCKUP_COLORS.some((c) => c.id === overrides?.colorId) ? String(overrides?.colorId) : 'white',
    modelLabel: overrides?.modelLabel || MOCKUP_MODELS[category][0],
    placement: placement.ok ? placement.placement : 'front',
    scalePercent: scale.ok ? scale.scale : 100,
    sourceKind: overrides?.sourceKind,
    sourceLogoJobId: overrides?.sourceLogoJobId,
    sourceStickerJobId: overrides?.sourceStickerJobId,
    sourceBannerJobId: overrides?.sourceBannerJobId,
    sourceFileId: overrides?.sourceFileId,
    outputWidth: overrides?.outputWidth ?? MOCKUP_OUTPUT_PX,
    outputHeight: overrides?.outputHeight ?? MOCKUP_OUTPUT_PX,
    outputFormat: format.ok ? format.format : mode === 'local' ? 'svg' : 'png',
    qualityProfile: overrides?.qualityProfile ?? resolveNexterQualityMode(overrides?.scene || 'gaming'),
    scene: overrides?.scene,
    summary: '',
  };
  config.summary = buildMockupDesignSummary(config);
  return config;
}

export function buildMockupDesignSummary(config: MockupConfig): string {
  const source =
    config.sourceKind === 'sticker'
      ? 'dein Sticker'
      : config.sourceKind === 'banner'
        ? 'dein Banner'
        : config.sourceKind === 'file'
          ? 'dein Design'
          : 'dein Logo';
  const local = `${source} wird ${mockupPlacementLabel(config.placement)} auf ${mockupColorLabel(config.colorId).toLowerCase()}n ${PRODUCT_LABEL[config.category]} platziert, Größe ${config.scalePercent}%, neutraler Studiohintergrund.`;
  if (config.mode === 'lifestyle') {
    return `KI-Lifestyle-Generierung – kostenpflichtiger Generierungsjob. ${local}`;
  }
  return local;
}

export function mockupDownloadFilename(input: {
  creatorName: string;
  sourceKind?: string;
  category: string;
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
  const source = slug(input.sourceKind || 'logo');
  return `${slug(input.creatorName)}-${source}-${slug(input.category)}-mockup-v${version}.${ext}`;
}

function parseCategory(lower: string): MockupProductCategory | undefined {
  if (/hoodie|kapuzen/.test(lower)) return 'hoodie';
  if (/t-?shirt|shirt/.test(lower)) return 'tshirt';
  if (/\bcap|kappe|mütze/.test(lower)) return 'cap';
  if (/phone|handy|case/.test(lower)) return 'phone';
  if (/poster|plakat/.test(lower)) return 'poster';
  if (/tote|beutel|tasche/.test(lower) && !/tasse/.test(lower)) return 'tote';
  if (/tasse|mug|becher/.test(lower)) return 'mug';
  return undefined;
}

export function isLifestyleMockupRequest(message: string): boolean {
  const lower = String(message ?? '').toLowerCase();
  if (/lifestyle|realistisch|photoreal|foto|café|cafe/.test(lower)) return true;
  if (/ki[- ]?(lifestyle|mockup|foto)/.test(lower)) return true;
  if (/zeig mir (eine? )?schwarze tasse/.test(lower) && !/composite|lokal|vorschau/.test(lower)) return true;
  return false;
}

export function parseMockupIntent(
  message: string,
  ctx?: {
    lastLogoId?: string;
    lastStickerId?: string;
    lastBannerId?: string;
    lastMockupId?: string;
    dnaName?: string;
  }
): MockupIntent {
  const lower = String(message ?? '').toLowerCase();
  const mentioned = parseCategory(lower);
  const category = mentioned ?? 'mug';
  let colorId = 'white';
  if (/schwarz|black/.test(lower)) colorId = 'black';
  else if (/grau|gray|grey/.test(lower)) colorId = 'gray';
  else if (/lila|violet|purple/.test(lower)) colorId = 'purple';
  else if (/magenta|pink/.test(lower)) colorId = 'magenta';
  else if (/weiß|weiss|white/.test(lower)) colorId = 'white';

  const lifestyle = isLifestyleMockupRequest(message);
  const mode: MockupMode = lifestyle ? 'lifestyle' : 'local';
  let placement: MockupPlacement = 'front';
  if (/ecke|oben|höher|hoeher/.test(lower)) placement = 'corner';
  else if (/umlauf|wrap/.test(lower)) placement = 'wrap';
  else if (/mitte|mittig|center/.test(lower)) placement = 'center';

  let scalePercent = 100;
  if (/kleiner|verkleiner/.test(lower)) scalePercent = 70;
  if (/größer|groesser|vergrößer/.test(lower)) scalePercent = 120;

  const wantsSticker = /sticker|emote|badge/.test(lower);
  const wantsLogo = /\blogo\b/.test(lower) || (!wantsSticker && Boolean(ctx?.lastLogoId));
  const sourceLogoJobId = wantsLogo && !wantsSticker ? ctx?.lastLogoId : undefined;
  const sourceStickerJobId = wantsSticker ? ctx?.lastStickerId : undefined;

  const config = defaultMockupConfig({
    mode,
    category,
    colorId,
    placement,
    scalePercent,
    sourceKind: sourceStickerJobId ? 'sticker' : sourceLogoJobId ? 'logo' : undefined,
    sourceLogoJobId,
    sourceStickerJobId,
  });

  const missing: string[] = [];
  if (!mentioned && !/tasse|mug/.test(lower)) missing.push('product');
  if (!sourceLogoJobId && !sourceStickerJobId && !ctx?.lastLogoId && !/logo|sticker|design/.test(lower)) {
    missing.push('asset');
  }
  if (/\bmockup\b/.test(lower) && !lifestyle && !mentioned) missing.push('mode');

  const followUpQuestion = missing.includes('asset')
    ? 'Welches eigene Asset — dein letztes Logo, ein Sticker oder ein Banner? Fremde Dateien nutze ich nicht.'
    : missing.includes('product')
      ? 'Welches Produkt — Tasse, Shirt, Hoodie, Cap, Phone, Poster oder Tote? Lokal (kostenlos) oder Lifestyle-KI?'
      : missing.includes('mode')
        ? 'Lokales Composite (kostenlos) oder realistische Lifestyle-KI (kostenpflichtig)?'
        : null;

  return {
    category,
    colorId,
    lifestyle,
    mode,
    placement,
    scalePercent,
    sourceLogoJobId,
    sourceStickerJobId,
    mentionedProduct: Boolean(mentioned),
    missing,
    followUpQuestion,
    summary: config.summary,
  };
}

export function mockupNeedsFollowUp(
  message: string,
  ctx?: { lastLogoId?: string; lastStickerId?: string; lastMockupId?: string }
): boolean {
  const lower = String(message ?? '').toLowerCase();
  if (!/\bmockup|tasse|hoodie|t-?shirt|shirt|\bcap\b|poster|phone|handy|tote/.test(lower)) return false;
  if (/öffne|open|geh(e)? zu/.test(lower)) return false;
  if (
    /kleiner|größer|änder|variante|höher|schwarz|heller/.test(lower) &&
    (ctx?.lastMockupId || /mein(em)? mockup/.test(lower))
  ) {
    return false;
  }
  const parsed = parseMockupIntent(message, ctx);
  return Boolean(parsed.missing?.length);
}

export function applyMockupChangeRequest(config: MockupConfig, request: string): MockupConfig {
  const parsed = parseMockupIntent(request);
  const lower = request.toLowerCase();
  let next: MockupConfig = { ...config };
  if (parsed.mentionedProduct) next.category = parsed.category;
  if (/schwarz|weiß|weiss|grau|lila|magenta|black|white/.test(lower)) next.colorId = parsed.colorId;
  if (/ecke|oben|höher|hoeher/.test(lower)) next.placement = 'corner';
  else if (/umlauf|wrap/.test(lower)) next.placement = 'wrap';
  else if (/mitte|mittig/.test(lower)) next.placement = 'center';
  if (/kleiner|verkleiner/.test(lower)) next.scalePercent = Math.max(MOCKUP_SCALE_MIN, next.scalePercent - 30);
  if (/größer|groesser/.test(lower)) next.scalePercent = Math.min(MOCKUP_SCALE_MAX, next.scalePercent + 20);
  if (/lifestyle|realistisch|foto/.test(lower)) next.mode = 'lifestyle';
  if (/sticker/.test(lower)) next.sourceKind = 'sticker';
  if (/\blogo\b/.test(lower) && /stattdessen|nimm/.test(lower)) next.sourceKind = 'logo';
  next.modelLabel = MOCKUP_MODELS[next.category][0];
  next.summary = buildMockupDesignSummary(next);
  return next;
}

export function mockupPromptComposition(config: MockupConfig): string {
  return [
    `photorealistic ${mockupColorLabel(config.colorId)} ${PRODUCT_LABEL[config.category]} merch mockup`,
    `creator artwork printed ${mockupPlacementLabel(config.placement)} at ${config.scalePercent}% scale`,
    config.scene || 'lifestyle cafe/studio lighting, shallow depth of field',
    'use the creator’s own supplied artwork as the print, never invent another brand mark',
  ].join('; ');
}

export function mockupPromptConstraints(config: MockupConfig): string {
  return [
    `square canvas ${config.outputWidth}x${config.outputHeight}px`,
    'no watermark, no extra logos, readable print',
    config.qualityProfile,
  ].join('; ');
}

export function mockupStudioPath(): string {
  return NEXTER_STUDIO_PATHS.mockup;
}
