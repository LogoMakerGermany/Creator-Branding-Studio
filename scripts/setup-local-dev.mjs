#!/usr/bin/env node
/**
 * Prepare local development: Firebase client keys + optional Admin SDK from backend/.env.railway
 * Usage: npm run setup:local
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseEnv(content) {
  const out = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function upsertEnvLines(content, updates) {
  let next = content;
  if (!next.endsWith('\n')) next += '\n';

  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, 'm');
    const line = `${key}=${value}`;
    if (re.test(next)) {
      next = next.replace(re, line);
    } else {
      next += `${line}\n`;
    }
  }
  return next;
}

console.log('1/2 Firebase Web-Keys synchronisieren …');
const sync = spawnSync('node', ['scripts/sync-firebase-env.mjs'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
});
if (sync.status !== 0) {
  process.exit(sync.status ?? 1);
}

const railwayPath = path.join(root, 'backend', '.env.railway');
const backendEnvPath = path.join(root, 'backend', '.env');

if (!existsSync(railwayPath)) {
  console.log('\n2/2 backend/.env.railway fehlt — nur Dev-Login ohne Firebase Admin möglich.');
  console.log('   Kopiere backend/.env.railway.example und trage Service-Account-Daten ein.');
  process.exit(0);
}

const railway = parseEnv(readFileSync(railwayPath, 'utf8'));
const adminKeys = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_STORAGE_BUCKET',
  'PUBLIC_FIREBASE_API_KEY',
  'PUBLIC_FIREBASE_AUTH_DOMAIN',
  'PUBLIC_FIREBASE_PROJECT_ID',
  'PUBLIC_FIREBASE_STORAGE_BUCKET',
  'PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'PUBLIC_FIREBASE_APP_ID',
];

const updates = {
  DEV_AUTH_BYPASS: 'true',
  DEFAULT_FREE_COINS: '50',
  PORT: '3001',
  FRONTEND_URL: 'http://localhost:5173',
};

for (const key of adminKeys) {
  if (railway[key]) updates[key] = railway[key];
}

const existing = existsSync(backendEnvPath) ? readFileSync(backendEnvPath, 'utf8') : '';
writeFileSync(backendEnvPath, upsertEnvLines(existing, updates), 'utf8');

console.log(`\n2/2 Aktualisiert ${backendEnvPath}`);
console.log('\nFertig. Starte die App mit: npm run dev');
console.log('  • Dev-Login: funktioniert ohne Firebase (Backend muss laufen)');
console.log('  • Echter Auth: Google/E-Mail nach Neustart mit Firebase Admin in backend/.env');
