import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  arePaymentsEnabled,
  collectProductionConfigIssues,
  isDevMode,
  isOpenAiImageGenerationLiveEnabled,
  isTtsGenerationEnabled,
  areVideoGenerationsEnabled,
  areMusicGenerationsEnabled,
} from '../config/env.js';
import { publicHealthPayload } from '../lib/observability.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';

process.env.NODE_TEST = '1';
process.env.DEV_AUTH_BYPASS = 'true';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '../../..');

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

function src(rel: string): string {
  return readFileSync(join(dir, '..', rel), 'utf8');
}

const SECRET_VALUE =
  /sk_live_[A-Za-z0-9]+|sk_test_[A-Za-z0-9]+|BEGIN PRIVATE KEY|whsec_[A-Za-z0-9]+|RAILWAY_TOKEN=.+|FIREBASE_PRIVATE_KEY=-----|DISCORD_CLIENT_SECRET=.+[A-Za-z0-9]{8}|RESEND_API_KEY=re_|ELEVENLABS_API_KEY=[A-Za-z0-9]/;

const BUILD_KEYS = new Set([
  'builder',
  'watchPatterns',
  'buildCommand',
  'dockerfilePath',
  'nixpacksConfigPath',
  'nixpacksPlan',
  'nixpacksVersion',
  'railpackVersion',
]);
const DEPLOY_KEYS = new Set([
  'startCommand',
  'preDeployCommand',
  'preDeployTimeoutSeconds',
  'numReplicas',
  'healthcheckPath',
  'healthcheckTimeout',
  'sleepApplication',
  'runtime',
  'registryCredentials',
  'restartPolicyType',
  'restartPolicyMaxRetries',
  'cronSchedule',
  'region',
  'multiRegionConfig',
  'limitOverride',
  'requiredMountPath',
  'overlapSeconds',
  'drainingSeconds',
  'ipv6EgressEnabled',
]);
const FORBIDDEN_DEPLOY = new Set([
  'startCommand',
  'preDeployCommand',
  'numReplicas',
  'region',
  'multiRegionConfig',
  'registryCredentials',
  'cronSchedule',
  'requiredMountPath',
  'limitOverride',
]);

function parseSimpleToml(text: string): Record<string, Record<string, string | number | boolean>> {
  const out: Record<string, Record<string, string | number | boolean>> = {};
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) {
      section = sec[1] ?? '';
      out[section] ??= {};
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    assert.equal(Boolean(kv && section), true, `invalid railway.toml line: ${raw}`);
    const key = kv![1];
    let value: string | number | boolean = kv![2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    else if (/^-?\d+$/.test(value)) value = Number(value);
    else if (value === 'true' || value === 'false') value = value === 'true';
    out[section][key] = value;
  }
  return out;
}

