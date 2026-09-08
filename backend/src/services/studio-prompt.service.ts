import type { CreatorDNA } from '@ucbs/shared';
import {
  BANNER_PLATFORM_SPECS,
  buildDnaPromptContext,
  buildLogoPrompt,
  buildStructuredStudioPrompt,
  qualityInstructionsForStyle,
  qualityNegativesForStyle,
  bannerConfigFromGenerationOptions,
  bannerPromptComposition,
  bannerPromptConstraints,
  facecamConfigFromGenerationOptions,
  facecamPromptComposition,
  facecamPromptConstraints,
  overlayConfigFromGenerationOptions,
  overlayPromptComposition,
  overlayPromptConstraints,
  stickerConfigFromGenerationOptions,
  stickerPromptComposition,
  stickerPromptConstraints,
  mockupPromptComposition,
  mockupPromptConstraints,
  type BannerGenerationOptions,
  type FacecamGenerationOptions,
  type OverlayGenerationOptions,
  type StickerGenerationOptions,
  type MockupConfig,
} from '@ucbs/shared';

export { buildLogoPrompt, buildDnaPromptContext, buildStructuredStudioPrompt };

function colorList(dna: CreatorDNA, custom?: string[]): string {
  const fromDna = [...dna.primaryColors, ...dna.secondaryColors, ...dna.accentColors].filter(Boolean);
  const merged = [...(custom ?? []), ...fromDna].slice(0, 6);
  return merged.length ? merged.join(', ') : 'brand accent colors';
}

function dnaTail(dna: CreatorDNA): string {
  return buildDnaPromptContext(dna);
}

function qualityFor(dna: CreatorDNA, styleOverride?: string) {
  const style = styleOverride || dna.styleDirection;
  return {
    style,
    quality: qualityInstructionsForStyle(style),
    negatives: qualityNegativesForStyle(style),
  };
}

export function buildBannerPrompt(dna: CreatorDNA, opts: BannerGenerationOptions): string {
  const spec = BANNER_PLATFORM_SPECS[opts.platform] ?? BANNER_PLATFORM_SPECS.twitch;
  const q = qualityFor(dna, opts.style);
  const config = bannerConfigFromGenerationOptions(opts, {
    title: opts.title || dna.name,
    colors: [...dna.primaryColors, ...dna.secondaryColors].filter(Boolean).slice(0, 4),
    motif: opts.motif || dna.mascot,
    style: opts.style || dna.styleDirection,
  });
  return buildStructuredStudioPrompt({
    assetType: 'banner',
    creatorDna: dnaTail(dna),
    userRequest: opts.title || `creator: ${dna.name}`,
    style: q.style,
    composition: bannerPromptComposition(config),
    colors: colorList(dna),
    platformFormat: `${spec.label} ${spec.aspect} (${config.width}x${config.height}px)`,
    quality: q.quality,
    constraints: [
      bannerPromptConstraints(config),
      dna.visualLanguage ? `visual language: ${dna.visualLanguage}` : null,
      dna.fonts[0] ? `typography feel: ${dna.fonts[0].name}` : null,
    ]
      .filter(Boolean)
      .join('; '),
    negatives: q.negatives,
  });
}

export function buildFacecamPrompt(dna: CreatorDNA, opts: FacecamGenerationOptions = {}): string {
  const q = qualityFor(dna, opts.style);
  const config = facecamConfigFromGenerationOptions(opts, {
    colors: [...dna.primaryColors, ...dna.secondaryColors].filter(Boolean).slice(0, 4),
    motif: opts.motif || dna.mascot,
    style: opts.style || dna.styleDirection,
  });
  return buildStructuredStudioPrompt({
    assetType: 'facecam',
    creatorDna: dnaTail(dna),
    userRequest: opts.decorations || `webcam overlay frame for ${config.platform}`,
    style: q.style,
    composition: facecamPromptComposition(config),
    colors: colorList(dna, config.colors),
    platformFormat: `${config.platform} ${config.aspectRatio} (${config.width}x${config.height}px)`,
    quality: q.quality,
    constraints: [
      facecamPromptConstraints(config),
      opts.animated || dna.animations?.length
        ? `motion cues stay on the FRAME only: ${(dna.animations?.length ? dna.animations : ['dynamic accent lines']).join(', ')}`
        : 'clean static overlay',
      dna.visualLanguage ? `visual language: ${dna.visualLanguage}` : null,
      'DESIGN AREA vs TRANSPARENT CAMERA INTERIOR must remain distinct',
    ]
      .filter(Boolean)
      .join('; '),
    negatives: q.negatives,
  });
}

