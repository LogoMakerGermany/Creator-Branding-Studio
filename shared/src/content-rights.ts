/** Technical content-rights safety. Not legal advice. Not a clearance guarantee. */

export const CONTENT_RIGHTS_ACK_VERSION = 'cr-1';
export const VOICE_CLONE_CONSENT_VERSION = 'vc-1';

export const CONTENT_RIGHTS_ACK_STATEMENT =
  'Ich bestätige, dass ich die erforderlichen Rechte oder Erlaubnisse für die von mir hochgeladenen bzw. bereitgestellten Inhalte besitze.';

export const VOICE_CLONE_CONSENT_STATEMENT =
  'Ich bestätige, dass die Referenzstimme meine eigene Stimme ist oder dass die erforderliche Einwilligung bzw. Berechtigung vorliegt.';

export const CONTENT_RIGHTS_LEGAL_DISCLAIMER =
  'NEXTER ersetzt keine individuelle Rechtsberatung und garantiert nicht, dass Inhalte urheberrechtsfrei, markenrechtlich unbedenklich oder kommerziell frei nutzbar sind.';

export type ContentRightsRiskCategory =
  | 'NORMAL'
  | 'RIGHTS_CONFIRMATION_REQUIRED'
  | 'TRADEMARK_COPY_RISK'
  | 'COPYRIGHT_COPY_RISK'
  | 'PERSONALITY_RIGHTS_RISK'
  | 'VOICE_CLONE_CONSENT_REQUIRED'
  | 'COMMERCIAL_MERCH_RISK';

export const CONTENT_RIGHTS_REPORT_CATEGORIES = [
  'COPYRIGHT',
  'TRADEMARK',
  'PERSONALITY_RIGHTS',
  'VOICE_IDENTITY',
  'OTHER',
] as const;

export type ContentRightsReportCategory = (typeof CONTENT_RIGHTS_REPORT_CATEGORIES)[number];

export const CONTENT_RIGHTS_REPORT_STATUSES = [
  'OPEN',
  'REVIEWING',
  'ACTIONED',
  'REJECTED',
  'CLOSED',
] as const;

export type ContentRightsReportStatus = (typeof CONTENT_RIGHTS_REPORT_STATUSES)[number];

export interface ContentRightsAckRecord {
  version: string;
  acceptedAt: string;
}

export interface VoiceCloneConsentRecord {
  version: string;
  acceptedAt: string;
  statement: 'own' | 'authorized';
}

export interface ContentRightsClassification {
  category: ContentRightsRiskCategory;
  rewrittenPrompt?: string;
  userFacingNote?: string;
  /** Classifier is technical risk-signalling only — not a legal determination. */
  legallyConclusive: false;
}

export interface ContentProviderRightsInventoryRow {
  id: string;
  inputType: string;
  outputType: string;
  featureGate: string;
  productionStatus: string;
  commercialUse: 'LEGAL/PROVIDER REVIEW REQUIRED';
}

/**
 * Repo-backed provider inventory only. Commercial license claims are not inferred.
 */
