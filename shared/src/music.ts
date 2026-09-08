/** Music generation settings parsed from natural language (Nexter + studios). */

export const MUSIC_PROVIDERS = {
  'replicate-musicgen': {
    id: 'replicate-musicgen',
    label: 'MusicGen',
    maxDurationSec: 30,
  },
} as const;

export type MusicProviderId = keyof typeof MUSIC_PROVIDERS;

/** MusicGen is text-to-music and does not offer a dedicated vocalist/lyrics pipeline. */
export const MUSICGEN_VOCAL_CAPABILITY = 'instrumental-only' as const;

export const MIN_MUSIC_DURATION_SEC = 1;
export const MAX_MUSIC_PROMPT_CHARS = 800;

export type MusicPurpose =
  | 'stream-intro'
  | 'stream-outro'
  | 'stream'
  | 'youtube'
  | 'background'
  | 'jingle'
  | 'short';

export type MusicEnergy = 'low' | 'medium' | 'high';

export const MUSIC_GENRES = [
  'Hardcore',
  'Techno',
  'Electronic',
  'Hip-Hop',
  'Rock',
  'Lo-Fi',
  'Ambient',
  'Orchestral',
  'Jazz',
  'Metal',
  'Pop',
  'Trap',
  'Synthwave',
] as const;

export const MUSIC_MOODS = [
  'epic',
  'energetic',
  'dark',
  'chill',
  'aggressive',
  'cinematic',
  'sad',
  'happy',
] as const;

export const MUSIC_USE_CASES: Array<{ id: MusicPurpose; label: string }> = [
  { id: 'stream-intro', label: 'Intro' },
  { id: 'stream-outro', label: 'Outro' },
  { id: 'background', label: 'Background' },
  { id: 'stream', label: 'Stream' },
  { id: 'short', label: 'Short' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'jingle', label: 'Jingle' },
];

export const MUSIC_ENERGY_OPTIONS: Array<{ id: MusicEnergy; label: string }> = [
  { id: 'low', label: 'Ruhig' },
  { id: 'medium', label: 'Mittel' },
  { id: 'high', label: 'Hoch' },
];

export interface MusicConfig {
  genre?: string;
  mood?: string;
  energy: MusicEnergy;
  durationSec: number;
  instrumental: true;
  purpose?: MusicPurpose;
  prompt: string;
  summary: string;
  title?: string;
  theme?: string;
}

export interface MusicGenerationSettings {
  type: 'music';
  duration?: number;
  assumedDuration: boolean;
  mood?: string;
  purpose?: MusicPurpose;
  instrumental?: boolean;
  theme?: string;
  genre?: string;
  energy?: MusicEnergy;
  title?: string;
  prompt: string;
  summary?: string;
  missing: string[];
  followUpQuestion: string | null;
  vocalsRequested?: boolean;
}

export function musicProviderMaxDuration(id: MusicProviderId): number {
  return MUSIC_PROVIDERS[id].maxDurationSec;
}

export function musicGenMaxDurationSec(): number {
  return MUSIC_PROVIDERS['replicate-musicgen'].maxDurationSec;
}

export function checkMusicDuration(
  durationSec: number,
  maxSec: number
): { ok: true } | { ok: false; message: string } {
  if (!Number.isFinite(durationSec) || durationSec < MIN_MUSIC_DURATION_SEC) {
    return { ok: false, message: 'Die Dauer muss mindestens 1 Sekunde sein.' };
  }
  if (!Number.isInteger(durationSec)) {
    return { ok: false, message: 'Die Dauer muss in ganzen Sekunden angegeben werden.' };
  }
  if (durationSec > maxSec) {
    return {
      ok: false,
      message: `Der aktive Musik-Provider unterstützt maximal ${maxSec} Sekunden. Gewünscht wurden ${durationSec} Sekunden. Bitte eine kürzere Dauer wählen — die Länge wird nicht stillschweigend gekürzt.`,
    };
  }
  return { ok: true };
}

const GENRES: ReadonlyArray<readonly [string, string]> = [
  ['hardcore', 'Hardcore'],
  ['techno', 'Techno'],
  ['edm', 'Electronic'],
  ['hip hop', 'Hip-Hop'],
  ['hip-hop', 'Hip-Hop'],
  ['rock', 'Rock'],
  ['lofi', 'Lo-Fi'],
  ['lo-fi', 'Lo-Fi'],
  ['ambient', 'Ambient'],
  ['orchestral', 'Orchestral'],
  ['jazz', 'Jazz'],
  ['metal', 'Metal'],
  ['pop', 'Pop'],
  ['trap', 'Trap'],
  ['synth', 'Synthwave'],
  ['electronic', 'Electronic'],
];

