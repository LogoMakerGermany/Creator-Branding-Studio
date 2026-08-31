import { randomUUID } from 'node:crypto';
import {
  COIN_COSTS,
  CoinSpendCategory,
  NEXTER_STUDIO_PATHS,
  type NexterAction,
  type NexterContextSnapshot,
  type NexterQuoteKind,
} from '@ucbs/shared';

export const QUOTE_KIND_CATEGORY: Record<NexterQuoteKind, CoinSpendCategory> = {
  logo: CoinSpendCategory.LOGO_GENERATION,
  banner: CoinSpendCategory.BANNER_GENERATION,
  overlay: CoinSpendCategory.OVERLAY_GENERATION,
  facecam: CoinSpendCategory.FACECAM_GENERATION,
  sticker: CoinSpendCategory.STICKER_GENERATION,
  streamset: CoinSpendCategory.STREAMSET_PACK,
  mockup: CoinSpendCategory.MOCKUP_GENERATION,
  animation: CoinSpendCategory.ANIMATION_GENERATION,
  text: CoinSpendCategory.TEXT_GENERATION,
};

export function coinCostForKind(kind: NexterQuoteKind): number {
  return COIN_COSTS[QUOTE_KIND_CATEGORY[kind]];
}

/** Strict per-user isolation: never return another user's row. */
export function recordOwnedByUser<T extends { userId: string }>(
  row: T | null | undefined,
  userId: string
): T | null {
  if (!row || row.userId !== userId) return null;
  return row;
}

export function detectIncompletePrompt(
  message: string,
  ctx?: Pick<NexterContextSnapshot, 'hasDna' | 'dnaName' | 'primaryColors' | 'styleDirection'>
): string | null {
  const t = message.trim();
  if (t.length < 4) return 'Kannst du etwas genauer sagen — Name, Spiel oder Stil?';

  const wantsLogo = /\blogo\b/i.test(t);
  const vagueLogo = /^(mach|erstelle|generiere)(\s+mir)?\s+(ein\s+)?logo[.!?]?$/i.test(t);
  if (vagueLogo || (wantsLogo && t.split(/\s+/).length <= 4)) {
    if (ctx?.hasDna && ctx.dnaName) return null;
    return 'Für ein Logo brauche ich mindestens den Namen. Hast du schon eine Creator DNA, oder soll ich das Logo Studio öffnen?';
  }

  const vague =
    /^(mach|erstelle|generiere)(\s+mir)?(\s+(was|etwas|eins?))?[.!?]?$/i.test(t) ||
    /^(hilfe|hallo|hi|hey)[.!?]?$/i.test(t);
  if (vague) {
    return 'Wofür genau? z. B. Gaming-Logo, Twitch-Set oder Shorts aus einem Video.';
  }
  return null;
}

const SECRET_KEYS = /passwort|password|api[_-]?key|secret|token|ssn|sozialversich/i;

export function extractPreference(message: string): { key: string; value: string } | null {
  if (SECRET_KEYS.test(message)) return null;
  const color = message.match(/(?:lieber|gerne|bitte|bevorzuge)\s+(lila|blau|rot|grün|schwarz|weiß|neon)/i);
  if (color) return { key: 'preferredColor', value: color[1].toLowerCase() };
  const style = message.match(/\b(dunkel|futuristisch|militärisch|clean|anime|cyberpunk)\b/i);
  if (style) return { key: 'preferredStyle', value: style[1].toLowerCase() };
  const platform = message.match(/\b(twitch|youtube|tiktok|kick|instagram)\b/i);
  if (platform && /hauptsächlich|immer|standard|plattform/i.test(message)) {
    return { key: 'preferredPlatform', value: platform[1].toLowerCase() };
  }
  const format = message.match(/\b(9:16|16:9|1:1|shorts|banner)\b/i);
  if (format && /format|lieber|standard/i.test(message)) {
    return { key: 'preferredFormat', value: format[1].toLowerCase() };
  }
  return null;
}

