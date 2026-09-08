import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COIN_COSTS,
  CoinSpendCategory,
  DEFAULT_NEXTER_VOICE_CATALOG_ID,
  MAX_VOICE_STUDIO_CHARS,
  NEXTER_VOICE_MALE_ID,
  detectVoiceQuoteIntent,
  parseVoiceIntent,
  validateVoiceText,
  voiceDownloadFilename,
  voiceNeedsFollowUp,
  voiceSupportsLanguage,
} from '@ucbs/shared';
import { getOrCreateUser, getUserById } from './user.service.js';
import { getActiveDna, upsertDna } from './dna.service.js';
import { createProject } from './project.service.js';
import { deductAmount, getCoinBalance, getTransactions } from './coins.service.js';
import { getUserFile } from './file-cloud.service.js';
import { ServiceError } from '../lib/errors.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import { createVideoProject, saveEditPlan } from './media.service.js';
import { defaultEditPlan } from '@ucbs/shared';
import { listBillableChargesForUser, refundBillableChargeOnce } from './billable-charge.service.js';
import {
  downloadVoice,
  generateVoiceTrack,
  getVoice,
  listVoice,
  listVoiceVersions,
  retryVoiceJob,
  setVoiceTestHooks,
  speakNexterReply,
} from './voice.service.js';
import { createQuote, confirmQuote } from './nexter/quotes.service.js';
import { detectQuoteKind } from './nexter/tools.service.js';
import { nexterChat } from './nexter/conversation.service.js';
import { updateNexterPreferencesForUser } from './nexter/preferences.service.js';
import {
  __resetVoiceCatalogCacheForTests,
  __setElevenLabsVoicesLoaderForTests,
  __setVoicePreviewFetcherForTests,
  catalogIdForProviderVoice,
  getOfficialVoicePreview,
  listPublicNexterVoices,
} from './nexter/voice-catalog.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

afterEach(() => {
  setVoiceTestHooks(null);
  __setElevenLabsVoicesLoaderForTests(null);
  __setVoicePreviewFetcherForTests(null);
  __resetVoiceCatalogCacheForTests();
});

