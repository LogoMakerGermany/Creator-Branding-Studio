/**
 * Quality vs style are separate: high production value must never override
 * a chosen style such as minimal / comic / clean.
 */

export type NexterQualityMode = 'cinematic-premium' | 'clean-premium' | 'stylized-premium';

export type NexterAssetType =
  | 'logo'
  | 'facecam'
  | 'overlay'
  | 'banner'
  | 'starting-screen'
  | 'brb-screen'
  | 'ending-screen'
  | 'streamset'
  | 'intro'
  | 'outro'
  | 'animation'
  | 'sticker'
  | 'badge'
  | 'short'
  | 'video'
  | 'audio';

const MINIMAL_STYLES = /minimal|clean|corporate/;
const STYLIZED_STYLES = /comic|cartoon|anime/;

export function resolveNexterQualityMode(
  style?: string | null,
  stylePreferences?: string[] | null
): NexterQualityMode {
  const pool = [style, ...(stylePreferences ?? [])]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());
  if (pool.some((s) => MINIMAL_STYLES.test(s))) return 'clean-premium';
  if (pool.some((s) => STYLIZED_STYLES.test(s))) return 'stylized-premium';
  return 'cinematic-premium';
}

export const NEXTER_QUALITY_PROFILES: Record<
  NexterQualityMode,
  { label: string; instructions: string; negatives: string }
> = {
  'cinematic-premium': {
    label: 'Ultra-Cinematic Premium',
    instructions:
      'ultra-cinematic, high-end 3D materials, strong depth, professional lighting, high detail, premium game-art / creator branding, clean composition, premium text/logo integration if the provider supports text',
    negatives:
      'cheap plastic, muddy lighting, cluttered composition, artifacts, watermark, low-res, stretched logos, amateur collage',
  },
  'clean-premium': {
    label: 'Clean Premium',
    instructions:
      'premium but restrained: generous negative space, crisp geometry, subtle professional lighting, high production value without cinematic 3D excess, sharp edges, calm composition',
    negatives:
      'ultra-cinematic 3D, heavy volumetric fog, ornate particles, clutter, artifacts, watermark, baroque ornament',
  },
  'stylized-premium': {
    label: 'Stylized Premium',
    instructions:
      'high-end stylized illustration matching the chosen art style, readable shapes, professional lighting for that style, premium creator branding, clean composition',
    negatives:
      'photoreal cinematic 3D override, muddy colors, artifacts, watermark, unreadable details',
  },
};

export function qualityInstructionsForStyle(
  style?: string | null,
  stylePreferences?: string[] | null
): string {
  const mode = resolveNexterQualityMode(style, stylePreferences);
  return NEXTER_QUALITY_PROFILES[mode].instructions;
}

export function qualityNegativesForStyle(
  style?: string | null,
  stylePreferences?: string[] | null
): string {
  const mode = resolveNexterQualityMode(style, stylePreferences);
  return NEXTER_QUALITY_PROFILES[mode].negatives;
}

export const ASSET_COMPOSITION_HINTS: Record<string, string> = {
  logo: 'centered emblem, strong silhouette, readable at small sizes, no mockup scene',
  facecam: 'decorative webcam border only, center kept clear for camera feed, transparent-friendly',
  overlay: 'HUD-safe margins, OBS/Streamlabs compatible, transparent-friendly where needed',
  banner: 'wide header graphic, text-safe zones, readable at thumbnail size',
  'starting-screen': 'full-screen starting soon graphic, readable title, opaque background',
  'brb-screen': 'full-screen be-right-back graphic, readable pause copy, opaque background',
  'ending-screen': 'full-screen endcard, farewell area, opaque background',
  streamset: 'matching pack of stream screens that share one visual system',
  intro: 'short branded open, readable title moment, no clutter',
  outro: 'endcard with brand mark and calm social/handle area',
  animation: 'loop-friendly motion, brand-consistent, no random extra characters',
  sticker: 'bold isolated sticker/emote, readable at emoji size',
  mockup: 'photorealistic merch mockup, readable printed artwork, no extra brands',
  badge: 'compact badge/icon, high contrast, simple silhouette',
  short: 'vertical 9:16 framing, subject-safe center, platform-native pacing',
  video: 'cinematic but brand-consistent framing, no fake gameplay events',
  audio: 'mix-ready instrumental branding sting, no vocal unless requested',
};

export interface StructuredStudioPromptInput {
  assetType: string;
  creatorDna?: string;
  userRequest?: string;
  style?: string;
  composition?: string;
  colors?: string;
  platformFormat?: string;
  quality?: string;
  constraints?: string;
  negatives?: string;
}

/** Numbered, filtered prompt — empty sections are omitted. */
export function buildStructuredStudioPrompt(input: StructuredStudioPromptInput): string {
  const composition = input.composition || ASSET_COMPOSITION_HINTS[input.assetType] || '';
  const sections: Array<[string, string | undefined]> = [
    ['1. Asset Type', input.assetType],
    ['2. Creator DNA', input.creatorDna],
    ['3. User Request', input.userRequest],
    ['4. Style', input.style],
    ['5. Composition', composition],
    ['6. Colors', input.colors],
    ['7. Platform/Format', input.platformFormat],
    ['8. Quality Profile', input.quality],
    ['9. Constraints', input.constraints],
    ['10. Avoid', input.negatives],
  ];
  return sections
    .filter(([, value]) => Boolean(value && String(value).trim()))
    .map(([label, value]) => `${label}: ${String(value).trim()}`)
    .join('\n');
}
