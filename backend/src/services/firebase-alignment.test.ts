import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  collectProductionConfigIssues,
  isDevMode,
  normalizeFirebaseStorageBucket,
} from '../config/env.js';

process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(dir, '../..');
const repoRoot = join(dir, '../../..');
const EXPECTED_PROJECT = 'nexter-creator-studio';
const OLD_PROJECT = 'creatorstudio-519eb';

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

function parseEnvProjectIds(file: string): Record<string, string> {
  const text = readFileSync(file, 'utf8');
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i < 0) continue;
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (
      key === 'VITE_FIREBASE_PROJECT_ID' ||
      key === 'PUBLIC_FIREBASE_PROJECT_ID' ||
      key === 'FIREBASE_PROJECT_ID' ||
      key === 'VITE_FIREBASE_AUTH_DOMAIN' ||
      key === 'PUBLIC_FIREBASE_AUTH_DOMAIN' ||
      key === 'VITE_FIREBASE_STORAGE_BUCKET' ||
      key === 'PUBLIC_FIREBASE_STORAGE_BUCKET' ||
      key === 'FIREBASE_STORAGE_BUCKET' ||
      key === 'FIREBASE_CLIENT_EMAIL' ||
      key === 'FRONTEND_URLS' ||
      key === 'DEV_AUTH_BYPASS'
    ) {
      out[key] = value;
    }
  }
  return out;
}

function walkFiles(start: string, skip: Set<string>): string[] {
  const found: string[] = [];
  const stack = [start];
  while (stack.length) {
    const current = stack.pop()!;
    let entries: string[] = [];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (skip.has(name)) continue;
      const full = join(current, name);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) stack.push(full);
      else found.push(full);
    }
  }
  return found;
}

function collectionBlock(rules: string, collection: string): string {
  const needle = `match /${collection}/`;
  const start = rules.indexOf(needle);
  assert.ok(start >= 0, `missing rules block for ${collection}`);
  const next = rules.indexOf('match /', start + needle.length);
  return rules.slice(start, next === -1 ? undefined : next);
}

function hasCompositeIndex(
  indexes: { collectionGroup: string; fields: Array<{ fieldPath: string; order: string }> }[],
  collection: string,
  fields: Array<[string, string]>
): boolean {
  return indexes.some(
    (idx) =>
      idx.collectionGroup === collection &&
      idx.fields.length === fields.length &&
      idx.fields.every((field, i) => field.fieldPath === fields[i]![0] && field.order === fields[i]![1])
  );
}

