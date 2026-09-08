import { analyzeMagikName } from './magik/name-parser';
import { BANNER_PLATFORM_SPECS } from './studio';
import { VIDEO_FORMAT_PRESETS, getVideoFormatPreset } from './video-formats';
import type { NexterContextSnapshot, NexterQuoteKind } from './nexter';
import { NEXTER_PLATFORM_LABELS, NEXTER_STYLE_PREFERENCE_LABELS } from './nexter-preferences';

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  };
}

export function colorFamilyLabel(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return '';
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2 / 255;
  const s = max === min ? 0 : (max - min) / 255;
  if (s < 0.12 && l < 0.18) return 'Schwarz';
  if (s < 0.12 && l > 0.82) return 'Weiß';
  if (s < 0.12) return 'Grau';
  let h = 0;
  const d = max - min;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  if (h < 20 || h >= 340) return 'Rot';
  if (h < 45) return 'Orange';
  if (h < 70) return 'Gelb';
  if (h < 160) return 'Grün';
  if (h < 200) return 'Cyan';
  if (h < 255) return 'Blau';
  if (h < 290) return 'Violett';
  return 'Magenta';
}

export function describeKnownColors(ctx: Pick<NexterContextSnapshot, 'primaryColors' | 'secondaryColors' | 'accentColors'>): string {
  const hexes = [...(ctx.primaryColors ?? []), ...(ctx.secondaryColors ?? []), ...(ctx.accentColors ?? [])];
  const labels = [...new Set(hexes.map(colorFamilyLabel).filter(Boolean))];
  return labels.slice(0, 3).join('-') || (hexes.length ? 'gespeicherten Farben' : '');
}

export function describeDnaContinuity(
  ctx: Pick<
    NexterContextSnapshot,
    'hasDna' | 'dnaName' | 'mascot' | 'styleDirection' | 'primaryColors' | 'secondaryColors' | 'accentColors'
  >,
  nextAsset: string
): string | null {
  if (!ctx.hasDna) return null;
  const color = describeKnownColors(ctx);
  const motif = ctx.mascot || ctx.dnaName || 'deinen Look';
  const style = ctx.styleDirection || 'bestehenden Stil';
  const look = [motif, color, style].filter(Boolean).join('/');
  return `Ich kann deinen bestehenden ${look}-Stil für ${nextAsset} übernehmen, damit alles zusammenpasst.`;
}

export function detectNameBasedLogoHelp(message: string): boolean {
  return /wei(ss|ß) (gar )?nicht.{0,40}logo|was (f(ü|u)r ein |f(ü|u)r\'n )?logo.{0,30}(name|passen)|logo.{0,20}zu meinem namen|welches logo passt/i.test(
    message
  );
}

export function suggestLogoDirections(input: {
  name: string;
  platforms?: string[];
  stylePreferences?: string[];
  creatorGoals?: string[];
  dnaStyle?: string;
  dnaColors?: string[];
  mascot?: string;
}): { intro: string; directions: Array<{ title: string; why: string }> } {
  const name = input.name.trim() || 'deinen Creator-Namen';
  const analysis = analyzeMagikName(name);
  const stylePref = input.stylePreferences?.[0];
  const styleLabel =
    (stylePref && NEXTER_STYLE_PREFERENCE_LABELS[stylePref as keyof typeof NEXTER_STYLE_PREFERENCE_LABELS]) ||
    input.dnaStyle ||
    analysis.suggestedStyle;
  const platform = input.platforms?.[0];
  const platformLabel = platform
    ? NEXTER_PLATFORM_LABELS[platform as keyof typeof NEXTER_PLATFORM_LABELS] || platform
    : null;
  const colorHint = input.dnaColors?.length
    ? describeKnownColors({ primaryColors: input.dnaColors })
    : '';

  const directions: Array<{ title: string; why: string }> = [];
  if (input.mascot || analysis.motifs[0]) {
    directions.push({
      title: input.mascot ? `Figur aus deiner DNA (${input.mascot})` : `Namensmotiv (${analysis.summary.replace(/^MAGIK AI:\s*/i, '')})`,
      why: `Direkt aus „${name}“ lesbar, stark als Icon.`,
    });
  }
  if (styleLabel) {
    directions.push({
      title: `${styleLabel}-Emblem`,
      why: input.creatorGoals?.includes('brand')
        ? 'Passt zu deinem Ziel, eine wiedererkennbare Marke aufzubauen.'
        : 'Trifft deinen bevorzugten Stil, ohne ein neues Universum zu erfinden.',
    });
  }
  if (platformLabel) {
    directions.push({
      title: `${platformLabel}-taugliches Zeichen`,
      why: 'Bleibt klein auf Overlay, Facecam und Profilbild lesbar.',
    });
  }
  if (directions.length < 2) {
    directions.push({
      title: 'Reduziertes Lettermark',
      why: `Die Buchstaben von „${name}“ als klares Markenzeichen — gut, wenn das Motiv noch offen ist.`,
    });
  }
  const unique = directions.slice(0, 3);
  const extras = [colorHint ? `Farben: ${colorHint}` : null, platformLabel ? `Plattform: ${platformLabel}` : null]
    .filter(Boolean)
    .join('. ');
  return {
    intro: `Zu deinem Namen „${name}“ könnten wir in ${unique.length} Richtungen gehen.${extras ? ` ${extras}.` : ''}`,
    directions: unique,
  };
}

