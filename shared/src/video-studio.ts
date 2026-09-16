/** Phase F — shared video / animation / shorts types. No fake kill/reaction detection. */

export const ANIMATION_TYPES = [
  { id: 'intro', label: 'Intro', durationSec: 6, supportsLoop: false },
  { id: 'outro', label: 'Outro', durationSec: 6, supportsLoop: false },
  { id: 'stinger', label: 'Stinger', durationSec: 3, supportsLoop: false },
  { id: 'alert', label: 'Animierter Alert', durationSec: 4, supportsLoop: false },
  { id: 'logo-loop', label: 'Logo Loop', durationSec: 5, supportsLoop: true },
  { id: 'stream-start', label: 'Animierter Starting Soon', durationSec: 6, supportsLoop: true },
  { id: 'stream-end', label: 'Animiertes Stream-Ende', durationSec: 6, supportsLoop: false },
] as const;

export type AnimationTypeId = (typeof ANIMATION_TYPES)[number]['id'];

export const ANIMATION_ASPECTS = ['original', '1:1', '16:9', '9:16'] as const;
export type AnimationAspect = (typeof ANIMATION_ASPECTS)[number];

export const ANIMATION_EFFECTS = [
  { id: 'fade-in', label: 'Fade In' },
  { id: 'fade-out', label: 'Fade Out' },
  { id: 'zoom', label: 'Zoom' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'rotate', label: 'Rotation' },
  { id: 'slide', label: 'Slide' },
  { id: 'logo-reveal', label: 'Logo Reveal' },
] as const;
export type AnimationEffectId = (typeof ANIMATION_EFFECTS)[number]['id'];

export const MIN_ANIMATION_DURATION_SEC = 1;
export const MAX_ANIMATION_DURATION_SEC = 15;
export const MAX_ANIMATION_ROTATIONS = 3;

export type AnimationDirection = 'cw' | 'ccw' | 'left' | 'right' | 'up' | 'down';

export const ANIMATION_SOURCE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
] as const;

export interface AnimationConfig {
  type: AnimationTypeId;
  durationSec: number;
  aspectRatio: AnimationAspect;
  motion: 'subtle' | 'medium' | 'strong';
  loop: boolean;
  withAudio: boolean;
  logoUrl?: string;
  effect?: AnimationEffectId;
  rotations?: number;
  direction?: AnimationDirection;
  transparent?: boolean;
  sourceFileId?: string | null;
}

export interface VideoMetadata {
  durationSec: number;
  width: number;
  height: number;
  aspectRatio: string;
  fps?: number;
  hasAudio: boolean;
  sizeBytes: number;
  videoCodec?: string;
  audioCodec?: string;
}

export interface TimelineRange {
  start: number;
  end: number;
}

export interface VideoScene extends TimelineRange {
  duration: number;
  score?: number;
}

export interface VideoPause extends TimelineRange {
  duration: number;
}

export interface AudioActivityBucket {
  start: number;
  end: number;
  rms: number;
}

export interface VideoHighlight extends TimelineRange {
  score: number;
  reason: string;
  label: string;
  transcriptSegment?: string;
}

export type VideoAspectPreset = '16:9' | '9:16' | '1:1' | 'original';
export type VideoFitMode = 'crop' | 'fit' | 'center';
export type VideoTransitionId = 'cut' | 'fade';

export const VIDEO_TRANSITION_TYPES: readonly VideoTransitionId[] = ['cut', 'fade'];
export const MAX_TRANSITION_SEC = 1.5;
export const DEFAULT_TRANSITION_SEC = 0.4;
export const MAX_CAPTION_CHARS = 200;

export interface VideoEditPlan {
  trimStart: number;
  trimEnd: number;
  removeSegments: TimelineRange[];
  volume: number;
  mute?: boolean;
  crop: VideoCrop;
  fitMode?: VideoFitMode;
  aspectRatio: VideoAspectPreset;
  subtitleTrack: boolean;
  introFileId?: string | null;
  outroFileId?: string | null;
  audioFileId?: string | null;
  transition?: VideoTransitionId;
  transitionSec?: number;
}