export function detectQuoteKind(message: string): NexterQuoteKind | null {
  const lower = message.toLowerCase();
  if (/streamset|komplettes?\s+(twitch|stream)|vollst(ä|a)ndiges?\s+(stream)?set|daraus ein.*streamset/.test(lower)) {
    return 'streamset';
  }
  if (
    /animier(?:e|en|t)?\b|logo[- ]?loop|(mach|erstell|generier).*(intro|outro|stinger|alert)/.test(lower) ||
    /(intro|outro|stinger).*(sek|s\b|animation)/.test(lower)
  ) {
    return 'animation';
  }
  if (
    /lifestyle[- ]?(ai|foto|bild|mockup)/.test(lower) ||
    /(zeig mir|erstell|generier).*(tasse|t-?shirt|hoodie|cap|poster|mockup|phone)/.test(lower) ||
    /(tasse|mockup).*(lifestyle|foto)/.test(lower)
  ) {
    return 'mockup';
  }
  if (detectTextQuoteIntent(lower)) return 'text';
  if (/\blogo\b/.test(lower)) return 'logo';
  if (/\bbanner\b/.test(lower)) return 'banner';
  if (/\bfacecam|webcam-rahmen/.test(lower)) return 'facecam';
  if (/\bsticker|emote/.test(lower)) return 'sticker';
  if (/\boverlay|starting soon|offline/.test(lower)) return 'overlay';
  return null;
}

export function detectTextQuoteIntent(message: string): boolean {
  const lower = message.toLowerCase();
  if (/öffne|open|geh(e)? zu/.test(lower) && /\btext\b|social/.test(lower)) return false;
  if (
    /tiktok[- ]?text|content[- ]?paket|content daf(ü|u)r|titel.{0,40}caption.{0,40}hashtag|mach (die )?caption|caption\s+k(ü|u)rzer|\d+\s*(neue\s+)?hooks?|alternativ.*hook/.test(
      lower
    )
  ) {
    return true;
  }
  return /(erstell|generier|schreib|mach mir).*(caption|hook|hashtag|titel|bio|skript|content|beschreibung)/.test(
    lower
  );
}

export function detectExternalPublishIntent(message: string): string | null {
  if (
    /veröffentlich.*(tiktok|youtube|instagram|twitch|discord)|lade .{0,20}(auf|zu) (tiktok|youtube|instagram)|post(e)? (das |es )?(auf|bei) (tiktok|youtube|instagram)|tiktok verbinden|instagram verbinden|youtube verbinden/i.test(
      message
    )
  ) {
    return 'Direktes Publishing auf TikTok, YouTube, Instagram oder Twitch ist noch nicht verfügbar. Ich kann den Text intern als Entwurf oder intern geplant speichern — das sendet nichts an die Plattform.';
  }
  return null;
}

export function detectOpenStudio(message: string): string | null {
  const lower = message.toLowerCase();
  if (/ich möchte shorts machen|shorts machen|clips für tiktok/.test(lower)) {
    return NEXTER_STUDIO_PATHS.shorts;
  }
  const navigates = /öffne|open|geh(e)? zu|studio/.test(lower);
  if (!navigates) return null;
  if (/logo/.test(lower)) return NEXTER_STUDIO_PATHS.logo;
  if (/streamset/.test(lower)) return NEXTER_STUDIO_PATHS.streamset;
  if (/short/.test(lower)) return NEXTER_STUDIO_PATHS.shorts;
  if (/video/.test(lower) && !/logo/.test(lower)) return NEXTER_STUDIO_PATHS.video;
  if (/animation|intro|outro|stinger/.test(lower)) return NEXTER_STUDIO_PATHS.animation;
  if (/social|thumbnail|story/.test(lower)) return NEXTER_STUDIO_PATHS.social;
  if (/\btext\b|caption|bio|hashtag/.test(lower)) return NEXTER_STUDIO_PATHS.text;
  if (/mockup|tasse|shirt/.test(lower)) return NEXTER_STUDIO_PATHS.mockup;
  if (/\bdna\b/.test(lower)) return NEXTER_STUDIO_PATHS.dna;
  if (/banner/.test(lower)) return NEXTER_STUDIO_PATHS.banner;
  return null;
}

