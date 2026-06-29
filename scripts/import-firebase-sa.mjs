#!/usr/bin/env node
/**
 * Import Firebase Admin credentials from service account JSON into backend/.env.railway
 * Usage: node scripts/import-firebase-sa.mjs [path-to-json]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultSa = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'creatorstudio-519eb-firebase-adminsdk-fbsvc-7b469ebd30.json'
);
const saPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultSa;
const envPath = path.join(root, 'backend', '.env.railway');

if (!existsSync(saPath)) {
  console.error(`Service account JSON not found: ${saPath}`);
  process.exit(1);
}
if (!existsSync(envPath)) {
  console.error(`Missing ${envPath} — copy from backend/.env.railway.example first`);
  process.exit(1);
}

const sa = JSON.parse(readFileSync(saPath, 'utf8'));
let content = readFileSync(envPath, 'utf8');

const updates = {
  FIREBASE_PROJECT_ID: sa.project_id,
  FIREBASE_CLIENT_EMAIL: sa.client_email,
  FIREBASE_PRIVATE_KEY: JSON.stringify(sa.private_key),
  FIREBASE_STORAGE_BUCKET: `${sa.project_id}.firebasestorage.app`,
};

for (const [key, value] of Object.entries(updates)) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  content = re.test(content) ? content.replace(re, `${key}=${value}`) : `${content}\n${key}=${value}`;
}

writeFileSync(envPath, content, 'utf8');

console.log('Imported Firebase Admin credentials into backend/.env.railway');
console.log('  FIREBASE_PROJECT_ID');
console.log('  FIREBASE_CLIENT_EMAIL');
console.log('  FIREBASE_PRIVATE_KEY');
console.log('  FIREBASE_STORAGE_BUCKET');
console.log('\nStill required: STRIPE_*, OPENAI_API_KEY (or REPLICATE_API_TOKEN)');
