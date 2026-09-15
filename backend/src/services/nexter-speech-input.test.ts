import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COIN_COSTS,
  CoinSpendCategory,
  NEXTER_SPEECH_LANG,
  createNexterSpeechController,
  isNexterSpeechSupported,
  mapSpeechEngineError,
  nexterSpeechErrorMessage,
  stopMediaStreamTracks,
  type NexterMicState,
  type NexterSpeechErrorCode,
  type SpeechRecognitionLike,
} from '@ucbs/shared';
import { arePaymentsEnabled, getDefaultFreeCoins, isOpenAiImageGenerationLiveEnabled } from '../config/env.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';

process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '../../..');

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

class FakeRecognition implements SpeechRecognitionLike {
  lang = '';
  interimResults = false;
  continuous = true;
  maxAlternatives = 0;
  onresult: SpeechRecognitionLike['onresult'] = null;
  onerror: SpeechRecognitionLike['onerror'] = null;
  onend: SpeechRecognitionLike['onend'] = null;
  started = 0;
  aborted = 0;
  start() {
    this.started += 1;
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.aborted += 1;
    this.onend?.();
  }
  emitResult(text: string, isFinal: boolean) {
    this.onresult?.({ results: { 0: { isFinal, 0: { transcript: text } }, length: 1 } });
  }
  emitError(error: string) {
    this.onerror?.({ error });
    this.onend?.();
  }
}

function harness(opts?: {
  cap?: { secureContext: boolean; speechRecognition: boolean; webkitSpeechRecognition: boolean };
  permission?: () => Promise<'granted' | 'denied' | 'no-device' | 'audio-capture' | 'skipped'>;
}) {
  const states: NexterMicState[] = [];
  const transcripts: Array<{ text: string; isFinal: boolean }> = [];
  const errors: NexterSpeechErrorCode[] = [];
  const recs: FakeRecognition[] = [];
  let permCalls = 0;
  const controller = createNexterSpeechController({
    getCapability: () =>
      opts?.cap ?? { secureContext: true, speechRecognition: true, webkitSpeechRecognition: false },
    createRecognition: () => {
      const rec = new FakeRecognition();
      recs.push(rec);
      return rec;
    },
    requestMicPermission: async () => {
      permCalls += 1;
      return opts?.permission ? opts.permission() : 'granted';
    },
    onState: (s) => states.push(s),
    onTranscript: (text, isFinal) => transcripts.push({ text, isFinal }),
    onError: (code) => errors.push(code),
  });
  return { controller, states, transcripts, errors, recs, get permCalls() { return permCalls; } };
}

describe('nexter speech input — capability', () => {
  it('1. SpeechRecognition present is supported', () => {
    assert.equal(
      isNexterSpeechSupported({ secureContext: true, speechRecognition: true, webkitSpeechRecognition: false }),
      true
    );
  });

  it('2. webkitSpeechRecognition present is supported', () => {
    assert.equal(
      isNexterSpeechSupported({ secureContext: true, speechRecognition: false, webkitSpeechRecognition: true }),
      true
    );
  });

  it('3. both missing is unsupported; text chat stays in the panel', () => {
    assert.equal(
      isNexterSpeechSupported({ secureContext: true, speechRecognition: false, webkitSpeechRecognition: false }),
      false
    );
    assert.equal(
      isNexterSpeechSupported({ secureContext: false, speechRecognition: true, webkitSpeechRecognition: true }),
      false
    );
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    assert.match(panel, /aria-label="Nachricht an Nexter"/);
    assert.match(panel, /aria-label="Senden"/);
    const { controller, errors } = harness({
      cap: { secureContext: true, speechRecognition: false, webkitSpeechRecognition: false },
    });
    void controller.start();
    assert.equal(errors[0], 'UNSUPPORTED_BROWSER');
    assert.match(nexterSpeechErrorMessage('UNSUPPORTED_BROWSER'), /Text-Chat funktioniert weiterhin/);
  });
});