describe('Firebase alignment — nexter-creator-studio', () => {
  it('CLI default project is nexter-creator-studio', () => {
    const rc = JSON.parse(repo('.firebaserc')) as { projects?: { default?: string } };
    assert.equal(rc.projects?.default, EXPECTED_PROJECT);
    assert.match(repo('firebase.json'), /firestore\.rules/);
    assert.match(repo('scripts/sync-firebase-env.mjs'), /EXPECTED_PROJECT = 'nexter-creator-studio'/);
    assert.match(repo('scripts/sync-firebase-env.mjs'), /--project',\s*EXPECTED_PROJECT/);
  });

  it('tracked and local config contain zero active creatorstudio-519eb references', () => {
    const skip = new Set([
      'node_modules',
      'dist',
      '.git',
      'coverage',
      '.data',
      'agent-transcripts',
    ]);
    const hits: string[] = [];
    for (const file of walkFiles(repoRoot, skip)) {
      let text = '';
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      if (!text.includes(OLD_PROJECT)) continue;
      const rel = relative(repoRoot, file).replaceAll('\\', '/');
      if (rel.endsWith('firebase-alignment.test.ts')) continue;
      hits.push(rel);
    }
    assert.deepEqual(hits, []);
  });

  it('client writes on projects, creator_dna, and layouts are blocked', () => {
    const rules = repo('firestore.rules');
    for (const collection of ['projects', 'creator_dna', 'layouts']) {
      const block = collectionBlock(rules, collection);
      assert.match(block, /allow create, update, delete: if false/);
      assert.doesNotMatch(block, /allow create: if request\.auth/);
      assert.doesNotMatch(block, /allow read, write:/);
      assert.doesNotMatch(block, /allow read, update, delete:/);
    }
  });

  it('local composite indexes cover current Firestore list queries', () => {
    const parsed = JSON.parse(repo('firestore.indexes.json')) as {
      indexes: Array<{ collectionGroup: string; fields: Array<{ fieldPath: string; order: string }> }>;
    };
    const required: Array<[string, Array<[string, string]>]> = [
      ['projects', [['ownerId', 'ASCENDING'], ['updatedAt', 'DESCENDING']]],
      ['socialPosts', [['userId', 'ASCENDING'], ['updatedAt', 'DESCENDING']]],
      ['calendarEvents', [['userId', 'ASCENDING'], ['startAt', 'ASCENDING']]],
      ['testerFeedback', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['changeRequests', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['designVersions', [['jobId', 'ASCENDING'], ['version', 'ASCENDING']]],
      ['nexterSessions', [['userId', 'ASCENDING'], ['updatedAt', 'DESCENDING']]],
      ['nexterQuotes', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
    ];
    for (const [collection, fields] of required) {
      assert.equal(
        hasCompositeIndex(parsed.indexes, collection, fields),
        true,
        `missing index ${collection} ${fields.map((f) => f.join(':')).join(',')}`
      );
    }
  });

  it('storage bucket names drop gs:// before Admin SDK init', () => {
    assert.equal(
      normalizeFirebaseStorageBucket('gs://nexter-creator-studio.firebasestorage.app'),
      'nexter-creator-studio.firebasestorage.app'
    );
    assert.equal(
      normalizeFirebaseStorageBucket('nexter-creator-studio.firebasestorage.app/'),
      'nexter-creator-studio.firebasestorage.app'
    );
    assert.equal(normalizeFirebaseStorageBucket(undefined), undefined);
    assert.match(repo('backend/src/config/firebase.ts'), /storageBucket: creds\.storageBucket/);
    assert.match(
      repo('frontend/src/lib/runtime-config.ts'),
      /\$\{projectId\}\.firebasestorage\.app/
    );
    assert.doesNotMatch(repo('frontend/src/lib/runtime-config.ts'), /\$\{projectId\}\.appspot\.com/);
    assert.doesNotMatch(
      repo('backend/src/config/env.ts'),
      /getPublicFirebaseConfig[\s\S]*\$\{projectId\}\.appspot\.com/
    );
  });

  it('production never falls back to the Dev Store', () => {
    const prevNode = process.env.NODE_ENV;
    const prevBypass = process.env.DEV_AUTH_BYPASS;
    const prevProject = process.env.FIREBASE_PROJECT_ID;
    const prevEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const prevKey = process.env.FIREBASE_PRIVATE_KEY;
    try {
      process.env.NODE_ENV = 'production';
      process.env.DEV_AUTH_BYPASS = 'true';
      delete process.env.FIREBASE_PROJECT_ID;
      delete process.env.FIREBASE_CLIENT_EMAIL;
      delete process.env.FIREBASE_PRIVATE_KEY;
      assert.equal(isDevMode(), false);
      const issues = collectProductionConfigIssues().map((issue) => issue.variable);
      assert.equal(issues.includes('DEV_AUTH_BYPASS'), true);
      assert.match(repo('backend/src/index.ts'), /isProduction\(\) && !isFirebaseReady\(\)/);
      assert.match(repo('backend/src/index.ts'), /process\.exit\(1\)/);
    } finally {
      if (prevNode === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevNode;
      if (prevBypass === undefined) delete process.env.DEV_AUTH_BYPASS;
      else process.env.DEV_AUTH_BYPASS = prevBypass;
      if (prevProject === undefined) delete process.env.FIREBASE_PROJECT_ID;
      else process.env.FIREBASE_PROJECT_ID = prevProject;
      if (prevEmail === undefined) delete process.env.FIREBASE_CLIENT_EMAIL;
      else process.env.FIREBASE_CLIENT_EMAIL = prevEmail;
      if (prevKey === undefined) delete process.env.FIREBASE_PRIVATE_KEY;
      else process.env.FIREBASE_PRIVATE_KEY = prevKey;
    }
  });

  it('local env files point only at nexter-creator-studio when present', () => {
    const files = [
      join(repoRoot, 'frontend/.env.local'),
      join(repoRoot, 'frontend/.env.production'),
      join(backendRoot, '.env'),
      join(backendRoot, '.env.railway'),
    ];
    for (const file of files) {
      if (!existsSync(file)) continue;
      const values = parseEnvProjectIds(file);
      for (const [key, value] of Object.entries(values)) {
        if (key === 'DEV_AUTH_BYPASS') {
          assert.notEqual(value, 'true');
          continue;
        }
        assert.equal(value.includes(OLD_PROJECT), false, `${file} ${key} still references old project`);
        if (
          key === 'VITE_FIREBASE_PROJECT_ID' ||
          key === 'PUBLIC_FIREBASE_PROJECT_ID' ||
          key === 'FIREBASE_PROJECT_ID'
        ) {
          assert.equal(value, EXPECTED_PROJECT);
        }
        if (key === 'FIREBASE_STORAGE_BUCKET' || key === 'PUBLIC_FIREBASE_STORAGE_BUCKET' || key === 'VITE_FIREBASE_STORAGE_BUCKET') {
          assert.equal(value.startsWith('gs://'), false);
          assert.equal(value.startsWith(`${EXPECTED_PROJECT}.`), true);
        }
        if (key === 'FIREBASE_CLIENT_EMAIL') {
          assert.equal(value.endsWith(`@${EXPECTED_PROJECT}.iam.gserviceaccount.com`), true);
        }
      }
    }
  });

  it('production auth domain candidates stay on nexter-creator-studio without a retired UCBS host', () => {
    const retiredHost = 'creatorbrandingstudioultimate-production.up.railway.app';
    const expected = [
      'localhost',
      `${EXPECTED_PROJECT}.firebaseapp.com`,
      `${EXPECTED_PROJECT}.web.app`,
    ];
    const env = repo('backend/src/config/env.ts');
    const railwayExample = repo('backend/.env.railway.example');
    const sync = repo('scripts/sync-firebase-env.mjs');
    const authSetup = repo('docs/ETAPPE3-AUTH-SETUP.md');
    assert.equal(env.includes(retiredHost), false);
    assert.equal(railwayExample.includes(retiredHost), false);
    assert.equal(sync.includes(retiredHost), false);
    assert.equal(authSetup.includes(retiredHost), false);
    assert.doesNotMatch(env, new RegExp(OLD_PROJECT));
    assert.doesNotMatch(railwayExample, new RegExp(OLD_PROJECT));
    assert.doesNotMatch(sync, new RegExp(OLD_PROJECT));
    const action = repo('frontend/src/lib/auth-action-url.ts');
    assert.match(action, /window\.location\.origin/);
    assert.doesNotMatch(action, /localhost:5173/);
    assert.doesNotMatch(action, new RegExp(OLD_PROJECT));
    assert.equal(expected.includes('localhost'), true);
    assert.equal(expected.includes(`${EXPECTED_PROJECT}.firebaseapp.com`), true);
  });
});
