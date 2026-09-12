import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  arePaymentsEnabled,
  getDefaultFreeCoins,
  getNexterChatModel,
  hasImageAiProvider,
  isNexterChatEnabled,
  isNexterChatProviderAvailable,
  isOpenAiImageGenerationLiveEnabled,
  NEXTER_CHAT_MODEL_DEFAULT,
} from '../config/env.js';
import { getPublicClientConfig } from './client-config.service.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import {
  consumeNexterChatProviderSlot,
  DNA_VISION_BLOCKED_MESSAGE,
  NEXTER_CHAT_MAX_PER_WINDOW,
} from '../lib/provider-gate.js';
import { redactLogString } from '../lib/observability.js';
import { getOrCreateUser } from './user.service.js';
import { getCoinBalance } from './coins.service.js';
import { upsertDna } from './dna.service.js';
import { createProject } from './project.service.js';
import { nexterChat } from './nexter/conversation.service.js';
import { analyzeImageWithVision } from './dna-analysis.service.js';
import { ServiceError } from '../lib/errors.js';

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

const PLACEHOLDER_KEY = 'test-openai-not-a-real-key';

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

describe('nexter chat openai provider safety', () => {
  it('1-4 availability matrix: gate AND key, fail-closed otherwise', async () => {
    await withEnv(
      { NEXTER_CHAT_ENABLED: 'true', OPENAI_API_KEY: PLACEHOLDER_KEY },
      () => {
        assert.equal(isNexterChatEnabled(), true);
        assert.equal(isNexterChatProviderAvailable(), true);
      }
    );
    await withEnv({ NEXTER_CHAT_ENABLED: 'true', OPENAI_API_KEY: undefined }, () => {
      assert.equal(isNexterChatEnabled(), true);
      assert.equal(isNexterChatProviderAvailable(), false);
    });
    await withEnv(
      { NEXTER_CHAT_ENABLED: 'false', OPENAI_API_KEY: PLACEHOLDER_KEY },
      () => {
        assert.equal(isNexterChatEnabled(), false);
        assert.equal(isNexterChatProviderAvailable(), false);
      }
    );
    await withEnv({ NEXTER_CHAT_ENABLED: undefined, OPENAI_API_KEY: undefined }, () => {
      assert.equal(isNexterChatEnabled(), false);
      assert.equal(isNexterChatProviderAvailable(), false);
    });
    await withEnv(
      { NEXTER_CHAT_ENABLED: 'yes', OPENAI_API_KEY: PLACEHOLDER_KEY },
      () => {
        assert.equal(isNexterChatEnabled(), false);
        assert.equal(isNexterChatProviderAvailable(), false);
      }
    );
    await withEnv(
      { NEXTER_CHAT_ENABLED: '1', OPENAI_API_KEY: PLACEHOLDER_KEY },
      () => {
        assert.equal(isNexterChatEnabled(), false);
        assert.equal(isNexterChatProviderAvailable(), false);
      }
    );
  });

  it('5 unauthenticated chat is blocked at the route', () => {
    const routes = src('routes/nexter.routes.ts');
    assert.match(routes, /nexterRoutes\.use\(authenticate/);
    assert.match(src('middleware/auth.ts'), /AUTH_REQUIRED/);
    assert.match(src('middleware/auth.ts'), /Authentifizierung erforderlich/);
  });

  it('6-8 message, history, and output token limits stay server-side', () => {
    const routes = src('routes/nexter.routes.ts');
    assert.match(routes, /z\.string\(\)\.min\(1\)\.max\(4000\)/);
    assert.doesNotMatch(routes, /model:/);
    const conv = src('services/nexter/conversation.service.ts');
    assert.match(conv, /MAX_NEXTER_MESSAGES = 60/);
    assert.match(conv, /NEXTER_CHAT_PROVIDER_HISTORY = 8/);
    assert.match(conv, /NEXTER_CHAT_MAX_OUTPUT_TOKENS = 700/);
    assert.match(conv, /NEXTER_CHAT_TIMEOUT_MS = 45_000/);
    assert.match(conv, /AbortController/);
    assert.match(conv, /signal: controller\.signal/);
    assert.doesNotMatch(conv, /\/\* fallback \*\//);
  });

  it('9 rate limit / in-flight protection reuse the existing chat slot', async () => {
    const userId = `chat-limit-${randomUUID()}`;
    for (let i = 0; i < NEXTER_CHAT_MAX_PER_WINDOW; i += 1) {
      const slot = await consumeNexterChatProviderSlot(userId);
      assert.equal(slot.ok, true);
    }
    const blocked = await consumeNexterChatProviderSlot(userId);
    assert.equal(blocked.ok, false);
    const conv = src('services/nexter/conversation.service.ts');
    assert.match(conv, /consumeNexterChatProviderSlot/);
    assert.match(conv, /liveNexterChatInFlight/);
    assert.match(src('index.ts'), /apiLimiter/);
  });

  it('10 provider timeout/error paths do not debit coins and tests never fetch OpenAI', async () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(Boolean(process.env.NODE_TEST), true);
    const conv = src('services/nexter/conversation.service.ts');
    assert.match(conv, /shouldCallLiveNexterChatProvider/);
    assert.match(conv, /isPaidProviderTestBlocked/);
    assert.match(conv, /process\.env\.NODE_TEST/);
    assert.match(conv, /AI_TIMEOUT/);
    assert.match(conv, /AI_PROVIDER_ERROR/);
    assert.doesNotMatch(conv, /console\.(log|info|error|debug)\(/);
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@chat-timeout.test`, 'ChatTimeout');
    const before = await getCoinBalance(user.id);
    const session = await nexterChat(user.id, 'Hallo Nexter, was kannst du?');
    assert.ok(session.messages.length >= 2);
    assert.equal(await getCoinBalance(user.id), before);
  });

  it('11 Nexter chat does not re-grant the 50 welcome bonus', async () => {
    assert.equal(getDefaultFreeCoins(), 50);
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@chat-welcome.test`, 'ChatWelcome');
    assert.equal(await getCoinBalance(user.id), 50);
    await nexterChat(user.id, 'Hallo');
    await nexterChat(user.id, 'Noch eine Nachricht');
    assert.equal(await getCoinBalance(user.id), 50);
    const conv = src('services/nexter/conversation.service.ts');
    assert.doesNotMatch(conv, /getOrCreateUser/);
    assert.doesNotMatch(conv, /getDefaultFreeCoins/);
    assert.doesNotMatch(conv, /Willkommensbonus/);
  });

  it('12 Nexter chat never starts generation without quote confirmation', async () => {
    const user = await getOrCreateUser(randomUUID(), `${randomUUID()}@chat-quote.test`, 'ChatQuote');
    const dna = await upsertDna({
      userId: user.id,
      name: 'ChatWolf',
      mascot: 'Wolf',
      styleDirection: 'neon',
      primaryColors: ['#1E40AF'],
    });
    const project = await createProject(user.id, { name: 'Chat Brand', type: 'streamset', dnaId: dna.id });
    const before = await getCoinBalance(user.id);
    const quoted = await nexterChat(user.id, 'Mach mir ein Logo.', { projectId: project.id });
    assert.equal(quoted.messages.at(-1)?.actions?.some((a) => a.tool === 'start_generation'), true);
    assert.equal(await getCoinBalance(user.id), before);
    const conv = src('services/nexter/conversation.service.ts');
    assert.doesNotMatch(conv, /confirmQuote\(/);
    assert.doesNotMatch(conv, /generateWithOpenAI/);
    assert.doesNotMatch(conv, /generateStudioAsset/);
    assert.doesNotMatch(conv, /transcribeVideoSource/);
    assert.doesNotMatch(conv, /analyzeImageWithVision/);
  });

  it('13-15 OpenAI key stays server-only: not in client config, frontend, or logs', () => {
    const cfg = getPublicClientConfig();
    const serialized = JSON.stringify(cfg);
    assert.equal('openai' in cfg, false);
    assert.equal(serialized.includes('OPENAI'), false);
    assert.equal(serialized.includes(PLACEHOLDER_KEY), false);
    const client = src('services/client-config.service.ts');
    assert.doesNotMatch(client, /OPENAI|getOpenAiApiKey/);
    const frontendFiles = [
      repo('frontend/src/lib/runtime-config.ts'),
      repo('frontend/src/vite-env.d.ts'),
      repo('frontend/src/services/api.ts'),
      repo('frontend/src/lib/firebase.ts'),
    ].join('\n');
    assert.doesNotMatch(frontendFiles, /OPENAI_API_KEY/);
    assert.doesNotMatch(frontendFiles, /VITE_OPENAI/);
    assert.doesNotMatch(frontendFiles, /PUBLIC_OPENAI/);
    assert.equal(redactLogString(`prefix sk-abcdefghijklmnopqrstuvwxyz12 suffix`), '[redacted]');
    const conv = src('services/nexter/conversation.service.ts');
    assert.doesNotMatch(conv, /console\.(log|info|debug|error)\(.*key/i);
    assert.doesNotMatch(conv, /logEvent\(/);
  });

  it('16 PAYMENTS_ENABLED remains false', () => {
    assert.equal(arePaymentsEnabled(), false);
  });

  it('17 OpenAI chat key does not live-enable studio image generation', async () => {
    await withEnv(
      {
        NEXTER_CHAT_ENABLED: 'true',
        OPENAI_API_KEY: PLACEHOLDER_KEY,
        IMAGE_GENERATIONS_ENABLED: undefined,
        REPLICATE_API_TOKEN: undefined,
      },
      () => {
        assert.equal(isNexterChatProviderAvailable(), true);
        assert.equal(isOpenAiImageGenerationLiveEnabled(), false);
        assert.equal(hasImageAiProvider(), false);
      }
    );
    await withEnv(
      {
        NEXTER_CHAT_ENABLED: 'true',
        OPENAI_API_KEY: PLACEHOLDER_KEY,
        IMAGE_GENERATIONS_ENABLED: 'true',
        GENERATIONS_ENABLED: 'true',
        REPLICATE_API_TOKEN: undefined,
      },
      () => {
        assert.equal(isOpenAiImageGenerationLiveEnabled(), true);
        assert.equal(hasImageAiProvider(), true);
      }
    );
    const ai = src('services/ai.service.ts');
    assert.match(ai, /isOpenAiImageGenerationLiveEnabled/);
    assert.match(ai, /liveOpenAiImages/);
    await assert.rejects(
      () =>
        analyzeImageWithVision(
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfCcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmHIQAAAABJRU5ErkJggg==',
          'neon'
        ),
      (err: unknown) => err instanceof ServiceError && err.code === 'AI_NOT_CONFIGURED'
    );
    const vision = src('services/dna-analysis.service.ts');
    assert.match(vision, /DNA_VISION_BLOCKED_MESSAGE/);
    void DNA_VISION_BLOCKED_MESSAGE;
  });

  it('chat model stays server-controlled gpt-4o-mini; client cannot choose', async () => {
    assert.equal(NEXTER_CHAT_MODEL_DEFAULT, 'gpt-4o-mini');
    await withEnv({ OPENAI_CHAT_MODEL: undefined }, () => {
      assert.equal(getNexterChatModel(), 'gpt-4o-mini');
    });
    await withEnv({ OPENAI_CHAT_MODEL: 'gpt-4o-mini' }, () => {
      assert.equal(getNexterChatModel(), 'gpt-4o-mini');
    });
    await withEnv({ OPENAI_CHAT_MODEL: 'gpt-4o' }, () => {
      assert.equal(getNexterChatModel(), 'gpt-4o-mini');
    });
    await withEnv({ OPENAI_CHAT_MODEL: 'o3' }, () => {
      assert.equal(getNexterChatModel(), 'gpt-4o-mini');
    });
    const routes = src('routes/nexter.routes.ts');
    assert.doesNotMatch(routes, /openaiModel|chatModel|OPENAI_CHAT_MODEL/);
  });

  it('examples and env getters never ship the key to git or the browser bundle', () => {
    const example = repo('backend/.env.example');
    const railway = repo('backend/.env.railway.example');
    assert.match(example, /NEXTER_CHAT_ENABLED=false/);
    assert.match(railway, /NEXTER_CHAT_ENABLED=false/);
    assert.doesNotMatch(example, /OPENAI_API_KEY=\S+/);
    assert.doesNotMatch(railway, /OPENAI_API_KEY=\S+/);
    assert.doesNotMatch(example, /VITE_OPENAI|PUBLIC_OPENAI/);
    const env = src('config/env.ts');
    assert.match(env, /isNexterChatEnabled/);
    assert.match(env, /NEXTER_CHAT_ENABLED/);
    assert.match(env, /toLowerCase\(\) === 'true'/);
  });
});
