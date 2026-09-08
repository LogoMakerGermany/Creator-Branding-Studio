import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COIN_COSTS,
  CoinSpendCategory,
  MUSICGEN_VOCAL_CAPABILITY,
  checkMusicDuration,
  musicDownloadFilename,
  musicGenMaxDurationSec,
  musicNeedsFollowUp,
  parseMusicIntent,
  sanitizeMusicUserRequest,
} from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { getActiveDna, upsertDna } from './dna.service.js';
import { createProject } from './project.service.js';
import { deductAmount, getCoinBalance, getTransactions } from './coins.service.js';
import { getUserFile } from './file-cloud.service.js';
import { ServiceError } from '../lib/errors.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import { createVideoProject, saveEditPlan } from './media.service.js';
import { defaultEditPlan } from '@ucbs/shared';
import {
  downloadMusic,
  generateMusicTrack,
  getMusic,
  listMusic,
  listMusicVersions,
  retryMusicJob,
  setMusicTestHooks,
} from './music.service.js';
import { createQuote, confirmQuote } from './nexter/quotes.service.js';
import { detectQuoteKind } from './nexter/tools.service.js';
import { nexterChat } from './nexter/conversation.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

afterEach(() => {
  setMusicTestHooks(null);
});

async function seed() {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@music-close.test`, 'Beat');
  const dna = await upsertDna({
    userId: user.id,
    name: 'NightWolf',
    mascot: 'Cyber-Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF'],
    brandingStyle: 'esports',
  });
  const project = await createProject(user.id, { name: 'Music Brand', type: 'streamset', dnaId: dna.id });
  return { user, dna, project };
}

describe('music closure — project, dna, config', () => {
  it('persists owned music project and does not rewrite DNA', async () => {
    const { user, project, dna } = await seed();
    const before = dna.version;
    setMusicTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'music', project.id, {
      purpose: 'stream-intro',
      genre: 'Hardcore',
      mood: 'aggressive',
      duration: 20,
      energy: 'high',
    });
    const result = await confirmQuote(user.id, quote.id);
    const job = await getMusic(result.jobIds[0]!, user.id);
    assert.equal(job?.userId, user.id);
    assert.equal(job?.projectId, project.id);
    assert.equal(job?.metadata?.genre, 'Hardcore');
    assert.equal(job?.duration, 20);
    assert.ok(job?.metadata?.fileId);
    const listed = await listMusic(user.id);
    assert.ok(listed.some((j) => j.id === job?.id));
    const after = await getActiveDna(user.id);
    assert.equal(after?.version, before);
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@music-b.test`, 'B');
    assert.equal(await getMusic(job!.id, other.id), null);
  });

  it('validates duration, instrumental-only vocals, and prompt builder', () => {
    const max = musicGenMaxDurationSec();
    assert.equal(checkMusicDuration(0, max).ok, false);
    assert.equal(checkMusicDuration(-1, max).ok, false);
    assert.equal(checkMusicDuration(120, max).ok, false);
    assert.equal(checkMusicDuration(30, max).ok, true);
    assert.equal(MUSICGEN_VOCAL_CAPABILITY, 'instrumental-only');
    const hard = parseMusicIntent('Ich brauche aggressiven Hardcore-Techno.');
    assert.equal(hard.genre, 'Hardcore');
    assert.equal(hard.mood, 'aggressive');
    assert.equal(hard.instrumental, true);
    assert.match(hard.prompt, /Instrumental/i);
    assert.match(hard.summary ?? '', /Hardcore|Techno|instrumental/i);
    const vocals = parseMusicIntent('Mach mir Musik für mein Intro mit Gesang.');
    assert.equal(vocals.instrumental, true);
    assert.equal(vocals.vocalsRequested, true);
    const unsafe = sanitizeMusicUserRequest('Erzeuge exakt Song X von ArtistY');
    assert.equal(/exakt Song X/i.test(unsafe), false);
  });
});

