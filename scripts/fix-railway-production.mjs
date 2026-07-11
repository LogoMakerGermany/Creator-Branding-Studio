#!/usr/bin/env node
/**
 * One-shot Railway production fix:
 * 1. Patch FRONTEND_URL / FRONTEND_URLS in backend/.env.railway
 * 2. Push vars to Railway
 * 3. Mirror main → LogoMakerGermany/CreatorBrandingStudioUltimate (Railway source repo)
 * 4. Trigger deploy from that repo
 *
 * Usage: node scripts/fix-railway-production.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const RAILWAY_PUBLIC_URL = 'https://creatorbrandingstudioultimate-production.up.railway.app';
const FRONTEND_URL = RAILWAY_PUBLIC_URL;
const FRONTEND_URLS = [
  RAILWAY_PUBLIC_URL,
  'https://creatorstudio-519eb.web.app',
  'https://creatorstudio-519eb.firebaseapp.com',
].join(',');

const RAILWAY_GITHUB_REPO = 'LogoMakerGermany/CreatorBrandingStudioUltimate';
const RAILWAY_GITHUB_REMOTE = 'railway-github';
const RAILWAY_GITHUB_URL = `https://github.com/${RAILWAY_GITHUB_REPO}.git`;

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: opts.silent ? 'pipe' : 'inherit',
    env: { ...process.env, NODE_OPTIONS: '--use-system-ca', ...opts.env },
  });
  if (result.status !== 0 && !opts.allowFail) {
    const err = result.stderr || result.stdout || `${cmd} failed`;
    throw new Error(typeof err === 'string' ? err : String(err));
  }
  return result;
}

function patchEnvRailway() {
  const envPath = path.join(root, 'backend', '.env.railway');
  if (!existsSync(envPath)) {
    console.warn('Skip: backend/.env.railway not found — copy from .env.railway.example');
    return false;
  }
  let content = readFileSync(envPath, 'utf8');
  const updates = {
    FRONTEND_URL,
    FRONTEND_URLS,
    PORT: '8080',
  };
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(content)) content = content.replace(re, `${key}=${value}`);
    else content += `\n${key}=${value}`;
  }
  writeFileSync(envPath, content, 'utf8');
  console.log(`Patched ${envPath} (FRONTEND_URL, FRONTEND_URLS, PORT)`);
  return true;
}

function pushRailwayVars() {
  console.log('\nSyncing Railway variables…');
  const r = run(process.execPath, ['scripts/push-railway-vars.mjs'], { silent: true });
  if (r.status !== 0) {
    console.warn('Variable sync failed — set FRONTEND_URL manually in Railway Dashboard if needed.');
    return false;
  }
  console.log('Railway variables synced.');
  return true;
}

function mirrorToRailwayRepo() {
  console.log(`\nMirroring main → ${RAILWAY_GITHUB_REPO} …`);
  run('git', ['remote', 'get-url', RAILWAY_GITHUB_REMOTE], { silent: true, allowFail: true });
  const hasRemote = run('git', ['remote', 'get-url', RAILWAY_GITHUB_REMOTE], { silent: true, allowFail: true }).status === 0;
  if (!hasRemote) {
    run('git', ['remote', 'add', RAILWAY_GITHUB_REMOTE, RAILWAY_GITHUB_URL], { silent: true });
  } else {
    run('git', ['remote', 'set-url', RAILWAY_GITHUB_REMOTE, RAILWAY_GITHUB_URL], { silent: true });
  }
  const push = run('git', ['push', RAILWAY_GITHUB_REMOTE, 'main', '--force'], { silent: true, allowFail: true });
  if (push.status !== 0) {
    console.error('Git push to Railway repo failed. Connect GitHub auth or push manually:');
    console.error(`  git remote add ${RAILWAY_GITHUB_REMOTE} ${RAILWAY_GITHUB_URL}`);
    console.error(`  git push ${RAILWAY_GITHUB_REMOTE} main --force`);
    return false;
  }
  console.log(`Pushed to ${RAILWAY_GITHUB_REPO}`);
  return true;
}

async function gql(token, query, variables = {}) {
  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (data.errors?.length) throw new Error(data.errors.map((e) => e.message).join('; '));
  return data.data;
}

async function triggerDeploy() {
  const configPath = path.join(os.homedir(), '.railway', 'config.json');
  if (!existsSync(configPath)) {
    console.warn('Skip deploy trigger: not logged in to Railway CLI');
    return false;
  }
  const token = JSON.parse(readFileSync(configPath, 'utf8')).user?.token;
  if (!token) return false;

  process.env.RAILWAY_GITHUB_REPO = RAILWAY_GITHUB_REPO;
  const r = spawnSync(process.execPath, ['scripts/railway-trigger-deploy.mjs'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, RAILWAY_GITHUB_REPO },
  });
  return r.status === 0;
}

async function main() {
  console.log('UCBS Railway production fix\n');
  patchEnvRailway();
  pushRailwayVars();
  const mirrored = mirrorToRailwayRepo();
  if (mirrored) {
    await triggerDeploy();
  }
  console.log('\nDone. After deploy (~5 min), verify:');
  console.log(`  ${RAILWAY_PUBLIC_URL}/health`);
  console.log(`  CSP should include apis.google.com`);
  console.log(`  Login: ${RAILWAY_PUBLIC_URL}/login`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