export const CONTENT_PROVIDER_RIGHTS_INVENTORY: readonly ContentProviderRightsInventoryRow[] = [
  {
    id: 'openai',
    inputType: 'text prompts, optional image references (chat / image generation)',
    outputType: 'chat text, images (when image live flag is on)',
    featureGate: 'OPENAI_API_KEY; IMAGE_GENERATIONS_ENABLED=true for live images; Nexter chat provider gate',
    productionStatus: 'chat gated; live image generation fail-closed unless exact flag',
    commercialUse: 'LEGAL/PROVIDER REVIEW REQUIRED',
  },
  {
    id: 'replicate',
    inputType: 'text prompts; MusicGen audio params; Flux image prompts; video model prompts / image-to-video',
    outputType: 'images (Flux), music (MusicGen), video',
    featureGate: 'REPLICATE_API_TOKEN; generation kill switches; music/video/image provider readiness',
    productionStatus: 'implemented in media-providers.ts; tests block paid provider calls',
    commercialUse: 'LEGAL/PROVIDER REVIEW REQUIRED',
  },
  {
    id: 'runway',
    inputType: 'text-to-video prompts; optional first-frame image on /v1/image_to_video (same gen4.5 model)',
    outputType: 'video',
    featureGate: 'RUNWAY_API_KEY; VIDEO_GENERATIONS_ENABLED=true',
    productionStatus: 'adapter in runway-video.ts; tests block paid provider calls; production remains disabled until flag+key',
    commercialUse: 'LEGAL/PROVIDER REVIEW REQUIRED',
  },
  {
    id: 'elevenlabs',
    inputType: 'text + catalog voiceId (TTS)',
    outputType: 'speech audio from catalog voices',
    featureGate: 'ELEVENLABS_API_KEY; TTS_GENERATION_ENABLED',
    productionStatus: 'catalog TTS only; voice cloning not implemented',
    commercialUse: 'LEGAL/PROVIDER REVIEW REQUIRED',
  },
  {
    id: 'suno',
    inputType: 'music prompts (unofficial endpoint present)',
    outputType: 'music (disabled)',
    featureGate: 'unofficial Suno endpoint disabled; MUSIC_PROVIDER replicate',
    productionStatus: 'disabled in media-providers.ts',
    commercialUse: 'LEGAL/PROVIDER REVIEW REQUIRED',
  },
] as const;

const COPY_INTENT =
  /(?:exakt(?:e[rns]?)?\s+(?:nach(?:machen)?|kopi(?:eren)?|reproduz(?:ieren)?|identisch)|identisch(?:e[rns]?)?\s+(?:kopi(?:eren)?|nach(?:machen)?|machen)|1\s*[:.]\s*1|one[\s-]?to[\s-]?one|pixelgenau|offiziell(?:e[sn]?)?\s+(?:logo|keyart|artwork|marke|kennzeichnung)|kopiere\s+(?:das|die|den)\s+|copy\s+(?:the\s+)?(?:official\s+)?(?:logo|trademark|marke)|mache?\s+(?:mir\s+)?das\s+.{0,80}logo\s+(?:exakt|identisch)|ersetze\s+nur\s+den\s+namen|nur\s+den\s+namen\s+ersetzen|mach\s+das\s+.{0,40}logo\s+identisch)/i;

const TRADEMARK_SUBJECT =
  /logo|markenzeichen|trademark|wordmark|brand\s*mark|kennzeichnung|play\s*button/i;

const KNOWN_MARK_IN_COPY =
  /nike|adidas|puma|gucci|supreme|twitch|youtube|instagram|tiktok|discord|xbox|playstation|nintendo|microsoft|apple|google|amazon|netflix/i;

const COPYRIGHT_SUBJECT =
  /song|lied|melodie|melody|track\b|recording|sample|beat\b|keyart|key[\s-]?art|artwork|skin\b|charakter|character|figur|texture|map\s+asset|promotional\s+asset/i;

const VOICE_CLONE_INTENT =
  /voice[\s-]?clon|stimme\s+klon|klon(?:e|en)\s+(?:die\s+)?stimme|referenzstimme|clone\s+(?:this\s+)?voice|imitate(?:re)?\s+(?:die\s+)?stimme|nachmachen.{0,40}stimme/i;

const PERSONALITY_CLAIM =
  /(?:öffentliches?\s+foto|public(?:ly)?\s+(?:available\s+)?(?:photo|image)).{0,40}(?:frei|free\s+to\s+use)|promi.{0,40}ohne\s+(?:erlaubnis|einwilligung)|ist\s+(?:ein\s+)?promi.{0,30}(?:erlaubt|frei)|ist\s+auf\s+tiktok.{0,30}(?:erlaubt|frei)|ich\s+habe\s+einen\s+clip.{0,30}(?:erlaubt|frei)/i;

const REAL_PERSON_USE =
  /(?:foto|gesicht|portrait|bildnis)\s+(?:von\s+)?(?:einem\s+)?(?:echten|realen)\s+(?:menschen|person)|real(?:e[rn]?)?\s+person|celebritys?\s+(?:face|photo)|öffentliche[rn]?\s+person/i;

const MERCH_INTENT =
  /merch(?:andise)?|t[\s-]?shirt|hoodie|tasse|mug\b|poster\b|print\s+on\s+demand|aufdruck/i;