export function detectFakeDetectionRequest(message: string): string | null {
  if (
    /kill.?detect|headshot|warzone victory|fortnite elimination|reaction erkannt|gegner get[öo]tet|kill erkannt|victory erkannt/i.test(
      message
    )
  ) {
    return 'Kill-/Reaction-Detection ist nicht verfügbar. Ich kann Szenen, Pausen und Sprachaktivität aus der lokalen Analyse zeigen — keine Gameplay-Events.';
  }
  return null;
}

export function detectShowHighlights(message: string): boolean {
  return /besten stellen|zeig(e)? mir (die )?highlights?|spannendsten (stellen|momente)/i.test(message);
}

export function detectMakeShort(message: string): boolean {
  return /highlight\s*\d+/i.test(message) && /short/i.test(message);
}

export function detectAnalyzeVideo(message: string): boolean {
  return /analysiere (dieses |mein )?video|video analys/i.test(message);
}

export function detectAnalyzeIntent(message: string): boolean {
  return /analy|was fehlt|was habe ich|schon erstellt|was wei(ss|ß)t du|aktuelles? (creator-)?projekt|über mein|welche farben|projektfarben|welche dna|in (diesem|meinem) projekt/i.test(
    message
  );
}

export function detectLockedTraitOverride(
  message: string,
  ctx: Pick<NexterContextSnapshot, 'locks' | 'primaryColors' | 'mascot' | 'styleDirection' | 'characterDescription'>
): string | null {
  const t = message.toLowerCase();
  const colorChange =
    /ändere meine farben|farben? (für dieses design )?(auf|zu)|mach (es|das) diesmal rot|diesmal rot|farb(e|en) (änder|wechsel|setz)/i.test(
      t
    ) ||
    ((/farben?|primärfarbe|farbpalette/.test(t) && /(änder|wechsel|mach|setz|nimm|statt|rot)/.test(t)));
  if (colorChange && ctx.locks?.colors) {
    const colors = ctx.primaryColors.join(', ') || 'gesetzt';
    return `Deine Projektfarben sind gesperrt (${colors}). Soll ich die Farbsperre zuerst ändern? Ich wende die neue Farbe nicht an.`;
  }
  const charChange =
    /(figur|character|maskottchen|mascot).*(änder|tausch|neu|statt)|tausch(e)? (die )?figur/.test(t);
  if (charChange && (ctx.locks?.character || ctx.locks?.mascot)) {
    const fig = ctx.characterDescription || ctx.mascot;
    return `Deine Figur ist gesperrt${fig ? ` (${fig})` : ''}. Soll ich die Figursperre zuerst ändern?`;
  }
  const styleChange =
    /(stil|style).*(änder|wechsel)|(änder|wechsel).*(stil|style)|mach (es|das) (cinematic|cartoon|cyberpunk|clean)/.test(
      t
    );
  if (styleChange && ctx.locks?.style) {
    return `Dein Stil ist gesperrt (${ctx.styleDirection ?? 'gesetzt'}). Soll ich die Stilsperre zuerst ändern?`;
  }
  return null;
}

export function detectSuggestVariant(message: string): boolean {
  return /variante|alternativ|noch (ein|eins)|zweite version/i.test(message);
}

export type ChangeTargetKind = 'logo' | 'banner' | 'overlay' | 'facecam' | 'sticker';

export function detectChangeIntent(
  message: string
): { kind: ChangeTargetKind; request: string; wantsLatest: boolean; facecamOnly: boolean } | null {
  if (detectTextQuoteIntent(message)) return null;
  const lower = message.toLowerCase();
  const isEdit =
    /änder|dunkler|heller|aggressiv|cleaner|variante|schrift|partikel|hintergrund|gr(ö|oe)sser|kleiner|zweite version/.test(
      lower
    );
  if (!isEdit) return null;
  if (
    /komplettes?\s+streamset|vollst(ä|a)ndiges?\s+streamset|daraus ein.*streamset/.test(lower) &&
    !/nur|facecam/.test(lower)
  ) {
    return null;
  }
  const wantsLatest = /letzt|aktuell/.test(lower);
  const facecamOnly = /nur (die )?facecam|facecam.{0,40}(änder|streamset)|streamset.{0,40}facecam/.test(lower);
  if (facecamOnly || (/\bfacecam|webcam/.test(lower) && isEdit)) {
    return { kind: 'facecam', request: message, wantsLatest, facecamOnly: true };
  }
  if (/\blogo\b/.test(lower)) return { kind: 'logo', request: message, wantsLatest, facecamOnly: false };
  if (/\bbanner\b/.test(lower)) return { kind: 'banner', request: message, wantsLatest, facecamOnly: false };
  if (/\bsticker|emote/.test(lower)) return { kind: 'sticker', request: message, wantsLatest, facecamOnly: false };
  if (/\boverlay/.test(lower)) return { kind: 'overlay', request: message, wantsLatest, facecamOnly: false };
  return null;
}

