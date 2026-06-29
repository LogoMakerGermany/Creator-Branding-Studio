#!/usr/bin/env node
/**
 * Push only Firebase-related vars from backend/.env.railway to Railway.
 * Skips Stripe/AI keys — use when those already exist on Railway.
 * Usage: npm run railway:vars:firebase
 */
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, 'backend', '.env.railway');

const FIREBASE_PREFIXES = ['FIREBASE_', 'PUBLIC_FIREBASE_', 'FRONTEND_URL'];

function parseEnv(content) {
  const vars = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!FIREBASE_PREFIXES.some((p) => key.startsWith(p) || key === 'FRONTEND_URLS')) continue;
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\n/g, '\n');
    if (!value) continue;
    vars.push({ key, value });
  }
  return vars;
}

const railwayEnv = { ...process.env, NODE_OPTIONS: '--use-system-ca' };
const railwayBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'railway.cmd' : 'railway');

if (!existsSync(envFile)) {
  console.error('Missing backend/.env.railway');
  process.exit(1);
}

const vars = parseEnv(readFileSync(envFile, 'utf8'));
console.log(`Pushing ${vars.length} Firebase/URL variables to Railway (Stripe/AI unchanged)…\n`);

let failed = 0;
for (const { key, value } of vars) {
  process.stdout.write(`  ${key} … `);
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  const args = ['variables', '--set', `${key}=${escaped}`, '--skip-deploys'];

  const result = spawnSync(railwayBin, args, {
    cwd: root,
    env: railwayEnv,
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });

  if (result.status === 0) {
    console.log('ok');
  } else {
    console.log('FAILED');
    failed += 1;
  }
}

if (failed) {
  console.error(`\n${failed} failed — SSL issue? Use Railway Dashboard → Variables manually.`);
  process.exit(1);
}

console.log('\nDone. Redeploy in Railway Dashboard → Deploy, or: npm run railway:up');
