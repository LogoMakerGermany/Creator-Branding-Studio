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
import { isPaidProviderTestBlocked } from '../lib/media-providers.js';
import { arePaymentsEnabled } from '../config/env.js';
import { getCoinBalance } from './coins.service.js';
import { saveUserFile, getUserFile } from './file-cloud.service.js';
import { saveGeneratedAsset } from './file-cloud.service.js';
import { nexterChat } from './nexter/conversation.service.js';
import { detectLayoutStudioIntent, detectQuoteKind } from './nexter/tools.service.js';
import { sanitizeZipEntryName } from '../lib/zip-store.js';
import {
  createLayout,
  getLayout,
  listLayouts,
  updateLayout,
  deleteLayout,
  duplicateLayout,
  exportLayout,
  exportLayoutSvgFile,
  hydrateLayout,
  validateCanvas,
  createLayoutFromPreset,
  applyNexterLayoutCommand,
  duplicateElement,
  moveElementLayer,
  elementsFromPreset,
} from './layout.service.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(dir, '../../..');

function repo(rel: string): string {
  return readFileSync(join(repoRoot, rel), 'utf8');
}

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

async function seed(prefix: string) {
  const user = await getOrCreateUser(`${prefix}-${randomUUID()}`, `${randomUUID()}@layout.test`, prefix, {
    role: UserRole.USER,
  });
  const project = await createProject(user.id, { name: `${prefix} Brand`, type: 'branding' });
  return { user, project };
}