export function inferMusicMetadata(prompt: string): { genre: string; bpm: number } {
  const lower = prompt.toLowerCase();
  const genre = GENRES.find(([key]) => lower.includes(key))?.[1] ?? 'Electronic';
  const bpm = lower.includes('slow') ? 90 : lower.includes('fast') || lower.includes('energetic') ? 128 : 110;
  return { genre, bpm };
}

export function detectMusicQuoteIntent(message: string): boolean {
  const lower = message.toLowerCase();
  if (/öffne|open|geh(e)? zu/.test(lower) && /\b(musik|music)\b/.test(lower)) {
    return false;
  }
  if (
    /\b(musik|hintergrundmusik|hintergrund-musik|song|jingle|bgm|soundtrack)\b/.test(lower)
  ) {
    return true;
  }
  if (/gaming[- ]?song/.test(lower)) return true;
  return false;
}

const WORD_DUR: Record<string, number> = {
  eins: 1,
  fünf: 5,
  funf: 5,
  zehn: 10,
  fünfzehn: 15,
  funfzehn: 15,
  zwanzig: 20,
  dreißig: 30,
  dreissig: 30,
};

export function sanitizeMusicUserRequest(message: string): string {
  let t = String(message ?? '');
  t = t.replace(/erzeuge?\s+exakt(?:e[nrs]?)?\s+(?:den\s+|das\s+)?song\s+.+$/i, 'im gleichen musikalischen Charakter');
  t = t.replace(/kopiere?\s+exakt\s+(?:künstler|artist|den stil von)\s+\S+/gi, 'ähnliche musikalische Eigenschaften');
  t = t.replace(/\bwie\s+(?:bei|von)\s+[A-ZÄÖÜ][\w.\-]{1,40}/g, 'mit ähnlicher Stimmung');
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return t.trim().slice(0, MAX_MUSIC_PROMPT_CHARS);
}

export function musicDownloadFilename(input: {
  creatorName: string;
  purpose?: string;
  version: number;
  ext?: string;
}): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'track';
  const version = Math.max(1, Math.floor(input.version) || 1);
  const ext = (input.ext || 'wav').replace(/^\./, '').replace(/[^a-z0-9]/gi, '') || 'wav';
  return `${slug(input.creatorName)}-${slug(input.purpose || 'music')}-music-v${version}.${ext}`;
}

