/**
 * Browser TTS for Nexter chat replies. 0 coins. Never a paid provider.
 * Preference persistence: reuse existing nexterPreferences.voiceOutputEnabled
 * (authenticated PATCH of own user only). Missing field resolves to false.
 * No new collection and no production data migration. Spoken audio is not persisted.
 */

import type { NexterMicState } from './nexter-speech';

export const NEXTER_TTS_PREFERRED_LANG = 'de-DE';
export const NEXTER_TTS_CHUNK_MAX = 320;
export const NEXTER_TTS_ERROR_MESSAGE = 'Voice Output konnte nicht gestartet werden.';

export const NEXTER_TTS_STATES = ['idle', 'unsupported', 'speaking', 'stopped', 'error'] as const;
export type NexterTtsState = (typeof NEXTER_TTS_STATES)[number];

export const NEXTER_TTS_STATUS_LABEL: Record<NexterTtsState, string> = {
  idle: 'Bereit',
  unsupported: 'Nicht unterstützt',
  speaking: 'Spricht',
  stopped: 'Gestoppt',
  error: 'Nicht verfügbar',
};

export type NexterTtsCapability = {
  speechSynthesis: boolean;
  speechSynthesisUtterance: boolean;
};

export type NexterSpeechVoiceLike = {
  voiceURI: string;
  name: string;
  lang: string;
  default?: boolean;
};

export function isNexterTtsSupported(cap: NexterTtsCapability): boolean {
  return cap.speechSynthesis === true && cap.speechSynthesisUtterance === true;
}

export function nexterTtsStatusLabel(state: NexterTtsState): string {
  return NEXTER_TTS_STATUS_LABEL[state];
}

/** Fail-closed: missing / undefined / non-true → Voice Output OFF. */
export function isNexterVoiceOutputEnabled(value: unknown): boolean {
  return value === true;
}

export function utteranceLangForNexter(language?: string | null): string {
  if (language === 'en') return 'en-US';
  return NEXTER_TTS_PREFERRED_LANG;
}

export function pickNexterSpeechVoice(
  voices: NexterSpeechVoiceLike[],
  preferredLang = NEXTER_TTS_PREFERRED_LANG
): NexterSpeechVoiceLike | null {
  if (!Array.isArray(voices) || voices.length === 0) return null;
  const wanted = preferredLang.replace('_', '-');
  const exact = voices.find((v) => normalizeVoiceLang(v.lang) === wanted);
  if (exact) return exact;
  const prefix = wanted.slice(0, 2).toLowerCase();
  const prefixMatch = voices.find((v) => normalizeVoiceLang(v.lang).toLowerCase().startsWith(prefix));
  if (prefixMatch) return prefixMatch;
  return voices.find((v) => v.default === true) ?? null;
}

function normalizeVoiceLang(lang: string): string {
  return (lang || '').replace('_', '-');
}

/**
 * Spoken-only normalization. Visible chat markdown stays unchanged.
 * Code blocks and raw URLs are not read verbatim.
 */
export function normalizeNexterSpeechText(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) return '';
  let text = raw.replace(/\r\n/g, '\n');
  text = text.replace(/```[\s\S]*?```/g, ' Ich habe dir einen Codeblock erstellt. ');
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/!\[[^\]]*]\([^)]+\)/g, ' ');
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text.replace(/https?:\/\/[^\s)<]+/gi, ' ');
  text = text.replace(/\bwww\.[^\s)<]+/gi, ' ');
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/(\*\*|__)([\s\S]*?)\1/g, '$2');
  text = text.replace(/(\*|_)([^*_\n]+)\1/g, '$2');
  text = text.replace(/~~([\s\S]*?)~~/g, '$1');
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');
  text = text.replace(/[#*_~`>|]/g, ' ');
  try {
    text = text.replace(/\p{Extended_Pictographic}/gu, ' ');
  } catch {
    /* engines without Unicode property escapes keep emoji; still safe */
  }
  return text.replace(/\s+/g, ' ').trim();
}

export function chunkNexterSpeechText(text: string, max = NEXTER_TTS_CHUNK_MAX): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= max) return [trimmed];
  const parts: string[] = [];
  for (const para of trimmed.split(/\n+/)) {
    const block = para.trim();
    if (!block) continue;
    if (block.length <= max) {
      parts.push(block);
      continue;
    }
    const sentences = block.split(/(?<=[.!?])\s+/);
    let buf = '';
    for (const sentence of sentences) {
      const next = buf ? `${buf} ${sentence}` : sentence;
      if (next.length <= max) {
        buf = next;
        continue;
      }
      if (buf) parts.push(buf);
      if (sentence.length <= max) {
        buf = sentence;
        continue;
      }
      let rest = sentence;
      while (rest.length > max) {
        let cut = rest.lastIndexOf(' ', max);
        if (cut < 1) cut = max;
        parts.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      buf = rest;
    }
    if (buf) parts.push(buf);
  }
  return parts.filter(Boolean);
}

