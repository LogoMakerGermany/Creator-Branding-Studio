#!/usr/bin/env node
/**
 * Sync Firebase Web SDK config into env files for hosting / Railway deploy.
 * Always uses project nexter-creator-studio. Usage: node scripts/sync-firebase-env.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_PROJECT = 'nexter-creator-studio';
const RAILWAY_FRONTEND = typeof process.env.FRONTEND_URL === 'string' ? process.env.FRONTEND_URL.trim() : '';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, NODE_OPTIONS: '--use-system-ca' };

function runFirebase(args) {
  const result = spawnSync('npx', ['firebase-tools', ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
    shell: true,
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(1);
  }
  return result.stdout;
}

function normalizeBucket(raw) {
  return String(raw || '')
    .trim()
    .replace(/^gs:\/\//i, '')
    .replace(/\/+$/, '');
}

function upsertEnv(content, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(content)) return content.replace(re, line);
  return `${content.replace(/\s*$/, '')}\n${line}\n`;
}

function envValue(content, key) {
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!match) return undefined;
  let value = match[1].trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

function envRaw(content, key) {
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1] : undefined;
}

const raw = runFirebase(['apps:sdkconfig', 'WEB', '--project', EXPECTED_PROJECT]);
const jsonMatch = raw.match(/\{[\s\S]*\}/);
if (!jsonMatch) {
  console.error('Could not parse Firebase SDK config');
  process.exit(1);
}

const cfg = JSON.parse(jsonMatch[0]);
if (cfg.projectId !== EXPECTED_PROJECT) {
  console.error(`BLOCKED_BY_EXTERNAL_CONFIG: WEB app project is ${cfg.projectId || 'MISSING'}, expected ${EXPECTED_PROJECT}`);
  process.exit(1);
}

const required = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
for (const key of required) {
  if (!cfg[key]) {
    console.error(`BLOCKED_BY_EXTERNAL_CONFIG: WEB app missing ${key}`);
    process.exit(1);
  }
}

cfg.storageBucket = normalizeBucket(cfg.storageBucket);
if (!cfg.storageBucket.startsWith(`${EXPECTED_PROJECT}.`)) {
  console.error('BLOCKED_BY_EXTERNAL_CONFIG: storage bucket does not belong to nexter-creator-studio');
  process.exit(1);
}

const lines = [
  `VITE_FIREBASE_API_KEY=${cfg.apiKey}`,
  `VITE_FIREBASE_AUTH_DOMAIN=${cfg.authDomain}`,
  `VITE_FIREBASE_PROJECT_ID=${cfg.projectId}`,
  `VITE_FIREBASE_STORAGE_BUCKET=${cfg.storageBucket}`,
  `VITE_FIREBASE_MESSAGING_SENDER_ID=${cfg.messagingSenderId}`,
  `VITE_FIREBASE_APP_ID=${cfg.appId}`,
  '',
  `VITE_API_URL=${RAILWAY_FRONTEND}`,
  '',
];

const frontendProd = path.join(root, 'frontend', '.env.production');
writeFileSync(frontendProd, lines.join('\n'), 'utf8');
console.log(`Wrote ${frontendProd}`);

const devLines = [
  '# Lokale Entwicklung — Vite lädt .env.local automatisch',
  '# VITE_API_URL leer = Vite-Proxy auf localhost:3001',
  ...lines.slice(0, 7),
  'VITE_API_URL=',
  '',
];
const frontendLocal = path.join(root, 'frontend', '.env.local');
writeFileSync(frontendLocal, devLines.join('\n'), 'utf8');
console.log(`Wrote ${frontendLocal}`);

const publicUpdates = {
  FIREBASE_PROJECT_ID: cfg.projectId,
  FIREBASE_STORAGE_BUCKET: cfg.storageBucket,
  PUBLIC_FIREBASE_API_KEY: cfg.apiKey,
  PUBLIC_FIREBASE_AUTH_DOMAIN: cfg.authDomain,
  PUBLIC_FIREBASE_PROJECT_ID: cfg.projectId,
  PUBLIC_FIREBASE_STORAGE_BUCKET: cfg.storageBucket,
  PUBLIC_FIREBASE_MESSAGING_SENDER_ID: cfg.messagingSenderId,
  PUBLIC_FIREBASE_APP_ID: cfg.appId,
};

function applyPublicFirebase(filePath, extra = {}) {
  if (!existsSync(filePath)) return false;
  let content = readFileSync(filePath, 'utf8');
  for (const [key, value] of Object.entries({ ...publicUpdates, ...extra })) {
    content = upsertEnv(content, key, value);
  }
  writeFileSync(filePath, content, 'utf8');
  return true;
}

const backendEnv = path.join(root, 'backend', '.env');
if (applyPublicFirebase(backendEnv)) {
  console.log(`Updated ${backendEnv} (public Firebase keys + project/bucket)`);
}

const railwayPath = path.join(root, 'backend', '.env.railway');
const frontendUrls = [
  RAILWAY_FRONTEND,
  `https://${EXPECTED_PROJECT}.web.app`,
  `https://${EXPECTED_PROJECT}.firebaseapp.com`,
]
  .filter(Boolean)
  .join(',');

const railwayExtras = RAILWAY_FRONTEND
  ? { FRONTEND_URL: RAILWAY_FRONTEND, FRONTEND_URLS: frontendUrls }
  : {};

if (applyPublicFirebase(railwayPath, railwayExtras)) {
  if (existsSync(backendEnv)) {
    const local = readFileSync(backendEnv, 'utf8');
    const localProject = envValue(local, 'FIREBASE_PROJECT_ID');
    const clientEmail = envRaw(local, 'FIREBASE_CLIENT_EMAIL');
    const privateKey = envRaw(local, 'FIREBASE_PRIVATE_KEY');
    if (localProject === EXPECTED_PROJECT && clientEmail && privateKey) {
      let railway = readFileSync(railwayPath, 'utf8');
      railway = upsertEnv(railway, 'FIREBASE_CLIENT_EMAIL', clientEmail);
      railway = upsertEnv(railway, 'FIREBASE_PRIVATE_KEY', privateKey);
      writeFileSync(railwayPath, railway, 'utf8');
      console.log(`Updated ${railwayPath} (public Firebase keys + Admin credentials from local .env)`);
    } else {
      console.log(`Updated ${railwayPath} (public Firebase keys + hosting URLs)`);
      console.log('Still required manually: FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY for nexter-creator-studio');
    }
  } else {
    console.log(`Updated ${railwayPath} (public Firebase keys + hosting URLs)`);
    console.log('Still required manually: FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, Stripe, AI keys');
  }
}

console.log('\nNext: npm run build:prod (Railway all-in-one — Firebase Hosting not used)');
console.log('LIVE RAILWAY VARIABLES: unchanged (this script only writes local files)');
