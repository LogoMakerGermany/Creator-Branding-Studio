/** Phase F — shared video / animation / shorts types. No fake kill/reaction detection. */

export const ANIMATION_TYPES = [
  { id: 'intro', label: 'Intro', durationSec: 6, supportsLoop: false },
  { id: 'outro', label: 'Outro', durationSec: 6, supportsLoop: false },
  { id: 'stinger', label: 'Stinger', durationSec: 3, supportsLoop: false },
  { id: 'alert', label: 'Animierter Alert', durationSec: 4, supportsLoop: false },
  { id: 'logo-loop', label: 'Logo Loop', durationSec: 5, supportsLoop: true },
] as const;

export type AnimationTypeId = (typeof ANIMATION_TYPES)[number]['id'];

export const ANIMATION_ASPECTS = ['16:9', '9:16'] as const;
export type AnimationAspect = (typeof ANIMATION_ASPECTS)[number];

export interface AnimationConfig {
  type: AnimationTypeId;
  durationSec: number;
  aspectRatio: AnimationAspect;
  motion: 'subtle' | 'medium' | 'strong';
  loop: boolean;
  withAudio: boolean;
  logoUrl?: string;
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

export interface VideoEditPlan {
  trimStart: number;
  trimEnd: number;
  removeSegments: TimelineRange[];
  volume: number;
  crop: VideoCrop;
  aspectRatio: '16:9' | '9:16' | 'original';
  subtitleTrack: boolean;
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
    crop: { ...DEFAULT_VIDEO_CROP },
    aspectRatio: 'original',
    subtitleTrack: false,
  };
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

export function parseAnimationIntent(message: string): Partial<AnimationConfig> {
  const lower = message.toLowerCase();
  let type: AnimationTypeId = 'intro';
  if (/outro|abspann/.test(lower)) type = 'outro';
  else if (/stinger|transition/.test(lower)) type = 'stinger';
  else if (/alert|benachricht/.test(lower)) type = 'alert';
  else if (/loop|logo/.test(lower) && /anim/.test(lower)) type = 'logo-loop';
  else if (/intro/.test(lower)) type = 'intro';

  const dur = message.match(/(\d+)\s*(s|sek)/i);
  const durationSec = dur ? Math.min(15, Math.max(2, Number(dur[1]))) : ANIMATION_TYPES.find((t) => t.id === type)!.durationSec;
  const aspectRatio: AnimationAspect = /9\s*[:x]\s*16|vertikal|short/.test(lower) ? '9:16' : '16:9';
  return { type, durationSec, aspectRatio, loop: type === 'logo-loop', motion: 'medium', withAudio: false };
}

export function parseHighlightIndex(message: string): number | null {
  const m = message.match(/highlight\s*(\d+)/i);
  if (!m) return null;
  return Math.max(0, Number(m[1]) - 1);
}

export function ffmpegCropScaleFilter(
  targetWidth: number,
  targetHeight: number,
  crop: VideoCrop
): string {
  if (crop.mode === 'manual') {
    const w = Math.max(0.05, Math.min(1, crop.width));
    const h = Math.max(0.05, Math.min(1, crop.height));
    const x = Math.max(0, Math.min(1 - w, crop.x));
    const y = Math.max(0, Math.min(1 - h, crop.y));
    return `crop=iw*${w}:ih*${h}:iw*${x}:ih*${y},scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}`;
  }
  return `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}`;
}