export interface VideoCrop {
  mode: 'center' | 'manual';
  /** Normalized 0–1 relative to source frame */
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_VIDEO_CROP: VideoCrop = {
  mode: 'center',
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

export function defaultEditPlan(durationSec: number): VideoEditPlan {
  const end = Math.max(0.5, durationSec || 1);
  return {
    trimStart: 0,
    trimEnd: end,
    removeSegments: [],
    volume: 1,
    mute: false,
    crop: { ...DEFAULT_VIDEO_CROP },
    fitMode: 'crop',
    aspectRatio: 'original',
    subtitleTrack: false,
    introFileId: null,
    outroFileId: null,
    audioFileId: null,
    transition: 'cut',
    transitionSec: DEFAULT_TRANSITION_SEC,
  };
}

export function isValidTrim(start: number, end: number, duration: number): boolean {
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(duration)) return false;
  if (start < 0) return false;
  if (end > duration + 0.05) return false;
  return start < end;
}

export function outputSizeForAspect(
  aspect: VideoAspectPreset
): { width: number; height: number } | null {
  if (aspect === 'original') return null;
  if (aspect === '9:16') return { width: 1080, height: 1920 };
  if (aspect === '1:1') return { width: 1080, height: 1080 };
  return { width: 1920, height: 1080 };
}

export function clampRange(start: number, end: number, duration: number): TimelineRange {
  const s = Math.max(0, Math.min(start, duration));
  const e = Math.max(s + 0.2, Math.min(end, duration));
  return { start: s, end: e };
}

/** Non-destructive: invert remove-segments inside a trim window. */
export function keptRanges(trim: TimelineRange, removes: TimelineRange[] = []): TimelineRange[] {
  const sorted = [...removes]
    .filter((r) => r.end > trim.start && r.start < trim.end)
    .sort((a, b) => a.start - b.start);
  const kept: TimelineRange[] = [];
  let cursor = trim.start;
  for (const r of sorted) {
    const rs = Math.max(r.start, trim.start);
    const re = Math.min(r.end, trim.end);
    if (rs > cursor + 0.05) kept.push({ start: cursor, end: rs });
    cursor = Math.max(cursor, re);
  }
  if (trim.end - cursor > 0.05) kept.push({ start: cursor, end: trim.end });
  return kept.length ? kept : [trim];
}

export function clipSubtitlesToRange<T extends { start: number; end: number; text: string }>(
  subs: T[],
  range: TimelineRange
): T[] {
  return subs
    .filter((s) => s.end > range.start && s.start < range.end)
    .map((s) => ({
      ...s,
      start: Math.max(0, s.start - range.start),
      end: Math.max(0.05, Math.min(s.end, range.end) - range.start),
    }));
}

const FORBIDDEN_DETECTION =
  /\b(kill|headshot|victory|warzone|fortnite|elimination|reaction|kills? erkannt|gegner get[öo]tet)\b/i;

export function sanitizeHighlightLabel(label: string): string {
  if (FORBIDDEN_DETECTION.test(label)) return 'Highlight';
  const cleaned = label.replace(FORBIDDEN_DETECTION, '').trim();
  return cleaned.length > 2 ? cleaned : 'Highlight';
}

export function highlightClaimsFakeDetection(text: string): boolean {
  return FORBIDDEN_DETECTION.test(text);
}

export function buildLocalHighlights(input: {
  durationSec: number;
  scenes: VideoScene[];
  pauses: VideoPause[];
  activity: AudioActivityBucket[];
  subtitles?: Array<{ start: number; end: number; text: string }>;
}): VideoHighlight[] {
  const duration = Math.max(1, input.durationSec);
  const window = Math.min(18, Math.max(6, duration / 4));
  const candidates: VideoHighlight[] = [];

  const step = Math.max(2, window / 2);
  for (let t = 0; t + window <= duration + 0.01; t += step) {
    const start = t;
    const end = Math.min(duration, t + window);
    const sceneHits = input.scenes.filter((s) => s.start >= start && s.start < end).length;
    const pauseDur = input.pauses
      .filter((p) => p.end > start && p.start < end)
      .reduce((sum, p) => sum + Math.min(p.end, end) - Math.max(p.start, start), 0);
    const speech = (input.subtitles ?? []).filter((s) => s.end > start && s.start < end);
    const speechDur = speech.reduce((sum, s) => sum + Math.min(s.end, end) - Math.max(s.start, start), 0);
    const activityAvg =
      input.activity
        .filter((a) => a.end > start && a.start < end)
        .reduce((sum, a) => sum + a.rms, 0) / Math.max(1, input.activity.length);

    let score = 40;
    const reasons: string[] = [];
    if (sceneHits > 0) {
      score += Math.min(25, sceneHits * 12);
      reasons.push('Szenenwechsel');
    }
    if (speechDur > 1) {
      score += Math.min(20, speechDur * 4);
      reasons.push('hohe Sprachaktivität');
    }
    if (activityAvg > 0.15) {
      score += 10;
      reasons.push('Audioaktivität');
    }
    if (pauseDur > window * 0.5) score -= 20;
    score = Math.max(0, Math.min(100, Math.round(score)));

    if (score < 45) continue;
    const snippet = speech[0]?.text;
    candidates.push({
      start,
      end,
      score,
      reason: reasons.join(' + ') || 'Aktivitätsfenster',
      label: sanitizeHighlightLabel(snippet ? snippet.slice(0, 48) : 'Highlight'),
      transcriptSegment: snippet,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const picked: VideoHighlight[] = [];
  for (const c of candidates) {
    if (picked.some((p) => overlap(p, c) > 0.5)) continue;
    picked.push(c);
    if (picked.length >= 5) break;
  }
  return picked.sort((a, b) => a.start - b.start);
}

function overlap(a: TimelineRange, b: TimelineRange): number {
  const inter = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  const union = Math.max(a.end, b.end) - Math.min(a.start, b.start);
  return union <= 0 ? 0 : inter / union;
}

export function isAiVideoQuoteIntent(message: string): boolean {
  const lower = message.toLowerCase();
  if (/analysier|transkrib|untertitel|\bcaptions?\b|\bshorts?\b/.test(lower)) return false;
  if (!/(?:ki|ai)[- ]?video/.test(lower)) return false;
  return /(mach|erstell|generier|brauche)/.test(lower);
}

export function isAnimatedStreamScreenIntent(message: string): boolean {
  const lower = message.toLowerCase();
  if (!/animier/.test(lower)) return false;
  return isStreamScreenPhrase(lower);
}

export function isStaticStreamScreenIntent(message: string): boolean {
  const lower = message.toLowerCase();
  if (/animier/.test(lower)) return false;
  return isStreamScreenPhrase(lower);
}

function isStreamScreenPhrase(lower: string): boolean {
  return /starting[- ]?soon|startscreen|startbildschirm|stream[- ]?start|endscreen|ending[- ]?screen|stream[- ]?ende|\bending screen\b/.test(
    lower
  );
}

export function parseAnimationIntent(message: string): Partial<AnimationConfig> {
  const lower = message.toLowerCase();
  let type: AnimationTypeId = 'intro';
  const animatedScreen = /animier/.test(lower);
  const startingSoon =
    /starting[- ]?soon|startscreen|startbildschirm|stream[- ]?start/.test(lower);
  const endingScreen = /endscreen|ending[- ]?screen|stream[- ]?ende|\bending screen\b/.test(lower);
  if (animatedScreen && endingScreen) type = 'stream-end';
  else if (animatedScreen && startingSoon) type = 'stream-start';
  else if (/outro|abspann/.test(lower)) type = 'outro';
  else if (/stinger|transition/.test(lower)) type = 'stinger';
  else if (/alert|benachricht/.test(lower)) type = 'alert';
  else if (/loop|logo/.test(lower) && /anim/.test(lower)) type = 'logo-loop';
  else if (/intro/.test(lower)) type = 'intro';
  else if (endingScreen) type = 'stream-end';
  else if (startingSoon) type = 'stream-start';

  const wordDur: Record<string, number> = {
    eins: 1,
    zwei: 2,
    drei: 3,
    vier: 4,
    fünf: 5,
    funf: 5,
    sechs: 6,
    sieben: 7,
    acht: 8,
    neun: 9,
    zehn: 10,
    elf: 11,
    zwölf: 12,
    zwoelf: 12,
    fünfzehn: 15,
    funfzehn: 15,
  };
  const dur = message.match(/(\d+)\s*(s|sek)/i);
  const word = lower.match(
    /\b(eins|zwei|drei|vier|fünf|funf|sechs|sieben|acht|neun|zehn|elf|zwölf|zwoelf|fünfzehn|funfzehn)\s*(s|sek)/i
  );
  const rawDur = dur
    ? Number(dur[1])
    : word
      ? wordDur[word[1]!.replace('ü', 'u').replace('ö', 'oe')] ?? wordDur[word[1]!]
      : undefined;
  const durationSec =
    rawDur != null
      ? Math.min(MAX_ANIMATION_DURATION_SEC, Math.max(MIN_ANIMATION_DURATION_SEC, rawDur))
      : ANIMATION_TYPES.find((t) => t.id === type)!.durationSec;
  let aspectRatio: AnimationAspect = '16:9';
  if (/9\s*[:x]\s*16|vertikal|short|tiktok/.test(lower)) aspectRatio = '9:16';
  else if (/1\s*[:x]\s*1|quadrat/.test(lower)) aspectRatio = '1:1';
  else if (/original/.test(lower)) aspectRatio = 'original';

  let effect: AnimationEffectId | undefined;
  if (/achse dreh|um die eigene achse|rotat|dreh/.test(lower)) effect = 'rotate';
  else if (/ausblend|fade[- ]?out/.test(lower)) effect = 'fade-out';
  else if (/einblend|fade[- ]?in/.test(lower)) effect = 'fade-in';
  else if (/zoom/.test(lower)) effect = 'zoom';
  else if (/pulse|pulsier/.test(lower)) effect = 'pulse';
  else if (/slide|schieb/.test(lower)) effect = 'slide';
  else if (/reveal|enthüll/.test(lower)) effect = 'logo-reveal';

  const rotations = /zweimal|zwei mal|2(?:x|\s*mal)/.test(lower)
    ? 2
    : /dreimal|3(?:x|\s*mal)/.test(lower)
      ? 3
      : /einmal|eine umdrehung/.test(lower)
        ? 1
        : effect === 'rotate'
          ? 1
          : undefined;
  const direction: AnimationDirection | undefined = /gegen den uhr|ccw|links herum/.test(lower)
    ? 'ccw'
    : /uhrzeigersinn|cw|rechts herum/.test(lower)
      ? 'cw'
      : effect === 'slide' && /rechts/.test(lower)
        ? 'right'
        : effect === 'slide' && /links/.test(lower)
          ? 'left'
          : undefined;

  return {
    type,
    durationSec,
    aspectRatio,
    loop: type === 'logo-loop' || type === 'stream-start' || /loop/.test(lower),
    motion: /langsam/.test(lower) ? 'subtle' : /stark|schnell/.test(lower) ? 'strong' : 'medium',
    withAudio: false,
    effect,
    transparent: /transparent/.test(lower) || undefined,
    rotations,
    direction,
  };
}

export function animationNeedsFollowUp(message: string): boolean {
  const lower = message.toLowerCase();
  if (!/animier|animation/.test(lower)) return false;
  if (/(intro|outro|stinger|alert|starting[- ]?soon|startscreen|endscreen|stream[- ]?ende|stream[- ]?start)/.test(lower))
    return false;
  if (/(mach|erstell|generier).*\banimation\b/.test(lower)) return false;
  if (/(\d+)\s*(s|sek)/.test(lower)) return false;
  if (
    /dreh|rotat|einblend|ausblend|fade|zoom|pulse|slide|reveal|transparent|tiktok|achse/.test(
      lower
    )
  ) {
    return false;
  }
  return true;
}

export function isSupportedAnimationType(value: string | undefined): value is AnimationTypeId {
  return ANIMATION_TYPES.some((t) => t.id === value);
}

export function isSupportedAnimationEffect(value: string | undefined): value is AnimationEffectId {
  return ANIMATION_EFFECTS.some((e) => e.id === value);
}

export function validateAnimationDuration(
  value: unknown
): { ok: true; durationSec: number } | { ok: false; code: 'INVALID_DURATION' } {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ok: false, code: 'INVALID_DURATION' };
  }
  if (value < MIN_ANIMATION_DURATION_SEC || value > MAX_ANIMATION_DURATION_SEC) {
    return { ok: false, code: 'INVALID_DURATION' };
  }
  return { ok: true, durationSec: value };
}

export function defaultAnimationPlan(): AnimationConfig {
  return {
    type: 'intro',
    durationSec: 6,
    aspectRatio: '16:9',
    motion: 'medium',
    loop: false,
    withAudio: false,
    effect: 'fade-in',
    rotations: 1,
    direction: 'cw',
    transparent: false,
    sourceFileId: null,
  };
}

export function animationOutputHasAlpha(kind: 'preview' | 'mp4' | 'webm'): boolean {
  return kind === 'preview' || kind === 'webm';
}

export interface AnimationPreviewState {
  type: AnimationTypeId;
  effect: AnimationEffectId;
  durationSec: number;
  aspectRatio: AnimationAspect;
  motion: AnimationConfig['motion'];
  loop: boolean;
  rotations: number;
  direction: AnimationDirection;
  transparent: boolean;
  sourceFileId: string | null;
  cssAspect: string;
  animationClass: string;
  animationDuration: string;
  animationIteration: string;
  label: 'Vorschau';
  alphaNote: string;
}

export function buildAnimationPreviewState(plan: AnimationConfig): AnimationPreviewState {
  const effect: AnimationEffectId = isSupportedAnimationEffect(plan.effect) ? plan.effect : 'fade-in';
  const direction: AnimationDirection = plan.direction ?? (effect === 'rotate' ? 'cw' : 'left');
  const rotations = Math.min(
    MAX_ANIMATION_ROTATIONS,
    Math.max(1, Math.round(plan.rotations ?? 1))
  );
  const cssAspect =
    plan.aspectRatio === '9:16'
      ? '9 / 16'
      : plan.aspectRatio === '1:1'
        ? '1 / 1'
        : plan.aspectRatio === 'original'
          ? 'auto'
          : '16 / 9';
  let animationClass = `ucbs-anim-${effect}`;
  if (effect === 'rotate') animationClass = direction === 'ccw' ? 'ucbs-anim-rotate-ccw' : 'ucbs-anim-rotate-cw';
  if (effect === 'slide') {
    animationClass =
      direction === 'right'
        ? 'ucbs-anim-slide-right'
        : direction === 'up'
          ? 'ucbs-anim-slide-up'
          : direction === 'down'
            ? 'ucbs-anim-slide-down'
            : 'ucbs-anim-slide-left';
  }
  const mp4Alpha = animationOutputHasAlpha('mp4');
  return {
    type: isSupportedAnimationType(plan.type) ? plan.type : 'intro',
    effect,
    durationSec: plan.durationSec,
    aspectRatio: plan.aspectRatio,
    motion: plan.motion,
    loop: Boolean(plan.loop),
    rotations,
    direction,
    transparent: Boolean(plan.transparent),
    sourceFileId: plan.sourceFileId ?? null,
    cssAspect,
    animationClass,
    animationDuration: `${Math.max(MIN_ANIMATION_DURATION_SEC, plan.durationSec)}s`,
    animationIteration: plan.loop ? 'infinite' : String(effect === 'rotate' ? rotations : 1),
    label: 'Vorschau',
    alphaNote: plan.transparent
      ? mp4Alpha
        ? 'Transparenter Hintergrund'
        : 'Vorschau kann transparent sein. Provider-MP4 hat kein Alpha.'
      : 'Deckender Hintergrund',
  };
}

export function applyAnimationChangeRequest(plan: AnimationConfig, request: string): AnimationConfig {
  const lower = request.toLowerCase();
  const next = { ...plan };
  if (/langsamer/.test(lower)) {
    next.durationSec = Math.min(MAX_ANIMATION_DURATION_SEC, Math.max(MIN_ANIMATION_DURATION_SEC, plan.durationSec * 1.5));
    next.motion = 'subtle';
  }
  if (/schneller/.test(lower)) {
    next.durationSec = Math.min(MAX_ANIMATION_DURATION_SEC, Math.max(MIN_ANIMATION_DURATION_SEC, plan.durationSec * 0.65));
    next.motion = 'strong';
  }
  if (/drehrichtung|gegen den uhr|andere richtung/.test(lower)) {
    next.direction = plan.direction === 'ccw' ? 'cw' : 'ccw';
    next.effect = 'rotate';
  }
  const onlyDur = lower.match(/nur\s+(\d+)\s*(s|sek)/);
  if (onlyDur) next.durationSec = Math.min(MAX_ANIMATION_DURATION_SEC, Math.max(MIN_ANIMATION_DURATION_SEC, Number(onlyDur[1])));
  if (/transparent/.test(lower)) next.transparent = true;
  if (/tiktok|9\s*[:x]\s*16/.test(lower)) next.aspectRatio = '9:16';
  return next;
}

export function animationStudioPath(plan: Partial<AnimationConfig>): string {
  const params = new URLSearchParams();
  if (plan.type) params.set('type', plan.type);
  if (plan.effect) params.set('effect', plan.effect);
  if (plan.durationSec) params.set('duration', String(plan.durationSec));
  if (plan.aspectRatio) params.set('aspect', plan.aspectRatio);
  if (plan.transparent) params.set('transparent', '1');
  if (plan.sourceFileId) params.set('sourceFileId', plan.sourceFileId);
  if (plan.loop) params.set('loop', '1');
  if (plan.direction) params.set('direction', plan.direction);
  const q = params.toString();
  return q ? `/animation-studio?${q}` : '/animation-studio';
}

export function parseHighlightIndex(message: string): number | null {
  const m = message.match(/highlight\s*(\d+)/i);
  if (!m) return null;
  return Math.max(0, Number(m[1]) - 1);
}

export interface VideoStudioPrep {
  studio: 'video' | 'shorts';
  aspectRatio?: VideoAspectPreset;
  bestSeconds?: number;
  cutStart?: boolean;
  wantIntro?: boolean;
  format?: 'tiktok' | 'shorts' | 'youtube';
}

/** Prepares Video/Shorts Studio. Never starts a paid job. */
export function parseVideoStudioPrep(message: string): VideoStudioPrep | null {
  const lower = message.toLowerCase();
  const tiktok = /tiktok|reel|reels/.test(lower) && /clip|kurz|mach|erstell|export/.test(lower);
  const shortish = /short/.test(lower) && /mach|erstell|clip/.test(lower);
  const vertical = /9\s*[:x]\s*16|vertikal/.test(lower);
  const square = /1\s*[:x]\s*1|quadrat/.test(lower);
  const landscape = /16\s*[:x]\s*9/.test(lower);
  const best = lower.match(/besten\s+(\d+)\s*(s|sek)/i);
  const cutStart = /schneide den anfang|anfang weg|trimme den anfang|cut (the )?start/i.test(lower);
  const wantIntro = /f[uü]ge mein intro|intro davor|intro davor setzen|mit intro/i.test(lower);
  if (!tiktok && !shortish && !vertical && !square && !landscape && !best && !cutStart && !wantIntro) {
    return null;
  }
  const studio: 'video' | 'shorts' = tiktok || shortish || (vertical && /clip|short/.test(lower)) ? 'shorts' : 'video';
  let aspectRatio: VideoAspectPreset | undefined;
  if (vertical || tiktok || shortish) aspectRatio = '9:16';
  else if (square) aspectRatio = '1:1';
  else if (landscape) aspectRatio = '16:9';
  return {
    studio,
    aspectRatio,
    bestSeconds: best ? Math.min(60, Math.max(3, Number(best[1]))) : undefined,
    cutStart,
    wantIntro,
    format: tiktok ? 'tiktok' : shortish ? 'shorts' : landscape ? 'youtube' : undefined,
  };
}

function numericFilterToken(n: number): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return String(Math.max(0, Math.min(10000, v)));
}

export function ffmpegCropScaleFilter(
  targetWidth: number,
  targetHeight: number,
  crop: VideoCrop,
  fitMode: VideoFitMode = 'crop'
): string {
  const w = numericFilterToken(targetWidth);
  const h = numericFilterToken(targetHeight);
  if (fitMode === 'fit') {
    return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black`;
  }
  if (crop.mode === 'manual') {
    const cw = Math.max(0.05, Math.min(1, crop.width));
    const ch = Math.max(0.05, Math.min(1, crop.height));
    const x = Math.max(0, Math.min(1 - cw, crop.x));
    const y = Math.max(0, Math.min(1 - ch, crop.y));
    return `crop=iw*${cw}:ih*${ch}:iw*${x}:ih*${y},scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  }
  return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
}

export function isSupportedVideoTransition(value: string | undefined): value is VideoTransitionId {
  return value === 'cut' || value === 'fade';
}

export function resolveTransitionDuration(
  requested: number | undefined,
  leftClipSec: number,
  rightClipSec: number
): { ok: true; durationSec: number } | { ok: false; code: 'INVALID_TRANSITION' } {
  const fade = requested ?? DEFAULT_TRANSITION_SEC;
  const maxAllowed = Math.max(0, Math.min(MAX_TRANSITION_SEC, leftClipSec - 0.15, rightClipSec - 0.15));
  if (!Number.isFinite(fade) || fade < 0.05 || fade > maxAllowed + 1e-6) {
    return { ok: false, code: 'INVALID_TRANSITION' };
  }
  return { ok: true, durationSec: Math.min(fade, maxAllowed) };
}

export function sanitizeCaptionText(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/-->/g, '→')
    .replace(/\r/g, '')
    .trim()
    .slice(0, MAX_CAPTION_CHARS);
}

