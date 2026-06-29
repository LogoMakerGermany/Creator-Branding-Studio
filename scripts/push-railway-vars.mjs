#!/usr/bin/env node
/**
 * Push backend/.env.railway variables to Railway.
 * Usage: npm run railway:vars
 * Requires: railway CLI logged in + project linked (railway link)
 */

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const envFile = path.join(root, 'backend', '.env.railway');

const SKIP_KEYS = new Set(['DEV_AUTH_BYPASS', 'PORT']);

function parseEnv(content) {
  const vars = [];
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\n/g, '\n');
    if (SKIP_KEYS.has(key) || !value) continue;
    vars.push({ key, value });
  }
  return vars;
}

const railwayEnv = { ...process.env, NODE_OPTIONS: '--use-system-ca' };

function railwayBin() {
  const bin = process.platform === 'win32' ? 'railway.cmd' : 'railway';
  return path.join(root, 'node_modules', '.bin', bin);
}

function railway(args, input) {
  const result = spawnSync(railwayBin(), args, {
    cwd: root,
    env: railwayEnv,
    input,
    stdio: input ? ['pipe', 'pipe', 'inherit'] : 'inherit',
    shell: process.platform === 'win32',
  });
  return result.status === 0;
}

if (!existsSync(envFile)) {
  console.error('Missing backend/.env.railway');
  console.error('Copy backend/.env.railway.example → backend/.env.railway and fill values.');
  process.exit(1);
}

const vars = parseEnv(readFileSync(envFile, 'utf8'));
if (!vars.length) {
  console.error('No variables found in backend/.env.railway');
  process.exit(1);
}

console.log(`Pushing ${vars.length} variables to Railway…\n`);

let failed = 0;
for (const { key, value } of vars) {
  process.stdout.write(`  ${key} … `);
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  const args = ['variables', '--set', `${key}=${escaped}`, '--skip-deploys'];

  const result = spawnSync(railwayBin(), args, {
    cwd: root,
    env: railwayEnv,
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });

  if (result.status === 0) {
    console.log('ok');
  } else {
    if (result.stderr?.length) process.stderr.write(result.stderr);
    console.log('FAILED');
    failed += 1;
  }
}

if (failed) {
  console.error(`\n${failed} variable(s) failed. Run: npm run railway:login && npm run railway:link`);
  process.exit(1);
}

console.log('\nDone. Deploy with: npm run railway:up');
console.log('Then set FRONTEND_URL to your Railway URL if you used a placeholder.');
