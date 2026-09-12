import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  arePaymentsEnabled,
  collectProductionConfigIssues,
  getDefaultFreeCoins,
  getFrontendUrls,
  isDevMode,
  normalizeRegistrationMode,
} from '../config/env.js';
import { getPublicClientConfig } from './client-config.service.js';
import { publicHealthPayload } from '../lib/observability.js';

process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '../../..');
const EXPECTED_PROJECT = 'nexter-creator-studio';
const OLD_PROJECT = ['creatorstudio', '519eb'].join('-');

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

describe('Railway production environment alignment', () => {
  it('Dockerfile all-in-one serves frontend/dist with production fail-closed defaults', () => {
    const docker = repo('Dockerfile');
    const toml = repo('railway.toml');
    assert.match(docker, /ENV NODE_ENV=production/);
    assert.match(docker, /ENV SERVE_STATIC=true/);
    assert.match(docker, /ENV PORT=8080/);
    assert.match(docker, /COPY --from=builder \/app\/frontend\/dist \.\/frontend\/dist/);
    assert.match(docker, /CMD \["node", "dist\/index\.js"\]/);
    assert.equal(JSON.parse(repo('.firebaserc')).projects.default, EXPECTED_PROJECT);
    assert.doesNotMatch(docker, /ARG VITE_/);
    assert.doesNotMatch(docker, /ENV VITE_/);
    assert.match(toml, /builder = "DOCKERFILE"/);
    assert.match(toml, /healthcheckPath = "\/health"/);
    assert.match(repo('backend/src/middleware/static.ts'), /frontend\/dist/);
    assert.match(repo('backend/src/index.ts'), /attachStaticFrontend/);
  });

  it('browser config uses PUBLIC_FIREBASE runtime fallback and never receives admin secrets', () => {
    const runtime = repo('frontend/src/lib/runtime-config.ts');
    const client = repo('backend/src/services/client-config.service.ts');
    const viteEnv = repo('frontend/src/vite-env.d.ts');
    const frontendSrc = [
      repo('frontend/src/lib/runtime-config.ts'),
      repo('frontend/src/vite-env.d.ts'),
      repo('frontend/src/services/api.ts'),
    ].join('\n');
    assert.match(runtime, /fromViteEnv/);
    assert.match(runtime, /\/api\/v1\/config\/client/);
    assert.match(client, /PUBLIC_FIREBASE/);
    assert.match(client, /Vite env is not available at image build/);
    assert.doesNotMatch(frontendSrc, /VITE_FIREBASE_PRIVATE_KEY/);
    assert.doesNotMatch(frontendSrc, /VITE_FIREBASE_CLIENT_EMAIL/);
    assert.doesNotMatch(frontendSrc, /VITE_OPENAI/);
    assert.doesNotMatch(frontendSrc, /VITE_STRIPE_SECRET/);
    assert.doesNotMatch(viteEnv, /PRIVATE_KEY/);
    const cfg = getPublicClientConfig();
    assert.equal('privateKey' in cfg, false);
    assert.equal('clientEmail' in cfg, false);
  });

  it('production CORS stays on an explicit allowlist without wildcards or the retired UCBS host', () => {
    const retiredHost = 'creatorbrandingstudioultimate-production.up.railway.app';
    const urls = getFrontendUrls();
    assert.equal(urls.includes(`https://${retiredHost}`), false);
    assert.equal(urls.some((url) => url.includes(retiredHost)), false);
    const cors = repo('backend/src/index.ts');
    assert.match(cors, /allowedOrigins\.includes/);
    assert.doesNotMatch(cors, /origin:\s*true/);
    assert.doesNotMatch(cors, /origin:\s*['"]\*/);
    const action = repo('frontend/src/lib/auth-action-url.ts');
    assert.match(action, /window\.location\.origin/);
    assert.doesNotMatch(action, /localhost:5173/);
    assert.doesNotMatch(action, new RegExp(OLD_PROJECT));
    assert.doesNotMatch(repo('frontend/src/lib/firebase.ts'), new RegExp(OLD_PROJECT));
    assert.equal(repo('backend/src/config/env.ts').includes(OLD_PROJECT), false);
    assert.equal(repo('backend/src/config/env.ts').includes(retiredHost), false);
    assert.equal(repo('frontend/src/lib/auth-errors.ts').includes(retiredHost), false);
    assert.equal(repo('frontend/src/pages/auth/LoginPage.tsx').includes(retiredHost), false);
    assert.equal(repo('frontend/src/lib/runtime-config.ts').includes(retiredHost), false);
    assert.equal(repo('frontend/src/lib/auth-providers.ts').includes("'github'"), false);
    assert.equal(repo('frontend/src/lib/auth-providers.ts').includes("'apple'"), false);
  });

  it('production fail-closed, invite_only, welcome 50, and payments stay unchanged', () => {
    assert.equal(normalizeRegistrationMode(undefined), 'invite_only');
    assert.equal(getDefaultFreeCoins(), 50);
    assert.equal(arePaymentsEnabled(), false);
    assert.equal(publicHealthPayload(true).status, 'ok');
    const prevNode = process.env.NODE_ENV;
    const prevBypass = process.env.DEV_AUTH_BYPASS;
    try {
      process.env.NODE_ENV = 'production';
      process.env.DEV_AUTH_BYPASS = 'true';
      assert.equal(isDevMode(), false);
      const issues = collectProductionConfigIssues().map((issue) => issue.variable);
      assert.equal(issues.includes('DEV_AUTH_BYPASS'), true);
    } finally {
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
      if (prevBypass === undefined) delete process.env.DEV_AUTH_BYPASS;
      else process.env.DEV_AUTH_BYPASS = prevBypass;
    }
    const push = repo('scripts/push-railway-vars.mjs');
    assert.match(push, /SKIP_KEYS/);
    assert.match(push, /DEV_AUTH_BYPASS/);
    assert.match(push, /--skip-deploys/);
    const railwayExample = repo('backend/.env.railway.example');
    assert.match(railwayExample, /YOUR-NEXTER-SERVICE\.up\.railway\.app/);
    assert.doesNotMatch(railwayExample, /creatorbrandingstudioultimate-production\.up\.railway\.app/);
    assert.match(railwayExample, /PUBLIC_FIREBASE_PROJECT_ID=/);
    assert.match(railwayExample, /NEXTER_CHAT_ENABLED=false/);
    assert.doesNotMatch(railwayExample, /VITE_OPENAI|PUBLIC_OPENAI/);
    assert.match(railwayExample, /# NEVER in production:/);
    const activeBypass = railwayExample
      .split(/\r?\n/)
      .map((line) => line.trim())
      .some((line) => line === 'DEV_AUTH_BYPASS=true' || line.startsWith('DEV_AUTH_BYPASS=true'));
    assert.equal(activeBypass, false);
  });
});
