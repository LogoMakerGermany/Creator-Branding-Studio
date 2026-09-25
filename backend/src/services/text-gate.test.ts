import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { areTextGenerationsEnabled, hasTextAiProvider, isTextGenerationsFlagEnabled } from '../config/env.js';
import { ServiceError } from '../lib/errors.js';
import { detectHighlightsFromSubtitles } from '../lib/video-analysis.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { assertTextLiveProviderReady } from './text-provider-gate.js';
import { getCoinBalance, getTransactions } from './coins.service.js';
import { createProject } from './project.service.js';
import { generateContentPackage, listTextJobs, setTextTestHooks } from './text.service.js';
import { getOrCreateUser } from './user.service.js';

process.env.DEV_AUTH_BYPASS = 'true';

const dir = dirname(fileURLToPath(import.meta.url));
const PLACEHOLDER_KEY = 'unit-test-openai-placeholder';

const ENV_KEYS = [
  'TEXT_GENERATIONS_ENABLED',
  'GENERATIONS_ENABLED',
  'OPENAI_API_KEY',
  'NEXTER_CHAT_ENABLED',
  'IMAGE_GENERATIONS_ENABLED',
] as const;

function snapshotEnv(): Record<string, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(prev: Record<string, string | undefined>): void {
  for (const key of ENV_KEYS) {
    const value = prev[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function withEnv(
  patch: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
  run: () => Promise<void>
): Promise<void> {
  const prev = snapshotEnv();
  for (const key of ENV_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const value = patch[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    restoreEnv(prev);
    setTextTestHooks(null);
  }
}

async function spendCount(userId: string): Promise<number> {
  const rows = await getTransactions(userId);
  return rows.filter((row) => row.type === 'spend').length;
}

describe('text generation fail-closed gate', () => {
  afterEach(() => {
    setTextTestHooks(null);
  });

  it('flag missing, false, yes, empty, or 1 keeps text off even with a key', async () => {
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@text-gate.test`, 'Text Gate');
    const project = await createProject(user.id, { name: 'Text', type: 'branding' });
    const offValues = [undefined, 'false', 'yes', '', '1'] as const;

    for (const flag of offValues) {
      let openaiCalls = 0;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('api.openai.com')) {
          openaiCalls += 1;
          return new Response('blocked', { status: 500 });
        }
        return originalFetch(input, init);
      }) as typeof fetch;

      try {
        await withEnv(
          {
            TEXT_GENERATIONS_ENABLED: flag,
            GENERATIONS_ENABLED: 'true',
            OPENAI_API_KEY: PLACEHOLDER_KEY,
            NEXTER_CHAT_ENABLED: 'false',
            IMAGE_GENERATIONS_ENABLED: 'false',
          },
          async () => {
            assert.equal(isTextGenerationsFlagEnabled(), false);
            assert.equal(areTextGenerationsEnabled(), false);
            assert.equal(hasTextAiProvider(), false);
            const before = await getCoinBalance(user.id);
            const spends = await spendCount(user.id);
            const jobs = (await listTextJobs(user.id)).length;
            await assert.rejects(
              () =>
                generateContentPackage(user.id, project.id, {
                  kind: 'package',
                  topic: 'raid',
                  sourceType: 'topic',
                }),
              (err: unknown) =>
                err instanceof ServiceError && err.code === 'TEXT_GENERATION_DISABLED' && err.statusCode === 503
            );
            assert.equal(await getCoinBalance(user.id), before);
            assert.equal(await spendCount(user.id), spends);
            assert.equal((await listTextJobs(user.id)).length, jobs);
            assert.equal(openaiCalls, 0);
            assert.equal(hasTextAiProvider(), false);
            assert.equal(isTextGenerationsFlagEnabled(), false);
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  });

  it('flag true without a key does not debit or call the provider', async () => {
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@text-gate-nokey.test`, 'Text Gate');
    const project = await createProject(user.id, { name: 'Text', type: 'branding' });
    let openaiCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('api.openai.com')) {
        openaiCalls += 1;
        return new Response('blocked', { status: 500 });
      }
      return originalFetch(input, init);
    }) as typeof fetch;
    try {
      await withEnv(
        {
          TEXT_GENERATIONS_ENABLED: 'true',
          GENERATIONS_ENABLED: 'true',
          OPENAI_API_KEY: undefined,
        },
        async () => {
          assert.equal(isTextGenerationsFlagEnabled(), true);
          assert.equal(hasTextAiProvider(), false);
          const before = await getCoinBalance(user.id);
          const spends = await spendCount(user.id);
          await assert.rejects(
            () =>
              generateContentPackage(user.id, project.id, {
                kind: 'package',
                topic: 'raid',
                sourceType: 'topic',
              }),
            (err: unknown) => err instanceof ServiceError && err.code === 'AI_NOT_CONFIGURED'
          );
          assert.equal(await getCoinBalance(user.id), before);
          assert.equal(await spendCount(user.id), spends);
          assert.equal(openaiCalls, 0);
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('flag true with a key stays blocked in the test process before any debit', async () => {
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@text-gate-live.test`, 'Text Gate');
    const project = await createProject(user.id, { name: 'Text', type: 'branding' });
    let openaiCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('api.openai.com')) {
        openaiCalls += 1;
        return new Response('blocked', { status: 500 });
      }
      return originalFetch(input, init);
    }) as typeof fetch;
    try {
      await withEnv(
        {
          TEXT_GENERATIONS_ENABLED: 'TRUE',
          GENERATIONS_ENABLED: 'true',
          OPENAI_API_KEY: PLACEHOLDER_KEY,
        },
        async () => {
          assert.equal(isPaidProviderTestBlocked(), true);
          assert.equal(hasTextAiProvider(), true);
          const before = await getCoinBalance(user.id);
          const spends = await spendCount(user.id);
          const jobs = (await listTextJobs(user.id)).length;
          await assert.rejects(
            () =>
              generateContentPackage(user.id, project.id, {
                kind: 'package',
                topic: 'raid',
                sourceType: 'topic',
              }),
            (err: unknown) =>
              err instanceof ServiceError &&
              err.code === 'AI_NOT_CONFIGURED' &&
              /provider-gated/.test(err.message)
          );
          assert.equal(await getCoinBalance(user.id), before);
          assert.equal(await spendCount(user.id), spends);
          assert.equal((await listTextJobs(user.id)).length, jobs);
          assert.equal(openaiCalls, 0);
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('global generations switch stays closed even when the text flag is true', async () => {
    await withEnv(
      {
        TEXT_GENERATIONS_ENABLED: 'true',
        GENERATIONS_ENABLED: 'false',
        OPENAI_API_KEY: PLACEHOLDER_KEY,
      },
      async () => {
        assert.equal(isTextGenerationsFlagEnabled(), true);
        assert.equal(areTextGenerationsEnabled(), false);
        assert.equal(hasTextAiProvider(), false);
        const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@text-gate-global.test`, 'Text Gate');
        const before = await getCoinBalance(user.id);
        await assert.rejects(
          () => generateContentPackage(user.id, undefined, { kind: 'package', topic: 'raid', sourceType: 'topic' }),
          (err: unknown) => err instanceof ServiceError && err.code === 'GENERATIONS_DISABLED'
        );
        assert.equal(await getCoinBalance(user.id), before);
      }
    );
  });

  it('does not change chat or image flags and keeps the example default off', () => {
    const example = readFileSync(join(dir, '../../.env.example'), 'utf8');
    const railway = readFileSync(join(dir, '../../.env.railway.example'), 'utf8');
    assert.match(example, /TEXT_GENERATIONS_ENABLED=false/);
    assert.match(railway, /TEXT_GENERATIONS_ENABLED=false/);
    assert.match(example, /NEXTER_CHAT_ENABLED=false/);
    assert.match(example, /IMAGE_GENERATIONS_ENABLED=false/);
    const env = readFileSync(join(dir, '../config/env.ts'), 'utf8');
    assert.match(env, /isEnvFlagTrue\('TEXT_GENERATIONS_ENABLED'\)/);
    assert.match(env, /isEnvFlagTrue\('NEXTER_CHAT_ENABLED'\)/);
    assert.match(env, /isEnvFlagTrue\('IMAGE_GENERATIONS_ENABLED'\)/);
    const toml = readFileSync(join(dir, '../../../railway.toml'), 'utf8');
    assert.doesNotMatch(toml, /TEXT_GENERATIONS_ENABLED/);
  });
});

describe('highlight chat stays on the text gate', () => {
  const sample = [{ start: 0, end: 1, text: 'Hallo Stream' }];

  async function rejectsWithoutFetch(
    patch: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>,
    code: string
  ): Promise<void> {
    let openaiCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('api.openai.com')) openaiCalls += 1;
      return originalFetch(input, init);
    }) as typeof fetch;
    try {
      await withEnv(patch, async () => {
        await assert.rejects(
          () => detectHighlightsFromSubtitles('Clip', 8, sample),
          (err: unknown) => err instanceof ServiceError && err.code === code
        );
        assert.equal(openaiCalls, 0);
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  it('a key alone does not call the highlight provider', async () => {
    await rejectsWithoutFetch(
      {
        TEXT_GENERATIONS_ENABLED: undefined,
        GENERATIONS_ENABLED: 'true',
        OPENAI_API_KEY: PLACEHOLDER_KEY,
      },
      'TEXT_GENERATION_DISABLED'
    );
  });

  it('a disabled text flag does not call the highlight provider', async () => {
    await rejectsWithoutFetch(
      {
        TEXT_GENERATIONS_ENABLED: 'false',
        GENERATIONS_ENABLED: 'true',
        OPENAI_API_KEY: PLACEHOLDER_KEY,
      },
      'TEXT_GENERATION_DISABLED'
    );
  });

  it('stays blocked in the test process even when the text flag and key are set', async () => {
    await rejectsWithoutFetch(
      {
        TEXT_GENERATIONS_ENABLED: 'true',
        GENERATIONS_ENABLED: 'true',
        OPENAI_API_KEY: PLACEHOLDER_KEY,
      },
      'AI_NOT_CONFIGURED'
    );
  });

  it('keeps the text mock bypass in front of the live provider check', () => {
    const prev = snapshotEnv();
    process.env.TEXT_GENERATIONS_ENABLED = 'false';
    process.env.OPENAI_API_KEY = PLACEHOLDER_KEY;
    try {
      assert.doesNotThrow(() => assertTextLiveProviderReady(true));
      const text = readFileSync(join(dir, 'text.service.ts'), 'utf8');
      const start = text.indexOf('export async function generateContentPackage');
      const body = text.slice(start, start + 2500);
      const gateAt = body.indexOf('assertTextLiveProviderReady(');
      const chargeAt = body.indexOf('withCoinCharge(');
      assert.ok(gateAt >= 0 && chargeAt > gateAt);
    } finally {
      restoreEnv(prev);
    }
  });
});
