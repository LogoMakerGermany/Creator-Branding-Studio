import { randomUUID } from 'node:crypto';
import type { NexterConversationIntent } from './conversation-intent.js';
import { isSmalltalkMessage, looksLikeAssetEditFollowUp, messageImpliesFormatNeed } from './conversation-intent-patterns.js';
import {
  COIN_COSTS,
  CoinSpendCategory,
  STREAMSET_PACK_ITEMS,
  keysForStreamsetThreePart,
  NEXTER_STUDIO_PATHS,
  nexterStudioPathFromUtterance,
  detectMusicQuoteIntent,
  detectVoiceQuoteIntent,
  detectStudioChangeScope,
  detectCalendarPlanningIntent,
  detectSocialPlannerIntent,
  platformFormatHint,
  parseVideoStudioPrep,
  parseVideoClosureCommand,
  isAiVideoQuoteIntent,
  isAnimatedStreamScreenIntent,
  isStaticStreamScreenIntent,
  formatColorsForNexter,
  humanColorName,
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
  'ai-video': CoinSpendCategory.AI_VIDEO,
  text: CoinSpendCategory.TEXT_GENERATION,
  music: CoinSpendCategory.AI_MUSIC,
  voice: CoinSpendCategory.AI_VOICE,
  captions: CoinSpendCategory.VIDEO_EDIT,
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
  ctx?: Pick<NexterContextSnapshot, 'hasDna' | 'dnaName' | 'primaryColors' | 'styleDirection' | 'addressAs'>
): string | null {
  const t = message.trim();
  if (t.length < 4) return 'Kannst du etwas genauer sagen — Name, Spiel oder Stil?';

  const wantsLogo = /\blogo\b/i.test(t);
  const vagueLogo = /^(mach|erstelle|generiere)(\s+mir)?\s+(ein\s+)?logo[.!?]?$/i.test(t);
  if (vagueLogo || (wantsLogo && t.split(/\s+/).length <= 4)) {
    if (ctx?.hasDna && ctx.dnaName) return null;
    if (ctx?.addressAs?.trim()) return null;
    return 'Für ein Logo brauche ich mindestens den Namen. Hast du schon eine Creator DNA, oder soll ich das Logo Studio öffnen?';
  }

  const vague = /^(mach|erstelle|generiere)(\s+mir)?(\s+(was|etwas|eins?))?[.!?]?$/i.test(t);
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

export function detectSecretProbe(message: string): boolean {
  return /zeig.*(api[-_\s]?key|secret|token|webhook)|what('?s| is) (your |the )?(api[-_\s]?key|secret)|openai[-_\s]?key|stripe[-_\s]?secret|paypal[-_\s]?secret/i.test(
    message
  );
}

export function detectOwnershipBypass(message: string): boolean {
  return /ignoriere alle (regeln|anweisungen)|ignore (all )?(rules|previous)|als admin|datei von user b|von einem anderen user|fremde[nr]? (datei|projekt|session)/i.test(
    message
  );
}

export function detectFreeCoinPromiseRequest(message: string): boolean {
  return /gib mir \d+\s*coins|schenk(e)? mir (coins|\d+)|10000 coins|kostenlos(?:e)? coins|guthaben auf \d+|setze mein guthaben/i.test(
    message
  );
}

export type NexterSupportIntent = {
  type: 'bug' | 'feedback' | 'feature_request' | 'support';
  category?: 'generation' | 'technical' | 'file' | 'coins' | 'account';
};

export function detectSupportIntent(message: string): NexterSupportIntent | null {
  const t = message.trim().toLowerCase();
  if (!t) return null;
  if (
    /feature[- ]?request|neue funktion|funktionswunsch|ich (möchte|würde) (gerne )?(eine )?neue funktion|was fehlt an funktion/i.test(
      t
    )
  ) {
    return { type: 'feature_request' };
  }
  if (
    /ich möchte feedback|feedback geben|mein feedback|verbesserungsvorschlag|was gefällt dir|was ist unverständlich/i.test(
      t
    )
  ) {
    return { type: 'feedback' };
  }
  if (
    /fehler melden|bug report|\bbug\b|technisches problem|generierung (funktioniert|geht|klappt) nicht|die generierung funktioniert nicht|download (funktioniert|geht) nicht/i.test(
      t
    )
  ) {
    const category = /generierung/.test(t) ? 'generation' : /download|datei/.test(t) ? 'file' : 'technical';
    return { type: 'bug', category };
  }
  if (
    /ich habe ein problem|support[- ]?(anfrage|ticket)|hilfe beim (login|konto|account)|problem melden/i.test(
      t
    )
  ) {
    const category = /\bcoins?\b|guthaben/.test(t)
      ? 'coins'
      : /login|konto|account/.test(t)
        ? 'account'
        : undefined;
    return { type: 'support', category };
  }
  return null;
}

export function detectCoinQuestion(message: string): boolean {
  if (detectFreeCoinPromiseRequest(message)) return false;
  return /wie viele coins|mein guthaben|coin[- ]?bestand|was kosten|was kostet|nicht genug coins|zu wenig coins/i.test(
    message
  );
}

export function detectChatConfirmIntent(message: string): boolean {
  return /angebot bestätig|bestätig(e|en) (das |dieses )?angebot|jetzt (erstellen|generieren)$/i.test(message.trim());
}

export function detectContinueProject(message: string): boolean {
  return /weiter (an|am|bei) (meinem |dem )?(letzten )?projekt|mach bei meinem projekt weiter|letztes projekt/i.test(
    message
  );
}

export function detectEphemeralLanguage(message: string): string | null {
  const t = message.toLowerCase();
  if (/speicher|ab jetzt dauerhaft|als bevorzugte sprache/.test(t)) return null;
  if (/auf englisch|in english|speak english/.test(t)) return 'en';
  if (/auf deutsch|in german|auf german/.test(t)) return 'de';
  return null;
}

export function detectLanguagePreferenceWrite(message: string): 'de' | 'en' | null {
  const t = message.toLowerCase();
  if (!/speicher|ab jetzt|als bevorzugte sprache|dauerhaft/.test(t)) return null;
  if (/englisch|english/.test(t)) return 'en';
  if (/deutsch|german/.test(t)) return 'de';
  return null;
}

export function looksLikeConstraintFollowUp(message: string): boolean {
  const t = message.trim();
  if (t.length < 2 || t.length > 140) return false;
  if (isSmalltalkMessage(t)) return false;
  if (looksLikeAssetEditFollowUp(t) && !detectQuoteKind(t)) return false;
  if (detectQuoteKind(t) || detectOpenStudio(t) || detectCoinQuestion(t) || detectChatConfirmIntent(t)) {
    return false;
  }
  if (detectFileCloudIntent(t) || detectCalendarPlanningIntent(t)) return false;
  const words = t.split(/\s+/).filter(Boolean);
  return (
    /blau|schwarz|rot|grün|lila|violett|neon|dunkel|hell|weiß|weiss|gold|silber|minimal|aggressiv|und |,/.test(
      t.toLowerCase()
    ) || words.length <= 6
  );
}

export function pendingKindFromHistory(
  messages: Array<{ role: string; content: string }>
): NexterQuoteKind | null {
  const window = messages.slice(-10);
  for (let i = window.length - 1; i >= 0; i--) {
    const row = window[i];
    if (row.role === 'user') {
      const kind = detectQuoteKind(row.content);
      if (kind) return kind;
    }
    if (row.role === 'assistant') {
      if (/\blogo\b/i.test(row.content) && /name|farbe|stil|brauche/i.test(row.content)) return 'logo';
      if (/\bbanner\b/i.test(row.content) && /plattform|nachfragen|brauche/i.test(row.content)) return 'banner';
      if (/\bfacecam\b/i.test(row.content) && /brauche|rahmen/i.test(row.content)) return 'facecam';
    }
  }
  return null;
}

export function detectFileCloudIntent(message: string): boolean {
  const lower = String(message ?? '').toLowerCase();
  if (detectLayoutStudioIntent(message)) return false;
  if (/(erstell|generier)\b/.test(lower) && !/nimm mein|letzten? dateien|file[- ]?cloud/.test(lower)) {
    return false;
  }
  return /letzten? dateien|meine dateien|file[- ]?cloud|wo ist mein letztes|öffne mein letztes|dateien gehören|welche dateien|nimm mein letztes logo|nimm ein logo|verwende mein logo|streamset[- ]?dateien|letzten files/.test(
    lower
  );
}

export function detectLayoutStudioIntent(message: string): boolean {
  const lower = String(message ?? '').toLowerCase();
  if (/neues logo dafür|(erstell|generier).*(logo|overlay|facecam)/.test(lower) && !/layout studio|ins layout/.test(lower)) {
    return false;
  }
  if (/\boverlay\b|gaming[- ]?layout|stream[- ]?overlay/.test(lower) && !/layout studio|ins layout|für das layout/.test(lower)) {
    return false;
  }
  return (
    /layout[- ]?studio/.test(lower) ||
    /mach mir ein (tiktok|twitch|youtube) layout/.test(lower) ||
    /facecam oben.{0,80}gameplay.{0,80}chat/.test(lower) ||
    /setz mein logo/.test(lower) ||
    /mach (die )?facecam kleiner/.test(lower) ||
    /verschiebe den chat/.test(lower) ||
    /mach das logo gr(ö|oe)sser/.test(lower) ||
    /blende den sticker aus/.test(lower) ||
    /hintergrund (schwarz|transparent)/.test(lower) ||
    /mach daraus ein twitch layout/.test(lower) ||
    /nimm mein letztes facecam/.test(lower) ||
    /nimm mein letztes logo.{0,24}(layout|oben)/.test(lower)
  );
}

export function detectQuoteKind(message: string): NexterQuoteKind | null {
  if (detectFileCloudIntent(message)) return null;
  if (detectLayoutStudioIntent(message)) return null;
  const lower = message.toLowerCase();
  if (detectOpenStudio(message) && !/(mach|erstell|generier|ich brauche)/.test(lower)) {
    return null;
  }
  if (parseVideoClosureCommand(message)?.wantTranscribe) return 'captions';
  if (
    /streamset|komplettset|komplettes?\s+(twitch|stream)|vollst(ä|a)ndiges?\s+(stream)?set|daraus ein.*streamset|3\s*teile/.test(
      lower
    )
  ) {
    return 'streamset';
  }
  if (detectMusicQuoteIntent(message)) {
    return 'music';
  }
  if (detectVoiceQuoteIntent(message)) {
    return 'voice';
  }
  if (isAiVideoQuoteIntent(message)) {
    return 'ai-video';
  }
  if (
    /animier(?:e|en|t)?\b|\banimation\b|logo[- ]?loop|(mach|erstell|generier).*(intro|outro|stinger|alert)/.test(
      lower
    ) ||
    /(intro|outro|stinger).*(sek|s\b|animation)/.test(lower) ||
    /um die eigene achse|langsam einblend|version für tiktok/.test(lower) ||
    isAnimatedStreamScreenIntent(message) ||
    /\bstream[- ]?start\b|\bstream[- ]?end\b/.test(lower)
  ) {
    return 'animation';
  }
  if (
    /lifestyle[- ]?(ai|foto|bild|mockup|version|ki)/.test(lower) ||
    /realistische[ns]? lifestyle/.test(lower) ||
    /(zeig mir|erstell|generier|zeig).*(tasse|t-?shirt|hoodie|\bcap\b|poster|\bmockup\b|\bphone\b)/.test(lower) ||
    /(tasse|\bmockup\b).*(lifestyle|foto)/.test(lower) ||
    /auf einem (hoodie|t-?shirt|shirt)|auf einer .{0,24}tasse|handy-mockup|phone[- ]?mockup|\bmockup\b/.test(lower)
  ) {
    return 'mockup';
  }
  if (detectTextQuoteIntent(lower)) return 'text';
  if (/\bbanner\b/.test(lower)) return 'banner';
  if (
    /\boverlay|starting soon|startscreen|startbildschirm|\boffline\b|gaming[- ]?layout|stream[- ]?overlay|twitch layout|tiktok layout|youtube layout|twitch overlay|tiktok overlay|youtube overlay|oben facecam.{0,40}gameplay.{0,40}chat|facecam oben.{0,20}gameplay/.test(
      lower
    ) ||
    isStaticStreamScreenIntent(message)
  ) {
    return 'overlay';
  }
  if (/\bfacecam|webcam[- ]?rahmen|gesichtsrahmen/.test(lower)) return 'facecam';
  if (/\bsticker|emote|\bbadge\b/.test(lower)) return 'sticker';
  if (/\blogos?\b|gamerlogo|gaminglogo/.test(lower)) return 'logo';
  return null;
}

export function detectTextQuoteIntent(message: string): boolean {
  if (parseVideoClosureCommand(message)?.caption) return false;
  if (detectSocialPlannerIntent(message) || detectCalendarPlanningIntent(message)) return false;
  const lower = message.toLowerCase();
  if (/öffne|open|geh(e)? zu/.test(lower) && /\btext\b|social/.test(lower)) return false;
  if (/plane mir content|content (für|nächste) woche|in den planner|intern planen|content[- ]?kalender/.test(lower)) {
    return false;
  }
    if (
    /tiktok[- ]?text|tiktok[- ]?post|discord[- ]?post|youtube[- ]?(titel|beschreibung)|content[- ]?paket|content daf(ü|u)r|titel.{0,40}caption.{0,40}hashtag|mach (die )?caption|caption\s+k(ü|u)rzer|\d+\s*(neue\s+)?hooks?|alternativ.*hook|stream[- ]?ankündigung|ankündigung.{0,40}stream|going.?live/.test(
      lower
    )
  ) {
    return true;
  }
  if (/mach (das |es )?(lustiger|witziger|professioneller)|mehr emojis|weniger emojis|andere hashtags/.test(lower)) {
    return true;
  }
  return /(erstell|generier|schreib|mach mir).*(caption|hook|hashtag|titel|bio|skript|content|beschreibung|post|ankündigung)/.test(
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
  return nexterStudioPathFromUtterance(message);
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

export function detectVideoStudioPrep(message: string) {
  return parseVideoStudioPrep(message);
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
    const colors = formatColorsForNexter(ctx.primaryColors) || 'gesetzt';
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

export type ChangeTargetKind = 'logo' | 'banner' | 'overlay' | 'facecam' | 'sticker' | 'mockup';

export function detectChangeIntent(
  message: string,
  ctx?: Pick<
    NexterContextSnapshot,
    'lastLogoId' | 'lastBannerId' | 'lastOverlayId' | 'lastFacecamId' | 'lastStickerId' | 'lastMockupId' | 'lastModule'
  >
): { kind: ChangeTargetKind; request: string; wantsLatest: boolean; facecamOnly: boolean } | null {
  if (detectTextQuoteIntent(message)) return null;
  if (detectStudioChangeScope(message) === 'set') return null;
  const lower = message.toLowerCase();
  const changeVerb =
    /änder|dunkler|heller|aggressiv|cleaner|gr(ö|oe)sser|kleiner|höher|hoeher|zweite version|entferne |nimm den text/.test(
      lower
    );
  const existingCue = /(mein|letzten|aktuellen|vorhanden)/.test(lower);
  const backgroundEdit =
    /mach den hintergrund|änder.{0,32}hintergrund|hintergrund.{0,32}(meines|meinem|des vorhandenen|letzten|aktuellen)/.test(
      lower
    ) ||
    (/hintergrund/.test(lower) &&
      /(transparent|opak)/.test(lower) &&
      existingCue);
  const typographyEdit =
    /(schrift|partikel).{0,24}(änder|größer|kleiner|mehr|weniger)|(änder|mehr|weniger).{0,24}(schrift|partikel)/.test(
      lower
    );
  const variantOfExisting =
    (/\bvariante\b/.test(lower) && existingCue) ||
    Boolean(
      /\bvariante\b/.test(lower) &&
        (ctx?.lastLogoId ||
          ctx?.lastBannerId ||
          ctx?.lastOverlayId ||
          ctx?.lastFacecamId ||
          ctx?.lastStickerId ||
          ctx?.lastMockupId)
    );
  const isEdit = changeVerb || backgroundEdit || typographyEdit || variantOfExisting;
  if (!isEdit) return null;
  if (
    /komplettes?\s+streamset|vollst(ä|a)ndiges?\s+streamset|daraus ein.*streamset/.test(lower) &&
    !/nur|facecam/.test(lower)
  ) {
    return null;
  }
  const wantsLatest = /letzt|aktuell/.test(lower);
  const facecamOnly = /nur (die )?facecam|facecam.{0,40}(änder|streamset)|streamset.{0,40}facecam/.test(lower);
  if (facecamOnly) {
    return { kind: 'facecam', request: message, wantsLatest, facecamOnly: true };
  }
  if (/\boverlay/.test(lower)) return { kind: 'overlay', request: message, wantsLatest, facecamOnly: false };
  if (/\bfacecam|webcam/.test(lower) && isEdit) {
    return { kind: 'facecam', request: message, wantsLatest, facecamOnly: true };
  }
  if (/\blogos?\b/.test(lower)) return { kind: 'logo', request: message, wantsLatest, facecamOnly: false };
  if (/\bbanner\b/.test(lower)) return { kind: 'banner', request: message, wantsLatest, facecamOnly: false };
  if (/\bsticker|emote|\bbadge\b/.test(lower)) return { kind: 'sticker', request: message, wantsLatest, facecamOnly: false };
  if (/\bmockup|tasse|hoodie|t-?shirt/.test(lower) && isEdit) {
    return { kind: 'mockup', request: message, wantsLatest, facecamOnly: false };
  }
  if (ctx) {
    const inferred = inferChangeKindFromContext(ctx);
    if (inferred) return { kind: inferred, request: message, wantsLatest: true, facecamOnly: inferred === 'facecam' };
  }
  return null;
}

function inferChangeKindFromContext(
  ctx: Pick<
    NexterContextSnapshot,
    'lastLogoId' | 'lastBannerId' | 'lastOverlayId' | 'lastFacecamId' | 'lastStickerId' | 'lastMockupId' | 'lastModule'
  >
): ChangeTargetKind | null {
  const module = (ctx.lastModule ?? '').toLowerCase();
  if (module.includes('facecam') && ctx.lastFacecamId) return 'facecam';
  if (module.includes('banner') && ctx.lastBannerId) return 'banner';
  if (module.includes('overlay') && ctx.lastOverlayId) return 'overlay';
  if (module.includes('sticker') && ctx.lastStickerId) return 'sticker';
  if (module.includes('mockup') && ctx.lastMockupId) return 'mockup';
  if ((module.includes('logo') || module.includes('profile')) && ctx.lastLogoId) return 'logo';
  if (ctx.lastLogoId) return 'logo';
  if (ctx.lastFacecamId) return 'facecam';
  if (ctx.lastBannerId) return 'banner';
  if (ctx.lastOverlayId) return 'overlay';
  if (ctx.lastStickerId) return 'sticker';
  if (ctx.lastMockupId) return 'mockup';
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
    mockup: ctx.lastMockupId,
  };
  const countMap: Record<ChangeTargetKind, number> = {
    logo: ctx.logoCount ?? 0,
    banner: ctx.bannerCount ?? 0,
    overlay: ctx.overlayCount ?? 0,
    facecam: ctx.facecamCount ?? 0,
    sticker: ctx.stickerCount ?? 0,
    mockup: ctx.lastMockupId ? 1 : 0,
  };
  const labels: Record<ChangeTargetKind, string> = {
    logo: 'Logo',
    banner: 'Banner',
    overlay: 'Overlay',
    facecam: 'Facecam',
    sticker: 'Sticker',
    mockup: 'Mockup',
  };
  const id = idMap[kind];
  const count = countMap[kind];
  if (count > 1 && !wantsLatest) {
    return { ask: `Welches ${labels[kind]} möchtest du ändern? Nenne „letztes“ oder öffne das Projekt.` };
  }
  if (id) return { jobId: id };
  return { none: `Ich finde kein ${labels[kind]} in diesem Projekt (und keinen eindeutigen Fallback). Kein Job, keine Coins.` };
}

export function openStudioAction(
  path: string,
  label: string,
  opts?: { autoNavigate?: boolean }
): NexterAction {
  return {
    id: randomUUID(),
    tool: 'open_studio',
    label,
    path,
    ...(opts?.autoNavigate === true ? { autoNavigate: true } : { autoNavigate: false }),
  };
}

export function studioOpenLabel(path: string): string {
  const entry = Object.entries(NEXTER_STUDIO_PATHS).find(([, p]) => p === path);
  const key = entry?.[0] ?? 'Studio';
  return `${key[0].toUpperCase()}${key.slice(1)} öffnen`;
}

export function navigationStudioReply(path: string): string {
  const entry = Object.entries(NEXTER_STUDIO_PATHS).find(([, p]) => p === path);
  const name = entry ? `${entry[0][0].toUpperCase()}${entry[0].slice(1)} Studio` : 'Studio';
  return `Ich öffne das ${name}. Das Öffnen kostet keine Coins.`;
}

export function detectStreamsetThreePartIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return /3\s*teile|streamset\s*[-–]\s*3|starter[- ]?set/.test(lower) && !/komplettset|komplettes?\s+streamset|vollst(ä|a)ndiges?\s+streamset/.test(lower);
}

export function defaultStreamsetQuoteKeys(message: string, platform?: string): string[] {
  if (detectStreamsetThreePartIntent(message)) {
    const resolved =
      platform === 'tiktok' || platform === 'youtube' || platform === 'discord' || platform === 'twitch'
        ? platform
        : 'twitch';
    return keysForStreamsetThreePart(resolved);
  }
  return STREAMSET_PACK_ITEMS.map((item) => item.key);
}

export function quoteActions(
  kind: NexterQuoteKind,
  quoteId: string,
  isChange = false,
  extras?: { expiresAt?: string; coinBalance?: number; coinCost?: number }
): NexterAction[] {
  const cost =
    typeof extras?.coinCost === 'number' && Number.isFinite(extras.coinCost)
      ? Math.max(0, Math.floor(extras.coinCost))
      : coinCostForKind(kind);
  const studioByKind: Record<NexterQuoteKind, string> = {
    streamset: NEXTER_STUDIO_PATHS.streamset,
    logo: NEXTER_STUDIO_PATHS.logo,
    banner: NEXTER_STUDIO_PATHS.banner,
    facecam: NEXTER_STUDIO_PATHS.facecam,
    sticker: NEXTER_STUDIO_PATHS.sticker,
    mockup: NEXTER_STUDIO_PATHS.mockup,
    animation: NEXTER_STUDIO_PATHS.animation,
    'ai-video': NEXTER_STUDIO_PATHS['ai-video'],
    text: NEXTER_STUDIO_PATHS.text,
    overlay: NEXTER_STUDIO_PATHS.overlay,
    music: NEXTER_STUDIO_PATHS.music,
    voice: NEXTER_STUDIO_PATHS.voice,
    captions: NEXTER_STUDIO_PATHS.video,
  };
  const studio = studioByKind[kind] ?? NEXTER_STUDIO_PATHS.overlay;
  const startLabel = isChange
    ? `KI-Variante – ${cost} Coins`
    : `Erstellen – ${cost} Coins`;
  const extrasPayload = {
    quoteId,
    kind,
    changeRequest: isChange,
    ...(extras?.expiresAt ? { expiresAt: extras.expiresAt } : {}),
    ...(typeof extras?.coinBalance === 'number' ? { coinBalance: extras.coinBalance } : {}),
  };
  return [
    {
      id: randomUUID(),
      tool: 'quote_generation',
      label: `Angebot: ${cost} Coins`,
      coinCost: cost,
      payload: extrasPayload,
    },
    {
      id: randomUUID(),
      tool: 'start_generation',
      label: startLabel,
      coinCost: cost,
      requiresConfirmation: true,
      payload: extrasPayload,
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
  isChange = false,
  quoteExtras?: { expiresAt?: string; coinBalance?: number; coinCost?: number },
  intent?: NexterConversationIntent
): { suggestions: string[]; actions: NexterAction[] } {
  const suggestions: string[] = [];
  const actions: NexterAction[] = [];
  const lower = message.toLowerCase();
  const social =
    intent === 'SMALLTALK' ||
    intent === 'APP_HELP' ||
    intent === 'ACCOUNT_OR_SETTINGS' ||
    intent === 'NAVIGATION_ACTION' ||
    intent === 'AMBIGUOUS';

  const openPath = detectOpenStudio(message);
  if (openPath) {
    const label =
      Object.entries(NEXTER_STUDIO_PATHS).find(([, p]) => p === openPath)?.[0] ?? 'Studio';
    actions.push(
      openStudioAction(openPath, `${label[0].toUpperCase()}${label.slice(1)} öffnen`, { autoNavigate: true })
    );
  }

  if (quoteId && quoteKind) {
    actions.push(...quoteActions(quoteKind, quoteId, isChange, quoteExtras));
  }

  if ((intent === 'PROJECT_ANALYSIS' || (!intent && detectAnalyzeIntent(message))) && ctx.missingAssets[0]) {
    actions.push({
      id: randomUUID(),
      tool: 'analyze_asset',
      label: 'Lücken anzeigen',
      payload: { missing: ctx.missingAssets },
    });
    if (!openPath) {
      actions.push(openStudioAction(NEXTER_STUDIO_PATHS.streamset, 'Streamset öffnen', { autoNavigate: false }));
    }
  }

  if (detectSuggestVariant(message)) {
    actions.push({
      id: randomUUID(),
      tool: 'suggest_variant',
      label: 'Logo-Variante vorschlagen',
      path: NEXTER_STUDIO_PATHS.logo,
    });
  }

  if (social) {
    const dedupedSocial = actions.filter(
      (a, i, arr) => arr.findIndex((x) => a.tool === x.tool && a.path === x.path && a.label === x.label) === i
    );
    return { suggestions: suggestions.slice(0, 4), actions: dedupedSocial.slice(0, 6) };
  }

  if (intent === 'CREATOR_ADVICE') {
    if (!ctx.hasDna) suggestions.push('Creator DNA anlegen');
    const dedupedAdvice = actions.filter(
      (a, i, arr) => arr.findIndex((x) => a.tool === x.tool && a.path === x.path && a.label === a.label) === i
    );
    return { suggestions: suggestions.slice(0, 4), actions: dedupedAdvice.slice(0, 6) };
  }

  if (!ctx.hasDna) suggestions.push('Creator DNA anlegen');
  else if (
    (intent === 'CREATE_ASSET' || intent === 'MODIFY_ASSET' || !intent) &&
    (ctx.lastModule === 'logo' || Boolean(ctx.lastLogoId))
  ) {
    suggestions.push(
      'Wenn du möchtest, können wir daraus später einen Facecam-Rahmen und ein Komplettset ableiten.'
    );
  } else if (ctx.lastModule === 'mockup' && (intent === 'CREATE_ASSET' || !intent)) {
    suggestions.push('Zeig mir schwarze Tasse');
  } else if (ctx.missingAssets[0] && (intent === 'PROJECT_ANALYSIS' || intent === 'CREATE_ASSET' || !intent)) {
    suggestions.push(`Dir fehlt noch: ${ctx.missingAssets[0]}`);
  }
  if (/logo/.test(lower) && ctx.hasDna && (intent === 'CREATE_ASSET' || intent === 'MODIFY_ASSET' || !intent)) {
    suggestions.push('Logo aus DNA anbieten');
  }
  if (!suggestions.length && (intent === 'CREATE_ASSET' || intent === 'MODIFY_ASSET' || !intent)) {
    suggestions.push('Was weißt du über mein Projekt?', 'Öffne das Logo Studio');
  }

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

export function recommendFormat(
  message: string,
  ctx?: Pick<NexterContextSnapshot, 'preferredPlatforms'>
): string | null {
  const lower = message.toLowerCase();
  if (/twitch/.test(lower)) return platformFormatHint('twitch') ?? 'Twitch-Banner 1200×480 und Overlay 1920×1080.';
  if (/youtube/.test(lower)) return platformFormatHint('youtube', /banner/.test(lower) ? 'banner' : 'video');
  if (/tiktok|shorts|reel/.test(lower)) return platformFormatHint('tiktok', 'short');
  if (/discord/.test(lower)) return platformFormatHint('discord');
  if (/instagram/.test(lower)) return platformFormatHint('instagram');
  if (!messageImpliesFormatNeed(message)) return null;
  const stored = ctx?.preferredPlatforms?.[0];
  if (stored) return platformFormatHint(stored);
  return null;
}

export function formatStreamsetGapForPrompt(ctx: NexterContextSnapshot): string {
  const present = (ctx.presentAssets ?? []).filter(Boolean);
  const missing = (ctx.missingAssets ?? []).filter(Boolean);
  const hasActiveProject = Boolean(ctx.projectId);
  const presentBit = present.length
    ? `Vorhandene Streamset-Assets (abgeschlossene Jobs, keine DNA-Wünsche): ${present.join(', ')}.`
    : 'Es gibt noch keine abgeschlossenen Streamset-Assets.';
  const missingBit = missing.length
    ? `Gegenüber dem Komplettset-Katalog noch nicht erstellt: ${missing.join(', ')}.`
    : 'Gegenüber dem Komplettset-Katalog fehlt aktuell nichts.';
  if (!hasActiveProject) {
    return [
      'Kein vollständiges Streamset-Projekt ist an diese Analyse gebunden.',
      presentBit,
      missingBit,
      'Das ist ein Abgleich vorhandener Jobs gegen den Katalog, kein analysiertes Komplettset-Projekt.',
      'DNA beschreibt Stilwünsche, keine fertigen Assets.',
    ].join(' ');
  }
  return [
    `Aktives Projekt: ${ctx.projectName ?? ctx.projectId}.`,
    presentBit,
    missingBit,
    'Nenne nur diese realen Jobs als vorhanden oder fehlend. Erfinde keine persönliche Lückenliste.',
  ].join(' ');
}

export function formatContextForPrompt(
  ctx: NexterContextSnapshot,
  opts?: {
    includeGaps?: boolean;
    includeInventory?: boolean;
    includeDna?: boolean;
    includeProjects?: boolean;
    includeExactColorCodes?: boolean;
    minimal?: boolean;
  }
): string {
  const includeGaps = opts?.includeGaps !== false;
  const includeInventory = opts?.includeInventory !== false;
  const includeDna = opts?.includeDna !== false;
  const includeProjects = opts?.includeProjects !== false;
  const includeExactColorCodes = opts?.includeExactColorCodes === true;
  if (opts?.minimal) {
    return [
      `Nutzer: ${ctx.displayName ?? 'Creator'}${ctx.addressAs && ctx.addressAs !== ctx.displayName ? ` (Ansprache: ${ctx.addressAs})` : ''}.`,
      'Kein Projektkontext, keine Lückenanalyse, keine Formatvorgabe.',
    ].join(' ');
  }
  const source =
    ctx.dnaSource === 'project'
      ? `Quelle: Projekt-DNA${ctx.projectName ? ` „${ctx.projectName}“` : ''}`
      : ctx.dnaSource === 'active'
        ? 'Quelle: aktive User-DNA'
        : 'Keine Creator DNA vorhanden';
  const dnaColors = formatColorsForNexter(ctx.primaryColors, { includeHex: includeExactColorCodes });
  const secondaryColors = formatColorsForNexter(ctx.secondaryColors, { includeHex: includeExactColorCodes });
  const dna = ctx.hasDna
    ? `DNA „${ctx.dnaName ?? 'ohne Namen'}“ v${ctx.dnaVersion ?? '?'}, Stil ${ctx.styleDirection ?? 'offen'}, Farben ${dnaColors || 'offen'}${secondaryColors ? `, Sekundär ${secondaryColors}` : ''}${ctx.mascot ? `, Figur ${ctx.mascot}` : ''}${ctx.characterDescription && ctx.characterDescription !== ctx.mascot ? ` (${ctx.characterDescription})` : ''}. ${source}.`
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
  const missing = formatStreamsetGapForPrompt(ctx);
  const highlights = ctx.videoHighlights?.length
    ? `Video-Highlights: ${ctx.videoHighlights
        .slice(0, 5)
        .map((h, i) => `#${i + 1} ${h.start.toFixed(1)}-${h.end.toFixed(1)}s ${h.label} (${h.reason ?? 'Score ' + h.score})`)
        .join('; ')}.`
    : 'Keine Video-Highlights gespeichert.';
  return [
    `Nutzer: ${ctx.displayName ?? 'Creator'}${ctx.addressAs && ctx.addressAs !== ctx.displayName ? ` (Ansprache: ${ctx.addressAs})` : ''}.`,
    ctx.preferredPlatforms?.length ? `Creator-Plattformen: ${ctx.preferredPlatforms.join(', ')}.` : '',
    ctx.creationInterests?.length ? `Möchte erstellen: ${ctx.creationInterests.join(', ')}.` : '',
    ctx.stylePreferences?.length ? `Bevorzugte Stile: ${ctx.stylePreferences.join(', ')}.` : '',
    ctx.creatorGoals?.length ? `Creator-Ziele: ${ctx.creatorGoals.join(', ')}.` : '',
    ctx.uiTheme || ctx.customPrimary
      ? `App-Theme: ${ctx.uiTheme ?? 'dark'}${
          ctx.customPrimary
            ? `, Farben ${
                includeExactColorCodes
                  ? formatColorsForNexter([ctx.customPrimary, ctx.customAccent].filter(Boolean), { includeHex: true })
                  : `${humanColorName(ctx.customPrimary)}${ctx.customAccent ? '/' + humanColorName(ctx.customAccent) : ''}`
              }`
            : ctx.accentPreset
              ? `, ${ctx.accentPreset}`
              : ''
        }.`
      : '',
    ctx.visualLanguage ? `Bildsprache: ${ctx.visualLanguage}.` : '',
    ctx.brandingStyle ? `Markenwirkung: ${ctx.brandingStyle}.` : '',
    ctx.typographySummary ? `Schrift: ${ctx.typographySummary}.` : '',
    ctx.fontNames?.length ? `Fonts: ${ctx.fontNames.join(', ')}.` : '',
    ctx.dimension ? `Dimension: ${ctx.dimension}.` : '',
    `Coins: ${ctx.coinBalance}.`,
    ctx.voiceOutputEnabled === false ? 'Nexter-Stimme: aus.' : ctx.voiceCatalogId ? 'Nexter-Stimme: an (gespeicherte Katalog-Stimme).' : '',
    ctx.pendingQuotes?.length
      ? `Offene Angebote: ${ctx.pendingQuotes
          .slice(0, 3)
          .map((q) => `${q.kind} ${q.coinCost} Coins${q.expired ? ' (abgelaufen)' : ''}`)
          .join('; ')}.`
      : 'Keine offenen Coin-Angebote.',
    includeDna ? dna : '',
    includeDna ? locks : '',
    includeProjects ? projects : '',
    includeInventory ? `Dateien: ${ctx.fileCount}.` : '',
    includeInventory && ctx.lastLayoutId
      ? `Aktuelles Layout: ${ctx.lastLayoutName ?? ctx.lastLayoutId} (${ctx.layoutPlatform ?? '?'}, ${ctx.layoutElementCount ?? 0} Elemente).`
      : includeInventory
        ? 'Kein gespeichertes Layout.'
        : '',
    includeInventory ? (ctx.lastModule ? `Letzter Job: ${ctx.lastModule}.` : 'Noch keine Generierungen.') : '',
    includeGaps ? missing : '',
    includeInventory ? highlights : '',
    includeInventory && ctx.lastShortId
      ? `Letztes Short: ${ctx.lastShortId}${ctx.lastShortVideoProjectId ? ` (Video ${ctx.lastShortVideoProjectId})` : ''}.`
      : includeInventory
        ? 'Kein eigenes Short gespeichert.'
        : '',
    includeInventory && ctx.contentPackageId
      ? `Aktuelles Content-Paket: ${ctx.contentPackageId}${ctx.contentPackageTitle ? ` „${ctx.contentPackageTitle}“` : ''}.`
      : includeInventory
        ? 'Kein Content-Paket im aktuellen Projekt.'
        : '',
    includeInventory && ctx.lastLogoId ? `Letztes Logo: ${ctx.lastLogoId} (${ctx.logoCount ?? 1}).` : includeInventory ? 'Kein Logo im Projektkontext.' : '',
    includeInventory && ctx.lastBannerId ? `Letztes Banner: ${ctx.lastBannerId}.` : '',
    includeInventory && ctx.lastFacecamId ? `Letzte Facecam: ${ctx.lastFacecamId}.` : '',
    includeInventory && ctx.lastMockupId ? `Letztes Mockup: ${ctx.lastMockupId}.` : '',
    includeInventory && ctx.lastAnimationId ? `Letzte Animation: ${ctx.lastAnimationId}.` : '',
    includeInventory && ctx.lastMusicId ? `Letzter Musik-Track: ${ctx.lastMusicId}.` : '',
    includeInventory && ctx.lastVoiceId ? `Letztes Voiceover: ${ctx.lastVoiceId}.` : '',
    includeInventory && ctx.assetInventory?.length ? `Projekt-Inventar: ${ctx.assetInventory.join(', ')}.` : '',
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