describe('music closure — nexter', () => {
  it('parses intents and asks follow-up instead of quoting vague music', async () => {
    assert.equal(detectQuoteKind('Mach mir Musik für mein Intro.'), 'music');
    assert.equal(parseMusicIntent('Mach etwas Episches für mein Esports-Intro.').mood, 'epic');
    assert.equal(parseMusicIntent('Ich brauche 20 Sekunden Hintergrundmusik.').duration, 20);
    assert.equal(parseMusicIntent('Ohne Gesang und Intro Musik').instrumental, true);
    assert.equal(musicNeedsFollowUp('Mach mir Musik.'), true);
    assert.equal(musicNeedsFollowUp('Mach mir Musik für mein Intro.'), false);
    const { user } = await seed();
    const session = await nexterChat(user.id, 'Mach mir Musik.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.match(last?.content ?? '', /Intro|Background|Stil|Dauer/i);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), false);
  });

  it('concrete Nexter music request prepares a quote without starting a job', async () => {
    const { user } = await seed();
    const session = await nexterChat(user.id, 'Mach mir Musik für mein Intro.');
    const last = session.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), true);
    assert.equal((await listMusic(user.id)).length, 0);
  });
});

describe('music closure — quote, mock, refund, result', () => {
  it('requires quote confirmation and ignores client prices', async () => {
    const routes = src('../routes/music.routes.ts');
    assert.match(routes, /MUSIC_REQUIRES_QUOTE/);
    const { user, project } = await seed();
    const cheap = await createQuote(user.id, 'music', project.id, { purpose: 'background', duration: 10 }, 1);
    await assert.rejects(
      () => confirmQuote(user.id, cheap.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'PRICE_CHANGED'
    );
  });

  it('insufficient coins starts no job', async () => {
    const { user, project } = await seed();
    const bal = await getCoinBalance(user.id);
    if (bal > 0) await deductAmount(user.id, bal, 'drain', { sourceType: 'admin' });
    const quote = await createQuote(user.id, 'music', project.id, { purpose: 'jingle', duration: 8 });
    await assert.rejects(
      () => confirmQuote(user.id, quote.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'INSUFFICIENT_COINS'
    );
    assert.equal((await listMusic(user.id)).length, 0);
  });

  it('double confirm is one charge and one job', async () => {
    const { user, project } = await seed();
    setMusicTestHooks({ result: 'success' });
    const before = await getCoinBalance(user.id);
    const quote = await createQuote(user.id, 'music', project.id, {
      purpose: 'stream-intro',
      duration: 12,
      genre: 'Techno',
    });
    const first = await confirmQuote(user.id, quote.id);
    const second = await confirmQuote(user.id, quote.id);
    assert.equal(first.jobIds[0], second.jobIds[0]);
    assert.equal(second.jobIds.length, 1);
    const after = await getCoinBalance(user.id);
    assert.equal(before - after, COIN_COSTS[CoinSpendCategory.AI_MUSIC]);
  });

  it('mock success persists owned result; failure refunds once; retry needs quote', async () => {
    const { user, project } = await seed();
    setMusicTestHooks({ result: 'fail' });
    const before = await getCoinBalance(user.id);
    const failQuote = await createQuote(user.id, 'music', project.id, { purpose: 'background', duration: 10 });
    await assert.rejects(() => confirmQuote(user.id, failQuote.id));
    assert.equal(await getCoinBalance(user.id), before);
    const refunds = (await getTransactions(user.id)).filter((t) => t.type === 'refund' || t.amount > 0);
    assert.ok(refunds.length >= 1);

    setMusicTestHooks({ result: 'success' });
    const okQuote = await createQuote(user.id, 'music', project.id, {
      purpose: 'stream-intro',
      duration: 15,
      mood: 'epic',
    });
    const result = await confirmQuote(user.id, okQuote.id);
    const job = await getMusic(result.jobIds[0]!, user.id);
    assert.equal(job?.status, 'completed');
    const fileId = String(job!.metadata!.fileId);
    assert.ok(await getUserFile(fileId, user.id));
    const dl = await downloadMusic(job!.id, user.id);
    assert.ok(dl.downloadUrl);
    const again = await downloadMusic(job!.id, user.id);
    assert.ok(again.downloadUrl);
    assert.match(dl.filename, /nightwolf|music-v/i);
    assert.equal(musicDownloadFilename({ creatorName: 'Night Wolf!', purpose: 'stream-intro', version: 1, ext: 'wav' }), 'night-wolf-stream-intro-music-v1.wav');
    const other = await getOrCreateUser(randomUUID(), `${randomUUID()}@music-d.test`, 'D');
    await assert.rejects(() => downloadMusic(job!.id, other.id));
    await assert.rejects(
      () => retryMusicJob(job!.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'JOB_NOT_RETRYABLE'
    );

    setMusicTestHooks({ result: 'fail' });
    const fail2 = await createQuote(user.id, 'music', project.id, { purpose: 'jingle', duration: 5 });
    await assert.rejects(() => confirmQuote(user.id, fail2.id));
    const failed = (await listMusic(user.id)).find((j) => j.status === 'failed');
    assert.ok(failed);
    await assert.rejects(
      () => retryMusicJob(failed!.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'MUSIC_REQUIRES_QUOTE'
    );
  });

  it('change/variant reuses config, versions, and video can reference own music only', async () => {
    const { user, project, dna } = await seed();
    setMusicTestHooks({ result: 'success' });
    const quote = await createQuote(user.id, 'music', project.id, {
      purpose: 'stream-intro',
      duration: 10,
      mood: 'epic',
    });
    const first = await confirmQuote(user.id, quote.id);
    const change = await createQuote(user.id, 'music', project.id, {
      parentJobId: first.jobIds[0],
      request: 'Härter und nur 15 Sekunden.',
      changeRequest: true,
    });
    const second = await confirmQuote(user.id, change.id);
    const variant = await getMusic(second.jobIds[0]!, user.id);
    assert.equal(variant?.dnaId, dna.id);
    assert.equal(variant?.duration, 15);
    const versions = await listMusicVersions(second.jobIds[0]!, user.id);
    assert.ok(versions.length >= 2);

    const listed = await listMusic(user.id);
    assert.ok(listed.some((j) => j.id === first.jobIds[0]));

    const video = await createVideoProject(user.id, 'Clip', 4, 'youtube', dna.id, project.id);
    const ownFileId = String(variant!.metadata!.fileId);
    const saved = await saveEditPlan(video.id, user.id, {
      ...defaultEditPlan(4),
      audioFileId: ownFileId,
    });
    assert.equal(saved.editPlan?.audioFileId, ownFileId);

    const stranger = await getOrCreateUser(randomUUID(), `${randomUUID()}@music-e.test`, 'E');
    const strangerVideo = await createVideoProject(stranger.id, 'ClipB', 4);
    await assert.rejects(
      () => saveEditPlan(strangerVideo.id, stranger.id, { ...defaultEditPlan(4), audioFileId: ownFileId }),
      (err: unknown) => err instanceof ServiceError && err.statusCode === 404
    );

    const changeChat = await nexterChat(user.id, 'Mach die Musik schneller und härter.');
    const last = changeChat.messages.filter((m) => m.role === 'assistant').at(-1);
    assert.equal((last?.actions ?? []).some((a) => a.tool === 'quote_generation'), true);
  });
});

describe('music closure — safety', () => {
  it('provider and payment calls stay at 0; resource limits remain', async () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const media = src('../lib/media-providers.ts');
    const gen = media.split('export async function generateMusic')[1]?.split('export async function')[0] ?? '';
    assert.match(gen, /isPaidProviderTestBlocked/);
    assert.equal(gen.includes('api.openai.com'), false);
    const music = src('music.service.ts');
    assert.equal(music.includes('api.replicate.com'), false);
    assert.equal(music.includes('api.stripe.com'), false);
    const { user, project } = await seed();
    await assert.rejects(
      () => generateMusicTrack(user.id, project.id, { duration: 99, purpose: 'background' }),
      (err: unknown) => err instanceof ServiceError && err.code === 'MUSIC_DURATION_UNSUPPORTED'
    );
  });
});
