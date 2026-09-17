import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGAL_TEXT_STATUS, UserRole } from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { dsGet, dsSet } from '../lib/data-store.js';
import { ServiceError } from '../lib/errors.js';
import { AppError } from '../middleware/errorHandler.js';
import { requireRole } from '../middleware/rbac.js';
import { arePaymentsEnabled, getDefaultFreeCoins } from '../config/env.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import {
  SIGNED_URL_TTL_MS,
  getStorageDeletedPaths,
  isOwnedStoragePath,
  setStorageDeleteTestHooks,
} from '../lib/firebase-storage.js';
import {
  MAX_FEEDBACK_SCREENSHOT_CHARS,
  parseAndValidateFeedbackScreenshot,
} from '../lib/upload-validation.js';
import {
  FILE_DELETE_INCOMPLETE_MESSAGE,
  deleteUserFile,
  getUserFile,
  getUserStorageUsage,
  issueFileDownloadUrl,
  listUserFiles,
  mintDownloadUrlForOwnedFile,
  saveGeneratedAsset,
  saveGeneratedAudioFile,
  saveUserFile,
  setSaveGeneratedAssetTestHooks,
  sanitizeFileDisplayName,
  toClientFile,
} from './file-cloud.service.js';
import {
  issueFeedbackScreenshotUrl,
  setFeedbackScreenshotTestHooks,
  submitFeedback,
  toSafeFeedback,
  validateFeedbackScreenshot,
} from './feedback.service.js';
import { getLegalPage } from './legal.service.js';
import { assertValidFirestoreDocumentId } from '../lib/firestore-payload.js';

process.env.NODE_TEST = '1';
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
const JPEG = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64')}`;
const webpBuf = Buffer.alloc(12);
webpBuf.write('RIFF', 0);
webpBuf.writeUInt32LE(4, 4);
webpBuf.write('WEBP', 8);
const WEBP = `data:image/webp;base64,${webpBuf.toString('base64')}`;
const HTML_AS_PNG = `data:image/png;base64,${Buffer.from('<html><script>alert(1)</script></html>').toString('base64')}`;
const SVG_AS_PNG = `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>').toString('base64')}`;
const webmHeader = Buffer.alloc(48);
webmHeader[0] = 0x1a;
webmHeader[1] = 0x45;
webmHeader[2] = 0xdf;
webmHeader[3] = 0xa3;
const VIDEO = `data:video/webm;base64,${webmHeader.toString('base64')}`;

afterEach(() => {
  setStorageDeleteTestHooks(null);
  setSaveGeneratedAssetTestHooks(null);
  setFeedbackScreenshotTestHooks(null);
});

async function user(tag: string) {
  return getOrCreateUser(randomUUID(), `${randomUUID()}@${tag}.fs-g.test`, tag);
}