export function shouldAutoSpeakCompletedNexterReply(input: {
  voiceOutputEnabled: boolean;
  ttsSupported: boolean;
  micState: NexterMicState;
  replyComplete: boolean;
  isExistingSessionLoad: boolean;
}): boolean {
  if (!input.voiceOutputEnabled) return false;
  if (!input.ttsSupported) return false;
  if (!input.replyComplete) return false;
  if (input.isExistingSessionLoad) return false;
  if (input.micState === 'listening' || input.micState === 'requesting_permission' || input.micState === 'processing') {
    return false;
  }
  return true;
}

export type NexterTtsSpeakOptions = {
  language?: string | null;
  auto?: boolean;
};

export type NexterTtsSpeakUtteranceInput = {
  text: string;
  lang: string;
  voice: NexterSpeechVoiceLike | null;
  sessionId: number;
};

export function createNexterTtsController(deps: {
  getCapability: () => NexterTtsCapability;
  getVoices: () => NexterSpeechVoiceLike[];
  speakUtterance: (input: NexterTtsSpeakUtteranceInput) => Promise<void>;
  cancelEngine: () => void;
  isMicListening?: () => boolean;
  onState: (state: NexterTtsState) => void;
  onError?: (message: string) => void;
}) {
  let sessionId = 0;
  let state: NexterTtsState = 'idle';
  let disposed = false;
  let speakStarts = 0;

  function setState(next: NexterTtsState) {
    state = next;
    deps.onState(next);
  }

  function cancel() {
    sessionId += 1;
    try {
      deps.cancelEngine();
    } catch {
      /* cancel is best-effort */
    }
    if (!disposed && state === 'speaking') setState('stopped');
  }

  async function speak(raw: string, opts?: NexterTtsSpeakOptions) {
    if (disposed) return;
    if (opts?.auto && deps.isMicListening?.()) return;
    if (!isNexterTtsSupported(deps.getCapability())) {
      setState('unsupported');
      return;
    }
    const normalized = normalizeNexterSpeechText(raw);
    if (!normalized) return;
    cancel();
    const mySession = sessionId;
    const lang = utteranceLangForNexter(opts?.language);
    const voice = pickNexterSpeechVoice(deps.getVoices(), lang);
    const chunks = chunkNexterSpeechText(normalized);
    if (!chunks.length) return;
    speakStarts += 1;
    setState('speaking');
    for (const chunk of chunks) {
      if (disposed || sessionId !== mySession) return;
      try {
        await deps.speakUtterance({ text: chunk, lang, voice, sessionId: mySession });
      } catch {
        if (disposed || sessionId !== mySession) return;
        setState('error');
        deps.onError?.(NEXTER_TTS_ERROR_MESSAGE);
        return;
      }
    }
    if (!disposed && sessionId === mySession) setState('idle');
  }

  function dispose() {
    disposed = true;
    sessionId += 1;
    try {
      deps.cancelEngine();
    } catch {
      /* ignore */
    }
    state = 'idle';
  }

  return {
    speak,
    cancel,
    dispose,
    getState: () => state,
    getSessionId: () => sessionId,
    getSpeakStarts: () => speakStarts,
  };
}

export type NexterTtsController = ReturnType<typeof createNexterTtsController>;
