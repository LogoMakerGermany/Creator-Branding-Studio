import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '../../..');
const EXPECTED_PROJECT = 'nexter-creator-studio';

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

type IndexDef = {
  collectionGroup: string;
  fields: Array<{ fieldPath: string; order: string }>;
};

function collectionBlock(rules: string, collection: string): string {
  const needle = `match /${collection}/`;
  const start = rules.indexOf(needle);
  assert.ok(start >= 0, `missing rules block for ${collection}`);
  const next = rules.indexOf('match /', start + needle.length);
  return rules.slice(start, next === -1 ? undefined : next);
}

function writesBlocked(block: string): void {
  assert.match(block, /allow (?:create, update, delete|read, write|write): if false/);
  assert.doesNotMatch(block, /allow create: if request\.auth/);
  assert.doesNotMatch(block, /allow read, write: if request\.auth/);
}

function indexKey(idx: IndexDef): string {
  return `${idx.collectionGroup}|${idx.fields.map((f) => `${f.fieldPath}:${f.order}`).join(',')}`;
}

function hasIndex(indexes: IndexDef[], collection: string, fields: Array<[string, string]>): boolean {
  return indexes.some(
    (idx) =>
      idx.collectionGroup === collection &&
      idx.fields.length === fields.length &&
      idx.fields.every((field, i) => field.fieldPath === fields[i]![0] && field.order === fields[i]![1])
  );
}

