/** Browser speech-to-text for Nexter chat input. Transcripts are text only — never confirmation. */

export const NEXTER_SPEECH_LANG = 'de-DE';

export const NEXTER_MIC_STATES = [
  'idle',
  'unsupported',
  'requesting_permission',
  'listening',
  'processing',
  'result',
  'error',
] as const;

export type NexterMicState = (typeof NEXTER_MIC_STATES)[number];

export const NEXTER_SPEECH_ERROR_CODES = [
  'UNSUPPORTED_BROWSER',
  'PERMISSION_DENIED',
  'NO_MICROPHONE',
  'NO_SPEECH',
  'AUDIO_CAPTURE_ERROR',
  'NETWORK_ERROR',
  'RECOGNITION_ABORTED',
  'UNKNOWN_ERROR',
] as const;

export type NexterSpeechErrorCode = (typeof NEXTER_SPEECH_ERROR_CODES)[number];

export const NEXTER_SPEECH_ERROR_MESSAGE: Record<NexterSpeechErrorCode, string> = {
  UNSUPPORTED_BROWSER:
    'Dein Browser unterstützt die Spracheingabe hier nicht. Der Text-Chat funktioniert weiterhin.',
  PERMISSION_DENIED:
    'Der Mikrofonzugriff ist blockiert. Erlaube das Mikrofon für Nexter in deinen Browser-Einstellungen.',
  NO_MICROPHONE: 'Es wurde kein verfügbares Mikrofon gefunden.',
  NO_SPEECH: 'Ich habe nichts verstanden. Versuch es noch einmal.',
  AUDIO_CAPTURE_ERROR: 'Es wurde kein verfügbares Mikrofon gefunden.',
  NETWORK_ERROR: 'Die Spracherkennung ist momentan nicht erreichbar. Du kannst weiterhin schreiben.',
  RECOGNITION_ABORTED: '',
  UNKNOWN_ERROR: 'Spracheingabe ist gerade nicht möglich. Du kannst weiterhin schreiben.',
};

export function nexterSpeechErrorMessage(code: NexterSpeechErrorCode): string {
  return NEXTER_SPEECH_ERROR_MESSAGE[code];
}

export type NexterSpeechCapability = {
  secureContext: boolean;
  speechRecognition: boolean;
  webkitSpeechRecognition: boolean;
};

export function isNexterSpeechSupported(cap: NexterSpeechCapability): boolean {
  return cap.secureContext === true && (cap.speechRecognition === true || cap.webkitSpeechRecognition === true);
}

export function mapSpeechEngineError(error: string): NexterSpeechErrorCode {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'PERMISSION_DENIED';
    case 'no-speech':
      return 'NO_SPEECH';
    case 'audio-capture':
      return 'AUDIO_CAPTURE_ERROR';
    case 'network':
      return 'NETWORK_ERROR';
    case 'aborted':
      return 'RECOGNITION_ABORTED';
    default:
      return 'UNKNOWN_ERROR';
  }
}

export function mapGetUserMediaError(name: string): NexterSpeechErrorCode {
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'PERMISSION_DENIED';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'NO_MICROPHONE';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return 'AUDIO_CAPTURE_ERROR';
  }
  return 'UNKNOWN_ERROR';
}

export type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0?: { transcript?: string };
};

