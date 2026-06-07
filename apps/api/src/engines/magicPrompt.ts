import type { BrandDNA, AssetType } from '@cbs/shared';

const STICKER_VARIATIONS = [
  { pose: 'victory pose arms raised', emotion: 'triumphant', effect: 'neon spark burst' },
  { pose: 'leaning cool smirk', emotion: 'confident', effect: 'cyan glow trail' },
  { pose: 'laughing dynamic', emotion: 'hilarious', effect: 'pink energy waves' },
  { pose: 'fist pump forward', emotion: 'hyped', effect: 'purple lightning' },
  { pose: 'peace sign wink', emotion: 'playful', effect: 'star particle shower' },
];

export interface PromptContext {
  dna: BrandDNA;
  assetType: AssetType;
  platform?: string;
  customText?: string;
  stickerIndex?: number;
  targetAudience?: string;
  wizardContext?: {
    creatorName?: string;
    clanName?: string;
    slogan?: string;
    niche?: string;
    visualStyle?: string;
  };
}

export function buildMagicPrompt(ctx: PromptContext): string {
  const { dna, assetType, platform, customText, stickerIndex = 0, wizardContext } = ctx;
  const colors = [...dna.primaryColors, ...dna.secondaryColors, ...dna.accentColors].join(', ');
  const styleLock = dna.styleLocked ? `STRICT STYLE LOCK: maintain exact style "${dna.brandingStyle}"` : '';
  const stickerVar = assetType === 'sticker' ? STICKER_VARIATIONS[stickerIndex % 5] : null;
  const creatorLine = wizardContext?.creatorName
    ? `Creator brand: ${wizardContext.creatorName}${wizardContext.clanName ? `, clan/team: ${wizardContext.clanName}` : ''}.`
    : '';
  const nicheLine = wizardContext?.niche ? `Niche: ${wizardContext.niche}.` : '';
  const styleLine = wizardContext?.visualStyle ? `Visual style direction: ${wizardContext.visualStyle}.` : '';
  const sloganLine = wizardContext?.slogan ? `Brand slogan energy: "${wizardContext.slogan}".` : '';

  const assetDescriptions: Record<string, string> = {
    logo: 'professional esports gaming logo, icon mark, transparent background',
    banner: 'channel banner header, wide format, transparent edges where possible',
    facecam: 'webcam frame border overlay, transparent center cutout area',
    overlay: 'stream overlay layout frame, transparent background, HUD style',
    panel: 'stream info panel widget, transparent background',
    wallpaper: 'desktop wallpaper background scene',
    thumbnail: 'YouTube thumbnail, bold composition, high contrast',
    sticker: `individual chat sticker/emote, ${stickerVar?.pose}, ${stickerVar?.emotion}, ${stickerVar?.effect}`,
    alert: 'stream alert notification graphic, transparent background',
    offline: 'offline screen graphic, transparent background elements',
    starting_soon: 'starting soon screen, transparent overlay elements',
    brb: 'be right back screen graphic',
    ending: 'stream ending screen graphic',
    social: 'social media post graphic',
    merchandise: 'merchandise print design flat lay',
    discord: 'discord server branding asset',
    youtube: 'youtube channel branding asset',
    tiktok: 'tiktok profile branding asset',
    kick: 'kick streaming branding asset',
    twitch: 'twitch streaming branding asset',
  };

  const parts = [
    `Create a ${assetDescriptions[assetType] || assetType} for brand DNA.`,
    `Brand style: ${dna.brandingStyle}.`,
    `Colors: ${colors}.`,
    `Fonts aesthetic: ${dna.fonts.heading}, ${dna.fonts.body}.`,
    `Visual elements: ${dna.logoShapes.join(', ')}, symbols: ${dna.symbols.join(', ')}.`,
    `Characters/mascot: ${dna.characters.join(', ')}.`,
    `Glow intensity: ${dna.glowStrength}, neon: ${dna.neonStrength}.`,
    `Lighting: ${dna.lightBehavior}. Texture: ${dna.textureBehavior}.`,
    platform ? `Optimized for ${platform} platform.` : '',
    customText ? `Include text: "${customText}".` : '',
    creatorLine,
    nicheLine,
    styleLine,
    sloganLine,
    ['logo', 'sticker', 'facecam', 'panel', 'overlay', 'alert'].includes(assetType)
      ? 'CRITICAL: transparent background, no white background, no black background, PNG alpha.'
      : 'Premium full-frame composition allowed for this asset type.',
    'Premium gaming esports aesthetic, glasmorphism, neon accents.',
    styleLock,
  ];

  return parts.filter(Boolean).join(' ');
}

export function buildNegativePrompt(): string {
  return 'white background, black background, solid background, watermark, blurry, low quality, copyrighted characters, brand logos';
}

export { STICKER_VARIATIONS };