const GAME_MENTION_ONLY =
  /\b(?:call of duty|fortnite|minecraft|valorant|gta|grand theft auto|league of legends|warzone|overwatch|apex|roblox|cs2|counter[\s-]?strike)\b/i;

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function isVoiceCloneRequest(text: string, payload?: Record<string, unknown> | null): boolean {
  if (payload) {
    if (payload.referenceAudioDataUrl || payload.referenceAudio || payload.clone === true || payload.voiceClone === true) {
      return true;
    }
    if (typeof payload.mode === 'string' && /clone/i.test(payload.mode)) return true;
  }
  return VOICE_CLONE_INTENT.test(text);
}

export function rewritePromptForRightsSafety(
  original: string,
  category: ContentRightsRiskCategory
): string | undefined {
  const brief = normalize(original).slice(0, 500);
  if (category === 'TRADEMARK_COPY_RISK') {
    return `Eigenständiges originales Branding-Logo bzw. Kennzeichen im gewünschten Stil, der Stimmung und Farbwelt. Keine Nachbildung geschützter Markenzeichen, Logos oder offizieller Kennzeichnungen Dritter. Allgemeine Gaming- oder Tactical-Ästhetik ist erlaubt. Kurzbrief: ${brief}`;
  }
  if (category === 'COPYRIGHT_COPY_RISK' && /song|lied|melodie|melody|track|sample|beat/i.test(original)) {
    return `Eigenständige Musik mit ähnlichem Tempo, Genre, Instrumentierung, Stimmung und Energie. Keine Melodie, kein Recording und kein Sample eines bestehenden Songs kopieren. Kurzbrief: ${brief}`;
  }
  if (category === 'COPYRIGHT_COPY_RISK') {
    return `Eigenständiges Originaldesign mit der gewünschten Stimmung und Farbwelt. Keine Kopie geschützter Figuren, Keyarts, Skins, Maps, Texturen oder offizieller Promotional Assets. Kurzbrief: ${brief}`;
  }
  return undefined;
}

export function userFacingRightsNote(category: ContentRightsRiskCategory): string | undefined {
  if (category === 'TRADEMARK_COPY_RISK') {
    return 'Ich setze das nicht als exakte Kopie eines Dritt-Markenzeichens um. Stattdessen plane ich ein eigenständiges Original mit deiner Stimmung und Farbwelt. Das ist kein Rechtsrat — NEXTER prüft Markenrechte nicht abschließend.';
  }
  if (category === 'COPYRIGHT_COPY_RISK') {
    return 'Ich ziele nicht auf eine identische Reproduktion eines geschützten Werks. Stattdessen nutze ich eigenständige Eigenschaften (Stil, Stimmung, Tempo, Genre). Das ist kein Rechtsrat und keine Rechteklärung.';
  }
  if (category === 'PERSONALITY_RIGHTS_RISK') {
    return 'Ein öffentliches Foto oder eine bekannte Person ist nicht automatisch frei verwendbar. Du musst die erforderlichen Rechte oder Einwilligungen besitzen. NEXTER prüft das nicht automatisch.';
  }
  if (category === 'VOICE_CLONE_CONSENT_REQUIRED') {
    return 'Voice-Cloning einer realen Stimme braucht eine explizite Bestätigung: eigene Stimme oder erforderliche Einwilligung. Öffentliche Clips oder Prominenz ersetzen das nicht.';
  }
  if (category === 'COMMERCIAL_MERCH_RISK') {
    return 'Bei Merch musst du die notwendigen Rechte für die kommerzielle Nutzung selbst sicherstellen. NEXTER garantiert nicht automatisch Marken- oder Urheberrechtsfreiheit.';
  }
  return undefined;
}