export function resolveChangeTarget(
  ctx: NexterContextSnapshot,
  kind: ChangeTargetKind,
  wantsLatest: boolean
): { jobId: string } | { ask: string } | { none: string } {
  const idMap: Record<ChangeTargetKind, string | undefined> = {
    logo: ctx.lastLogoId,
    banner: ctx.lastBannerId,
    overlay: ctx.lastOverlayId,
    facecam: ctx.lastFacecamId,
    sticker: ctx.lastStickerId,
  };
  const countMap: Record<ChangeTargetKind, number> = {
    logo: ctx.logoCount ?? 0,
    banner: ctx.bannerCount ?? 0,
    overlay: ctx.overlayCount ?? 0,
    facecam: ctx.facecamCount ?? 0,
    sticker: ctx.stickerCount ?? 0,
  };
  const labels: Record<ChangeTargetKind, string> = {
    logo: 'Logo',
    banner: 'Banner',
    overlay: 'Overlay',
    facecam: 'Facecam',
    sticker: 'Sticker',
  };
  const id = idMap[kind];
  const count = countMap[kind];
  if (count > 1 && !wantsLatest) {
    return { ask: `Welches ${labels[kind]} möchtest du ändern? Nenne „letztes“ oder öffne das Projekt.` };
  }
  if (id) return { jobId: id };
  return { none: `Ich finde kein ${labels[kind]} in diesem Projekt (und keinen eindeutigen Fallback). Kein Job, keine Coins.` };
}

export function openStudioAction(path: string, label: string): NexterAction {
  return {
    id: randomUUID(),
    tool: 'open_studio',
    label,
    path,
  };
}

export function quoteActions(kind: NexterQuoteKind, quoteId: string, isChange = false): NexterAction[] {
  const cost = coinCostForKind(kind);
  const studio =
    kind === 'streamset'
      ? NEXTER_STUDIO_PATHS.streamset
      : kind === 'logo'
        ? NEXTER_STUDIO_PATHS.logo
        : kind === 'banner'
          ? NEXTER_STUDIO_PATHS.banner
          : kind === 'facecam'
            ? NEXTER_STUDIO_PATHS.facecam
            : kind === 'sticker'
              ? NEXTER_STUDIO_PATHS.sticker
              : kind === 'mockup'
                ? NEXTER_STUDIO_PATHS.mockup
                : kind === 'animation'
                  ? NEXTER_STUDIO_PATHS.animation
                  : kind === 'text'
                    ? NEXTER_STUDIO_PATHS.text
                    : NEXTER_STUDIO_PATHS.overlay;
  const startLabel = isChange
    ? `KI-Variante – ${cost} Coins`
    : `Erstellen – ${cost} Coins`;
  return [
    {
      id: randomUUID(),
      tool: 'quote_generation',
      label: `Angebot: ${cost} Coins`,
      coinCost: cost,
      payload: { quoteId, kind, changeRequest: isChange },
    },
    {
      id: randomUUID(),
      tool: 'start_generation',
      label: startLabel,
      coinCost: cost,
      requiresConfirmation: true,
      payload: { quoteId, kind, changeRequest: isChange },
    },
    {
      id: randomUUID(),
      tool: 'cancel_generation',
      label: 'Abbrechen',
      payload: { quoteId },
    },
    openStudioAction(studio, 'Studio öffnen'),
  ];
}