export function isValidCaption(
  entry: { start: number; end: number; text: string },
  durationSec: number
): boolean {
  const text = sanitizeCaptionText(entry.text);
  if (!text) return false;
  if (!Number.isFinite(entry.start) || !Number.isFinite(entry.end)) return false;
  if (entry.start < 0) return false;
  if (entry.end <= entry.start) return false;
  if (entry.end > durationSec + 0.05) return false;
  return true;
}

export function captionsFromTranscript(
  segments: Array<{ start: number; end: number; text: string }>,
  durationSec: number
): Array<{ start: number; end: number; text: string }> {
  return segments
    .map((s) => ({
      start: s.start,
      end: s.end,
      text: sanitizeCaptionText(s.text),
    }))
    .filter((s) => isValidCaption(s, durationSec));
}

export interface VideoPreviewState {
  trimStart: number;
  trimEnd: number;
  aspectRatio: VideoAspectPreset;
  fitMode: VideoFitMode;
  crop: VideoCrop;
  mute: boolean;
  volume: number;
  subtitleTrack: boolean;
  transition: VideoTransitionId;
  transitionSec: number;
  introFileId: string | null;
  outroFileId: string | null;
  captions: Array<{ start: number; end: number; text: string }>;
  objectFit: 'cover' | 'contain';
  cssAspect: string;
  label: 'Vorschau';
}