describe('Block G — storage lifecycle, delete, ownership', () => {
  it('own upload has owner metadata; foreign download and delete are denied', async () => {
    const a = await user('own');
    const b = await user('foreign');
    const file = await saveUserFile(a.id, {
      name: 'mine.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    assert.equal(file.userId, a.id);
    assert.equal(file.source, 'upload');
    assert.match(file.storagePath || '', new RegExp(`^users/${a.id}/logo/`));
    assert.ok(await getUserFile(file.id, a.id));
    assert.equal(await getUserFile(file.id, b.id), null);
    assert.equal(await issueFileDownloadUrl(file.id, b.id), null);
    assert.equal(await deleteUserFile(file.id, b.id), false);
    assert.ok(await getUserFile(file.id, a.id));
    const issued = await issueFileDownloadUrl(file.id, a.id);
    assert.ok(issued);
    assert.equal(issued.expiresInMs, SIGNED_URL_TTL_MS);
    assert.equal(issued.expiresInMs <= 60 * 60 * 1000, true);
    assert.equal(toClientFile(file).storagePath, undefined);
  });

  it('deleted file cannot mint a signed URL; duplicate delete is idempotent', async () => {
    setStorageDeleteTestHooks({});
    const owner = await user('del');
    const file = await saveUserFile(owner.id, {
      name: 'gone.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    assert.equal(await deleteUserFile(file.id, owner.id), true);
    assert.ok(getStorageDeletedPaths().some((p) => p.includes(file.id) || p.startsWith(`users/${owner.id}/`)));
    assert.equal(await getUserFile(file.id, owner.id), null);
    assert.equal(await issueFileDownloadUrl(file.id, owner.id), null);
    assert.equal(await mintDownloadUrlForOwnedFile(owner.id, { ...file, deletedAt: new Date().toISOString() }), null);
    assert.equal(await deleteUserFile(file.id, owner.id), true);
    const stored = await dsGet('files', file.id);
    assert.equal(stored?.deletionState, 'deleted');
  });

  it('rejects client-controlled and traversal storage paths', () => {
    const uid = 'user-a';
    assert.equal(isOwnedStoragePath(uid, 'users/user-b/logo/x.png'), false);
    assert.equal(isOwnedStoragePath(uid, 'users/user-a/../user-b/x.png'), false);
    assert.equal(isOwnedStoragePath(uid, '/users/user-a/logo/x.png'), false);
    assert.equal(isOwnedStoragePath(uid, 'gs://bucket/users/user-a/x.png'), false);
    assert.equal(isOwnedStoragePath(uid, 'https://storage.googleapis.com/x'), false);
    assert.equal(isOwnedStoragePath(uid, 'users/user-a/logo/%2e%2e/x.png'), false);
    assert.equal(isOwnedStoragePath(uid, 'users/user-a/logo/ok.png'), true);
    const routes = src('src/routes/modules.routes.ts');
    const start = routes.indexOf('function createFileCloudRoutes');
    const block = routes.slice(start, routes.indexOf('export const filesRoutes'));
    assert.equal(block.includes('storagePath'), false);
    assert.equal(sanitizeFileDisplayName('ok.png'), 'ok.png');
    assert.equal(sanitizeFileDisplayName('../etc/passwd'), 'passwd');
    assert.throws(() => sanitizeFileDisplayName('..'), /ungültig|leer/i);
  });

  it('storage delete failure is not reported as success and stays recoverable', async () => {
    setStorageDeleteTestHooks({ failDelete: true });
    const owner = await user('fail-del');
    const file = await saveUserFile(owner.id, {
      name: 'stuck.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    await assert.rejects(
      () => deleteUserFile(file.id, owner.id),
      (err: unknown) =>
        err instanceof ServiceError &&
        err.statusCode === 503 &&
        err.code === 'DELETE_INCOMPLETE' &&
        err.message === FILE_DELETE_INCOMPLETE_MESSAGE &&
        !err.message.includes('GCS') &&
        !err.message.includes('gs://')
    );
    assert.equal(await getUserFile(file.id, owner.id), null);
    const stuck = await dsGet('files', file.id);
    assert.equal(stuck?.deletionState, 'delete_failed');
    setStorageDeleteTestHooks({});
    assert.equal(await deleteUserFile(file.id, owner.id), true);
    assert.equal((await dsGet('files', file.id))?.deletionState, 'deleted');
  });

  it('missing object delete completes; metadata-without-object download is unavailable', async () => {
    setStorageDeleteTestHooks({ missingObject: true });
    const owner = await user('missing');
    const id = randomUUID();
    await dsSet('files', id, {
      id,
      userId: owner.id,
      name: 'ghost.png',
      mimeType: 'image/png',
      size: 12,
      category: 'logo',
      storagePath: `users/${owner.id}/logo/${id}.png`,
      source: 'upload',
      createdAt: new Date().toISOString(),
    });
    await assert.rejects(
      () => issueFileDownloadUrl(id, owner.id),
      (err: unknown) => err instanceof ServiceError && err.statusCode === 410 && err.code === 'FILE_MISSING'
    );
    setStorageDeleteTestHooks({});
    assert.equal(await deleteUserFile(id, owner.id), true);
    assert.equal((await dsGet('files', id))?.deletionState, 'deleted');
  });

  it('upload then metadata failure attempts exact-object cleanup', async () => {
    setStorageDeleteTestHooks({});
    setSaveGeneratedAssetTestHooks({ failAfterUpload: true });
    const owner = await user('orphan');
    await assert.rejects(() =>
      saveUserFile(owner.id, {
        name: 'orphan.png',
        mimeType: 'image/png',
        category: 'logo',
        dataUrl: PIXEL,
      })
    );
    const deleted = getStorageDeletedPaths();
    assert.equal(deleted.length >= 1, true);
    assert.equal(deleted.every((p) => p.startsWith(`users/${owner.id}/`)), true);
    assert.equal((await listUserFiles(owner.id)).length, 0);
  });
});

describe('Block G — generated assets, quota, feedback screenshots', () => {
  it('generated image/video/music have owners and measurable usage without NaN', async () => {
    const owner = await user('gen');
    const image = await saveGeneratedAsset(owner.id, 'logo', PIXEL, { name: 'gen-logo.png' });
    assert.ok(image);
    assert.equal(image?.userId, owner.id);
    assert.equal(image?.source, 'generation');
    const video = await saveUserFile(owner.id, {
      name: 'clip.webm',
      mimeType: 'video/webm',
      category: 'video',
      dataUrl: VIDEO,
      source: 'generation',
    });
    assert.equal(video.userId, owner.id);
    const audio = await saveGeneratedAudioFile(owner.id, {
      name: 'track.mp3',
      mimeType: 'audio/mpeg',
      buffer: Buffer.from([0x49, 0x44, 0x33, 0x04]),
    });
    assert.equal(audio.userId, owner.id);
    const usage = await getUserStorageUsage(owner.id);
    assert.equal(Number.isFinite(usage.totalBytes), true);
    assert.equal(Number.isFinite(usage.generatedBytes), true);
    assert.equal(usage.totalBytes >= 0, true);
    assert.equal(usage.generatedCount >= 2, true);
  });

  it('accepts PNG/JPEG/WebP screenshots and rejects HTML, SVG, and oversize', async () => {
    parseAndValidateFeedbackScreenshot(PIXEL);
    parseAndValidateFeedbackScreenshot(JPEG);
    parseAndValidateFeedbackScreenshot(WEBP);
    assert.throws(() => parseAndValidateFeedbackScreenshot(HTML_AS_PNG), /gültiges Bild|Bild/);
    assert.throws(() => parseAndValidateFeedbackScreenshot(SVG_AS_PNG), /gültiges Bild|Bild/);
    assert.throws(
      () => validateFeedbackScreenshot('data:image/svg+xml;base64,PHN2Zy8+'),
      /Bild/
    );
    assert.throws(
      () => validateFeedbackScreenshot(`data:image/png;base64,${'A'.repeat(MAX_FEEDBACK_SCREENSHOT_CHARS)}`),
      /zu groß/
    );
  });

  it('stores screenshot path server-side, ties it to user+feedback, and isolates access', async () => {
    setStorageDeleteTestHooks({});
    const a = await user('shot-a');
    const b = await user('shot-b');
    const row = await submitFeedback(a.id, {
      message: 'Screenshot nur für den Absender und Admin.',
      screenshotDataUrl: PIXEL,
    });
    assert.ok(row.screenshotStoragePath);
    assert.match(row.screenshotStoragePath || '', new RegExp(`^users/${a.id}/feedback/${row.id}/`));
    assert.equal(row.screenshotDataUrl, undefined);
    const safe = toSafeFeedback(row);
    assert.equal(safe.hasScreenshot, true);
    assert.equal('screenshotStoragePath' in safe, false);
    assert.equal('screenshotDataUrl' in safe, false);
    const own = await issueFeedbackScreenshotUrl(row.id, a.id, false);
    assert.equal(own.expiresInMs, SIGNED_URL_TTL_MS);
    await assert.rejects(
      () => issueFeedbackScreenshotUrl(row.id, b.id, false),
      (err: unknown) => err instanceof ServiceError && err.statusCode === 404
    );
    const adminIssued = await issueFeedbackScreenshotUrl(row.id, b.id, true);
    assert.ok(adminIssued.downloadUrl);
    const mw = requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN);
    assert.throws(
      () => mw({ user: { uid: b.id, role: UserRole.USER } } as never, {} as never, () => undefined),
      (err: unknown) => err instanceof AppError && err.statusCode === 403
    );
    const adminSrc = src('src/routes/admin.routes.ts');
    assert.match(adminSrc, /feedback\/:id\/screenshot/);
    assert.match(src('src/routes/feedback.routes.ts'), /:id\/screenshot/);
  });

  it('screenshot storage+DB failure does not leave orphans or false success', async () => {
    setStorageDeleteTestHooks({});
    const owner = await user('shot-fail');
    setFeedbackScreenshotTestHooks({ failMetadata: true });
    await assert.rejects(() =>
      submitFeedback(owner.id, {
        message: 'Metadaten dürfen nach Upload nicht hängen bleiben.',
        screenshotDataUrl: PIXEL,
      })
    );
    assert.equal(getStorageDeletedPaths().some((p) => p.includes(`/feedback/`)), true);
    setFeedbackScreenshotTestHooks({ failStorage: true });
    await assert.rejects(() =>
      submitFeedback(owner.id, {
        message: 'Speicherfehler darf keinen Anhang vortäuschen.',
        screenshotDataUrl: PIXEL,
      })
    );
  });

  it('preserves pricing, legal draft, oauth/email id shapes, and storage rules', () => {
    assert.equal(getDefaultFreeCoins(), 50);
    assert.equal(arePaymentsEnabled(), false);
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(LEGAL_TEXT_STATUS, 'draft');
    assert.equal(getLegalPage('impressum')?.draft, true);
    assert.doesNotThrow(() => assertValidFirestoreDocumentId('welcome:uid-1'));
    const rules = repo('storage.rules');
    assert.match(rules, /allow read, write: if false/);
    assert.equal(rules.includes('allow read, write: if true'), false);
    const cloud = src('src/services/file-cloud.service.ts');
    assert.match(cloud, /deleteOwnedStorageObject/);
    assert.match(cloud, /deletionState/);
    const feedback = src('src/services/feedback.service.ts');
    assert.doesNotMatch(feedback, /dispatchTransactionalEmail|resend/);
  });
});