describe('Firebase rules & index deploy preparation', () => {
  it('deploy target is only nexter-creator-studio and maps local rules/indexes', () => {
    const rc = JSON.parse(repo('.firebaserc')) as { projects?: { default?: string } };
    const firebase = JSON.parse(repo('firebase.json')) as {
      firestore?: { rules?: string; indexes?: string };
      hosting?: unknown;
      functions?: unknown;
    };
    const pkg = JSON.parse(repo('package.json')) as { scripts?: Record<string, string> };
    const planned = pkg.scripts?.['deploy:firebase:firestore'] ?? '';
    assert.equal(rc.projects?.default, EXPECTED_PROJECT);
    assert.equal(firebase.firestore?.rules, 'firestore.rules');
    assert.equal(firebase.firestore?.indexes, 'firestore.indexes.json');
    assert.equal(firebase.hosting, undefined);
    assert.equal(firebase.functions, undefined);
    assert.match(planned, /--only firestore:rules,firestore:indexes/);
    assert.match(planned, /--project nexter-creator-studio/);
    assert.doesNotMatch(planned, /storage/);
    assert.doesNotMatch(planned, /hosting/);
    assert.doesNotMatch(planned, /functions/);
  });

  it('unknown collections are default-deny', () => {
    const rules = repo('firestore.rules');
    const catchAll = rules.slice(rules.lastIndexOf('match /{document=**}'));
    assert.match(catchAll, /allow read, write: if false/);
  });

  it('users, coins, jobs, payments, files, and marketplace mutations are blocked', () => {
    const rules = repo('firestore.rules');
    for (const collection of [
      'users',
      'coin_transactions',
      'generationJobs',
      'mediaJobs',
      'files',
      'processedStripeSessions',
      'processedPayPalOrders',
      'marketplace_items',
    ]) {
      writesBlocked(collectionBlock(rules, collection));
    }
  });

  it('hardened project, DNA, and layout writes stay blocked', () => {
    const rules = repo('firestore.rules');
    for (const collection of ['projects', 'creator_dna', 'layouts']) {
      writesBlocked(collectionBlock(rules, collection));
    }
  });

  it('frontend has no Firestore or Storage client write dependency', () => {
    const frontendSrc = join(repoRoot, 'frontend/src');
    const stack = [frontendSrc];
    const files: string[] = [];
    while (stack.length) {
      const current = stack.pop()!;
      for (const name of readdirSync(current, { withFileTypes: true })) {
        const full = join(current, name.name);
        if (name.isDirectory()) stack.push(full);
        else if (/\.(ts|tsx)$/.test(name.name)) files.push(full);
      }
    }
    const joined = files.map((file) => readFileSync(file, 'utf8')).join('\n');
    assert.doesNotMatch(joined, /firebase\/firestore/);
    assert.doesNotMatch(joined, /firebase\/storage/);
    assert.doesNotMatch(joined, /\baddDoc\b/);
    assert.doesNotMatch(joined, /\bsetDoc\b/);
    assert.doesNotMatch(joined, /\bupdateDoc\b/);
    assert.doesNotMatch(joined, /\bdeleteDoc\b/);
    assert.doesNotMatch(joined, /\bwriteBatch\b/);
    assert.doesNotMatch(joined, /\brunTransaction\b/);
    assert.doesNotMatch(joined, /\buploadBytes\b/);
    assert.match(repo('frontend/src/services/api.ts'), /\/api\/v1\/projects/);
    assert.match(repo('frontend/src/services/api.ts'), /\/api\/v1\/dna/);
    assert.match(repo('frontend/src/services/api.ts'), /\/api\/v1\/layout/);
    assert.match(repo('frontend/src/services/api.ts'), /\/api\/v1\/files/);
  });

  it('storage rules deny client read and write for private prefixes', () => {
    const rules = repo('storage.rules');
    assert.match(rules, /match \/users\/\{userId\}\/\{allPaths=\*\*\}/);
    assert.match(rules, /match \/projects\/\{projectId\}\/\{allPaths=\*\*\}/);
    assert.match(rules, /match \/exports\/\{userId\}\/\{allPaths=\*\*\}/);
    assert.equal((rules.match(/allow read, write: if false/g) ?? []).length >= 3, true);
    assert.doesNotMatch(rules, /allow read, write: if request\.auth/);
    assert.match(repo('backend/src/lib/firebase-storage.ts'), /getSignedUrl/);
    assert.match(repo('backend/src/lib/firebase-storage.ts'), /isOwnedStoragePath/);
  });

  it('local composite indexes cover every productive equality+orderBy query', () => {
    const parsed = JSON.parse(repo('firestore.indexes.json')) as { indexes: IndexDef[] };
    const required: Array<[string, Array<[string, string]>]> = [
      ['creator_dna', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['dna_versions', [['dnaId', 'ASCENDING'], ['version', 'DESCENDING']]],
      ['projects', [['ownerId', 'ASCENDING'], ['updatedAt', 'DESCENDING']]],
      ['coin_transactions', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['files', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['generationJobs', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['mediaJobs', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['videoProjects', [['userId', 'ASCENDING'], ['updatedAt', 'DESCENDING']]],
      ['videoProjects', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['layouts', [['userId', 'ASCENDING'], ['updatedAt', 'DESCENDING']]],
      ['socialPosts', [['userId', 'ASCENDING'], ['updatedAt', 'DESCENDING']]],
      ['socialPosts', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['calendarEvents', [['userId', 'ASCENDING'], ['startAt', 'ASCENDING']]],
      ['testerFeedback', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['changeRequests', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['designVersions', [['jobId', 'ASCENDING'], ['version', 'ASCENDING']]],
      ['nexterQuotes', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['nexterSessions', [['userId', 'ASCENDING'], ['updatedAt', 'DESCENDING']]],
      ['nexterSessions', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['nexterMemory', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['textJobs', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['mockupJobs', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['prompt_sets', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['mobileDevices', [['userId', 'ASCENDING'], ['lastActiveAt', 'DESCENDING']]],
      ['liveStreamSessions', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['magik_ai_logo_context', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['ccd_evolution_proposals', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['ultimate_creator_projects', [['userId', 'ASCENDING'], ['updatedAt', 'DESCENDING']]],
      ['teamMembers', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['teamMembers', [['teamId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['agencyMembers', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['agencyMembers', [['agencyId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['chatChannels', [['ownerId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['chatMessages', [['channelId', 'ASCENDING'], ['createdAt', 'ASCENDING']]],
      ['marketplacePurchases', [['buyerId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['agencyClients', [['agencyId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['agencyClients', [['portalUserId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['clientProjects', [['agencyId', 'ASCENDING'], ['updatedAt', 'DESCENDING']]],
      ['clientProjects', [['clientId', 'ASCENDING'], ['updatedAt', 'DESCENDING']]],
      ['balance_ledger', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['billable_charges', [['userId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['admin_audit_logs', [['targetUserId', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
      ['oauth_identities', [['firebaseUid', 'ASCENDING'], ['createdAt', 'DESCENDING']]],
    ];
    assert.equal(parsed.indexes.length, required.length);
    for (const [collection, fields] of required) {
      assert.equal(
        hasIndex(parsed.indexes, collection, fields),
        true,
        `missing ${collection} ${fields.map((f) => f.join(':')).join(',')}`
      );
    }
  });

  it('has no duplicate indexes and drops unused legacy composites', () => {
    const parsed = JSON.parse(repo('firestore.indexes.json')) as { indexes: IndexDef[] };
    const keys = parsed.indexes.map(indexKey);
    assert.equal(keys.length, new Set(keys).size);
    assert.equal(
      hasIndex(parsed.indexes, 'creator_dna', [['userId', 'ASCENDING'], ['isActive', 'ASCENDING']]),
      false
    );
    assert.equal(
      hasIndex(parsed.indexes, 'projects', [['ownerId', 'ASCENDING'], ['status', 'ASCENDING']]),
      false
    );
    assert.equal(parsed.indexes.some((idx) => idx.collectionGroup === 'marketplace_items'), false);
  });

  it('rules and indexes are git-versioned local artifacts for rollback', () => {
    assert.match(repo('firestore.rules'), /rules_version = '2'/);
    assert.match(repo('firestore.indexes.json'), /"indexes"/);
    assert.match(repo('storage.rules'), /rules_version = '2'/);
    const gitignore = repo('.gitignore');
    assert.doesNotMatch(gitignore, /^firestore\.rules$/m);
    assert.doesNotMatch(gitignore, /^firestore\.indexes\.json$/m);
    assert.doesNotMatch(gitignore, /^storage\.rules$/m);
  });
});
