#!/usr/bin/env node
/**
 * Scannt das Repository auf versehentlich committete Secrets.
 * CI: npm run check:secrets
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(import.meta.dirname, '..');
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.vite', 'data']);
const IGNORE_FILES = new Set(['check-secrets.mjs', 'SECRETS_AUDIT.md']);

const PATTERNS = [
  { name: 'OpenAI Secret Key', regex: /sk-proj-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI API Key', regex: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'Replicate Token', regex: /r8_[A-Za-z0-9]{20,}/ },
  { name: 'Stripe Webhook Secret', regex: /whsec_[A-Za-z0-9]{20,}/ },
  { name: 'Stripe Secret Key', regex: /sk_(live|test)_[A-Za-z0-9]{20,}/ },
  { name: 'Firebase Private Key', regex: /-----BEGIN PRIVATE KEY-----/ },
  { name: 'Google API Key', regex: /AIza[A-Za-z0-9_-]{30,}/ },
  { name: 'Runway Key', regex: /key_[a-f0-9]{40,}/ },
];

const findings = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(ROOT, full);
    if (IGNORE_DIRS.has(entry)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    if (IGNORE_FILES.has(entry)) continue;
    if (rel === '.env' || rel.endsWith('.env.local')) continue;
    if (/\.(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|eot|mp4|webm|zip)$/i.test(entry)) continue;

    let content;
    try {
      content = readFileSync(full, 'utf8');
    } catch {
      continue;
    }

    for (const { name, regex } of PATTERNS) {
      if (regex.test(content)) {
        // Platzhalter in .env.example ohne Werte sind OK
        if (rel.endsWith('.env.example') && !content.match(/=(sk-|r8_|whsec_|AIza|key_|-----BEGIN)/)) {
          continue;
        }
        findings.push({ file: rel, type: name });
      }
    }
  }
}

walk(ROOT);

if (findings.length === 0) {
  console.log('✓ Keine Secrets im Repository gefunden.');
  process.exit(0);
}

console.error('✗ Secrets im Repository gefunden:');
for (const f of findings) {
  console.error(`  - ${f.type} in ${f.file}`);
}
console.error('\nAlle Keys rotieren und Dateien bereinigen.');
process.exit(1);