async function withEnv<T>(patch: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> {
  const prev: Record<string, string | undefined> = {};
  for (const key of Object.keys(patch)) {
    prev[key] = process.env[key];
    const value = patch[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(patch)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

describe('Block J — Railway config-as-code / IaC readiness', () => {
  const tomlText = repo('railway.toml');
  const toml = parseSimpleToml(tomlText);
  const docker = repo('Dockerfile');
  const dockerignore = repo('.dockerignore');
  const gitignore = repo('.gitignore');
  const docs = repo('docs/production-deployment.md');
  const index = src('index.ts');
  const runtime = src('lib/runtime.ts');
  const staticMw = src('middleware/static.ts');
  const routes = repo('frontend/src/routes/index.tsx');
  const pkg = JSON.parse(repo('package.json')) as { devDependencies?: Record<string, string>; scripts?: Record<string, string> };
  const backendPkg = repo('backend/package.json');

  it('1-8. one verified CaC format, schema keys, deterministic Docker start, no Nixpacks conflict', () => {
    assert.equal(existsSync(join(repoRoot, 'railway.toml')), true);
    assert.equal(existsSync(join(repoRoot, 'railway.json')), false);
    assert.equal(existsSync(join(repoRoot, '.railway', 'railway.ts')), false);
    assert.equal(existsSync(join(repoRoot, '.railway', 'railway.py')), false);
    assert.equal(existsSync(join(repoRoot, '.railway', 'railway.go')), false);
    assert.match(pkg.devDependencies?.['@railway/cli'] ?? '', /4\.6\.3/);
    assert.equal(Object.keys(toml).sort().join(','), 'build,deploy');
    for (const key of Object.keys(toml.build ?? {})) assert.equal(BUILD_KEYS.has(key), true, `unknown build key ${key}`);
    for (const key of Object.keys(toml.deploy ?? {})) assert.equal(DEPLOY_KEYS.has(key), true, `unknown deploy key ${key}`);
    for (const key of FORBIDDEN_DEPLOY) assert.equal(key in (toml.deploy ?? {}), false, `forbidden deploy key ${key}`);
    assert.equal('buildCommand' in (toml.build ?? {}), false);
    assert.equal(toml.build?.builder, 'DOCKERFILE');
    assert.equal(toml.build?.dockerfilePath, 'Dockerfile');
    assert.equal(toml.deploy?.healthcheckPath, '/health');
    assert.equal(toml.deploy?.healthcheckTimeout, 30);
    assert.equal(toml.deploy?.restartPolicyType, 'ON_FAILURE');
    assert.equal(toml.deploy?.restartPolicyMaxRetries, 3);
    assert.doesNotMatch(tomlText, /startCommand\s*=|buildCommand\s*=|NIXPACKS|RAILPACK/);
    assert.equal(existsSync(join(repoRoot, 'Dockerfile')), true);
    assert.match(docker, /CMD \["node", "dist\/index\.js"\]/);
    assert.match(docker, /WORKDIR \/app\/backend/);
    assert.match(backendPkg, /"start": "node dist\/index\.js"/);
    assert.match(repo('package.json'), /"start": "node backend\/dist\/index\.js"/);
    assert.doesNotMatch(tomlText, SECRET_VALUE);
    assert.doesNotMatch(tomlText, /OPENAI_API_KEY|FIREBASE_PRIVATE_KEY|STRIPE_SECRET|RAILWAY_TOKEN/);
  });

  it('9-16. PORT, bind address, read-only health, optional providers do not fail health', async () => {
    assert.match(src('config/env.ts'), /export function getPort/);
    assert.match(src('config/env.ts'), /readEnv\('PORT'\)/);
    assert.match(index, /app\.listen\(Number\(PORT\), '0\.0\.0\.0'/);
    assert.match(index, /app\.get\('\/health'/);
    assert.doesNotMatch(index, /\/health[\s\S]{0,400}initializeFirebase|\/health[\s\S]{0,400}openai|\/health[\s\S]{0,400}resend|\/health[\s\S]{0,400}stripe/i);
    assert.match(index, /publicHealthPayload/);
    assert.equal(publicHealthPayload(true).status, 'ok');
    const issues = await withEnv(
      {
        NODE_ENV: 'production',
        PAYMENTS_ENABLED: 'false',
        DEV_AUTH_BYPASS: undefined,
        FIREBASE_PROJECT_ID: 'nexter-creator-studio',
        FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk@nexter-creator-studio.iam.gserviceaccount.com',
        FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nMIIBTESTKEY\n-----END PRIVATE KEY-----',
        FIREBASE_STORAGE_BUCKET: 'nexter-creator-studio.firebasestorage.app',
        PUBLIC_FIREBASE_API_KEY: 'test-public-web-key',
        PUBLIC_FIREBASE_PROJECT_ID: 'nexter-creator-studio',
        FRONTEND_URL: 'https://nexter-creator-studio-production.up.railway.app',
        SERVE_STATIC: 'true',
        STRIPE_SECRET_KEY: undefined,
        ELEVENLABS_API_KEY: undefined,
        RESEND_API_KEY: undefined,
        OPENAI_API_KEY: undefined,
      },
      () => collectProductionConfigIssues().map((issue) => issue.variable)
    );
    assert.equal(issues.includes('STRIPE_SECRET_KEY'), false);
    assert.equal(issues.includes('ELEVENLABS_API_KEY'), false);
    assert.equal(issues.includes('RESEND_API_KEY'), false);
    assert.equal(issues.includes('OPENAI_API_KEY'), false);
    assert.equal(arePaymentsEnabled(), false);
  });

  it('17-28. Firebase fail-closed, SPA fallback, legal/auth/nexter/project routes, graceful shutdown', async () => {
    await withEnv(
      {
        NODE_ENV: 'production',
        DEV_AUTH_BYPASS: 'true',
        FIREBASE_PROJECT_ID: 'nexter-creator-studio',
        FIREBASE_CLIENT_EMAIL: 'firebase-adminsdk@nexter-creator-studio.iam.gserviceaccount.com',
        FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nMIIBTESTKEY\n-----END PRIVATE KEY-----',
        FIREBASE_STORAGE_BUCKET: 'nexter-creator-studio.firebasestorage.app',
        PUBLIC_FIREBASE_API_KEY: 'test-public-web-key',
        PUBLIC_FIREBASE_PROJECT_ID: 'nexter-creator-studio',
        FRONTEND_URL: 'https://nexter-creator-studio-production.up.railway.app',
        SERVE_STATIC: 'true',
      },
      () => {
        assert.equal(isDevMode(), false);
        assert.equal(collectProductionConfigIssues().some((issue) => issue.variable === 'DEV_AUTH_BYPASS'), true);
      }
    );
    assert.match(index, /isProduction\(\) && !isFirebaseReady\(\)/);
    assert.match(index, /process\.exit\(1\)/);
    assert.match(docker, /ENV SERVE_STATIC=true/);
    assert.match(staticMw, /app\.get\('\*'/);
    assert.match(staticMw, /req\.path === '\/health'/);
    assert.match(routes, /path="\/legal\/:slug"/);
    assert.match(routes, /path="\/login"/);
    assert.match(routes, /path="\/nexter"/);
    assert.match(routes, /path="\/projects"/);
    assert.match(runtime, /SIGTERM/);
    assert.match(runtime, /SIGINT/);
    assert.match(runtime, /25_000/);
    assert.match(runtime, /httpServer\.close/);
  });

  it('29-42. no volume/db/domain/env/provider activation in CaC; gitignore and dockerignore protect secrets', () => {
    assert.equal('requiredMountPath' in (toml.deploy ?? {}), false);
    assert.equal('cronSchedule' in (toml.deploy ?? {}), false);
    assert.doesNotMatch(tomlText, /creatorbrandingstudioultimate-production/);
    assert.doesNotMatch(tomlText, /nexter-creator-studio-production\.up\.railway\.app/);
    assert.match(docs, /LogoMakerGermany\/Creator-Branding-Studio/);
    assert.match(docs, /cursor\/phase1-invite-pricing-ledger/);
    assert.doesNotMatch(tomlText, /IMAGE_GENERATIONS_ENABLED|TTS_GENERATION_ENABLED|PAYMENTS_ENABLED|NEXTER_CHAT_ENABLED|VIDEO_GENERATIONS_ENABLED|MUSIC_GENERATIONS_ENABLED/);
    assert.match(gitignore, /\.env/);
    assert.match(gitignore, /backend\/\.env\.railway/);
    assert.match(gitignore, /serviceAccount/);
    assert.match(gitignore, /\.railway\/config\.json/);
    assert.match(dockerignore, /\.env\.\*/);
    assert.match(dockerignore, /firebase-adminsdk/);
    assert.match(dockerignore, /serviceAccount/);
    assert.match(dockerignore, /!\.env\.example/);
    assert.equal(isOpenAiImageGenerationLiveEnabled(), false);
    assert.equal(isTtsGenerationEnabled(), false);
    assert.equal(areVideoGenerationsEnabled(), false);
    assert.equal(areMusicGenerationsEnabled(), false);
    assert.equal(arePaymentsEnabled(), false);
  });

  it('43-47. docs have deploy/rollback, no secret values, drift documented', () => {
    assert.doesNotMatch(docs, SECRET_VALUE);
    assert.doesNotMatch(docs, /sk_live_[A-Za-z0-9]+|BEGIN PRIVATE KEY-----/);
    assert.match(docs, /Rollback procedure/);
    assert.match(docs, /37e16c7981e62b8b3bdba803b680c9a6ae968124/);
    assert.match(docs, /Deploy procedure/);
    assert.match(docs, /INTENTIONAL/);
    assert.match(docs, /file wins/);
    assert.match(docs, /GET \/health/);
    assert.doesNotMatch(docs, /copy the private key into chat/i);
  });

  it('48-58. closed launch blocks stay in the regression suite', () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.match(src('services/image-generation-e2e.test.ts'), /quote|confirm/i);
    assert.match(src('services/video-quote-e2e.test.ts'), /quote/i);
    assert.match(src('services/music-quote-e2e.test.ts'), /quote/i);
    assert.match(src('services/legal-operator-e2e.test.ts'), /LEGAL_TEXT_STATUS/);
    assert.match(src('services/oauth-invite-e2e.test.ts'), /invite/);
    assert.match(src('services/email-production-e2e.test.ts'), /UNAVAILABLE|fail-closed|TRANSACTIONAL/i);
    assert.match(src('services/storage-lifecycle-e2e.test.ts'), /deletedAt|soft/i);
    assert.match(src('services/firestore-id-nan-e2e.test.ts'), /empty|NaN|invalid/i);
    assert.match(src('services/nexter-branding-e2e.test.ts'), /PRODUCT_NAME/);
    assert.match(src('services/nexter-tts-e2e.test.ts'), /TTS_GENERATION_ENABLED/);
    assert.match(src('services/nexter-orphans-e2e.test.ts'), /LEGACY_REDIRECTS/);
  });
});
