import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UserRole } from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { createProject } from './project.service.js';
import { dsSet } from '../lib/data-store.js';
import { ServiceError } from '../lib/errors.js';
import {
  SIGNED_URL_TTL_MS,
  isOwnedStoragePath,
  signOwnedStoragePath,
} from '../lib/firebase-storage.js';
import {
  saveUserFile,
  getUserFile,
  issueFileDownloadUrl,
  mintDownloadUrlForOwnedFile,
  listUserFilesForClient,
} from './file-cloud.service.js';

process.env.DEV_AUTH_BYPASS = 'true';

const dir = dirname(fileURLToPath(import.meta.url));
const root = join(dir, '../..');
const repoRoot = join(dir, '../../..');

function src(rel: string): string {
  return readFileSync(join(root, rel), 'utf8');
}

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('P1 signed download URLs / private files', () => {
  it('own file download is allowed and time-limited', async () => {
    const user = await getOrCreateUser(`dl-own-${randomUUID()}`, 'own@dl.test', 'Owner', {
      role: UserRole.USER,
    });
    const file = await saveUserFile(user.id, {
      name: 'logo.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const issued = await issueFileDownloadUrl(file.id, user.id);
    assert.ok(issued);
    assert.equal(issued.downloadUrl.startsWith('data:image/png'), true);
    assert.equal(issued.expiresInMs, SIGNED_URL_TTL_MS);
    assert.equal(SIGNED_URL_TTL_MS, 60 * 60 * 1000);
    assert.ok(Date.parse(issued.expiresAt) > Date.now());
    assert.equal(issued.file.storagePath, undefined);
    assert.equal(issued.file.userId, user.id);
  });

  it('foreign file id is blocked and does not invoke the signer', async () => {
    const a = await getOrCreateUser(`dl-a-${randomUUID()}`, 'a@dl.test', 'A');
    const b = await getOrCreateUser(`dl-b-${randomUUID()}`, 'b@dl.test', 'B');
    const fileB = await saveUserFile(b.id, {
      name: 'secret.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    let signed = false;
    const issued = await issueFileDownloadUrl(fileB.id, a.id, async () => {
      signed = true;
      return 'https://signed.example/leaked';
    });
    assert.equal(issued, null);
    assert.equal(await getUserFile(fileB.id, a.id), null);
    assert.equal(signed, false);
  });

  it('unauthenticated file routes require the existing auth middleware', () => {
    const routes = src('src/routes/modules.routes.ts');
    const start = routes.indexOf('function createFileCloudRoutes');
    const end = routes.indexOf('export const filesRoutes');
    const block = routes.slice(start, end);
    assert.match(block, /router\.use\(authenticate/);
    assert.ok(block.indexOf('router.use(authenticate') < block.indexOf("'/:id/download-url'"));
    assert.ok(block.indexOf('router.use(authenticate') < block.indexOf("'/:id'"));
    assert.equal(block.includes('storagePath'), false);
  });

  it('foreign storage path is blocked before any provider sign call', async () => {
    let signed = false;
    await assert.rejects(
      () =>
        signOwnedStoragePath('user-a', 'users/user-b/logo/secret.png', async () => {
          signed = true;
          return 'https://signed.example/nope';
        }),
      (err: unknown) =>
        err instanceof ServiceError && err.statusCode === 403 && err.code === 'FORBIDDEN'
    );
    assert.equal(signed, false);
    assert.equal(isOwnedStoragePath('user-a', 'users/user-a/../user-b/x.png'), false);
    assert.equal(isOwnedStoragePath('user-a', 'users/user-a/logo/ok.png'), true);
  });

  it('tampered storagePath on an owned record is not signed', async () => {
    const a = await getOrCreateUser(`dl-t-${randomUUID()}`, 't@dl.test', 'Tamper');
    const id = randomUUID();
    await dsSet('files', id, {
      id,
      userId: a.id,
      name: 'tampered.png',
      mimeType: 'image/png',
      size: 12,
      category: 'logo',
      storagePath: 'users/someone-else/logo/secret.png',
      downloadUrl: 'https://storage.googleapis.com/bucket/o/users%2Fsomeone-else%2Flogo%2Fsecret.png',
      createdAt: new Date().toISOString(),
    });
    let signed = false;
    const minted = await mintDownloadUrlForOwnedFile(a.id, (await getUserFile(id, a.id))!, async () => {
      signed = true;
      return 'https://signed.example/should-not';
    });
    assert.equal(minted, null);
    assert.equal(signed, false);
  });

  it('invalid file id returns a safe empty result', async () => {
    const user = await getOrCreateUser(`dl-miss-${randomUUID()}`, 'miss@dl.test', 'Miss');
    const issued = await issueFileDownloadUrl(randomUUID(), user.id, async () => {
      throw new Error('signer must not run');
    });
    assert.equal(issued, null);
  });

  it('owned storage path signs only after ownership and is TTL-bound', async () => {
    let signedPath: string | undefined;
    const url = await signOwnedStoragePath(
      'user-a',
      'users/user-a/overlay/frame.png',
      async (path, ttlMs) => {
        signedPath = path;
        assert.equal(ttlMs, SIGNED_URL_TTL_MS);
        return `https://signed.example/${path}?exp=${SIGNED_URL_TTL_MS}`;
      }
    );
    assert.equal(signedPath, 'users/user-a/overlay/frame.png');
    assert.match(url, /signed\.example/);
    assert.ok(url.includes(String(SIGNED_URL_TTL_MS)));
    const storage = src('src/lib/firebase-storage.ts');
    assert.match(storage, /expires: Date\.now\(\) \+ ttlMs/);
    assert.match(storage, /action: 'read'/);
    assert.ok(storage.indexOf('isOwnedStoragePath') < storage.indexOf('return sign('));
  });

  it('foreign project id does not list another user\'s files', async () => {
    const a = await getOrCreateUser(`dl-pa-${randomUUID()}`, 'pa@dl.test', 'PA');
    const b = await getOrCreateUser(`dl-pb-${randomUUID()}`, 'pb@dl.test', 'PB');
    const projectB = await createProject(b.id, { name: 'B Brand', type: 'branding' });
    await saveUserFile(b.id, {
      name: 'b-logo.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      projectId: projectB.id,
    });
    const listed = await listUserFilesForClient(a.id, { projectId: projectB.id });
    assert.equal(listed.some((f) => f.userId === b.id), false);
    assert.equal(listed.length, 0);
  });

  it('storage rules deny public and client reads; download-url is file-id based', () => {
    const rules = repo('storage.rules');
    assert.equal(rules.includes('allow read: if true'), false);
    assert.match(rules, /match \/users\/\{userId\}/);
    const usersStart = rules.indexOf('match /users/{userId}');
    const usersEnd = rules.indexOf('match /projects/');
    const usersBlock = rules.slice(usersStart, usersEnd);
    assert.match(usersBlock, /allow read, write: if false/);

    const routes = src('src/routes/modules.routes.ts');
    assert.match(routes, /issueFileDownloadUrl\(String\(req\.params\.id\), req\.user!\.uid\)/);
    assert.equal(routes.includes('req.body.storagePath'), false);
    assert.equal(routes.includes('req.query.storagePath'), false);
    assert.match(routes, /\/:id\/download-url/);

    const frontend = repo('frontend/src/pages/files/FileCloudPage.tsx');
    assert.match(frontend, /api\.files\.downloadUrl\(id\)/);
    assert.equal(frontend.includes('handleDownload(file.id, file.name, file.downloadUrl)'), false);
  });
});