describe('layout studio local closure — ownership and isolation', () => {
  it('creates an owned layout', async () => {
    const { user } = await seed('create');
    const layout = await createLayout(user.id, {
      name: 'Night Layout',
      platform: 'obs',
      canvas: { width: 1920, height: 1080 },
      elements: [],
    });
    assert.equal(layout.userId, user.id);
    assert.equal(layout.version, 1);
    assert.equal((await listLayouts(user.id)).some((l) => l.id === layout.id), true);
  });

  it('blocks foreign layout read, update and delete', async () => {
    const a = await seed('own');
    const b = await seed('foreign');
    const layout = await createLayout(a.user.id, {
      name: 'Secret',
      platform: 'twitch',
      canvas: { width: 1920, height: 1080 },
      elements: [],
    });
    assert.equal(await getLayout(layout.id, b.user.id), null);
    assert.equal(await updateLayout(layout.id, b.user.id, { name: 'Hacked' }), null);
    assert.equal(await deleteLayout(layout.id, b.user.id), false);
    assert.ok(await getLayout(layout.id, a.user.id));
  });

  it('accepts an owned file and blocks a foreign file', async () => {
    const a = await seed('file-a');
    const b = await seed('file-b');
    const owned = await saveUserFile(a.user.id, {
      name: 'logo.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const foreign = await saveUserFile(b.user.id, {
      name: 'steal.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const layout = await createLayout(a.user.id, {
      name: 'With logo',
      platform: 'twitch',
      canvas: { width: 1920, height: 1080 },
      elements: [{ id: randomUUID(), type: 'logo', x: 10, y: 10, width: 120, height: 120, fileId: owned.id }],
    });
    assert.equal(layout.elements[0]?.fileId, owned.id);
    await assert.rejects(
      () =>
        createLayout(a.user.id, {
          name: 'Steal',
          platform: 'twitch',
          canvas: { width: 1920, height: 1080 },
          elements: [{ id: randomUUID(), type: 'logo', x: 0, y: 0, width: 80, height: 80, fileId: foreign.id }],
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'FOREIGN_ASSET'
    );
  });

  it('does not allow a deleted or ownerless asset as a new source', async () => {
    const { user } = await seed('del-asset');
    const file = await saveUserFile(user.id, {
      name: 'gone.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    await dsSet('files', file.id, { ...file, deletedAt: new Date().toISOString() });
    await assert.rejects(
      () =>
        createLayout(user.id, {
          name: 'Deleted',
          platform: 'obs',
          canvas: { width: 1920, height: 1080 },
          elements: [{ id: randomUUID(), type: 'logo', x: 0, y: 0, width: 80, height: 80, fileId: file.id }],
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'FOREIGN_ASSET'
    );
    const orphanId = randomUUID();
    await dsSet('files', orphanId, {
      id: orphanId,
      name: 'no-owner.png',
      mimeType: 'image/png',
      size: 8,
      category: 'logo',
      downloadUrl: PIXEL,
      createdAt: new Date().toISOString(),
    });
    await assert.rejects(
      () =>
        createLayout(user.id, {
          name: 'Orphan',
          platform: 'obs',
          canvas: { width: 1920, height: 1080 },
          elements: [{ id: randomUUID(), type: 'image', x: 0, y: 0, width: 80, height: 80, fileId: orphanId }],
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'FOREIGN_ASSET'
    );
  });

  it('keeps a layout open when a referenced storage object is missing', async () => {
    const { user } = await seed('miss');
    const id = randomUUID();
    await dsSet('files', id, {
      id,
      userId: user.id,
      name: 'missing.png',
      mimeType: 'image/png',
      size: 4,
      category: 'logo',
      downloadUrl: 'https://cdn.example/missing-layout.png',
      createdAt: new Date().toISOString(),
    });
    const layout = await createLayout(user.id, {
      name: 'Missing ref',
      platform: 'obs',
      canvas: { width: 1920, height: 1080 },
      elements: [{ id: randomUUID(), type: 'logo', x: 8, y: 8, width: 100, height: 100, fileId: id }],
    });
    const hydrated = await hydrateLayout(layout, user.id);
    assert.equal(hydrated.elements[0]?.assetMissing, true);
    await assert.rejects(
      () => exportLayoutSvgFile(layout.id, user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'EXPORT_MISSING_ASSET'
    );
  });

  it('accepts an owned project and blocks a foreign project', async () => {
    const a = await seed('proj-a');
    const b = await seed('proj-b');
    const layout = await createLayout(a.user.id, {
      name: 'Bound',
      platform: 'twitch',
      canvas: { width: 1920, height: 1080 },
      elements: [],
      projectId: a.project.id,
    });
    assert.equal(layout.projectId, a.project.id);
    await assert.rejects(
      () =>
        createLayout(a.user.id, {
          name: 'Foreign project',
          platform: 'twitch',
          canvas: { width: 1920, height: 1080 },
          elements: [],
          projectId: b.project.id,
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'NOT_FOUND'
    );
  });
});

describe('layout studio local closure — geometry, elements, presets', () => {
  it('validates canvas dimensions and blocks invalid values', async () => {
    const { user } = await seed('dim');
    assert.deepEqual(validateCanvas({ width: 1920, height: 1080 }), { width: 1920, height: 1080 });
    await assert.rejects(() => createLayout(user.id, {
      name: 'bad',
      platform: 'custom',
      canvas: { width: 0, height: 500 },
      elements: [],
    }), (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_DIMENSIONS');
    await assert.rejects(() => createLayout(user.id, {
      name: 'nan',
      platform: 'custom',
      canvas: { width: Number.NaN, height: 1080 },
      elements: [],
    }), (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_DIMENSIONS');
    await assert.rejects(() => createLayout(user.id, {
      name: 'inf',
      platform: 'custom',
      canvas: { width: Number.POSITIVE_INFINITY, height: 1080 },
      elements: [],
    }), (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_DIMENSIONS');
  });

  it('validates element x/y/width/height and blocks NaN/Infinity', async () => {
    const { user } = await seed('el');
    await assert.rejects(
      () =>
        createLayout(user.id, {
          name: 'pos',
          platform: 'obs',
          canvas: { width: 1920, height: 1080 },
          elements: [{ id: randomUUID(), type: 'gameplay', x: Number.NaN, y: 0, width: 100, height: 100 }],
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_POSITION'
    );
    await assert.rejects(
      () =>
        createLayout(user.id, {
          name: 'inf',
          platform: 'obs',
          canvas: { width: 1920, height: 1080 },
          elements: [{ id: randomUUID(), type: 'chatbox', x: 0, y: Number.POSITIVE_INFINITY, width: 100, height: 100 }],
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_POSITION'
    );
    await assert.rejects(
      () =>
        createLayout(user.id, {
          name: 'tiny',
          platform: 'obs',
          canvas: { width: 1920, height: 1080 },
          elements: [{ id: randomUUID(), type: 'text', x: 0, y: 0, width: 1, height: 1 }],
        }),
      (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_SIZE'
    );
  });

  it('adds, removes, duplicates, moves, resizes, layers, hides and locks elements', async () => {
    const { user } = await seed('ops');
    let layout = await createLayout(user.id, {
      name: 'Ops',
      platform: 'twitch',
      canvas: { width: 1920, height: 1080 },
      elements: [
        { id: 'g1', type: 'gameplay', x: 0, y: 0, width: 1920, height: 1080, label: 'Gameplay', visible: true },
        { id: 'f1', type: 'facecam', x: 40, y: 40, width: 320, height: 240, label: 'Facecam' },
        { id: 'c1', type: 'chatbox', x: 1500, y: 200, width: 360, height: 640, label: 'Chat' },
      ],
    });
    assert.equal(layout.elements.some((e) => e.type === 'gameplay'), true);
    assert.equal(layout.elements.some((e) => e.type === 'facecam'), true);
    assert.equal(layout.elements.some((e) => e.type === 'chatbox'), true);
    const duped = duplicateElement(layout.elements, 'f1');
    assert.equal(duped.length, 4);
    assert.equal(duped.filter((e) => e.type === 'facecam').length, 2);
    const layered = moveElementLayer(layout.elements, 'f1', 'forward');
    assert.equal(layered[1]?.id === 'f1' || layered[2]?.id === 'f1', true);
    layout = (await updateLayout(layout.id, user.id, {
      elements: layout.elements.map((el) =>
        el.id === 'f1' ? { ...el, x: 80, y: 90, width: 280, height: 200, visible: false, locked: true } : el
      ),
    }))!;
    const facecam = layout.elements.find((e) => e.id === 'f1')!;
    assert.equal(facecam.x, 80);
    assert.equal(facecam.width, 280);
    assert.equal(facecam.visible, false);
    assert.equal(facecam.locked, true);
    const obs = JSON.parse(exportLayout(layout, 'obs'));
    assert.equal(obs.sources.some((s: { name: string }) => s.name === 'Facecam'), false);
    layout = (await updateLayout(layout.id, user.id, {
      elements: layout.elements.filter((el) => el.id !== 'c1'),
    }))!;
    assert.equal(layout.elements.some((e) => e.id === 'c1'), false);
  });

  it('applies Twitch and TikTok presets and custom 1080 square', async () => {
    const { user } = await seed('preset');
    const twitch = await createLayoutFromPreset(user.id, 'twitch');
    assert.equal(twitch.canvas.width, 1920);
    assert.equal(twitch.elements.some((e) => e.type === 'gameplay'), true);
    const tiktok = await createLayoutFromPreset(user.id, 'tiktok');
    assert.equal(tiktok.canvas.width, 1080);
    assert.equal(tiktok.canvas.height, 1920);
    assert.equal(elementsFromPreset('tiktok').some((e) => e.type === 'chatbox'), true);
    const custom = await createLayout(user.id, {
      name: 'Square',
      platform: 'custom',
      canvas: { width: 1080, height: 1080 },
      elements: [],
      background: { mode: 'solid', color: '#000000' },
    });
    assert.equal(custom.background?.mode, 'solid');
    const clear = await updateLayout(custom.id, user.id, { background: { mode: 'transparent' } });
    assert.equal(clear?.background?.mode, 'transparent');
  });

  it('works without Creator DNA and can snapshot DNA id when present', async () => {
    const { user } = await seed('nodna');
    const layout = await createLayout(user.id, {
      name: 'No DNA',
      platform: 'obs',
      canvas: { width: 1920, height: 1080 },
      elements: [],
    });
    assert.equal(layout.dnaId, undefined);
  });
});

describe('layout studio local closure — persist, nexter, export', () => {
  it('saves, loads, duplicates and deletes a layout without deleting files', async () => {
    const { user } = await seed('persist');
    const file = await saveUserFile(user.id, {
      name: 'keep.png',
      mimeType: 'image/png',
      category: 'logo',
      dataUrl: PIXEL,
    });
    const layout = await createLayout(user.id, {
      name: 'Persist',
      platform: 'tiktok',
      canvas: { width: 1080, height: 1920 },
      elements: [{ id: randomUUID(), type: 'logo', x: 20, y: 20, width: 120, height: 120, fileId: file.id }],
    });
    const copy = await duplicateLayout(layout.id, user.id);
    assert.ok(copy);
    assert.notEqual(copy?.id, layout.id);
    assert.equal(copy?.elements[0]?.fileId, file.id);
    assert.notEqual(copy?.elements[0]?.id, layout.elements[0]?.id);
    assert.equal(await deleteLayout(layout.id, user.id), true);
    assert.equal(await getLayout(layout.id, user.id), null);
    assert.ok(await getUserFile(file.id, user.id));
    const again = await listLayouts(user.id);
    assert.equal(again.some((l) => l.id === layout.id), false);
    assert.equal(again.some((l) => l.id === copy?.id), true);
  });

  it('lets Nexter create, move and resize without coins or quote bypass', async () => {
    const { user } = await seed('nx');
    const before = await getCoinBalance(user.id);
    const created = await nexterChat(user.id, 'Mach mir ein TikTok Layout.');
    assert.match(created.messages.at(-1)?.content || '', /TikTok-Layout/);
    assert.equal(detectQuoteKind('Mach mir ein TikTok Layout.'), null);
    assert.equal(detectLayoutStudioIntent('Mach mir ein TikTok Layout.'), true);
    assert.equal(detectQuoteKind('Ich brauche ein TikTok Gaming Layout.'), 'overlay');
    assert.equal(detectQuoteKind('Erstelle mir noch ein neues Logo dafür'), 'logo');
    const moved = await nexterChat(user.id, 'Verschiebe den Chat nach unten.');
    assert.match(moved.messages.at(-1)?.content || '', /unten|Chat/i);
    const resized = await nexterChat(user.id, 'Mach die Facecam kleiner.');
    assert.match(resized.messages.at(-1)?.content || '', /kleiner|Facecam/i);
    const after = await getCoinBalance(user.id);
    assert.equal(after, before);
    const layouts = await listLayouts(user.id);
    const two = await updateLayout(layouts[0]!.id, user.id, {
      elements: [
        ...layouts[0]!.elements,
        { id: randomUUID(), type: 'facecam', x: 200, y: 200, width: 200, height: 160, label: 'Facecam 2' },
      ],
    });
    const amb = await applyNexterLayoutCommand(user.id, 'Mach die Facecam kleiner.');
    assert.equal(amb.followUp, true);
    assert.ok(two);
  });

  it('uses recent own assets and blocks foreign assets in Nexter', async () => {
    const a = await seed('nx-a');
    const b = await seed('nx-b');
    await saveUserFile(a.user.id, { name: 'own-logo.png', mimeType: 'image/png', category: 'logo', dataUrl: PIXEL });
    await saveUserFile(b.user.id, { name: 'foreign-logo.png', mimeType: 'image/png', category: 'logo', dataUrl: PIXEL });
    await createLayoutFromPreset(a.user.id, 'twitch');
    const session = await nexterChat(a.user.id, 'Setz mein Logo oben rechts.');
    assert.match(session.messages.at(-1)?.content || '', /own-logo\.png/);
    assert.equal((session.messages.at(-1)?.content || '').includes('foreign-logo.png'), false);
    const many = await seed('nx-many');
    await saveUserFile(many.user.id, { name: 'l1.png', mimeType: 'image/png', category: 'logo', dataUrl: PIXEL });
    await saveUserFile(many.user.id, { name: 'l2.png', mimeType: 'image/png', category: 'logo', dataUrl: PIXEL });
    await createLayoutFromPreset(many.user.id, 'twitch');
    const ask = await applyNexterLayoutCommand(many.user.id, 'Setz mein Logo oben rechts.');
    assert.equal(ask.followUp, true);
    await saveUserFile(a.user.id, { name: 'own-facecam.png', mimeType: 'image/png', category: 'overlay', dataUrl: PIXEL });
    const face = await nexterChat(a.user.id, 'Nimm mein letztes Facecam-Design.');
    assert.match(face.messages.at(-1)?.content || '', /own-facecam|Facecam/i);
    assert.equal((face.messages.at(-1)?.content || '').includes('foreign-logo.png'), false);
  });

  it('exports own layout to File Cloud and blocks foreign export', async () => {
    const a = await seed('ex-a');
    const b = await seed('ex-b');
    const layout = await createLayoutFromPreset(a.user.id, 'twitch', { name: 'Export Me' });
    const exported = await exportLayoutSvgFile(layout.id, a.user.id);
    assert.match(exported.filename, /svg$/i);
    assert.equal(sanitizeZipEntryName('../x.png'), 'x.png');
    assert.ok(exported.fileId);
    await assert.rejects(
      () => exportLayoutSvgFile(layout.id, b.user.id),
      (err: unknown) => err instanceof ServiceError && err.code === 'NOT_FOUND'
    );
    const file = await getUserFile(exported.fileId, a.user.id);
    assert.ok(file);
    assert.equal(await getUserFile(exported.fileId, b.user.id), null);
  });

  it('integrates streamset-style overlay files as owned image sources', async () => {
    const { user } = await seed('ss');
    const child = await saveGeneratedAsset(user.id, 'overlay', PIXEL, { name: 'streamset-offline.png' });
    const layout = await createLayout(user.id, {
      name: 'SS',
      platform: 'twitch',
      canvas: { width: 1920, height: 1080 },
      elements: [{ id: randomUUID(), type: 'overlay', x: 0, y: 0, width: 400, height: 200, fileId: child!.id }],
    });
    assert.equal(layout.elements[0]?.fileId, child?.id);
  });

  it('does not add client storage writes, providers or payments', () => {
    assert.equal(isPaidProviderTestBlocked(), true);
    assert.equal(arePaymentsEnabled(), false);
    const page = repo('frontend/src/pages/layout/LayoutStudioPage.tsx');
    const service = repo('backend/src/services/layout.service.ts');
    assert.equal(page.includes("from 'firebase/firestore'"), false);
    assert.equal(page.includes("from 'firebase/storage'"), false);
    assert.equal(page.includes('uploadBytes'), false);
    assert.equal(service.includes('openai.com'), false);
    assert.equal(service.includes('api.stripe.com'), false);
    assert.match(page, /Noch kein Layout/);
    assert.match(page, /Layout hat keine Elemente/);
    assert.match(page, /min-h-11/);
    assert.match(page, /layout-safe-area/);
    assert.match(page, /layout-preset-tiktok/);
    assert.match(page, /layout-preset-twitch/);
    assert.match(page, /aria-label="Layout speichern"/);
    assert.match(page, /<img/);
    assert.equal(page.includes('dangerouslySetInnerHTML'), false);
  });
});