export function buildOverlayPrompt(dna: CreatorDNA, opts: OverlayGenerationOptions = {}): string {
  const q = qualityFor(dna, opts.style);
  const config = overlayConfigFromGenerationOptions(opts, {
    colors: [...dna.primaryColors, ...dna.secondaryColors].filter(Boolean).slice(0, 4),
    motif: opts.motif || dna.mascot,
    style: opts.style || dna.styleDirection,
  });
  return buildStructuredStudioPrompt({
    assetType: 'overlay',
    creatorDna: dnaTail(dna),
    userRequest: opts.decorations || `${config.layoutPreset} stream overlay for ${config.platform}`,
    style: q.style,
    composition: overlayPromptComposition(config),
    colors: colorList(dna, config.colors),
    platformFormat: `${config.platform} ${config.aspectRatio} (${config.width}x${config.height}px)`,
    quality: q.quality,
    constraints: [
      overlayPromptConstraints(config),
      opts.animated || dna.animations?.length
        ? `motion cues stay on DESIGN ELEMENTS only: ${(dna.animations?.length ? dna.animations : ['glow accents']).join(', ')}`
        : 'clean static overlay',
      dna.visualLanguage ? `visual language: ${dna.visualLanguage}` : null,
      'DESIGN ELEMENTS vs TRANSPARENT CONTENT AREAS must remain distinct',
    ]
      .filter(Boolean)
      .join('; '),
    negatives: q.negatives,
  });
}

export function buildStickerPrompt(dna: CreatorDNA, opts: StickerGenerationOptions = {}): string {
  const q = qualityFor(dna, opts.style);
  const config = stickerConfigFromGenerationOptions(opts, {
    colors: [...dna.primaryColors, ...dna.secondaryColors].filter(Boolean).slice(0, 4),
    motif: opts.motif || dna.mascot,
    style: opts.style || dna.styleDirection,
  });
  return buildStructuredStudioPrompt({
    assetType: config.kind === 'badge' ? 'badge' : 'sticker',
    creatorDna: dnaTail(dna),
    userRequest: opts.text || opts.name || `${config.kind} for ${config.platform}`,
    style: q.style,
    composition: stickerPromptComposition(config),
    colors: colorList(dna, config.colors),
    platformFormat: `${config.platform} ${config.width}x${config.height}px ${config.format}`,
    quality: q.quality,
    constraints: [
      stickerPromptConstraints(config),
      dna.visualLanguage ? `visual language: ${dna.visualLanguage}` : null,
    ]
      .filter(Boolean)
      .join('; '),
    negatives: q.negatives,
  });
}

export function buildMockupPrompt(dna: CreatorDNA, config: MockupConfig): string {
  const q = qualityFor(dna, config.scene);
  return buildStructuredStudioPrompt({
    assetType: 'mockup',
    creatorDna: dnaTail(dna),
    userRequest: `lifestyle product photo of a ${config.colorId} ${config.category} with the creator artwork printed on it`,
    style: q.style,
    composition: mockupPromptComposition(config),
    colors: colorList(dna, [config.colorId]),
    platformFormat: `${config.outputWidth}x${config.outputHeight}px ${config.outputFormat}`,
    quality: q.quality,
    constraints: [
      mockupPromptConstraints(config),
      dna.visualLanguage ? `visual language: ${dna.visualLanguage}` : null,
    ]
      .filter(Boolean)
      .join('; '),
    negatives: q.negatives,
  });
}

export function buildBrandingPackPrompt(dna: CreatorDNA, module: string): string {
  const q = qualityFor(dna);
  const prompts: Record<string, string> = {
    'profile-pic': buildStructuredStudioPrompt({
      assetType: 'logo',
      creatorDna: dnaTail(dna),
      userRequest: `square creator profile avatar icon for ${dna.name}`,
      style: q.style,
      colors: colorList(dna),
      quality: q.quality,
      constraints: 'bold recognizable, no watermark',
      negatives: q.negatives,
    }),
    banner: buildBannerPrompt(dna, { platform: 'twitch', title: dna.name }),
    facecam: buildFacecamPrompt(dna, { transparentBackground: true }),
    overlay: buildOverlayPrompt(dna, { overlayType: 'hud', transparentBackground: true }),
    'stream-start': buildOverlayPrompt(dna, { overlayType: 'starting-soon', transparentBackground: false }),
    'stream-end': buildStructuredStudioPrompt({
      assetType: 'outro',
      creatorDna: dnaTail(dna),
      userRequest: `stream ending / thank you screen for ${dna.name}`,
      style: q.style,
      colors: colorList(dna),
      quality: q.quality,
      constraints: 'full-screen endcard, farewell message area, social handles space, no watermark',
      negatives: q.negatives,
    }),
    offline: buildStructuredStudioPrompt({
      assetType: 'overlay',
      creatorDna: dnaTail(dna),
      userRequest: `stream offline screen for ${dna.name}`,
      style: q.style,
      colors: colorList(dna),
      quality: q.quality,
      constraints: 'full-screen offline graphic, clear OFFLINE status, schedule placeholder, no watermark',
      negatives: q.negatives,
    }),
    panel: buildOverlayPrompt(dna, { overlayType: 'panel', transparentBackground: true }),
    alert: buildOverlayPrompt(dna, { overlayType: 'alert', transparentBackground: true }),
  };
  return (
    prompts[module] ??
    buildStructuredStudioPrompt({
      assetType: module,
      creatorDna: dnaTail(dna),
      style: q.style,
      colors: colorList(dna),
      quality: q.quality,
      negatives: q.negatives,
    })
  );
}

export function bannerOpenAiSize(platform: BannerGenerationOptions['platform']): '1792x1024' | '1024x1792' {
  const spec = BANNER_PLATFORM_SPECS[platform] ?? BANNER_PLATFORM_SPECS.twitch;
  return spec.height > spec.width ? '1024x1792' : '1792x1024';
}
