import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COIN_COSTS,
  CoinSpendCategory,
  STREAMSET_PACK_COIN_COST,
  STREAMSET_THREE_PART_COIN_COST,
  chunkNexterSpeechText,
  createNexterSpeechController,
  createNexterTtsController,
  defaultNexterPreferences,
  isNexterTtsSupported,
  isNexterVoiceOutputEnabled,
  normalizeNexterSpeechText,
  pickNexterSpeechVoice,
  resolveNexterPreferences,
  shouldAutoSpeakCompletedNexterReply,
  utteranceLangForNexter,
  type NexterSpeechVoiceLike,
  type NexterTtsState,
  type SpeechRecognitionLike,
} from '@ucbs/shared';
import {
  arePaymentsEnabled,
  getDefaultFreeCoins,
  isElevenLabsTtsLiveEnabled,
  isOpenAiImageGenerationLiveEnabled,
  isTtsGenerationEnabled,
} from '../config/env.js';
import { generateSpeech, isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { ServiceError } from '../lib/errors.js';
import { getOrCreateUser } from './user.service.js';
import { getCoinBalance } from './coins.service.js';
import { speakNexterReply } from './voice.service.js';
import { updateNexterPreferencesForUser } from './nexter/preferences.service.js';
import { resolveNexterConversationIntent } from './nexter/conversation-intent.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '../../..');

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

function src(rel: string): string {
  return readFileSync(join(dir, '..', rel), 'utf8');
}

async function withEnv<T>(patch: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> {
  const keys = Object.keys(patch);
  const prev: Record<string, string | undefined> = {};
  for (const key of keys) {
    prev[key] = process.env[key];
    const value = patch[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

function ttsHarness(opts?: {
  cap?: { speechSynthesis: boolean; speechSynthesisUtterance: boolean };
  voices?: NexterSpeechVoiceLike[];
  micListening?: boolean;
  hold?: boolean;
}) {
  const states: NexterTtsState[] = [];
  const spoken: string[] = [];
  const errors: string[] = [];
  const pending: Array<() => void> = [];
  let cancelled = 0;
  const controller = createNexterTtsController({
    getCapability: () => opts?.cap ?? { speechSynthesis: true, speechSynthesisUtterance: true },
    getVoices: () => opts?.voices ?? [],
    cancelEngine: () => {
      cancelled += 1;
      while (pending.length) pending.pop()?.();
    },
    speakUtterance: async ({ text }) => {
      spoken.push(text);
      if (opts?.hold) {
        await new Promise<void>((resolve) => pending.push(resolve));
      }
    },
    isMicListening: () => opts?.micListening === true,
    onState: (next) => states.push(next),
    onError: (message) => errors.push(message),
  });
  return { controller, states, spoken, errors, get cancelled() { return cancelled; }, pending };
}

class FakeRecognition implements SpeechRecognitionLike {
  lang = '';
  interimResults = false;
  continuous = true;
  maxAlternatives = 0;
  onresult: SpeechRecognitionLike['onresult'] = null;
  onerror: SpeechRecognitionLike['onerror'] = null;
  onend: SpeechRecognitionLike['onend'] = null;
  start() {}
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
}

describe('Block K — voice output default and no surprise audio', () => {
  it('1. Voice Output default is OFF', () => {
    assert.equal(defaultNexterPreferences().voiceOutputEnabled, false);
    assert.equal(isNexterVoiceOutputEnabled(undefined), false);
    assert.equal(isNexterVoiceOutputEnabled(null), false);
    assert.equal(resolveNexterPreferences({ language: 'de' }).voiceOutputEnabled, false);
    assert.equal(resolveNexterPreferences({ voiceOutputEnabled: true }).voiceOutputEnabled, true);
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    assert.match(panel, /useState\(false\)/);
    assert.match(panel, /isNexterVoiceOutputEnabled/);
    const fields = repo('frontend/src/components/nexter/NexterPersonalizationFields.tsx');
    assert.match(fields, /voiceOutputEnabled: false/);
    assert.match(fields, /prefs\.voiceOutputEnabled === true/);
  });

  it('2-3. session load and existing chat do not auto-speak', () => {
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    const load = panel.split('api.nexter')[1]?.split('useEffect(() => {')[0] ?? '';
    assert.match(panel, /getSession\(\)/);
    assert.doesNotMatch(load, /speakAssistantMessage|ttsRef\.current\?\.speak/);
    assert.equal(
      shouldAutoSpeakCompletedNexterReply({
        voiceOutputEnabled: true,
        ttsSupported: true,
        micState: 'idle',
        replyComplete: true,
        isExistingSessionLoad: true,
      }),
      false
    );
  });

  it('4. enabling Voice Output is an explicit preference change', async () => {
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@tts-pref.test`, 'Voice');
    assert.equal(user.nexterPreferences.voiceOutputEnabled, false);
    const saved = await updateNexterPreferencesForUser(user.id, { voiceOutputEnabled: true });
    assert.equal(saved.nexterPreferences.voiceOutputEnabled, true);
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    assert.match(panel, /updateNexterPreferences\(\{ voiceOutputEnabled: next \}\)/);
  });
});

describe('Block K — speak once, no stream tokens, stop, races', () => {
  it('5. completed reply auto-speaks once after opt-in', async () => {
    assert.equal(
      shouldAutoSpeakCompletedNexterReply({
        voiceOutputEnabled: true,
        ttsSupported: true,
        micState: 'idle',
        replyComplete: true,
        isExistingSessionLoad: false,
      }),
      true
    );
    const h = ttsHarness();
    await h.controller.speak('Hallo Creator, ich bin Nexter.');
    assert.equal(h.spoken.length, 1);
    assert.equal(h.controller.getSpeakStarts(), 1);
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    assert.match(panel, /speakAssistantMessage\(last, \{ auto: true \}\)/);
  });

  it('6. partial / streaming tokens are not spoken', () => {
    assert.equal(
      shouldAutoSpeakCompletedNexterReply({
        voiceOutputEnabled: true,
        ttsSupported: true,
        micState: 'idle',
        replyComplete: false,
        isExistingSessionLoad: false,
      }),
      false
    );
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    assert.doesNotMatch(panel, /onToken|streamDelta|partialContent/);
    const conv = src('services/nexter/conversation.service.ts');
    assert.doesNotMatch(conv, /text\/event-stream|onToken/);
  });

  it('7. manual speaker reads the selected message once', async () => {
    const h = ttsHarness();
    await h.controller.speak('Nur diese Antwort.');
    assert.deepEqual(h.spoken, ['Nur diese Antwort.']);
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    assert.match(panel, /aria-label=\{\s*speakingMessageId === m\.id/);
    assert.match(panel, /Antwort vorlesen/);
    assert.match(panel, /function speakLast/);
  });

  it('8. rapid double speak cancels then starts exactly one new session', async () => {
    const h = ttsHarness({ hold: true });
    const first = h.controller.speak('Erste lange Antwort die noch läuft.');
    const second = h.controller.speak('Zweite vollständige Antwort.');
    while (h.pending.length) h.pending.pop()?.();
    await Promise.allSettled([first, second]);
    assert.ok(h.cancelled >= 1);
    assert.equal(h.spoken.at(-1), 'Zweite vollständige Antwort.');
    assert.equal(h.spoken.filter((t) => t === 'Zweite vollständige Antwort.').length, 1);
  });

  it('9. stop calls cancel', () => {
    const h = ttsHarness({ hold: true });
    void h.controller.speak('Bitte stoppen.');
    h.controller.cancel();
    assert.ok(h.cancelled >= 1);
    assert.equal(h.controller.getState(), 'stopped');
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    assert.match(panel, /function stopSpeech/);
    assert.match(panel, /ttsRef\.current\?\.cancel\(\)/);
    assert.match(panel, /Vorlesen stoppen/);
  });

  it('10. a new spoken response cancels the previous voice', async () => {
    const h = ttsHarness({ hold: true });
    void h.controller.speak('Alte Stimme.');
    const oldSession = h.controller.getSessionId();
    void h.controller.speak('Neue vollständige Antwort.');
    assert.notEqual(h.controller.getSessionId(), oldSession);
    while (h.pending.length) h.pending.pop()?.();
    await new Promise((r) => setImmediate(r));
    assert.equal(h.spoken.at(-1), 'Neue vollständige Antwort.');
  });

  it('11-12. unmount and navigation cancel speech', () => {
    const h = ttsHarness({ hold: true });
    void h.controller.speak('Läuft noch.');
    h.controller.dispose();
    assert.ok(h.cancelled >= 1);
    const later = h.controller.getSessionId();
    void h.controller.speak('darf nicht starten nach dispose');
    assert.equal(h.controller.getSessionId(), later);
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    assert.match(panel, /controller\.dispose\(\)/);
    assert.match(panel, /\[location\.pathname\]/);
    assert.match(panel, /ttsRef\.current\?\.cancel\(\)/);
  });
});

describe('Block K — feature detection, voices, voiceschanged', () => {
  it('13-14. missing speechSynthesis or SpeechSynthesisUtterance is a safe fallback', async () => {
    assert.equal(isNexterTtsSupported({ speechSynthesis: false, speechSynthesisUtterance: true }), false);
    assert.equal(isNexterTtsSupported({ speechSynthesis: true, speechSynthesisUtterance: false }), false);
    assert.equal(isNexterTtsSupported({ speechSynthesis: true, speechSynthesisUtterance: true }), true);
    const h = ttsHarness({ cap: { speechSynthesis: false, speechSynthesisUtterance: false } });
    await h.controller.speak('Hallo');
    assert.equal(h.spoken.length, 0);
    assert.equal(h.controller.getState(), 'unsupported');
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    assert.match(panel, /Sprachausgabe nicht verfügbar/);
    assert.match(panel, /aria-label="Nachricht an Nexter"/);
  });

  it('15-18. empty voices, de-DE, de, then browser default', () => {
    assert.equal(pickNexterSpeechVoice([], 'de-DE'), null);
    const deDe = { voiceURI: 'de-DE', name: 'Anna', lang: 'de-DE' };
    const de = { voiceURI: 'de', name: 'Stefan', lang: 'de' };
    const en = { voiceURI: 'en', name: 'Sam', lang: 'en-US', default: true };
    assert.equal(pickNexterSpeechVoice([en, deDe, de], 'de-DE')?.voiceURI, 'de-DE');
    assert.equal(pickNexterSpeechVoice([en, de], 'de-DE')?.voiceURI, 'de');
    assert.equal(pickNexterSpeechVoice([en], 'de-DE')?.voiceURI, 'en');
    assert.equal(utteranceLangForNexter('de'), 'de-DE');
    assert.equal(utteranceLangForNexter('en'), 'en-US');
  });

  it('19. voiceschanged refreshes without a loop', () => {
    const browser = repo('frontend/src/lib/nexter-tts.ts');
    assert.match(browser, /addEventListener\('voiceschanged'/);
    assert.match(browser, /removeEventListener\('voiceschanged'/);
    assert.doesNotMatch(browser, /while\s*\(true\)/);
    assert.doesNotMatch(browser, /setInterval/);
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    assert.match(panel, /subscribeBrowserTtsVoices/);
  });
});

describe('Block K — speech text normalization', () => {
  it('20-24. markdown, URLs, code, HTML are stripped from spoken text only', () => {
    assert.equal(normalizeNexterSpeechText('**Hallo**'), 'Hallo');
    assert.equal(normalizeNexterSpeechText('[Google](https://google.com/search?q=nexter)'), 'Google');
    assert.doesNotMatch(
      normalizeNexterSpeechText('Siehe https://example.com/very/long/path?token=abc-secret-1'),
      /token=abc|example\.com\/very/
    );
    assert.match(normalizeNexterSpeechText('Hier:\n```js\nconst x = 1;\n```\nFertig.'), /Codeblock erstellt/);
    assert.doesNotMatch(normalizeNexterSpeechText('```js\nconst secret = 1;\n```'), /const secret/);
    assert.equal(normalizeNexterSpeechText('<p>Hallo <b>Welt</b></p>'), 'Hallo Welt');
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    assert.doesNotMatch(panel, /normalizeNexterSpeechText\(m\.content\)/);
    assert.match(panel, /\{m\.content\}/);
  });

  it('25-26. emoji is safe and empty speech creates no utterance', async () => {
    const spoken = normalizeNexterSpeechText('Hallo 🙂 Welt');
    assert.match(spoken, /Hallo/);
    assert.match(spoken, /Welt/);
    assert.equal(normalizeNexterSpeechText('```\ncode\n```'), 'Ich habe dir einen Codeblock erstellt.');
    const h = ttsHarness();
    await h.controller.speak('https://example.com/secret?token=1');
    assert.equal(h.spoken.length, 0);
    await h.controller.speak('   ');
    assert.equal(h.spoken.length, 0);
  });

  it('chunks long replies sequentially without word-for-word queues', () => {
    const long = `${'Nexter hilft Creatorn. '.repeat(40)}Ende.`;
    const chunks = chunkNexterSpeechText(long, 80);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((c) => c.length <= 80 || !c.includes(' ')));
    assert.ok(chunks[0]!.split(' ').length > 1);
  });
});

describe('Block K — privacy, coins, provider isolation', () => {
  it('27. TTS errors keep the chat visible', async () => {
    const controller = createNexterTtsController({
      getCapability: () => ({ speechSynthesis: true, speechSynthesisUtterance: true }),
      getVoices: () => [],
      cancelEngine: () => undefined,
      speakUtterance: async () => {
        throw new Error('boom');
      },
      onState: () => undefined,
      onError: (message) => {
        assert.match(message, /Voice Output konnte nicht gestartet werden/);
      },
    });
    await controller.speak('Hallo Nexter');
    assert.equal(controller.getState(), 'error');
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    assert.match(panel, /Voice Output konnte nicht gestartet werden/);
    assert.doesNotMatch(panel, /FirebaseError|DOMException|xi-api-key/);
  });

  it('28-33. browser TTS has no Firestore, Storage, coins, quote, provider, or payment calls', () => {
    const shared = repo('shared/src/nexter-tts.ts');
    const browser = repo('frontend/src/lib/nexter-tts.ts');
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    for (const file of [shared, browser]) {
      assert.doesNotMatch(file, /dsSet\(|saveUserFile\(|getStorage\(|xi-api-key|deductAmount\(|confirmQuote\(|api\.elevenlabs|stripe|paypal/i);
    }
    assert.doesNotMatch(panel, /api\.nexter\.speak/);
    assert.doesNotMatch(panel, /new Audio\(/);
    assert.doesNotMatch(panel, /NEXTER_VOICE/);
    assert.doesNotMatch(panel, /createQuote|deductAmount/);
    const sendFn = panel.split('async function send')[1]?.split('sendRef.current = send')[0] ?? '';
    assert.doesNotMatch(sendFn, /confirmQuote|deductAmount/);
  });
});

describe('Block K — microphone interaction and existing mic rules', () => {
  it('34. starting the microphone cancels TTS', () => {
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    const toggle = panel.split('async function toggleListen')[1]?.split('function closeQuote')[0] ?? '';
    assert.match(toggle, /ttsRef\.current\?\.cancel\(\)/);
    assert.match(toggle, /speechRef\.current\?\.start\(\)/);
    assert.doesNotMatch(toggle, /send\(|navigate\(|confirmQuote/);
  });

  it('35. auto TTS does not start while the microphone is active', () => {
    assert.equal(
      shouldAutoSpeakCompletedNexterReply({
        voiceOutputEnabled: true,
        ttsSupported: true,
        micState: 'listening',
        replyComplete: true,
        isExistingSessionLoad: false,
      }),
      false
    );
    const h = ttsHarness({ micListening: true });
    void h.controller.speak('sollte warten', { auto: true });
    assert.equal(h.spoken.length, 0);
  });

  it('36. microphone transcript still does not auto-send', async () => {
    const transcripts: string[] = [];
    const controller = createNexterSpeechController({
      getCapability: () => ({ secureContext: true, speechRecognition: true, webkitSpeechRecognition: false }),
      createRecognition: () => new FakeRecognition(),
      requestMicPermission: async () => 'granted',
      onState: () => undefined,
      onTranscript: (text) => transcripts.push(text),
      onError: () => undefined,
    });
    await controller.start();
    assert.equal(transcripts.length, 0);
    const speech = repo('shared/src/nexter-speech.ts');
    assert.doesNotMatch(speech, /send\(|confirmQuote|navigate\(/);
  });
});

describe('Block K — quote, navigation, and intelligence safety', () => {
  it('37-39. TTS cannot confirm quotes, generate, or navigate', () => {
    const tts = repo('shared/src/nexter-tts.ts');
    const browser = repo('frontend/src/lib/nexter-tts.ts');
    assert.doesNotMatch(tts, /confirmQuote|start_generation|deductAmount|navigate\(/);
    assert.doesNotMatch(browser, /confirmQuote|start_generation|api\.nexter|navigate\(/);
    const spokenPrice = resolveNexterConversationIntent('Das Logo kostet 15 Coins');
    assert.equal(typeof spokenPrice.intent, 'string');
    assert.doesNotMatch(tts, /resolveNexterConversationIntent/);
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    const speakFn = panel.split('function speakAssistantMessage')[1]?.split('function speakLast')[0] ?? '';
    assert.doesNotMatch(speakFn, /confirmQuote|navigate\(|api\.nexter\.chat/);
  });
});

describe('Block K — ElevenLabs fail-closed gate', () => {
  it('40-42. API key alone cannot enable provider TTS; disabled means zero provider calls', async () => {
    await withEnv(
      { TTS_GENERATION_ENABLED: undefined, ELEVENLABS_API_KEY: 'sk_test_not_a_real_elevenlabs_key', GENERATIONS_ENABLED: 'true' },
      () => {
        assert.equal(isTtsGenerationEnabled(), false);
        assert.equal(isElevenLabsTtsLiveEnabled(), false);
      }
    );
    await withEnv(
      { TTS_GENERATION_ENABLED: 'true', ELEVENLABS_API_KEY: undefined, GENERATIONS_ENABLED: 'true' },
      () => {
        assert.equal(isTtsGenerationEnabled(), true);
        assert.equal(isElevenLabsTtsLiveEnabled(), false);
      }
    );
    await withEnv(
      { TTS_GENERATION_ENABLED: 'yes', ELEVENLABS_API_KEY: 'sk_test_not_a_real_elevenlabs_key', GENERATIONS_ENABLED: 'true' },
      () => {
        assert.equal(isTtsGenerationEnabled(), false);
      }
    );
    const providers = src('lib/media-providers.ts');
    const gateIdx = providers.indexOf('isTtsGenerationEnabled()');
    const fetchIdx = providers.indexOf('https://api.elevenlabs.io/v1/text-to-speech');
    assert.ok(gateIdx > 0 && fetchIdx > gateIdx);
    await assert.rejects(
      () => generateSpeech('Hallo'),
      (err: unknown) => err instanceof ServiceError && err.code === 'AI_NOT_CONFIGURED'
    );
  });

  it('43. provider TTS unavailable charges 0 coins', async () => {
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@tts-debit.test`, 'Debit');
    const before = await getCoinBalance(user.id);
    await updateNexterPreferencesForUser(user.id, { voiceOutputEnabled: true });
    await assert.rejects(
      () => speakNexterReply(user.id, 'Hallo Nexter, bitte vorlesen.'),
      (err: unknown) => err instanceof ServiceError && err.code === 'TTS_GENERATION_DISABLED'
    );
    assert.equal(await getCoinBalance(user.id), before);
  });

  it('44-45. existing provider TTS still uses quote/charge/refund and Block G file ownership', () => {
    const voice = src('services/voice.service.ts');
    assert.match(voice, /withCoinCharge/);
    assert.match(voice, /CoinSpendCategory\.AI_VOICE/);
    assert.match(voice, /persistVoiceResult/);
    assert.match(voice, /saveUserFile/);
    assert.match(voice, /isTtsGenerationEnabled/);
    const files = src('services/file-cloud.service.ts');
    assert.match(files, /deletedAt/);
    assert.match(files, /deletionState/);
  });
});

describe('Block K — closed-block regression freeze', () => {
  it('46-53. pricing, payments, providers, and prior launch blocks stay frozen', () => {
    assert.equal(getDefaultFreeCoins(), 50);
    assert.equal(COIN_COSTS[CoinSpendCategory.LOGO_GENERATION], 15);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_MUSIC], 10);
    assert.equal(COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION], 25);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_VIDEO], 25);
    assert.equal(STREAMSET_THREE_PART_COIN_COST, 75);
    assert.equal(STREAMSET_PACK_COIN_COST, 200);
    assert.equal(Object.values(COIN_COSTS).includes(135), false);
    assert.equal(arePaymentsEnabled(), false);
    assert.equal(isOpenAiImageGenerationLiveEnabled(), false);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(isTtsGenerationEnabled(), false);
    const panel = repo('frontend/src/components/nexter/NexterPanel.tsx');
    assert.match(panel, /createNexterSpeechController/);
    assert.match(panel, /toggleListen/);
    assert.match(panel, /QuoteCard/);
    assert.match(panel, /shouldAutoNavigateNexterStudio/);
    assert.match(panel, /variant="identity"/);
    assert.doesNotMatch(panel, /api\.nexter\.listen/);
    assert.match(src('config/env.ts'), /TTS_GENERATION_ENABLED/);
    assert.match(repo('backend/.env.example'), /TTS_GENERATION_ENABLED=false/);
    assert.match(src('lib/media-providers.ts'), /isTtsGenerationEnabled/);
    assert.match(src('services/legal-operator-e2e.test.ts'), /LEGAL_TEXT_STATUS/);
    assert.match(src('services/oauth-invite-e2e.test.ts'), /invite/);
    assert.match(src('services/email-production-e2e.test.ts'), /UNAVAILABLE|fail-closed|TRANSACTIONAL/i);
    assert.match(src('services/storage-lifecycle-e2e.test.ts'), /deletedAt|soft/i);
    assert.match(src('services/firestore-id-nan-e2e.test.ts'), /empty|NaN|invalid/i);
  });
});