export function buildActions(
  message: string,
  ctx: NexterContextSnapshot,
  quoteId?: string,
  quoteKind?: NexterQuoteKind,
  isChange = false
): { suggestions: string[]; actions: NexterAction[] } {
  const suggestions: string[] = [];
  const actions: NexterAction[] = [];
  const lower = message.toLowerCase();

  const openPath = detectOpenStudio(message);
  if (openPath) {
    const label =
      Object.entries(NEXTER_STUDIO_PATHS).find(([, p]) => p === openPath)?.[0] ?? 'Studio';
    actions.push(openStudioAction(openPath, `${label[0].toUpperCase()}${label.slice(1)} öffnen`));
  }

  if (quoteId && quoteKind) {
    actions.push(...quoteActions(quoteKind, quoteId, isChange));
  }

  if (detectAnalyzeIntent(message) && ctx.missingAssets[0]) {
    actions.push({
      id: randomUUID(),
      tool: 'analyze_asset',
      label: 'Lücken anzeigen',
      payload: { missing: ctx.missingAssets },
    });
    if (!openPath) actions.push(openStudioAction(NEXTER_STUDIO_PATHS.streamset, 'Streamset öffnen'));
  }

  if (detectSuggestVariant(message)) {
    actions.push({
      id: randomUUID(),
      tool: 'suggest_variant',
      label: 'Logo-Variante vorschlagen',
      path: NEXTER_STUDIO_PATHS.logo,
    });
  }

  if (!ctx.hasDna) suggestions.push('Creator DNA anlegen');
  else if (ctx.lastModule === 'logo') {
    suggestions.push('Soll ich dir daraus ein vollständiges Streamset erstellen?');
  } else if (ctx.lastModule === 'mockup') {
    suggestions.push('Zeig mir schwarze Tasse');
  } else if (ctx.missingAssets[0]) suggestions.push(`Dir fehlt noch: ${ctx.missingAssets[0]}`);
  if (/logo/.test(lower) && ctx.hasDna) suggestions.push('Logo aus DNA anbieten');
  if (!suggestions.length) suggestions.push('Was weißt du über mein Projekt?', 'Öffne das Logo Studio');

  const deduped = actions.filter((a, i, arr) => arr.findIndex((x) => x.tool === a.tool && x.path === a.path && x.label === a.label) === i);
  return { suggestions: suggestions.slice(0, 4), actions: deduped.slice(0, 6) };
}

export function warnBadSettings(message: string): string | null {
  if (/comic sans|papyrus/i.test(message)) {
    return 'Vorsicht: Diese Schrift wirkt unprofessionell für Gaming-Branding.';
  }
  if (/10\s*farben|alle farben/i.test(message)) {
    return 'Zu viele Farben schwächen die Wiedererkennbarkeit — 2–3 Markenfarben reichen.';
  }
  return null;
}

export function recommendFormat(message: string): string | null {
  const lower = message.toLowerCase();
  if (/twitch/.test(lower)) return 'Twitch-Banner 1200×480 und Overlay 1920×1080.';
  if (/youtube/.test(lower)) return 'YouTube-Banner 2560×1440, Thumbnails 1280×720.';
  if (/tiktok|shorts|reel/.test(lower)) return '9:16 (1080×1920) für Shorts, Reels und TikTok.';
  return null;
}