async function seed() {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@voice-close.test`, 'Vox');
  const dna = await upsertDna({
    userId: user.id,
    name: 'NightWolf',
    mascot: 'Cyber-Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF'],
    brandingStyle: 'esports',
  });
  const project = await createProject(user.id, { name: 'Voice Brand', type: 'streamset', dnaId: dna.id });
  return { user, dna, project };
}

describe('voice closure — catalog, prefs, validation', () => {
  it('central catalog is used by onboarding, settings and voice studio UI', () => {
    const onboarding = src('../../../frontend/src/pages/onboarding/NexterSetupPage.tsx');
    const settings = src('../../../frontend/src/v2/pages/SettingsHubPage.tsx');
    const studio = src('../../../frontend/src/pages/ai/AIVoicePage.tsx');
    const fields = src('../../../frontend/src/components/nexter/NexterPersonalizationFields.tsx');
    assert.match(onboarding, /api\.nexter/);
    assert.match(onboarding, /voices\(\)/);
    assert.match(settings, /api\.nexter/);
    assert.match(settings, /voices\(\)/);
    assert.match(studio, /api\.nexter/);
    assert.match(studio, /voices\(\)/);
    assert.match(fields, /NexterPersonalizationFields/);
    assert.equal(studio.toLowerCase().includes('voice_id'), false);
    assert.equal(fields.toLowerCase().includes('elevenlabs'), false);
  });

  it('validates empty text, length, language, voice and compatibility', async () => {
    assert.equal(validateVoiceText('').ok, false);
    assert.equal(validateVoiceText('   ').ok, false);
    assert.equal(validateVoiceText('ok').ok, true);
    assert.equal(validateVoiceText('x'.repeat(MAX_VOICE_STUDIO_CHARS + 1)).ok, false);
    const { user, project } = await seed();
    await assert.rejects(
      () => generateVoiceTrack(user.id, project.id, { text: '   ' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'EMPTY_TEXT'
    );
    await assert.rejects(
      () => generateVoiceTrack(user.id, project.id, { text: 'x'.repeat(MAX_VOICE_STUDIO_CHARS + 1) }),
      (err: unknown) => err instanceof ServiceError && err.code === 'TEXT_TOO_LONG'
    );
    await assert.rejects(
      () => generateVoiceTrack(user.id, project.id, { text: 'Hallo', voiceCatalogId: 'not-a-voice' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'UNKNOWN_VOICE'
    );
    await assert.rejects(
      () => generateVoiceTrack(user.id, project.id, { text: 'Hallo', language: 'fr' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_LANGUAGE'
    );
    __setElevenLabsVoicesLoaderForTests(async () => [
      {
        voice_id: 'en_only_secret_zzzz',
        name: 'English Only',
        labels: { gender: 'female' },
        verified_languages: [{ language: 'en' }],
      },
    ]);
    const pub = await listPublicNexterVoices();
    const enOnly = pub.find((v) => v.catalogId.startsWith('el-') && v.languages?.includes('en') && !v.germanAvailable);
    assert.ok(enOnly);
    assert.equal(voiceSupportsLanguage(enOnly, 'de'), false);
    await assert.rejects(
      () =>
        generateVoiceTrack(user.id, project.id, {
          text: 'Hallo Welt',
          language: 'de',
          voiceCatalogId: enOnly!.catalogId,
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'VOICE_LANGUAGE_INCOMPATIBLE'
    );
  });

  it('persists voice and language preferences for Nexter TTS jobs', async () => {
    const { user, project } = await seed();
    await updateNexterPreferencesForUser(user.id, {
      voiceCatalogId: NEXTER_VOICE_MALE_ID,
      language: 'en',
    });
    const loaded = await getUserById(user.id);
    assert.equal(loaded?.nexterPreferences.voiceCatalogId, NEXTER_VOICE_MALE_ID);
    assert.equal(loaded?.nexterPreferences.language, 'en');
    setVoiceTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'voice', project.id, {
      text: 'Welcome to the stream.',
    });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getVoice(result.jobIds[0]!, user.id);
    assert.equal(job?.metadata?.voiceCatalogId, NEXTER_VOICE_MALE_ID);
    assert.equal(job?.metadata?.language, 'en');
    const after = await getActiveDna(user.id);
    assert.ok(after);
  });
});

describe('voice closure — nexter', () => {
  it('asks for text instead of quoting vague voiceover', async () => {
    assert.equal(detectQuoteKind('Mach ein Voiceover.'), 'voice');
    assert.equal(detectVoiceQuoteIntent('Mach ein Voiceover.'), true);
    assert.equal(voiceNeedsFollowUp('Mach ein Voiceover.'), true);
    assert.equal(voiceNeedsFollowUp('Sprich folgenden Text als Voiceover: Willkommen auf meinem Stream.'), false);
    assert.equal(parseVoiceIntent('Sprich folgenden Text als Voiceover: Willkommen auf meinem Stream.').text.includes('Willkommen'), true);
    assert.equal(detectQuoteKind('Erstelle Musik für mein Intro'), 'music');
    assert.equal(detectQuoteKind('Animier mein Logo'), 'animation');
    const { user } = await seed();
    const session = await nexterChat(user.id, 'Mach ein Voiceover.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(last?.content ?? '', /Text|sprechen/i);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), false);
  });

  it('concrete Nexter voice request prepares a quote without starting a job', async () => {
    const { user } = await seed();
    const session = await nexterChat(user.id, 'Sprich folgenden Text als Voiceover: Willkommen auf meinem Stream.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), true);
    assert.equal((await listVoice(user.id)).length, 0);
  });

  it('Nexter text survives TTS failure and disabled voice', async () => {
    const { user } = await seed();
    const session = await nexterChat(user.id, 'Was weißt du über mein aktuelles Creator-Projekt?');
    const assistant = session.messages.filter((m) => m.role === 'assistant');
    assert.ok(assistant.length >= 1);
    await assert.rejects(() => speakNexterReply(user.id, assistant.at(-1)!.content));
    const still = await nexterChat(user.id, 'Und welche DNA habe ich?');
    assert.ok(still.messages.filter((m) => m.role === 'assistant').length >= 1);
    await updateNexterPreferencesForUser(user.id, { voiceOutputEnabled: false });
    await assert.rejects(
      () => speakNexterReply(user.id, 'Hallo'),
      (err: unknown) => err instanceof ServiceError && err.code === 'VOICE_DISABLED'
    );
    const after = await nexterChat(user.id, 'Hallo Nexter');
    assert.ok(after.messages.filter((m) => m.role === 'assistant').at(-1)?.content);
  });
});

describe('voice closure — quote, mock, refund, result', () => {
  it('requires quote confirmation and ignores client prices', async () => {
    const routes = src('../routes/voice.routes.ts');
    assert.match(routes, /VOICE_REQUIRES_QUOTE/);
    const { user, project } = await seed();
    const cheap = await createQuote(user.id, 'voice', project.id, { text: 'Hallo Stream' }, 1);
    await assert.rejects(
      () => confirmQuote(user.id, cheap.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'PRICE_CHANGED'
    );
  });

  it('insufficient coins starts no job', async () => {
    const { user, project } = await seed();
    const bal = await getCoinBalance(user.id);
    if (bal > 0) await deductAmount(user.id, bal, 'drain', { sourceType: 'admin' });
    const quote = await createQuote(user.id, 'voice', project.id, { text: 'Hallo' });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'INSUFFICIENT_COINS'
    );
    assert.equal((await listVoice(user.id)).length, 0);
  });

  it('double confirm is one charge and one job', async () => {
    const { user, project } = await seed();
    setVoiceTestHooks({ result: 'success' });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'voice', project.id, { text: 'Willkommen auf meinem Stream.' });
    const first = await confirmQuote(user.id, quote.id);
    const second = await confirmQuote(user.id, quote.id);
    assert.equal(first.jobIds[0], second.jobIds[0]);
    assert.equal(second.jobIds.length, 1);
    const after = await getCoinBalance(user.id);
    assert.equal(before - after, COIN_COSTS[CoinSpendCategory.AI_VOICE]);
  });

  it('mock success persists owned result; failure refunds once; retry needs quote', async () => {
    const { user, project } = await seed();
    setVoiceTestHooks({ result: 'fail' });
    const before = await getCoinBalance(user.id);
    const failQuote = await createQuote(user.id, 'voice', project.id, { text: 'Hallo' });
    await assert.rejects(() => confirmQuote(user.id, failQuote.id));
    assert.equal(await getCoinBalance(user.id), before);
    const refunds = (await getTransactions(user.id)).filter((t) => t.type === 'refund' || t.amount > 0);
    assert.ok(refunds.length >= 1);
    const charges = await listBillableChargesForUser(user.id);
    const refunded = charges.find((c) => c.status === 'refunded' && c.quoteId === failQuote.id);
    assert.ok(refunded);
    const balAfterFail = await getCoinBalance(user.id);
    const dupRefund = await refundBillableChargeOnce(refunded, 'dup');
    const third = await refundBillableChargeOnce(refunded, 'dup');
    assert.equal(dupRefund.duplicate, true);
    assert.equal(third.duplicate, true);
    assert.equal(await getCoinBalance(user.id), balAfterFail);

    setVoiceTestHooks({ result: 'success' });
    const okQuote = await createQuote(user.id, 'voice', project.id, {
      text: 'Willkommen auf meinem Stream.',
      title: 'intro',
      language: 'de',
      voiceCatalogId: DEFAULT_NEXTER_VOICE_CATALOG_ID,
    });
    const result = await confirmQuote(user.id, okQuote.id);
    const job = await getVoice(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    assert.equal(job?.userId, user.id);
    assert.ok(job?.metadata?.fileId);
    assert.equal(job?.metadata?.voiceCatalogId, DEFAULT_NEXTER_VOICE_CATALOG_ID);
    assert.equal(job?.metadata?.language, 'de');
    const fileId = String(job!.metadata!.fileId);
    assert.ok(await getUserFile(fileId, user.id));
    const dl = await downloadVoice(job!.id, user.id);
    assert.ok(dl.downloadUrl);
    const renewed = await downloadVoice(job!.id, user.id);
    assert.ok(renewed.downloadUrl);
    assert.match(dl.filename, /nexter-voice-intro-v1\.wav/);
    assert.equal(voiceDownloadFilename({ title: 'intro', version: 1, ext: 'wav' }), 'nexter-voice-intro-v1.wav');
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@voice-d.test`, 'D');
    await assert.rejects(() => downloadVoice(job!.id, other.id));
    assert.equal(await getVoice(job!.id, other.id), null);
    await assert.rejects(
      () => retryVoiceJob(job!.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'JOB_NOT_RETRYABLE'
    );

    setVoiceTestHooks({ result: 'fail' });
    const fail2 = await createQuote(user.id, 'voice', project.id, { text: 'Zweiter Versuch' });
    await assert.rejects(() => confirmQuote(user.id, fail2.id));
    const failed = (await listVoice(user.id)).find((j) => j.status === 'failed');
    assert.ok(failed);
    await assert.rejects(
      () => retryVoiceJob(failed!.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'VOICE_REQUIRES_QUOTE'
    );
  });

  it('change/variant reuses context, versions, and video can reference own voice only', async () => {
    const { user, project, dna } = await seed();
    setVoiceTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'voice', project.id, {
      text: 'Willkommen auf meinem Stream. Das Match beginnt gleich.',
      title: 'intro',
    });
    const first = await confirmQuote(user.id, quote.id);
    const change = await createQuote(user.id, 'voice', project.id, {
      parentJobId: first.jobIds[0],
      request: 'Etwas langsamer. Nimm die männliche Stimme.',
      changeRequest: true,
    });
    const second = await confirmQuote(user.id, change.id);
    const variant = await getVoice(second.jobIds[0]!, user.id);
    assert.equal(variant?.dnaId, dna.id);
    assert.equal(variant?.metadata?.voiceCatalogId, NEXTER_VOICE_MALE_ID);
    const versions = await listVoiceVersions(second.jobIds[0]!, user.id);
    assert.ok(versions.length >= 2);
    assert.ok((await listVoice(user.id)).some((j) => j.id === first.jobIds[0]));

    const video = await createVideoProject(user.id, 'Clip', 4, 'youtube', dna.id, project.id);
    const ownFileId = String(variant!.metadata!.fileId);
    const saved = await saveEditPlan(video.id, user.id, {
      ...defaultEditPlan(4),
      audioFileId: ownFileId,
    });
    assert.equal(saved.editPlan?.audioFileId, ownFileId);

    const stranger = await getOrCreateUser(randomUUID(), `${randomUUID()}@voice-e.test`, 'E');
    const strangerVideo = await createVideoProject(stranger.id, 'ClipB', 4);
    await assert.rejects(
      () => saveEditPlan(strangerVideo.id, stranger.id, { ...defaultEditPlan(4), audioFileId: ownFileId }),
      (err: unknown) => err instanceof ServiceError && err.statusCode === 404
    );

    const changeChat = await nexterChat(user.id, 'Etwas langsamer.');
    const last = changeChat.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), true);
  });
});