export function buildVideoPreviewState(input: {
  plan: VideoEditPlan;
  captions?: Array<{ start: number; end: number; text: string }>;
}): VideoPreviewState {
  const plan = input.plan;
  const fitMode = plan.fitMode ?? 'crop';
  return {
    trimStart: plan.trimStart,
    trimEnd: plan.trimEnd,
    aspectRatio: plan.aspectRatio,
    fitMode,
    crop: plan.crop,
    mute: Boolean(plan.mute),
    volume: plan.volume,
    subtitleTrack: Boolean(plan.subtitleTrack),
    transition: isSupportedVideoTransition(plan.transition) ? plan.transition : 'cut',
    transitionSec: plan.transitionSec ?? DEFAULT_TRANSITION_SEC,
    introFileId: plan.introFileId ?? null,
    outroFileId: plan.outroFileId ?? null,
    captions: input.captions ?? [],
    objectFit: fitMode === 'fit' ? 'contain' : 'cover',
    cssAspect: plan.aspectRatio === '9:16' ? '9 / 16' : plan.aspectRatio === '1:1' ? '1 / 1' : '16 / 9',
    label: 'Vorschau',
  };
}

export interface VideoClosureCommand {
  transition?: VideoTransitionId;
  caption?: { text: string; start: number; end: number };
  wantPreview?: boolean;
  wantTranscribe?: boolean;
}