export function formatContextForPrompt(ctx: NexterContextSnapshot): string {
  const source =
    ctx.dnaSource === 'project'
      ? `Quelle: Projekt-DNA${ctx.projectName ? ` „${ctx.projectName}“` : ''}`
      : ctx.dnaSource === 'active'
        ? 'Quelle: aktive User-DNA'
        : 'Keine Creator DNA vorhanden';
  const dna = ctx.hasDna
    ? `DNA „${ctx.dnaName ?? 'ohne Namen'}“ v${ctx.dnaVersion ?? '?'}, Stil ${ctx.styleDirection ?? 'offen'}, Farben ${ctx.primaryColors.join(', ') || 'offen'}${ctx.secondaryColors?.length ? `, Sekundär ${ctx.secondaryColors.join(', ')}` : ''}${ctx.mascot ? `, Figur ${ctx.mascot}` : ''}${ctx.characterDescription && ctx.characterDescription !== ctx.mascot ? ` (${ctx.characterDescription})` : ''}. ${source}.`
    : 'Keine Creator DNA vorhanden. Fallback: keine zufällige Auswahl.';
  const lockBits = [
    ctx.locks?.name ? 'Name' : null,
    ctx.locks?.colors ? 'Farben' : null,
    ctx.locks?.character || ctx.locks?.mascot ? 'Figur' : null,
    ctx.locks?.style ? 'Stil' : null,
    ctx.locks?.typography || ctx.locks?.fonts ? 'Typografie' : null,
  ].filter(Boolean);
  const locks = lockBits.length
    ? `Gesperrte Merkmale (verbindlich, nicht eigenmächtig ändern): ${lockBits.join(', ')}.`
    : 'Keine DNA-Sperren.';
  const projects = ctx.projectNames.length
    ? `Projekte: ${ctx.projectNames.join(', ')}.`
    : 'Keine Projekte.';
  const missing = ctx.missingAssets.length
    ? `Fehlende Streamset-Assets: ${ctx.missingAssets.join(', ')}.`
    : 'Kein offensichtliches Asset-Loch im Streamset.';
  const highlights = ctx.videoHighlights?.length
    ? `Video-Highlights: ${ctx.videoHighlights
        .slice(0, 5)
        .map((h, i) => `#${i + 1} ${h.start.toFixed(1)}-${h.end.toFixed(1)}s ${h.label} (${h.reason ?? 'Score ' + h.score})`)
        .join('; ')}.`
    : 'Keine Video-Highlights gespeichert.';
  return [
    `Nutzer: ${ctx.displayName ?? 'Creator'}.`,
    `Coins: ${ctx.coinBalance}.`,
    dna,
    locks,
    projects,
    `Dateien: ${ctx.fileCount}.`,
    ctx.lastModule ? `Letzter Job: ${ctx.lastModule}.` : 'Noch keine Generierungen.',
    missing,
    highlights,
    ctx.lastShortId
      ? `Letztes Short: ${ctx.lastShortId}${ctx.lastShortVideoProjectId ? ` (Video ${ctx.lastShortVideoProjectId})` : ''}.`
      : 'Kein eigenes Short gespeichert.',
    ctx.contentPackageId
      ? `Aktuelles Content-Paket: ${ctx.contentPackageId}${ctx.contentPackageTitle ? ` „${ctx.contentPackageTitle}“` : ''}.`
      : 'Kein Content-Paket im aktuellen Projekt.',
    ctx.lastLogoId ? `Letztes Logo: ${ctx.lastLogoId} (${ctx.logoCount ?? 1}).` : 'Kein Logo im Projektkontext.',
    ctx.lastBannerId ? `Letztes Banner: ${ctx.lastBannerId}.` : '',
    ctx.lastFacecamId ? `Letzte Facecam: ${ctx.lastFacecamId}.` : '',
    ctx.lastMockupId ? `Letztes Mockup: ${ctx.lastMockupId}.` : '',
    ctx.lastAnimationId ? `Letzte Animation: ${ctx.lastAnimationId}.` : '',
    ctx.assetInventory?.length ? `Projekt-Inventar: ${ctx.assetInventory.join(', ')}.` : '',
  ].filter(Boolean).join(' ');
}

export type GenerationGate = 'ok' | 'no_dna' | 'insufficient_coins' | 'not_pending' | 'wrong_user' | 'expired';

export function evaluateGenerationGate(input: {
  quoteUserId: string;
  requestUserId: string;
  status: string;
  expiresAt: string;
  coinCost: number;
  coinBalance: number;
  hasDna: boolean;
  now?: number;
}): GenerationGate {
  if (input.quoteUserId !== input.requestUserId) return 'wrong_user';
  if (input.status !== 'pending') return 'not_pending';
  if (Date.parse(input.expiresAt) < (input.now ?? Date.now())) return 'expired';
  if (!input.hasDna) return 'no_dna';
  if (input.coinBalance < input.coinCost) return 'insufficient_coins';
  return 'ok';
}