export function formatLogoDirectionReply(help: ReturnType<typeof suggestLogoDirections>): string {
  const lines = help.directions.map((d, i) => `${i + 1}. ${d.title} — ${d.why}`);
  return `${help.intro}\n${lines.join('\n')}\nEs wird noch nichts generiert. Sag mir, welche Richtung du willst.`;
}

export function detectKnownFactFollowUp(
  message: string,
  ctx: Pick<
    NexterContextSnapshot,
    | 'primaryColors'
    | 'secondaryColors'
    | 'styleDirection'
    | 'stylePreferences'
    | 'mascot'
    | 'characterDescription'
    | 'hasDna'
  >
): string | null {
  const t = message.toLowerCase();
  const asksColors = /welche farben m(ö|o)chtest du|was f(ü|u)r farben soll|farben m(ö|o)chtest du|welche farbpalette soll/.test(
    t
  );
  const knownColors = describeKnownColors(ctx);
  if (asksColors && knownColors) {
    return `Sollen wir bei deinem ${knownColors}-Stil bleiben oder möchtest du diesmal etwas anderes?`;
  }
  const asksStyle = /welchen stil|was f(ü|u)r ein(en)? stil|stil m(ö|o)chtest du/.test(t);
  const style = ctx.styleDirection || ctx.stylePreferences?.[0];
  if (asksStyle && style) {
    return `Sollen wir bei deinem ${style}-Stil bleiben oder möchtest du diesmal etwas anderes?`;
  }
  const asksFigure = /soll die figur|menschlich.*tierisch|tierisch oder|abstrakt sein/.test(t);
  if (asksFigure && (ctx.mascot || ctx.characterDescription)) {
    return `Deine Figur ist schon gesetzt (${ctx.mascot || ctx.characterDescription}). Soll ich dabei bleiben?`;
  }
  const wantsLogoOrCharacter = /\blogo\b|figur|charakter|maskottchen/.test(t);
  if (
    wantsLogoOrCharacter &&
    !ctx.hasDna &&
    !ctx.mascot &&
    !/wolf|drache|mensch|tier|abstrakt|phoenix|schädel/.test(t) &&
    /unsicher|wei(ss|ß) nicht|keine ahnung|was f(ü|u)r eine figur/.test(t)
  ) {
    return 'Soll die Figur eher menschlich, tierisch oder komplett abstrakt sein?';
  }
  return null;
}

export type DnaChangeScope = 'ask-confirm' | 'explicit-dna';

export type StudioChangeScope = 'asset' | 'set' | 'dna';

export function detectStudioChangeScope(message: string): StudioChangeScope | null {
  const t = message.toLowerCase();
  if (detectDnaChangeScope(message) === 'explicit-dna') return 'dna';
  if (/daraus ein.*streamset|komplettes?\s+streamset|vollst(ä|a)ndiges?\s+(stream)?set/.test(t)) {
    return null;
  }
  if (
    /ganze[sn]? (stream)?set|komplette[sn]? set|alle (streamset[- ]?)?(assets|teile)|überall (dunkler|heller)|das ganze (stream)?set/.test(
      t
    )
  ) {
    return 'set';
  }
  if (
    /änder|kleiner|gr(ö|oe)sser|dunkler|heller|transparent|weniger neon|mehr blau|ring dicker|name kleiner|figur/.test(
      t
    )
  ) {
    return 'asset';
  }
  return null;
}