export function classifyContentRightsRisk(
  text: string,
  payload?: Record<string, unknown> | null
): ContentRightsClassification {
  const raw = typeof text === 'string' ? text : '';
  const extra =
    payload && typeof payload === 'object'
      ? [payload.request, payload.message, payload.prompt, payload.topic, payload.customPromptOverride]
          .filter((value): value is string => typeof value === 'string')
          .join('\n')
      : '';
  const source = `${raw}\n${extra}`.trim();
  const legallyConclusive = false as const;

  if (!source) {
    return { category: 'NORMAL', legallyConclusive };
  }

  if (isVoiceCloneRequest(source, payload)) {
    return {
      category: 'VOICE_CLONE_CONSENT_REQUIRED',
      userFacingNote: userFacingRightsNote('VOICE_CLONE_CONSENT_REQUIRED'),
      legallyConclusive,
    };
  }

  const copyIntent = COPY_INTENT.test(source);
  const trademarkish = TRADEMARK_SUBJECT.test(source) || (KNOWN_MARK_IN_COPY.test(source) && /logo|marke/i.test(source));

  if (copyIntent && trademarkish) {
    return {
      category: 'TRADEMARK_COPY_RISK',
      rewrittenPrompt: rewritePromptForRightsSafety(source, 'TRADEMARK_COPY_RISK'),
      userFacingNote: userFacingRightsNote('TRADEMARK_COPY_RISK'),
      legallyConclusive,
    };
  }

  if (copyIntent && COPYRIGHT_SUBJECT.test(source)) {
    return {
      category: 'COPYRIGHT_COPY_RISK',
      rewrittenPrompt: rewritePromptForRightsSafety(source, 'COPYRIGHT_COPY_RISK'),
      userFacingNote: userFacingRightsNote('COPYRIGHT_COPY_RISK'),
      legallyConclusive,
    };
  }

  if (PERSONALITY_CLAIM.test(source) || (REAL_PERSON_USE.test(source) && /frei|erlaubt|ohne erlaubnis/i.test(source))) {
    return {
      category: 'PERSONALITY_RIGHTS_RISK',
      userFacingNote: userFacingRightsNote('PERSONALITY_RIGHTS_RISK'),
      legallyConclusive,
    };
  }

  if (MERCH_INTENT.test(source) && (copyIntent || /offiziell|character|figur|logo/i.test(source))) {
    return {
      category: 'COMMERCIAL_MERCH_RISK',
      userFacingNote: userFacingRightsNote('COMMERCIAL_MERCH_RISK'),
      legallyConclusive,
    };
  }

  if (MERCH_INTENT.test(source)) {
    return {
      category: 'COMMERCIAL_MERCH_RISK',
      userFacingNote: userFacingRightsNote('COMMERCIAL_MERCH_RISK'),
      legallyConclusive,
    };
  }

  if (REAL_PERSON_USE.test(source)) {
    return {
      category: 'PERSONALITY_RIGHTS_RISK',
      userFacingNote: userFacingRightsNote('PERSONALITY_RIGHTS_RISK'),
      legallyConclusive,
    };
  }

  // Game titles alone, including "ich streame Call of Duty", stay NORMAL.
  if (GAME_MENTION_ONLY.test(source) && !copyIntent) {
    return { category: 'NORMAL', legallyConclusive };
  }

  return { category: 'NORMAL', legallyConclusive };
}

export function attachRightsSafetyToPayload(
  payload: Record<string, unknown> | undefined,
  classification: ContentRightsClassification
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(payload ?? {}) };
  next.rightsRisk = classification.category;
  if (classification.rewrittenPrompt) {
    next.rightsSafePrompt = classification.rewrittenPrompt;
  }
  if (classification.userFacingNote) {
    next.rightsUserNote = classification.userFacingNote;
  }
  return next;
}

export function isCurrentContentRightsAck(
  ack: ContentRightsAckRecord | undefined | null,
  version = CONTENT_RIGHTS_ACK_VERSION
): boolean {
  return Boolean(ack && ack.version === version && typeof ack.acceptedAt === 'string' && ack.acceptedAt.length > 0);
}

export function isCurrentVoiceCloneConsent(
  consent: VoiceCloneConsentRecord | undefined | null,
  version = VOICE_CLONE_CONSENT_VERSION
): boolean {
  return Boolean(
    consent &&
      consent.version === version &&
      (consent.statement === 'own' || consent.statement === 'authorized') &&
      typeof consent.acceptedAt === 'string'
  );
}