describe('voice closure — preview security and provider safety', () => {
  it('preview only accepts catalog ids and cannot proxy arbitrary URLs', async () => {
    assert.equal(await getOfficialVoicePreview('https://evil.example/audio.mp3'), null);
    assert.equal(await getOfficialVoicePreview('../../etc/passwd'), null);
    assert.equal(await getOfficialVoicePreview('el-0123456789abcdef'), null);
    __setElevenLabsVoicesLoaderForTests(async () => [
      {
        voice_id: 'preview_secret_zzzz',
        name: 'Preview Voice',
        preview_url: 'https://cdn.example.test/preview.mp3',
        verified_languages: [{ language: 'de' }],
      },
    ]);
    const catalogId = catalogIdForProviderVoice('preview_secret_zzzz');
    assert.equal(await getOfficialVoicePreview(catalogId), null);
    __setVoicePreviewFetcherForTests(async (url) => {
      assert.equal(url, 'https://cdn.example.test/preview.mp3');
      return { buffer: Buffer.alloc(128, 1), contentType: 'audio/mpeg' };
    });
    const preview = await getOfficialVoicePreview(catalogId);
    assert.ok(preview);
    assert.equal(preview.contentType, 'audio/mpeg');
    const routes = src('../routes/nexter.routes.ts');
    assert.match(routes, /voices\/:catalogId\/preview/);
    assert.equal(routes.includes('req.query.url'), false);
    assert.equal(routes.includes('req.body.url'), false);
  });

  it('provider and payment calls stay at 0; settings are server-validated', async () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const media = src('../lib/media-providers.ts');
    const gen = media.split('export async function generateSpeech')[1]?.split('export async function')[0] ?? '';
    assert.match(gen, /isPaidProviderTestBlocked/);
    assert.equal(gen.includes('api.openai.com'), false);
    const voice = src('voice.service.ts');
    assert.equal(voice.includes('api.elevenlabs.io'), false);
    assert.equal(voice.includes('api.stripe.com'), false);
    assert.equal(voice.includes('console.log(plan.text)'), false);
    assert.equal(gen.includes('await res.text()'), false);
    const { user, project } = await seed();
    setVoiceTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'voice', project.id, {
      text: 'Hallo',
      settings: { stability: 9, similarity: -2, style: 0.2, speed: 0.9 },
    });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getVoice(result.jobIds[0]!, user.id);
    const settings = job?.metadata?.settings as { stability: number; similarity: number; speed: number };
    assert.equal(settings.stability, 1);
    assert.equal(settings.similarity, 0);
    assert.equal(settings.speed, 0.9);
  });
});