export function parseMusicIntent(
  message: string,
  ctx?: { styleDirection?: string; dnaName?: string }
): MusicGenerationSettings {
  const original = sanitizeMusicUserRequest(message);
  const lower = original.toLowerCase();

  const durMatch = original.match(/(\d+)\s*(?:s|sek|sekunden)\b/i);
  const word = lower.match(
    /\b(eins|fünf|funf|zehn|fünfzehn|funfzehn|zwanzig|dreißig|dreissig)\s*(?:s|sek|sekunden)\b/
  );
  const duration = durMatch
    ? Number.parseInt(durMatch[1]!, 10)
    : word
      ? WORD_DUR[word[1]!.replace('ü', 'u').replace('ß', 'ss')] ?? WORD_DUR[word[1]!]
      : undefined;
  const assumedDuration = duration == null;

  let mood: string | undefined;
  if (/episch|\bepic\b/.test(lower)) mood = 'epic';
  else if (/energetisch|\benergetic\b|\benergy\b/.test(lower)) mood = 'energetic';
  else if (/\bdunkel\b|\bdark\b/.test(lower)) mood = 'dark';
  else if (/chill|lo-?fi|entspannt/.test(lower)) mood = 'chill';
  else if (/aggressiv|\baggressive\b|hardcore/.test(lower)) mood = 'aggressive';
  else if (/cinematic|filmisch|orchestral/.test(lower)) mood = 'cinematic';
  else if (/traurig|\bsad\b/.test(lower)) mood = 'sad';
  else if (/fröhlich|\bhappy\b|uplifting/.test(lower)) mood = 'happy';

  let purpose: MusicPurpose | undefined;
  if (/jingle/.test(lower)) purpose = 'jingle';
  else if (/stream[- ]?intro|intro/.test(lower) && !/outro|abspann/.test(lower)) purpose = 'stream-intro';
  else if (/stream[- ]?outro|outro|abspann/.test(lower)) purpose = 'stream-outro';
  else if (/short|tiktok|reel/.test(lower) && /musik|song|jingle|bgm/.test(lower)) purpose = 'short';
  else if (/youtube/.test(lower)) purpose = 'youtube';
  else if (/hintergrund|bgm|background/.test(lower)) purpose = 'background';
  else if (/\bstream\b/.test(lower)) purpose = 'stream';

  const vocalsRequested = /mit gesang|\bvocals?\b|\blyrics\b|\bgesang\b/.test(lower) && !/ohne gesang|ohne vocals?|no vocals?|instrumental/.test(lower);
  const instrumental = true;

  let theme: string | undefined;
  if (/\bgaming\b|\bgame\b|\besport/.test(lower)) theme = 'gaming';
  else if (/youtube/.test(lower)) theme = 'youtube';
  else if (ctx?.styleDirection) theme = ctx.styleDirection;

  const genre = GENRES.find(([key]) => lower.includes(key))?.[1];

  let energy: MusicEnergy = 'medium';
  if (/aggressiv|hardcore|schnell|energetisch|episch|\bepic\b|hoch/.test(lower)) energy = 'high';
  else if (/chill|langsam|ruhig|lo-?fi|entspannt/.test(lower)) energy = 'low';

  const titleMatch = original.match(/titel[:\s]+[„"]?([^"„”\n]+)[“"]?/i);
  const title = titleMatch?.[1]?.trim().slice(0, 80) || undefined;

  const missing: string[] = [];
  if (!purpose) missing.push('Einsatz');
  if (!mood && !genre) missing.push('Stil/Genre oder Stimmung');
  if (duration == null) missing.push('Dauer');

  let followUpQuestion: string | null = null;
  if (vocalsRequested) {
    followUpQuestion =
      'MusicGen erzeugt instrumental — kein Gesang. Ich plane einen Instrumental-Track.';
  } else if (missing.length === 3) {
    followUpQuestion = 'Wofür die Musik (Intro, Background, Stream), welcher Stil und welche Dauer (1–30 Sekunden)?';
  } else if (missing.length) {
    followUpQuestion = `Falls du magst: ${missing.join(', ')} — sonst starte ich mit sinnvollen Annahmen.`;
  }

  const durationSec = duration ?? musicGenMaxDurationSec();
  const prompt = buildMusicPrompt({
    duration: durationSec,
    mood,
    purpose,
    instrumental,
    theme,
    genre,
    energy,
    title,
    original,
    styleDirection: ctx?.styleDirection,
    dnaName: ctx?.dnaName,
  });
  const summary = buildMusicPreviewSummary({
    durationSec,
    mood,
    purpose,
    genre,
    energy,
    theme,
  });

  return {
    type: 'music',
    duration,
    assumedDuration,
    mood,
    purpose,
    instrumental,
    theme,
    genre,
    energy,
    title,
    prompt,
    summary,
    missing,
    followUpQuestion,
    vocalsRequested,
  };
}

export function musicNeedsFollowUp(message: string): boolean {
  if (!detectMusicQuoteIntent(message)) return false;
  const s = parseMusicIntent(message);
  return !s.purpose && !s.genre && !s.mood && s.duration == null;
}

export function buildMusicPrompt(input: {
  duration: number;
  mood?: string;
  purpose?: MusicPurpose;
  instrumental?: boolean;
  theme?: string;
  genre?: string;
  energy?: MusicEnergy;
  title?: string;
  original: string;
  styleDirection?: string;
  dnaName?: string;
}): string {
  const purposeLine: Record<MusicPurpose, string> = {
    'stream-intro': 'stream intro bed',
    'stream-outro': 'stream outro / end screen bed',
    stream: 'livestream background',
    youtube: 'YouTube video background',
    background: 'background music',
    jingle: 'short branded jingle',
    short: 'short-form / vertical clip bed',
  };
  const original = sanitizeMusicUserRequest(input.original);
  const energyLine =
    input.energy === 'high' ? 'high energy.' : input.energy === 'low' ? 'low energy, restrained.' : 'medium energy.';
  const parts = [
    'Instrumental, no vocals.',
    energyLine,
    `${input.duration} second ${input.mood ?? ''} ${input.genre ?? ''} ${input.theme ?? ''} ${input.purpose ? purposeLine[input.purpose] : 'music track'}`.replace(/\s+/g, ' ').trim(),
    input.styleDirection ? `Creator style: ${input.styleDirection}.` : null,
    input.dnaName ? `Brand: ${input.dnaName}.` : null,
    input.title ? `Title: ${input.title}.` : null,
    `User request: ${original}`,
  ].filter(Boolean);
  return parts.join(' ').slice(0, MAX_MUSIC_PROMPT_CHARS + 400);
}

export function buildMusicPreviewSummary(input: {
  durationSec: number;
  mood?: string;
  purpose?: MusicPurpose;
  genre?: string;
  energy?: MusicEnergy;
  theme?: string;
}): string {
  const purposeLabel = MUSIC_USE_CASES.find((u) => u.id === input.purpose)?.label;
  const energyLabel = MUSIC_ENERGY_OPTIONS.find((e) => e.id === input.energy)?.label ?? 'Mittel';
  const bits = [
    `${input.durationSec} Sekunden`,
    input.genre,
    input.mood,
    `${energyLabel} Energie`,
    'instrumental',
    purposeLabel ? `für ${purposeLabel}` : null,
    input.theme,
  ].filter(Boolean);
  return bits.join(', ');
}

export function defaultMusicConfig(): MusicConfig {
  const durationSec = musicGenMaxDurationSec();
  const energy: MusicEnergy = 'medium';
  const purpose: MusicPurpose = 'background';
  const prompt = buildMusicPrompt({
    duration: durationSec,
    purpose,
    instrumental: true,
    energy,
    original: 'Hintergrundmusik',
  });
  return {
    energy,
    durationSec,
    instrumental: true,
    purpose,
    prompt,
    summary: buildMusicPreviewSummary({ durationSec, energy, purpose }),
  };
}

export function settingsToMusicConfig(s: MusicGenerationSettings, durationSec: number): MusicConfig {
  const energy = s.energy ?? 'medium';
  return {
    genre: s.genre,
    mood: s.mood,
    energy,
    durationSec,
    instrumental: true,
    purpose: s.purpose,
    prompt: s.prompt,
    summary: s.summary ?? buildMusicPreviewSummary({ durationSec, mood: s.mood, purpose: s.purpose, genre: s.genre, energy, theme: s.theme }),
    title: s.title,
    theme: s.theme,
  };
}

export function applyMusicChangeRequest(config: MusicConfig, request: string): MusicConfig {
  const lower = request.toLowerCase();
  const next = { ...config };
  if (/schneller|energetisch/.test(lower)) next.energy = 'high';
  if (/härter|dunkler|aggressiv/.test(lower)) {
    next.mood = 'aggressive';
    next.energy = 'high';
  }
  if (/weniger bass/.test(lower)) {
    next.prompt = `${next.prompt} Less bass, tighter low end.`.slice(0, MAX_MUSIC_PROMPT_CHARS + 400);
  }
  if (/episch|epischer/.test(lower)) next.mood = 'epic';
  const onlyDur = lower.match(/nur\s+(\d+)\s*(s|sek)/);
  if (onlyDur) {
    const d = Number(onlyDur[1]);
    const check = checkMusicDuration(d, musicGenMaxDurationSec());
    if (check.ok) next.durationSec = d;
  }
  next.instrumental = true;
  next.prompt = buildMusicPrompt({
    duration: next.durationSec,
    mood: next.mood,
    purpose: next.purpose,
    instrumental: true,
    theme: next.theme,
    genre: next.genre,
    energy: next.energy,
    title: next.title,
    original: sanitizeMusicUserRequest(request),
  });
  next.summary = buildMusicPreviewSummary(next);
  return next;
}

export function musicStudioPath(plan: Partial<MusicConfig>): string {
  const params = new URLSearchParams();
  if (plan.purpose) params.set('purpose', plan.purpose);
  if (plan.genre) params.set('genre', plan.genre);
  if (plan.mood) params.set('mood', plan.mood);
  if (plan.energy) params.set('energy', plan.energy);
  if (plan.durationSec) params.set('duration', String(plan.durationSec));
  const q = params.toString();
  return q ? `/ai-music?${q}` : '/ai-music';
}

export function detectMusicChangeIntent(message: string): boolean {
  const lower = message.toLowerCase();
  return /härter|weniger bass|epischer|nur \d+\s*(s|sek)|neue variante|schneller|dunkler und härter|ohne gesang/.test(
    lower
  );
}