describe('nexter speech input — permission and listening', () => {
  it('4. permission is requested only after the user starts listening', async () => {
    const h = harness();
    assert.equal(h.permCalls, 0);
    await h.controller.start();
    assert.equal(h.permCalls, 1);
    assert.equal(h.recs[0]?.lang, NEXTER_SPEECH_LANG);
    assert.equal(h.recs[0]?.interimResults, true);
    assert.equal(h.recs[0]?.continuous, false);
    assert.equal(h.recs[0]?.maxAlternatives, 1);
  });

  it('5. permission granted starts listening', async () => {
    const h = harness();
    await h.controller.start();
    assert.equal(h.controller.getState(), 'listening');
    assert.equal(h.states.includes('requesting_permission'), true);
    assert.equal(h.recs[0]?.started, 1);
  });

  it('6. permission denied shows a distinct error and does not start recognition', async () => {
    const h = harness({ permission: async () => 'denied' });
    await h.controller.start();
    assert.equal(h.errors[0], 'PERMISSION_DENIED');
    assert.match(nexterSpeechErrorMessage('PERMISSION_DENIED'), /blockiert/);
    assert.equal(h.recs.length, 0);
    assert.match(repo('frontend/src/components/nexter/NexterPanel.tsx'), /aria-label="Nachricht an Nexter"/);
  });
});

