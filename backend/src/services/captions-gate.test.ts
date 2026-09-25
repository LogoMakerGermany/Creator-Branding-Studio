import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COIN_COSTS, CoinSpendCategory } from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { createProject } from './project.service.js';
import { getCoinBalance, getTransactions } from './coins.service.js';
import { ServiceError } from '../lib/errors.js';
import { createTinyTestVideo } from '../lib/video-processing.js';
import { transcribeVideoSource } from '../lib/video-analysis.js';
import {
  attachVideoSource,
  createVideoProject,
  executeQuotedCaptions,
  getVideoProject,
  setCaptionTestHooks,
} from './media.service.js';
import { createQuote, confirmQuote } from './nexter/quotes.service.js';
import { buildReadinessReport, readinessReportLeaksSecrets } from './readiness.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const PLACEHOLDER_KEY = 'unit-test-openai-placeholder';
const TOUCHED = ['CAPTIONS_GENERATIONS_ENABLED', 'OPENAI_API_KEY', 'GENERATIONS_ENABLED'] as const;

function snapshot(): Record<string, string | undefined> {
  return Object.fromEntries(TOUCHED.map((key) => [key, process.env[key]]));
}

function restore(prev: Record<string, string | undefined>): void {
  for (const key of TOUCHED) {
    const value = prev[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => {
  setCaptionTestHooks(null);
});

async function seed() {
  const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@captions-gate.test`, 'Captions');
  const brand = await createProject(user.id, { name: 'Brand', type: 'video' });
  const video = await createVideoProject(user.id, 'Captions Gate', 30, 'shorts', undefined, brand.id);
  const buf = await createTinyTestVideo(8);
  const dataUrl = `data:video/mp4;base64,${buf.toString('base64')}`;
  const attached = await attachVideoSource(video.id, user.id, dataUrl, undefined, 'clip.mp4');
  return { user, video: attached };
}

async function spendCount(userId: string): Promise<number> {
  const rows = await getTransactions(userId);
  return rows.filter((row) => row.type === 'spend' && row.category === CoinSpendCategory.VIDEO_EDIT).length;
}

async function withFetchGuard<T>(run: (openaiCalls: string[]) => Promise<T>): Promise<T> {
  const openaiCalls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('api.openai.com')) openaiCalls.push(url);
    return original(input, init);
  }) as typeof fetch;
  try {
    return await run(openaiCalls);
  } finally {
    globalThis.fetch = original;
  }
}

describe('captions fail-closed gate', () => {
  it('missing flag with a key does not charge or call the provider', async () => {
    const prev = snapshot();
    try {
      delete process.env.CAPTIONS_GENERATIONS_ENABLED;
      process.env.OPENAI_API_KEY = PLACEHOLDER_KEY;
      process.env.GENERATIONS_ENABLED = 'true';
      await withFetchGuard(async (openaiCalls) => {
        const { user, video } = await seed();
        const before = await getCoinBalance(user.id);
        const spends = await spendCount(user.id);
        await assert.rejects(
          () => executeQuotedCaptions(user.id, video.id),
          (err: unknown) => err instanceof ServiceError && err.code === 'CAPTIONS_GENERATION_DISABLED'
        );
        await assert.rejects(
          () => transcribeVideoSource('https://example.invalid/clip.mp4'),
          (err: unknown) => err instanceof ServiceError && err.code === 'CAPTIONS_GENERATION_DISABLED'
        );
        assert.equal(await getCoinBalance(user.id), before);
        assert.equal(await spendCount(user.id), spends);
        assert.equal(openaiCalls.length, 0);
      });
    } finally {
      restore(prev);
    }
  });

  it('flag false with a key does not charge or call the provider', async () => {
    const prev = snapshot();
    try {
      process.env.OPENAI_API_KEY = PLACEHOLDER_KEY;
      process.env.GENERATIONS_ENABLED = 'true';
      for (const flag of ['false', 'yes', '1', '']) {
        process.env.CAPTIONS_GENERATIONS_ENABLED = flag;
        await withFetchGuard(async (openaiCalls) => {
          const { user, video } = await seed();
          const before = await getCoinBalance(user.id);
          const spends = await spendCount(user.id);
          await assert.rejects(
            () => executeQuotedCaptions(user.id, video.id),
            (err: unknown) => err instanceof ServiceError && err.code === 'CAPTIONS_GENERATION_DISABLED'
          );
          assert.equal(await getCoinBalance(user.id), before);
          assert.equal(await spendCount(user.id), spends);
          assert.equal(openaiCalls.length, 0);
        });
      }
    } finally {
      restore(prev);
    }
  });

  it('flag true without a key does not charge or call the provider', async () => {
    const prev = snapshot();
    try {
      process.env.CAPTIONS_GENERATIONS_ENABLED = 'true';
      delete process.env.OPENAI_API_KEY;
      process.env.GENERATIONS_ENABLED = 'true';
      await withFetchGuard(async (openaiCalls) => {
        const { user, video } = await seed();
        const before = await getCoinBalance(user.id);
        const spends = await spendCount(user.id);
        await assert.rejects(
          () => executeQuotedCaptions(user.id, video.id),
          (err: unknown) => err instanceof ServiceError && err.code === 'AI_NOT_CONFIGURED'
        );
        await assert.rejects(
          () => transcribeVideoSource('https://example.invalid/clip.mp4'),
          (err: unknown) => err instanceof ServiceError && err.code === 'AI_NOT_CONFIGURED'
        );
        assert.equal(await getCoinBalance(user.id), before);
        assert.equal(await spendCount(user.id), spends);
        assert.equal(openaiCalls.length, 0);
      });
    } finally {
      restore(prev);
    }
  });

  it('flag true with a key stays blocked in the test runtime', async () => {
    const prev = snapshot();
    try {
      process.env.CAPTIONS_GENERATIONS_ENABLED = 'TRUE';
      process.env.OPENAI_API_KEY = PLACEHOLDER_KEY;
      process.env.GENERATIONS_ENABLED = 'true';
      await withFetchGuard(async (openaiCalls) => {
        const { user, video } = await seed();
        const before = await getCoinBalance(user.id);
        const spends = await spendCount(user.id);
        await assert.rejects(
          () => executeQuotedCaptions(user.id, video.id),
          (err: unknown) =>
            err instanceof ServiceError &&
            err.code === 'AI_NOT_CONFIGURED' &&
            /Tests blockiert/.test(err.message)
        );
        await assert.rejects(
          () => transcribeVideoSource(video.sourceUrl || 'https://example.invalid/clip.mp4'),
          (err: unknown) => err instanceof ServiceError && err.code === 'AI_NOT_CONFIGURED'
        );
        assert.equal(await getCoinBalance(user.id), before);
        assert.equal(await spendCount(user.id), spends);
        assert.equal(openaiCalls.length, 0);
      });
    } finally {
      restore(prev);
    }
  });

  it('approved mock path still quotes, charges once, and does not call the provider', async () => {
    const prev = snapshot();
    try {
      process.env.CAPTIONS_GENERATIONS_ENABLED = 'true';
      delete process.env.OPENAI_API_KEY;
      process.env.GENERATIONS_ENABLED = 'true';
      await withFetchGuard(async (openaiCalls) => {
        const { user, video } = await seed();
        const before = await getCoinBalance(user.id);
        const spends = await spendCount(user.id);
        setCaptionTestHooks({
          transcript: [
            { start: 1, end: 3, text: 'Caption A' },
            { start: 4, end: 6, text: 'Caption B' },
          ],
        });
        const quote = await createQuote(user.id, 'captions', video.id, { videoProjectId: video.id });
        const result = await confirmQuote(user.id, quote.id);
        assert.equal(result.jobIds.length, 1);
        assert.equal(result.coinsSpent, COIN_COSTS[CoinSpendCategory.VIDEO_EDIT]);
        assert.equal(await getCoinBalance(user.id), before - result.coinsSpent);
        assert.equal(await spendCount(user.id), spends + 1);
        const refunds = (await getTransactions(user.id)).filter((row) => row.type === 'refund');
        assert.equal(refunds.length, 0);
        const loaded = await getVideoProject(video.id, user.id);
        assert.equal(loaded?.subtitles[0]?.text, 'Caption A');
        assert.equal(loaded?.captionsNeedReview, true);
        assert.equal(openaiCalls.length, 0);
      });
    } finally {
      restore(prev);
    }
  });

  it('repeated confirmation of the same caption quote does not charge or call the provider again', async () => {
    const prev = snapshot();
    try {
      process.env.CAPTIONS_GENERATIONS_ENABLED = 'true';
      delete process.env.OPENAI_API_KEY;
      process.env.GENERATIONS_ENABLED = 'true';
      await withFetchGuard(async (openaiCalls) => {
        const { user, video } = await seed();
        const before = await getCoinBalance(user.id);
        setCaptionTestHooks({
          transcript: [
            { start: 1, end: 3, text: 'Caption A' },
            { start: 4, end: 6, text: 'Caption B' },
          ],
        });
        const quote = await createQuote(user.id, 'captions', video.id, { videoProjectId: video.id });
        const first = await confirmQuote(user.id, quote.id);
        const afterFirst = await getCoinBalance(user.id);
        const spends = await spendCount(user.id);
        await assert.rejects(
          () => confirmQuote(user.id, quote.id),
          (err: unknown) => err instanceof ServiceError && err.code === 'QUOTE_USED'
        );
        assert.equal(first.jobIds.length, 1);
        assert.equal(afterFirst, before - COIN_COSTS[CoinSpendCategory.VIDEO_EDIT]);
        assert.equal(await getCoinBalance(user.id), afterFirst);
        assert.equal(await spendCount(user.id), spends);
        const loaded = await getVideoProject(video.id, user.id);
        assert.equal(loaded?.subtitles.length, 2);
        assert.equal(openaiCalls.length, 0);
      });
    } finally {
      restore(prev);
    }
  });

  it('keeps the gate before the coin charge and before the Whisper request', () => {
    const media = readFileSync(join(dir, 'media.service.ts'), 'utf8');
    const fn = media.slice(media.indexOf('export async function executeQuotedCaptions'));
    const next = fn.indexOf('export async function exportShortClip');
    const body = next > 0 ? fn.slice(0, next) : fn;
    const gateAt = body.indexOf('assertCaptionsProviderReady(');
    const chargeAt = body.indexOf('withCoinCharge(');
    assert.ok(gateAt >= 0 && chargeAt > gateAt);
    const analysis = readFileSync(join(dir, '../lib/video-analysis.ts'), 'utf8');
    const whisper = analysis.slice(analysis.indexOf('export async function transcribeVideoSource'));
    const fetchAt = whisper.indexOf("fetch('https://api.openai.com/v1/audio/transcriptions'");
    assert.ok(whisper.indexOf('assertCaptionsProviderReady(false)') >= 0);
    assert.ok(fetchAt > whisper.indexOf('assertCaptionsProviderReady(false)'));
    assert.equal(analysis.includes('res.text()'), false);
    const example = readFileSync(join(dir, '../../.env.example'), 'utf8');
    const railway = readFileSync(join(dir, '../../.env.railway.example'), 'utf8');
    assert.match(example, /CAPTIONS_GENERATIONS_ENABLED=false/);
    assert.match(railway, /CAPTIONS_GENERATIONS_ENABLED=false/);
    const report = buildReadinessReport('2026-09-25T00:00:00.000Z');
    assert.equal(readinessReportLeaksSecrets(report, [PLACEHOLDER_KEY]), false);
  });
});
