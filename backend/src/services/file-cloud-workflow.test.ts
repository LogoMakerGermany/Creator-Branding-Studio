import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { UserRole } from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { createProject } from './project.service.js';
import { attachAssetToProject } from './project-assets.service.js';
import { exportProjectZip } from './project-export.service.js';
import { dsSet } from '../lib/data-store.js';
import { ServiceError } from '../lib/errors.js';
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import { SIGNED_URL_TTL_MS, signOwnedStoragePath } from '../lib/firebase-storage.js';
import { sanitizeZipEntryName } from '../lib/zip-store.js';
import {
  parseAndValidateDataUrl,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_UPLOAD_BYTES,
  MAX_FILES_PER_USER,
} from '../lib/upload-validation.js';
import { nexterChat } from './nexter/conversation.service.js';
import { detectFileCloudIntent, detectQuoteKind } from './nexter/tools.service.js';
import { assertOwnedMockupSource } from './mockup.service.js';
import {
  saveUserFile,
  saveGeneratedAsset,
  listUserFiles,
  listUserFilesForClient,
  queryUserFilesForClient,
  getUserFile,
  getRecentUserFiles,
  issueFileDownloadUrl,
  mintDownloadUrlForOwnedFile,
  updateUserFile,
  deleteUserFile,
  findFileReferences,
  toClientFile,
  getFileRelations,
  sanitizeFileDisplayName,
} from './file-cloud.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

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
const AUDIO = 'data:audio/mpeg;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAABhgA=';
const webmHeader = Buffer.alloc(48);
webmHeader[0] = 0x1a;
webmHeader[1] = 0x45;
webmHeader[2] = 0xdf;
webmHeader[3] = 0xa3;
const VIDEO = `data:video/webm;base64,${webmHeader.toString('base64')}`;

async function seed(prefix: string) {
  const user = await getOrCreateUser(`${prefix}-${randomUUID()}`, `${randomUUID()}@files.test`, prefix, {
    role: UserRole.USER,
  });
  const project = await createProject(user.id, { name: `${prefix} Brand`, type: 'branding' });
  return { user, project };
}