export function parseVideoClosureCommand(message: string): VideoClosureCommand | null {
  const lower = message.toLowerCase();
  const out: VideoClosureCommand = {};
  if (/weiche überblendung|crossfade|cross-fade|überblendung/.test(lower)) out.transition = 'fade';
  if (/harter schnitt|\bcut\b zwischen/.test(lower)) out.transition = 'cut';
  if (/zeig mir erst eine vorschau|erst (eine )?vorschau|preview zeigen/i.test(lower)) out.wantPreview = true;
  if (
    /transkrib|automatische untertitel|untertitel per (ki|whisper)|speech[- ]to[- ]text/.test(lower) &&
    /video|untertitel/.test(lower)
  ) {
    out.wantTranscribe = true;
  }
  const cap = message.match(
    /schreib(?:e)?(?:\s+unten)?\s+['"]([^'"]{1,200})['"]\s+von\s+(?:sekunde\s+)?(\d+(?:[.,]\d+)?)\s+bis\s+(\d+(?:[.,]\d+)?)/i
  );
  if (cap) {
    out.caption = {
      text: sanitizeCaptionText(cap[1] ?? ''),
      start: Number(String(cap[2]).replace(',', '.')),
      end: Number(String(cap[3]).replace(',', '.')),
    };
  }
  if (!out.transition && !out.caption && !out.wantPreview && !out.wantTranscribe) return null;
  return out;
}