export type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((ev: { results: { length: number; [index: number]: SpeechRecognitionResultLike } }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export type NexterSpeechPermissionResult = 'granted' | 'denied' | 'no-device' | 'audio-capture' | 'skipped';

export function latestSpeechTranscript(results: {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
}): { text: string; isFinal: boolean } {
  const last = results[results.length - 1];
  const raw = last?.[0]?.transcript ?? '';
  return { text: last?.isFinal ? raw.trim() : raw, isFinal: Boolean(last?.isFinal) };
}

export function stopMediaStreamTracks(stream: { getTracks: () => Array<{ stop: () => void }> }): number {
  const tracks = stream.getTracks();
  for (const track of tracks) track.stop();
  return tracks.length;
}

export function createNexterSpeechController(deps: {
  getCapability: () => NexterSpeechCapability;
  createRecognition: () => SpeechRecognitionLike | null;
  requestMicPermission: () => Promise<NexterSpeechPermissionResult>;
  onState: (state: NexterMicState) => void;
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (code: NexterSpeechErrorCode) => void;
}) {
  let state: NexterMicState = 'idle';
  let recognition: SpeechRecognitionLike | null = null;
  let userStop = false;
  let disposed = false;
  let startInFlight = false;
  let recognitionStarts = 0;

  function setState(next: NexterMicState) {
    state = next;
    deps.onState(next);
  }

  function detachRecognition() {
    const rec = recognition;
    recognition = null;
    if (!rec) return rec;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    return rec;
  }

  function stopRecognition(abort = true) {
    const rec = detachRecognition();
    if (!rec) return;
    try {
      if (abort) rec.abort();
      else rec.stop();
    } catch {
      try {
        rec.stop();
      } catch {
        /* already stopped */
      }
    }
  }

  async function start() {
    if (disposed) return;
    if (state === 'listening') {
      userStop = true;
      stopRecognition(true);
      setState('idle');
      return;
    }
    if (state === 'requesting_permission' || startInFlight) return;
    if (!isNexterSpeechSupported(deps.getCapability())) {
      setState('unsupported');
      deps.onError('UNSUPPORTED_BROWSER');
      return;
    }

    startInFlight = true;
    userStop = false;
    setState('requesting_permission');
    try {
      const perm = await deps.requestMicPermission();
      if (disposed) return;
      if (perm === 'denied') {
        setState('error');
        deps.onError('PERMISSION_DENIED');
        return;
      }
      if (perm === 'no-device') {
        setState('error');
        deps.onError('NO_MICROPHONE');
        return;
      }
      if (perm === 'audio-capture') {
        setState('error');
        deps.onError('AUDIO_CAPTURE_ERROR');
        return;
      }

      const rec = deps.createRecognition();
      if (!rec) {
        setState('unsupported');
        deps.onError('UNSUPPORTED_BROWSER');
        return;
      }
      rec.lang = NEXTER_SPEECH_LANG;
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;
      rec.onresult = (ev) => {
        if (disposed) return;
        const { text, isFinal } = latestSpeechTranscript(ev.results);
        deps.onTranscript(text, isFinal);
        if (isFinal) setState('processing');
      };
      rec.onerror = (ev) => {
        if (disposed) return;
        const code = mapSpeechEngineError(ev.error);
        if (code === 'RECOGNITION_ABORTED' || userStop) {
          setState('idle');
          return;
        }
        setState('error');
        deps.onError(code);
      };
      rec.onend = () => {
        recognition = null;
        if (disposed || userStop) {
          if (!disposed) setState('idle');
          return;
        }
        if (state === 'processing') {
          setState('result');
          setState('idle');
          return;
        }
        if (state === 'listening' || state === 'error') {
          if (state === 'listening') setState('idle');
        }
      };
      recognition = rec;
      rec.start();
      recognitionStarts += 1;
      setState('listening');
    } catch (err) {
      const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
      const code = mapGetUserMediaError(name);
      setState('error');
      deps.onError(code);
    } finally {
      startInFlight = false;
    }
  }

  function stop() {
    userStop = true;
    stopRecognition(true);
    if (!disposed && state !== 'idle' && state !== 'unsupported') setState('idle');
  }

  function dispose() {
    disposed = true;
    userStop = true;
    stopRecognition(true);
    state = 'idle';
  }

  return {
    start,
    stop,
    dispose,
    getState: () => state,
    getRecognitionStarts: () => recognitionStarts,
  };
}

export type NexterSpeechController = ReturnType<typeof createNexterSpeechController>;