describe('file cloud local closure — list, ownership, isolation', () => {
  it('lists only own persisted files with metadata', async () => {
    const { user, project } = await seed('list');
    const file = await saveUserFile(user.id, {
      name: 'nightwolf-logo.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      projectId: project.id,
      version: 2,
    });
    const listed = await listUserFiles(user.id);
    assert.equal(listed.some((f) => f.id === file.id), true);
    const own = listed.find((f) => f.id === file.id)!;
    assert.equal(own.name, 'nightwolf-logo.png');
    assert.equal(own.category, 'logo');
    assert.equal(own.projectId, project.id);
    assert.equal(own.version, 2);
    assert.ok(own.size > 0);
    assert.ok(own.createdAt);
    const client = await listUserFilesForClient(user.id);
    assert.equal(client.find((f) => f.id === file.id)?.storagePath, undefined);
  });

  it('does not list a foreign user file', async () => {
    const a = await seed('list-a');
    const b = await seed('list-b');
    const secret = await saveUserFile(b.user.id, {
      name: 'secret-b.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const listed = await listUserFiles(a.user.id);
    assert.equal(listed.some((f) => f.id === secret.id || f.userId === b.user.id), false);
    const page = await queryUserFilesForClient(a.user.id, { q: 'secret-b' });
    assert.equal(page.files.length, 0);
  });

  it('returns own file details and strips storagePath', async () => {
    const { user } = await seed('detail');
    const file = await saveUserFile(user.id, {
      name: 'banner.png',
      mimeType: 'image/png',
      category: 'banner',
      dataUrl: PIXEL,
    });
    const got = await getUserFile(file.id, user.id);
    assert.ok(got);
    assert.equal(got?.mimeType, 'image/png');
    const issued = await issueFileDownloadUrl(file.id, user.id);
    assert.ok(issued);
    assert.equal(issued.file.storagePath, undefined);
    assert.equal(issued.file.name, 'banner.png');
    assert.equal(toClientFile(file).storagePath, undefined);
  });

  it('blocks foreign file details', async () => {
    const a = await seed('det-a');
    const b = await seed('det-b');
    const file = await saveUserFile(b.user.id, {
      name: 'b-only.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    assert.equal(await getUserFile(file.id, a.user.id), null);
  });
});

describe('file cloud local closure — signed preview and download', () => {
  it('issues a secure preview URL for an owned file', async () => {
    const { user } = await seed('prev');
    const file = await saveUserFile(user.id, {
      name: 'preview.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const issued = await issueFileDownloadUrl(file.id, user.id);
    assert.ok(issued?.downloadUrl.startsWith('data:image/png'));
    assert.equal(issued?.expiresInMs, SIGNED_URL_TTL_MS);
  });

  it('blocks foreign preview and does not invoke the signer', async () => {
    const a = await seed('prev-a');
    const b = await seed('prev-b');
    const file = await saveUserFile(b.user.id, {
      name: 'nope.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    let signed = false;
    const issued = await issueFileDownloadUrl(file.id, a.user.id, async () => {
      signed = true;
      return 'https://signed.example/leak';
    });
    assert.equal(issued, null);
    assert.equal(signed, false);
  });

  it('issues a secure download for an owned file', async () => {
    const { user } = await seed('dl');
    const file = await saveUserFile(user.id, {
      name: 'dl.png',
      mimeType: 'image/png',
      category: 'sticker',
      dataUrl: PIXEL,
    });
    const issued = await issueFileDownloadUrl(file.id, user.id);
    assert.ok(issued);
    assert.ok(Date.parse(issued.expiresAt) > Date.now());
  });

  it('blocks foreign download', async () => {
    const a = await seed('dl-a');
    const b = await seed('dl-b');
    const file = await saveUserFile(b.user.id, {
      name: 'foreign.png',
      mimeType: 'image/png',
      category: 'overlay',
      dataUrl: PIXEL,
    });
    assert.equal(await issueFileDownloadUrl(file.id, a.user.id), null);
  });

  it('blocks arbitrary storagePath signing', async () => {
    let signed = false;
    await assert.rejects(
      () =>
        signOwnedStoragePath('user-a', 'users/user-b/logo/x.png', async () => {
          signed = true;
          return 'nope';
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'FORBIDDEN'
    );
    assert.equal(signed, false);
    const routes = src('src/routes/modules.routes.ts');
    const start = routes.indexOf('function createFileCloudRoutes');
    const end = routes.indexOf('export const filesRoutes');
    assert.equal(routes.slice(start, end).includes('storagePath'), false);
  });

  it('signs a URL only after ownership is verified', async () => {
    let signedPath = '';
    const url = await signOwnedStoragePath('u1', 'users/u1/logo/a.png', async (path) => {
      signedPath = path;
      return `https://signed.example/${path}`;
    });
    assert.equal(signedPath, 'users/u1/logo/a.png');
    assert.match(url, /signed\.example/);
  });

  it('renews a signed URL via file id', async () => {
    const { user } = await seed('renew');
    const file = await saveUserFile(user.id, {
      name: 'renew.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const first = await issueFileDownloadUrl(file.id, user.id);
    const second = await issueFileDownloadUrl(file.id, user.id);
    assert.ok(first && second);
    assert.equal(first.expiresInMs, SIGNED_URL_TTL_MS);
    assert.equal(second.expiresInMs, SIGNED_URL_TTL_MS);
    assert.ok(Date.parse(second.expiresAt) >= Date.parse(first.expiresAt));
  });

  it('returns FILE_MISSING when the storage object cannot be resolved', async () => {
    const { user } = await seed('miss');
    const id = randomUUID();
    await dsSet('files', id, {
      id,
      userId: user.id,
      name: 'gone.png',
      mimeType: 'image/png',
      size: 12,
      category: 'logo',
      downloadUrl: 'https://cdn.example/missing-object.png',
      createdAt: new Date().toISOString(),
    });
    await assert.rejects(
      () => issueFileDownloadUrl(id, user.id, async () => 'https://signed.example/should-not'),
      (err: unknown) => err instanceof ServiceError && err.statusCode === 410 && err.code === 'FILE_MISSING'
    );
    const page = await queryUserFilesForClient(user.id);
    const row = page.files.find((f) => f.id === id);
    assert.equal(row?.available, false);
  });

  it('denies ownerless records by default', async () => {
    const { user } = await seed('orphan');
    const id = randomUUID();
    await dsSet('files', id, {
      id,
      name: 'no-owner.png',
      mimeType: 'image/png',
      size: 8,
      category: 'logo',
      downloadUrl: PIXEL,
      createdAt: new Date().toISOString(),
    });
    let signed = false;
    assert.equal(await getUserFile(id, user.id), null);
    assert.equal(
      await issueFileDownloadUrl(id, user.id, async () => {
        signed = true;
        return 'leak';
      }),
      null
    );
    assert.equal(signed, false);
    assert.equal((await listUserFiles(user.id)).some((f) => f.id === id), false);
  });
});

describe('file cloud local closure — names, upload, validation', () => {
  it('uses the existing sanitizer for safe download names', () => {
    assert.equal(sanitizeZipEntryName('logo.png'), 'logo.png');
    assert.match(src('src/services/file-cloud.service.ts'), /sanitizeZipEntryName/);
  });

  it('sanitizes path-traversal filenames', async () => {
    const { user } = await seed('trav');
    const file = await saveUserFile(user.id, {
      name: '..\\..\\etc\\passwd\0.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    assert.equal(file.name.includes('..'), false);
    assert.equal(file.name.includes('\\'), false);
    assert.equal(file.name.includes('\0'), false);
    assert.equal(sanitizeZipEntryName('../../etc/passwd'), 'passwd');
  });

  it('uploads an owned file server-side', async () => {
    const { user } = await seed('up');
    const file = await saveUserFile(user.id, {
      name: 'upload.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      source: 'upload',
    });
    assert.equal(file.userId, user.id);
    assert.equal(file.source, 'upload');
    assert.ok(await getUserFile(file.id, user.id));
  });

  it('renames an owned file and blocks empty or foreign rename', async () => {
    const a = await seed('ren-a');
    const b = await seed('ren-b');
    const file = await saveUserFile(a.user.id, {
      name: 'old-name.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const renamed = await updateUserFile(file.id, a.user.id, { name: '  Night Wolf.png  ' });
    assert.equal(renamed.name.includes('Night'), true);
    assert.equal(renamed.name.includes('..'), false);
    const unicode = await updateUserFile(file.id, a.user.id, { name: 'Äpfel Logo.png' });
    assert.equal(unicode.name, 'Äpfel Logo.png');
    assert.equal(sanitizeFileDisplayName('../secret.png'), 'secret.png');
    await assert.rejects(() => updateUserFile(file.id, a.user.id, { name: '   ' }), (err: unknown) => {
      return err instanceof ServiceError && err.code === 'INVALID_NAME';
    });
    await assert.rejects(() => updateUserFile(file.id, b.user.id, { name: 'hacked.png' }), (err: unknown) => {
      return err instanceof ServiceError && err.code === 'NOT_FOUND';
    });
    assert.equal((await getUserFile(file.id, a.user.id))?.name, unicode.name);
  });

  it('blocks invalid MIME types', async () => {
    await assert.rejects(
      async () => parseAndValidateDataUrl('data:application/x-msdownload;base64,AAAA'),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_UPLOAD'
    );
    const { user } = await seed('mime');
    await assert.rejects(
      async () =>
        saveUserFile(user.id, {
          name: 'payload.exe',
          mimeType: 'application/x-msdownload',
          category: 'other',
          dataUrl: 'data:application/x-msdownload;base64,AAAA',
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_UPLOAD'
    );
  });

  it('blocks oversized uploads', async () => {
    const b64 = 'A'.repeat(Math.ceil(((MAX_UPLOAD_BYTES + 64) * 4) / 3));
    await assert.rejects(
      async () => parseAndValidateDataUrl(`data:image/png;base64,${b64}`),
      (err: unknown) => err instanceof ServiceError && err.statusCode === 413 && err.code === 'FILE_TOO_LARGE'
    );
    assert.equal(MAX_UPLOAD_BYTES, 5 * 1024 * 1024);
    assert.equal(MAX_VIDEO_UPLOAD_BYTES, 50 * 1024 * 1024);
    assert.equal(MAX_FILES_PER_USER, 100);
  });

  it('blocks empty uploads', async () => {
    await assert.rejects(
      async () => parseAndValidateDataUrl('data:image/png;base64,'),
      (err: unknown) => err instanceof ServiceError && err.code === 'EMPTY_UPLOAD'
    );
  });
});

describe('file cloud local closure — projects, assets, studios, nexter', () => {
  it('assigns an owned file to an owned project', async () => {
    const { user, project } = await seed('asg');
    const file = await saveUserFile(user.id, {
      name: 'assign.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const updated = await updateUserFile(file.id, user.id, { projectId: project.id });
    assert.equal(updated.projectId, project.id);
    assert.equal((await listUserFiles(user.id, { projectId: project.id })).some((f) => f.id === file.id), true);
  });

  it('blocks assignment to a foreign project', async () => {
    const a = await seed('asg-a');
    const b = await seed('asg-b');
    const file = await saveUserFile(a.user.id, {
      name: 'mine.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    await assert.rejects(
      () => updateUserFile(file.id, a.user.id, { projectId: b.project.id }),
      (err: unknown) => err instanceof ServiceError && err.code === 'NOT_FOUND'
    );
  });

  it('attaches an owned ProjectAsset by file id without copying bytes', async () => {
    const { user, project } = await seed('pa');
    const file = await saveUserFile(user.id, {
      name: 'pa.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const first = await attachAssetToProject(user.id, project.id, {
      name: file.name,
      type: file.category,
      url: file.downloadUrl || PIXEL,
      fileId: file.id,
      sourceType: 'file',
    });
    const second = await attachAssetToProject(user.id, project.id, {
      name: file.name,
      type: file.category,
      url: file.downloadUrl || PIXEL,
      fileId: file.id,
      sourceType: 'file',
    });
    assert.ok(first);
    assert.equal(second?.id, first?.id);
  });

  it('unlinks a file from a project without deleting it', async () => {
    const { user, project } = await seed('unlink');
    const file = await saveUserFile(user.id, {
      name: 'linked-keep.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    await attachAssetToProject(user.id, project.id, {
      name: file.name,
      type: file.category,
      url: file.downloadUrl || PIXEL,
      fileId: file.id,
      sourceType: 'file',
    });
    await updateUserFile(file.id, user.id, { projectId: project.id });
    assert.equal((await listUserFiles(user.id, { projectId: project.id })).some((f) => f.id === file.id), true);
    await updateUserFile(file.id, user.id, { projectId: null });
    assert.ok(await getUserFile(file.id, user.id));
    assert.equal((await listUserFiles(user.id, { projectId: project.id })).some((f) => f.id === file.id), false);
    assert.equal((await listUserFiles(user.id)).some((f) => f.id === file.id), true);
  });

  it('blocks a foreign ProjectAsset attach', async () => {
    const a = await seed('pa-a');
    const b = await seed('pa-b');
    const file = await saveUserFile(a.user.id, {
      name: 'a.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const attached = await attachAssetToProject(a.user.id, b.project.id, {
      name: file.name,
      type: file.category,
      url: file.downloadUrl || PIXEL,
      fileId: file.id,
      sourceType: 'file',
    });
    assert.equal(attached, null);
  });

  it('looks up recent own assets by createdAt', async () => {
    const { user } = await seed('recent');
    await saveUserFile(user.id, {
      name: 'old.png',
      mimeType: 'image/png',
      category: 'banner',
      dataUrl: PIXEL,
    });
    const latest = await saveUserFile(user.id, {
      name: 'newest-logo.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const recent = await getRecentUserFiles(user.id, { limit: 5 });
    assert.equal(recent[0]?.id, latest.id);
    const logos = await getRecentUserFiles(user.id, { category: 'logo', limit: 1 });
    assert.equal(logos[0]?.id, latest.id);
  });

  it('lets Nexter list own recent files', async () => {
    const { user } = await seed('nx-own');
    await saveUserFile(user.id, {
      name: 'nexter-own.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const session = await nexterChat(user.id, 'Zeig mir meine letzten Dateien.');
    const last = session.messages.at(-1)?.content || '';
    assert.match(last, /nexter-own\.png/);
    assert.match(last, /eigenen Dateien|letzten eigenen/);
    assert.equal(detectQuoteKind('Zeig mir meine letzten Dateien.'), null);
  });

  it('does not let Nexter surface a foreign file', async () => {
    const a = await seed('nx-a');
    const b = await seed('nx-b');
    await saveUserFile(b.user.id, {
      name: 'foreign-secret-logo.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const session = await nexterChat(a.user.id, 'Zeig mir meine letzten Dateien.');
    const last = session.messages.at(-1)?.content || '';
    assert.equal(last.includes('foreign-secret-logo.png'), false);
  });

  it('asks a follow-up when several own logos are ambiguous', async () => {
    const { user } = await seed('nx-amb');
    await saveUserFile(user.id, { name: 'logo-a.png', mimeType: 'image/png', category: 'logo', dataUrl: PIXEL });
    await saveUserFile(user.id, { name: 'logo-b.png', mimeType: 'image/png', category: 'logo', dataUrl: PIXEL });
    await saveUserFile(user.id, { name: 'logo-c.png', mimeType: 'image/png', category: 'logo', dataUrl: PIXEL });
    assert.equal(detectFileCloudIntent('Nimm ein Logo für ein Mockup.'), true);
    assert.equal(detectQuoteKind('Nimm ein Logo für ein Mockup.'), null);
    const session = await nexterChat(user.id, 'Nimm ein Logo für ein Mockup.');
    const last = session.messages.at(-1)?.content || '';
    assert.match(last, /3 eigene Logos/);
    assert.match(last, /Welches/);
    const pickLast = await nexterChat(user.id, 'Nimm mein letztes Logo für ein Mockup.');
    const picked = pickLast.messages.at(-1)?.content || '';
    assert.match(picked, /letztes eigenes Logo/);
    assert.equal(detectQuoteKind('Nimm mein letztes Logo für ein Mockup.'), null);
    assert.equal(picked.includes('quote_generation'), false);
  });

  it('uses an owned file as a studio source and blocks a foreign one', async () => {
    const a = await seed('src-a');
    const b = await seed('src-b');
    const owned = await saveUserFile(a.user.id, {
      name: 'src.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const foreign = await saveUserFile(b.user.id, {
      name: 'other.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const source = await assertOwnedMockupSource(a.user.id, { sourceFileId: owned.id });
    assert.equal(source.sourceId, owned.id);
    await assert.rejects(
      () => assertOwnedMockupSource(a.user.id, { sourceFileId: foreign.id }),
      (err: unknown) => err instanceof ServiceError && err.code === 'FOREIGN_REFERENCE'
    );
    const blocked = await nexterChat(a.user.id, `Benutze diese Datei (${foreign.id}) für einen Mockup.`);
    assert.match(blocked.messages.at(-1)?.content || '', /nicht zu deinem Konto/);
    const allowed = await nexterChat(a.user.id, `Benutze diese Datei (${owned.id}) für einen Mockup.`, {
      fileId: owned.id,
    });
    assert.equal(/nicht zu deinem Konto/.test(allowed.messages.at(-1)?.content || ''), false);
  });
});

describe('file cloud local closure — search, filter, sort, versions', () => {
  it('searches own files case-insensitively without loading others', async () => {
    const a = await seed('q-a');
    const b = await seed('q-b');
    await saveUserFile(a.user.id, {
      name: 'NightWolf-Final.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    await saveUserFile(b.user.id, {
      name: 'NightWolf-Secret.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const hits = await listUserFiles(a.user.id, { q: 'nightwolf' });
    assert.equal(hits.length, 1);
    assert.equal(hits[0]?.name, 'NightWolf-Final.png');
  });

  it('filters by category and kind', async () => {
    const { user } = await seed('flt');
    await saveUserFile(user.id, { name: 'l.png', mimeType: 'image/png', category: 'logo', dataUrl: PIXEL });
    await saveUserFile(user.id, { name: 'track.mp3', mimeType: 'audio/mpeg', category: 'other', dataUrl: AUDIO });
    const logos = await listUserFiles(user.id, { category: 'logo' });
    assert.equal(logos.every((f) => f.category === 'logo'), true);
    const audio = await listUserFiles(user.id, { kind: 'audio' });
    assert.equal(audio.some((f) => f.name === 'track.mp3'), true);
    const images = await listUserFiles(user.id, { kind: 'image' });
    assert.equal(images.some((f) => f.name === 'l.png'), true);
    const counts = await queryUserFilesForClient(user.id, { category: 'logo' });
    assert.ok(counts.counts.total >= 2);
    assert.ok(counts.counts.audio >= 1);
  });

  it('sorts newest, oldest, name and size', async () => {
    const { user } = await seed('sort');
    const a = await saveUserFile(user.id, { name: 'zeta.png', mimeType: 'image/png', category: 'logo', dataUrl: PIXEL });
    const b = await saveUserFile(user.id, { name: 'alpha.png', mimeType: 'image/png', category: 'banner', dataUrl: PIXEL });
    await dsSet('files', a.id, { ...a, createdAt: '2020-01-01T00:00:00.000Z', size: 10 });
    await dsSet('files', b.id, { ...b, createdAt: '2024-01-01T00:00:00.000Z', size: 99 });
    const newest = await queryUserFilesForClient(user.id, { sort: 'newest' });
    assert.equal(newest.files[0]?.id, b.id);
    const oldest = await queryUserFilesForClient(user.id, { sort: 'oldest' });
    assert.equal(oldest.files[0]?.id, a.id);
    const byName = await queryUserFilesForClient(user.id, { sort: 'name' });
    assert.equal(byName.files[0]?.name, 'alpha.png');
    const byNameDesc = await queryUserFilesForClient(user.id, { sort: 'name-desc' });
    assert.equal(byNameDesc.files[0]?.name, 'zeta.png');
    const bySize = await queryUserFilesForClient(user.id, { sort: 'size' });
    assert.ok(bySize.files.length >= 2);
  });

  it('filters uploads vs generated results', async () => {
    const { user } = await seed('src');
    await saveUserFile(user.id, {
      name: 'upload-only.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      source: 'upload',
    });
    await saveGeneratedAsset(user.id, 'banner', PIXEL, { name: 'gen-banner.png' });
    const uploads = await listUserFiles(user.id, { source: 'upload' });
    assert.equal(uploads.every((f) => f.source === 'upload'), true);
    assert.equal(uploads.some((f) => f.name === 'upload-only.png'), true);
    const generated = await listUserFiles(user.id, { source: 'generation' });
    assert.equal(generated.every((f) => f.source === 'generation'), true);
    assert.equal(generated.some((f) => f.name === 'gen-banner.png'), true);
  });

  it('stores version metadata on generated variants', async () => {
    const { user } = await seed('ver');
    const v1 = await saveGeneratedAsset(user.id, 'logo', PIXEL, { name: 'logo-v1.png', version: 1 });
    const v2 = await saveGeneratedAsset(user.id, 'logo', PIXEL, {
      name: 'logo-v2.png',
      version: 2,
      sourceAssetId: v1?.id,
    });
    assert.equal(v1?.version, 1);
    assert.equal(v2?.version, 2);
    assert.equal(v2?.sourceAssetId, v1?.id);
    assert.notEqual(v1?.id, v2?.id);
  });
});

describe('file cloud local closure — delete, missing, zip, persistence', () => {
  it('soft-deletes an owned file and hides it from lists and Nexter', async () => {
    const { user } = await seed('del');
    const file = await saveUserFile(user.id, {
      name: 'gone-soon.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    assert.equal(await deleteUserFile(file.id, user.id), true);
    assert.equal(await getUserFile(file.id, user.id), null);
    assert.equal((await listUserFiles(user.id)).some((f) => f.id === file.id), false);
    assert.equal((await getRecentUserFiles(user.id)).some((f) => f.id === file.id), false);
    const session = await nexterChat(user.id, 'Wo ist mein letztes Logo?');
    assert.equal((session.messages.at(-1)?.content || '').includes('gone-soon.png'), false);
  });

  it('blocks foreign delete', async () => {
    const a = await seed('del-a');
    const b = await seed('del-b');
    const file = await saveUserFile(b.user.id, {
      name: 'keep.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    assert.equal(await deleteUserFile(file.id, a.user.id), false);
    assert.ok(await getUserFile(file.id, b.user.id));
  });

  it('blocks delete while project references exist', async () => {
    const { user, project } = await seed('ref');
    const file = await saveUserFile(user.id, {
      name: 'linked.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      projectId: project.id,
    });
    await attachAssetToProject(user.id, project.id, {
      name: file.name,
      type: file.category,
      url: file.downloadUrl || PIXEL,
      fileId: file.id,
      sourceType: 'file',
    });
    const refs = await findFileReferences(file.id, user.id);
    assert.ok(refs.includes('projects'));
    await assert.rejects(
      () => deleteUserFile(file.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.statusCode === 409 && err.code === 'DELETE_BLOCKED'
    );
    assert.ok(await getUserFile(file.id, user.id));
  });

  it('does not offer a deleted file as a studio source', async () => {
    const { user } = await seed('src-del');
    const file = await saveUserFile(user.id, {
      name: 'src-del.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    await deleteUserFile(file.id, user.id);
    await assert.rejects(
      () => assertOwnedMockupSource(user.id, { sourceFileId: file.id }),
      (err: unknown) =>
        err instanceof ServiceError && (err.code === 'FOREIGN_REFERENCE' || err.code === 'SOURCE_MISSING')
    );
  });

  it('keeps streamset child files user-scoped', async () => {
    const a = await seed('ss-a');
    const b = await seed('ss-b');
    const child = await saveGeneratedAsset(a.user.id, 'overlay', PIXEL, {
      name: 'streamset-offline.png',
      sourceJobId: randomUUID(),
    });
    assert.ok(child);
    assert.equal(child?.category, 'overlay');
    assert.equal(await getUserFile(child!.id, b.user.id), null);
    assert.equal((await listUserFiles(b.user.id)).some((f) => f.id === child?.id), false);
    const session = await nexterChat(a.user.id, 'Welche Streamset-Dateien habe ich?');
    assert.match(session.messages.at(-1)?.content || '', /streamset-offline\.png/);
  });

  it('packs only owned project files in ZIP exports', async () => {
    const a = await seed('zip-a');
    const b = await seed('zip-b');
    const own = await saveUserFile(a.user.id, {
      name: 'zip-own.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      projectId: a.project.id,
    });
    await attachAssetToProject(a.user.id, a.project.id, {
      name: own.name,
      type: own.category,
      url: own.downloadUrl || PIXEL,
      fileId: own.id,
      sourceType: 'file',
    });
    await saveUserFile(b.user.id, {
      name: 'zip-foreign.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
      projectId: b.project.id,
    });
    const result = await exportProjectZip(a.project.id, a.user.id);
    assert.equal(JSON.stringify(result.manifest).includes('zip-foreign.png'), false);
    await assert.rejects(() => exportProjectZip(a.project.id, b.user.id));
  });

  it('marks missing file-cloud objects in ZIP without crashing', async () => {
    const { user, project } = await seed('zip-miss');
    const id = randomUUID();
    await dsSet('files', id, {
      id,
      userId: user.id,
      name: 'missing-zip.png',
      mimeType: 'image/png',
      size: 4,
      category: 'logo',
      projectId: project.id,
      downloadUrl: 'https://cdn.example/missing-zip.png',
      createdAt: new Date().toISOString(),
    });
    const result = await exportProjectZip(project.id, user.id);
    assert.ok(result.missingCount >= 1);
    assert.ok(result.manifest.assets.some((a) => a.missing && a.fileId === id));
  });

  it('reloads own files after a simulated refresh and relogin', async () => {
    const { user } = await seed('persist');
    const file = await saveUserFile(user.id, {
      name: 'persist.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const afterRefresh = await listUserFiles(user.id);
    assert.equal(afterRefresh.some((f) => f.id === file.id), true);
    const other = await seed('relogin-b');
    assert.equal((await listUserFiles(other.user.id)).some((f) => f.id === file.id), false);
    const again = await listUserFiles(user.id);
    assert.equal(again.some((f) => f.id === file.id), true);
    const page = repo('frontend/src/pages/files/FileCloudPage.tsx');
    assert.match(page, /useSearchParams/);
  });

  it('limits file list pages', async () => {
    const { user } = await seed('page');
    await saveUserFile(user.id, { name: 'p1.png', mimeType: 'image/png', category: 'logo', dataUrl: PIXEL });
    await saveUserFile(user.id, { name: 'p2.png', mimeType: 'image/png', category: 'logo', dataUrl: PIXEL });
    await saveUserFile(user.id, { name: 'p3.png', mimeType: 'image/png', category: 'logo', dataUrl: PIXEL });
    const page = await queryUserFilesForClient(user.id, { limit: 2, offset: 0 });
    assert.equal(page.files.length, 2);
    assert.equal(page.total, 3);
    const next = await queryUserFilesForClient(user.id, { limit: 2, offset: 2 });
    assert.equal(next.files.length, 1);
  });
});

describe('file cloud local closure — UI safety, providers, payments', () => {
  it('renders SVG as an image and never as HTML', () => {
    const page = repo('frontend/src/pages/files/FileCloudPage.tsx');
    assert.match(page, /<img src=\{previewSrc\} alt=\{selected\.name\}/);
    assert.equal(page.includes('dangerouslySetInnerHTML'), false);
    assert.equal(page.includes('innerHTML'), false);
    assert.match(page, /SVG wird als Bild geladen/);
  });

  it('does not authorize via a permanent public URL', async () => {
    const { user } = await seed('pub');
    const id = randomUUID();
    await dsSet('files', id, {
      id,
      userId: user.id,
      name: 'public.png',
      mimeType: 'image/png',
      size: 10,
      category: 'logo',
      downloadUrl: 'https://storage.googleapis.com/bucket/o/users%2Fsomeone-else%2Flogo%2Fpublic.png',
      createdAt: new Date().toISOString(),
    });
    const file = await getUserFile(id, user.id);
    assert.ok(file);
    const minted = await mintDownloadUrlForOwnedFile(user.id, file!, async () => 'https://signed.example/nope');
    assert.equal(minted, null);
    await assert.rejects(
      () => issueFileDownloadUrl(id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'FILE_MISSING'
    );
  });

  it('does not accept a client-controlled storagePath on file routes', () => {
    const routes = src('src/routes/modules.routes.ts');
    const start = routes.indexOf('function createFileCloudRoutes');
    const end = routes.indexOf('export const filesRoutes');
    const block = routes.slice(start, end);
    assert.equal(block.includes('storagePath'), false);
    assert.equal(block.includes('req.body.storagePath'), false);
    const page = repo('frontend/src/pages/files/FileCloudPage.tsx');
    assert.match(page, /api\.files\.downloadUrl\(id\)/);
    assert.equal(page.includes('handleDownload(file.id, file.name, file.downloadUrl)'), false);
  });

  it('does not introduce a Firebase Storage client write', () => {
    const page = repo('frontend/src/pages/files/FileCloudPage.tsx');
    const api = repo('frontend/src/services/api.ts');
    for (const file of [page, api]) {
      assert.equal(file.includes("from 'firebase/storage'"), false);
      assert.equal(file.includes('uploadBytes'), false);
      assert.equal(file.includes('getStorage('), false);
    }
  });

  it('does not call paid providers or payments', () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const service = src('src/services/file-cloud.service.ts');
    const page = repo('frontend/src/pages/files/FileCloudPage.tsx');
    for (const file of [service, page]) {
      assert.equal(file.includes('openai.com'), false);
      assert.equal(file.includes('api.stripe.com'), false);
      assert.equal(file.includes('paypal.com'), false);
    }
    assert.match(page, /Noch keine Dateien/);
    assert.match(page, /Dateien werden geladen/);
    assert.match(page, /Grid/);
    assert.match(page, /Liste/);
    assert.match(page, /min-h-11/);
    assert.match(page, /aria-label="Datei hochladen"/);
    assert.match(page, /<audio controls/);
    assert.match(page, /<video controls/);
    assert.match(page, /Weitere laden/);
    assert.match(page, /Umbenennen/);
    assert.match(page, /Datei löschen\?/);
    assert.match(page, /Aus Projekt entfernen/);
    assert.match(page, /change-request\?jobId=/);
    assert.match(page, /Nexter fragen/);
    assert.match(page, /Neue Variante/);
    assert.match(page, /Mit Nexter verwenden/);
    assert.match(page, /Aktualisieren/);
    assert.match(page, /Vorschau wird geladen/);
    assert.match(page, /--ucbs-accent-cyan/);
    assert.match(page, /search\.get\('file'\)/);
    assert.equal(page.includes('confirmQuote'), false);
    assert.equal(page.includes('generateSpeech'), false);
    const routes = src('src/routes/modules.routes.ts');
    const start = routes.indexOf('function createFileCloudRoutes');
    const end = routes.indexOf('export const filesRoutes');
    const block = routes.slice(start, end);
    assert.equal(block.includes('userId: z'), false);
    assert.equal(block.includes('ownerId'), false);
  });
});

describe('file cloud local closure — relations, list performance, studio results', () => {
  it('does not mint signed URLs while listing files', async () => {
    const querySrc = src('src/services/file-cloud.service.ts');
    const start = querySrc.indexOf('export async function queryUserFilesForClient');
    const end = querySrc.indexOf('export async function getUserFileWithData');
    const block = querySrc.slice(start, end);
    assert.equal(block.includes('mintDownloadUrlForOwnedFile'), false);
    assert.equal(block.includes('signOwnedStoragePath'), false);
    const { user } = await seed('nomint');
    const file = await saveUserFile(user.id, {
      name: 'listed.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const page = await queryUserFilesForClient(user.id);
    const row = page.files.find((f) => f.id === file.id);
    assert.ok(row);
    assert.equal(row?.storagePath, undefined);
    assert.equal(row?.available, true);
    assert.equal(row?.downloadUrl, undefined);
  });

  it('returns usage and versions for an owned file', async () => {
    const { user, project } = await seed('rel');
    const v1 = await saveGeneratedAsset(user.id, 'logo', PIXEL, { name: 'logo-v1.png', version: 1 });
    const v2 = await saveGeneratedAsset(user.id, 'logo', PIXEL, {
      name: 'logo-v2.png',
      version: 2,
      sourceAssetId: v1?.id,
    });
    await attachAssetToProject(user.id, project.id, {
      name: v2!.name,
      type: 'logo',
      url: v2!.downloadUrl || PIXEL,
      fileId: v2!.id,
      sourceType: 'file',
    });
    const relations = await getFileRelations(v2!.id, user.id);
    assert.equal(relations.usage.some((u) => u.projectId === project.id), true);
    assert.ok(relations.versions.some((v) => v.id === v1?.id));
    assert.ok(relations.versions.some((v) => v.id === v2?.id));
    const oldPreview = await issueFileDownloadUrl(v1!.id, user.id);
    assert.ok(oldPreview?.downloadUrl);
    const foreign = await seed('rel-b');
    const other = await getFileRelations(v2!.id, foreign.user.id);
    assert.equal(other.usage.length, 0);
    assert.equal(other.versions.length, 0);
    assert.equal(await issueFileDownloadUrl(v1!.id, foreign.user.id), null);
  });

  it('includes ProjectAsset-linked files in project lists', async () => {
    const { user, project } = await seed('pa-list');
    const file = await saveUserFile(user.id, {
      name: 'asset-only.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    await attachAssetToProject(user.id, project.id, {
      name: file.name,
      type: file.category,
      url: file.downloadUrl || PIXEL,
      fileId: file.id,
      sourceType: 'file',
    });
    const listed = await listUserFiles(user.id, { projectId: project.id });
    assert.equal(listed.some((f) => f.id === file.id), true);
  });

  it('surfaces studio result files without duplicating records', async () => {
    const { user } = await seed('studio');
    const logo = await saveGeneratedAsset(user.id, 'logo', PIXEL, { name: 'studio-logo.png' });
    const banner = await saveGeneratedAsset(user.id, 'banner', PIXEL, { name: 'studio-banner.png' });
    const facecam = await saveGeneratedAsset(user.id, 'facecam', PIXEL, { name: 'studio-facecam.png' });
    const overlay = await saveGeneratedAsset(user.id, 'overlay', PIXEL, { name: 'studio-overlay.png' });
    const sticker = await saveGeneratedAsset(user.id, 'sticker', PIXEL, { name: 'studio-sticker.png' });
    const mockup = await saveGeneratedAsset(user.id, 'mockup', PIXEL, { name: 'studio-mockup.png' });
    const music = await saveUserFile(user.id, {
      name: 'studio-music.mp3',
      mimeType: 'audio/mpeg',
      category: 'other',
      dataUrl: AUDIO,
      source: 'generation',
    });
    const voice = await saveUserFile(user.id, {
      name: 'studio-voice.mp3',
      mimeType: 'audio/mpeg',
      category: 'other',
      dataUrl: AUDIO,
      source: 'generation',
    });
    const video = await saveUserFile(user.id, {
      name: 'studio-video.webm',
      mimeType: 'video/webm',
      category: 'video',
      dataUrl: VIDEO,
      source: 'generation',
    });
    const animation = await saveUserFile(user.id, {
      name: 'studio-animation.webm',
      mimeType: 'video/webm',
      category: 'video',
      dataUrl: VIDEO,
      source: 'generation',
    });
    const shorts = await saveUserFile(user.id, {
      name: 'studio-short.webm',
      mimeType: 'video/webm',
      category: 'video',
      dataUrl: VIDEO,
      source: 'generation',
    });
    const listed = await listUserFiles(user.id);
    const ids = listed.map((f) => f.id);
    for (const file of [logo, banner, facecam, overlay, sticker, mockup, music, voice, video, animation, shorts]) {
      assert.ok(file);
      assert.equal(ids.filter((id) => id === file!.id).length, 1);
    }
    assert.equal(facecam?.category, 'overlay');
    assert.equal(mockup?.category, 'other');
  });
});