describe('nexter speech input — transcript stays in the input', () => {
  it('7. Wie geht es dir? fills transcript and is not auto-sent', async () => {
    const h = harness();
    await h.controller.start();
    h.recs[0]?.emitResult('Wie geht es dir?', true);
    assert.equal(h.transcripts.at(-1)?.text, 'Wie geht es dir?');
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    assert.match(panel, /onTranscript: \(text\) => \{/);
    assert.match(panel, /setInput\(text\)/);
    assert.doesNotMatch(panel, /void send\(transcript\)/);
    assert.doesNotMatch(panel, /api\.nexter\.listen/);
  });

  it('8. Mach mir ein Logo stays in the input without quote or debit', async () => {
    const h = harness();
    await h.controller.start();
    h.recs[0]?.emitResult('Mach mir ein Logo', true);
    assert.equal(h.transcripts.at(-1)?.text, 'Mach mir ein Logo');
    const speech = repo('shared/src/nexter-speech.ts');
    assert.doesNotMatch(speech, /createQuote|confirmQuote|deductAmount|start_generation/);
    assert.equal(getDefaultFreeCoins(), 50);
    assert.equal(COIN_COSTS[CoinSpendCategory.LOGO_GENERATION], 15);
  });

  it('9. Öffne das Logo Studio does not navigate from speech', async () => {
    const h = harness();
    await h.controller.start();
    h.recs[0]?.emitResult('Öffne das Logo Studio', true);
    assert.equal(h.transcripts.at(-1)?.text, 'Öffne das Logo Studio');
    const speech = repo('shared/src/nexter-speech.ts');
    const browser = repo('frontend/src/lib/nexter-speech.ts');
    assert.doesNotMatch(speech, /navigate\(|open_studio|confirmQuote/);
    assert.doesNotMatch(browser, /navigate\(|confirmQuote|api\.nexter/);
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    const toggle = panel.split('async function toggleListen')[1]?.split('function closeQuote')[0] ?? '';
    assert.doesNotMatch(toggle, /send\(|navigate\(|confirmQuote/);
  });
});

describe('nexter speech input — errors and lifecycle', () => {
  it('10. no-speech is a distinct recoverable error', async () => {
    const h = harness();
    await h.controller.start();
    h.recs[0]?.emitError('no-speech');
    assert.equal(h.errors[0], 'NO_SPEECH');
    assert.match(nexterSpeechErrorMessage('NO_SPEECH'), /nichts verstanden/);
    await h.controller.start();
    assert.equal(h.controller.getState(), 'listening');
  });

  it('11. audio-capture is a distinct error', () => {
    assert.equal(mapSpeechEngineError('audio-capture'), 'AUDIO_CAPTURE_ERROR');
    assert.match(nexterSpeechErrorMessage('AUDIO_CAPTURE_ERROR'), /kein verfügbares Mikrofon/);
  });

  it('12. network is a distinct error', () => {
    assert.equal(mapSpeechEngineError('network'), 'NETWORK_ERROR');
    assert.match(nexterSpeechErrorMessage('NETWORK_ERROR'), /nicht erreichbar/);
  });

  it('13. aborted returns to idle without an error banner', async () => {
    const h = harness();
    await h.controller.start();
    h.recs[0]?.emitError('aborted');
    assert.equal(h.controller.getState(), 'idle');
    assert.equal(h.errors.length, 0);
    assert.equal(nexterSpeechErrorMessage('RECOGNITION_ABORTED'), '');
  });

  it('14. a second mic click while listening does not start a parallel session', async () => {
    const h = harness();
    await h.controller.start();
    assert.equal(h.controller.getRecognitionStarts(), 1);
    await h.controller.start();
    assert.equal(h.controller.getState(), 'idle');
    assert.equal(h.controller.getRecognitionStarts(), 1);
    assert.equal(h.recs.length, 1);
  });

  it('15. dispose aborts recognition and ignores later results', async () => {
    const h = harness();
    await h.controller.start();
    const rec = h.recs[0]!;
    h.controller.dispose();
    rec.emitResult('should not land', true);
    assert.equal(h.transcripts.length, 0);
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    assert.match(panel, /controller\.dispose\(\)/);
  });

  it('16. permission-test MediaStream tracks are closed', () => {
    let stopped = 0;
    const n = stopMediaStreamTracks({
      getTracks: () => [{ stop: () => { stopped += 1; } }, { stop: () => { stopped += 1; } }],
    });
    assert.equal(n, 2);
    assert.equal(stopped, 2);
    assert.match(repo('frontend/src/lib/nexter-speech.ts'), /stopMediaStreamTracks\(stream\)/);
  });

  it('17-19. speech input costs 0 coins and cannot confirm or generate', () => {
    const speech = repo('shared/src/nexter-speech.ts');
    const browser = repo('frontend/src/lib/nexter-speech.ts');
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    assert.doesNotMatch(speech, /COIN_COSTS|deductAmount|confirmQuote|whisper|elevenlabs|openai/i);
    assert.doesNotMatch(browser, /confirmQuote|start_generation|deductAmount|api\.nexter\.listen/);
    assert.doesNotMatch(panel, /api\.nexter\.listen/);
    assert.doesNotMatch(panel, /Mikrofon nicht verfügbar — der Text-Chat funktioniert weiter/);
    assert.equal(arePaymentsEnabled(), false);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(isOpenAiImageGenerationLiveEnabled(), false);
  });
});

describe('nexter speech input — wiring freeze', () => {
  it('uses browser SpeechRecognition, de-DE, existing orb listening state, and keeps text chat', () => {
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    const shared = repo('shared/src/nexter-speech.ts');
    assert.match(panel, /createNexterSpeechController/);
    assert.match(panel, /toggleListen/);
    assert.match(panel, /recording \? 'listening'/);
    assert.match(panel, /setOrbState\('listening'\)/);
    assert.match(shared, /de-DE/);
    assert.equal(NEXTER_SPEECH_LANG, 'de-DE');
    assert.match(repo('backend/src/config/csp.ts'), /mediastream:/);
    assert.match(repo('backend/src/config/csp.ts'), /https:\/\/www\.google\.com/);
    assert.match(repo('backend/src/index.ts'), /microphone=\(self\)/);
    assert.match(repo('backend/src/services/nexter/listen.service.ts'), /AI_NOT_CONFIGURED/);
  });
});
