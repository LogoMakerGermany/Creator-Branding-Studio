import type { NexterSpeechVoiceLike, NexterTtsCapability } from '@ucbs/shared';

type TtsWindow = Window & {
  speechSynthesis?: SpeechSynthesis;
  SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance;
};

function ttsWindow(): TtsWindow {
  return window as TtsWindow;
}

export function readBrowserTtsCapability(): NexterTtsCapability {
  if (typeof window === 'undefined') {
    return { speechSynthesis: false, speechSynthesisUtterance: false };
  }
  const w = ttsWindow();
  return {
    speechSynthesis: 'speechSynthesis' in w && typeof w.speechSynthesis === 'object' && w.speechSynthesis !== null,
    speechSynthesisUtterance: 'SpeechSynthesisUtterance' in w && typeof w.SpeechSynthesisUtterance === 'function',
  };
}

export function readBrowserTtsVoices(): NexterSpeechVoiceLike[] {
  if (typeof window === 'undefined' || typeof window.speechSynthesis?.getVoices !== 'function') {
    return [];
  }
  return window.speechSynthesis.getVoices().map((voice) => ({
    voiceURI: voice.voiceURI,
    name: voice.name,
    lang: voice.lang,
    default: voice.default,
  }));
}

export function cancelBrowserTts(): void {
  if (typeof window === 'undefined' || typeof window.speechSynthesis?.cancel !== 'function') return;
  window.speechSynthesis.cancel();
}

export function subscribeBrowserTtsVoices(onChange: (voices: NexterSpeechVoiceLike[]) => void): () => void {
  if (typeof window === 'undefined' || typeof window.speechSynthesis?.getVoices !== 'function') {
    return () => undefined;
  }
  const synth = window.speechSynthesis;
  const emit = () => onChange(readBrowserTtsVoices());
  emit();
  if (typeof synth.addEventListener === 'function') {
    synth.addEventListener('voiceschanged', emit);
    return () => synth.removeEventListener('voiceschanged', emit);
  }
  const legacy = synth as SpeechSynthesis & { onvoiceschanged?: (() => void) | null };
  legacy.onvoiceschanged = emit;
  return () => {
    if (legacy.onvoiceschanged === emit) legacy.onvoiceschanged = null;
  };
}

export function speakBrowserUtterance(input: {
  text: string;
  lang: string;
  voice: NexterSpeechVoiceLike | null;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = ttsWindow();
    const synth = w.speechSynthesis;
    const Utterance = w.SpeechSynthesisUtterance;
    if (!synth || typeof Utterance !== 'function') {
      reject(new Error('unsupported'));
      return;
    }
    const utterance = new Utterance(input.text);
    utterance.lang = input.lang;
    if (input.voice) {
      const match = synth.getVoices().find((voice) => voice.voiceURI === input.voice?.voiceURI);
      if (match) utterance.voice = match;
    }
    utterance.onend = () => resolve();
    utterance.onerror = (event) => {
      const reason = 'error' in event ? String(event.error) : '';
      if (reason === 'interrupted' || reason === 'canceled') {
        resolve();
        return;
      }
      reject(new Error('tts-error'));
    };
    try {
      if (typeof synth.resume === 'function') synth.resume();
      synth.speak(utterance);
    } catch {
      reject(new Error('tts-error'));
    }
  });
}
