import {
  mapGetUserMediaError,
  stopMediaStreamTracks,
  type NexterSpeechCapability,
  type NexterSpeechPermissionResult,
  type SpeechRecognitionLike,
} from '@ucbs/shared';

type BrowserSpeechCtor = new () => SpeechRecognitionLike;

function speechWindow(): Window & {
  SpeechRecognition?: BrowserSpeechCtor;
  webkitSpeechRecognition?: BrowserSpeechCtor;
} {
  return window as Window & {
    SpeechRecognition?: BrowserSpeechCtor;
    webkitSpeechRecognition?: BrowserSpeechCtor;
  };
}

export function readBrowserSpeechCapability(): NexterSpeechCapability {
  if (typeof window === 'undefined') {
    return { secureContext: false, speechRecognition: false, webkitSpeechRecognition: false };
  }
  const w = speechWindow();
  return {
    secureContext: window.isSecureContext === true,
    speechRecognition: typeof w.SpeechRecognition === 'function',
    webkitSpeechRecognition: typeof w.webkitSpeechRecognition === 'function',
  };
}

export function createBrowserRecognition(): SpeechRecognitionLike | null {
  if (typeof window === 'undefined') return null;
  const w = speechWindow();
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (typeof Ctor !== 'function') return null;
  return new Ctor() as SpeechRecognitionLike;
}

export async function requestBrowserMicPermission(): Promise<NexterSpeechPermissionResult> {
  if (typeof navigator === 'undefined' || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
    return 'skipped';
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stopMediaStreamTracks(stream);
    return 'granted';
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    const code = mapGetUserMediaError(name);
    if (code === 'PERMISSION_DENIED') return 'denied';
    if (code === 'NO_MICROPHONE') return 'no-device';
    return 'audio-capture';
  }
}