export function targetsForStudioChange(
  scope: StudioChangeScope,
  opts: { selectedAssetKey?: string; selectedKeys?: string[] } = {}
): string[] {
  if (scope === 'dna') return [];
  if (scope === 'set') return [...(opts.selectedKeys ?? [])];
  return opts.selectedAssetKey ? [opts.selectedAssetKey] : [];
}

export function detectDnaChangeScope(message: string): DnaChangeScope | null {
  const t = message.toLowerCase();
  if (
    /in meiner (creator.? )?dna|dauerhaft (speichern|ändern)|ab jetzt immer|ab jetzt soll|ab jetzt überall|sollen ab jetzt|als bevorzugte farbe|in die dna|gesamtes design/.test(t)
  ) {
    return 'explicit-dna';
  }
  if (
    /diesmal (rot|blau|grün|lila|schwarz)|nur f(ü|u)r dieses (projekt|logo|design)|f(ü|u)r dieses projekt/.test(t) ||
    /(änder|mach).{0,24}(farb|stil|figur)|mach (es|das|den hintergrund)/.test(t)
  ) {
    return 'ask-confirm';
  }
  return null;
}

export function dnaUpdateConfirmationPrompt(message: string): string {
  const color = message.match(/\b(rot|blau|grün|lila|schwarz|wei(ss|ß)|neon|orange)\b/i)?.[1];
  const topic = color ? color : 'diese Änderung';
  return `Soll ich ${topic} nur für dieses Projekt verwenden oder als neue bevorzugte Einstellung in deiner Creator-DNA speichern? Ich ändere die DNA nicht automatisch.`;
}

export function platformFormatHint(platform: string, assetType?: string): string | null {
  const p = platform.toLowerCase();
  if (assetType === 'banner' && p in BANNER_PLATFORM_SPECS) {
    const spec = BANNER_PLATFORM_SPECS[p as keyof typeof BANNER_PLATFORM_SPECS];
    return `${spec.label}-Banner ${spec.aspect} (${spec.width}×${spec.height}px).`;
  }
  if (p === 'tiktok' || p === 'shorts' || assetType === 'short') {
    const spec = VIDEO_FORMAT_PRESETS.tiktok;
    return `TikTok/Shorts ${spec.aspectRatio} (${spec.width}×${spec.height}px).`;
  }
  if (p === 'youtube' && (assetType === 'video' || assetType === 'banner')) {
    if (assetType === 'video') {
      const spec = VIDEO_FORMAT_PRESETS.youtube;
      return `YouTube ${spec.aspectRatio} (${spec.width}×${spec.height}px).`;
    }
  }
  if (p === 'twitch') {
    return 'Twitch-Overlay 1920×1080, Banner 1200×480, Facecam als Rahmen ohne Webcam-Inhalt.';
  }
  if (p === 'discord') {
    const spec = BANNER_PLATFORM_SPECS.discord;
    return `Discord ${spec.aspect} (${spec.width}×${spec.height}px) für Banner/Icon-Assets.`;
  }
  if (p === 'instagram') {
    const spec = getVideoFormatPreset('instagram');
    return `Instagram ${spec.aspectRatio} (${spec.width}×${spec.height}px).`;
  }
  if (p in VIDEO_FORMAT_PRESETS) {
    const spec = getVideoFormatPreset(p);
    return `${spec.label} ${spec.aspectRatio} (${spec.width}×${spec.height}px).`;
  }
  if (p in BANNER_PLATFORM_SPECS) {
    const spec = BANNER_PLATFORM_SPECS[p as keyof typeof BANNER_PLATFORM_SPECS];
    return `${spec.label} ${spec.aspect} (${spec.width}×${spec.height}px).`;
  }
  return null;
}

export function followOnAssetLabel(kind: NexterQuoteKind | string): string {
  const labels: Record<string, string> = {
    facecam: 'einen Facecam-Rahmen',
    overlay: 'ein Overlay',
    banner: 'ein Banner',
    streamset: 'ein Streamset',
    sticker: 'Sticker/Badges',
    mockup: 'ein Mockup',
    animation: 'Intro/Outro',
    music: 'einen Musik-Track',
    voice: 'ein Voiceover',
    logo: 'ein Logo',
  };
  return labels[kind] ?? kind;
}
