#!/usr/bin/env node
/**
 * Sync Firebase Web SDK config into env files for hosting / Railway deploy.
 * Usage: node scripts/sync-firebase-env.mjs
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const raw = runFirebase(['apps:sdkconfig', 'WEB']);
const jsonMatch = raw.match(/\{[\s\S]*\}/);
if (!jsonMatch) {
  console.error('Could not parse Firebase SDK config');
  process.exit(1);
}

const cfg = JSON.parse(jsonMatch[0]);
const lines = [
  `VITE_FIREBASE_API_KEY=${cfg.apiKey}`,
  `VITE_FIREBASE_AUTH_DOMAIN=${cfg.authDomain}`,
  `VITE_FIREBASE_PROJECT_ID=${cfg.projectId}`,
  `VITE_FIREBASE_STORAGE_BUCKET=${cfg.storageBucket}`,
  `VITE_FIREBASE_MESSAGING_SENDER_ID=${cfg.messagingSenderId}`,
  `VITE_FIREBASE_APP_ID=${cfg.appId}`,
  '',
  'VITE_API_URL=https://creatorbrandingstudioultimate-production.up.railway.app',
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

const railwayPath = path.join(root, 'backend', '.env.railway');
if (existsSync(railwayPath)) {
  let content = readFileSync(railwayPath, 'utf8');
  const updates = {
    FIREBASE_PROJECT_ID: cfg.projectId,
    FIREBASE_STORAGE_BUCKET: cfg.storageBucket,
    PUBLIC_FIREBASE_API_KEY: cfg.apiKey,
    PUBLIC_FIREBASE_AUTH_DOMAIN: cfg.authDomain,
    PUBLIC_FIREBASE_PROJECT_ID: cfg.projectId,
    PUBLIC_FIREBASE_STORAGE_BUCKET: cfg.storageBucket,
    PUBLIC_FIREBASE_MESSAGING_SENDER_ID: cfg.messagingSenderId,
    PUBLIC_FIREBASE_APP_ID: cfg.appId,
    FRONTEND_URL: 'https://creatorbrandingstudioultimate-production.up.railway.app',
    FRONTEND_URLS: 'https://creatorbrandingstudioultimate-production.up.railway.app,https://creatorstudio-519eb.web.app,https://creatorstudio-519eb.firebaseapp.com',
  };

  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(content)) {
      content = content.replace(re, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }
  writeFileSync(railwayPath, content, 'utf8');
  console.log(`Updated ${railwayPath} (public Firebase keys + hosting URLs)`);
  console.log('Still required manually: FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, Stripe, AI keys');
}

console.log('\nNext: npm run build:prod && npx firebase-tools deploy --only hosting');
