import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COIN_COSTS, CoinSpendCategory, resolveStreamsetAssetKey } from '@ucbs/shared';
import { getOrCreateUser } from './user.service.js';
import { upsertDna, getActiveDna } from './dna.service.js';
import { createProject } from './project.service.js';
import { attachAssetToProject } from './project-assets.service.js';
import { getJobsByUser } from './ai.service.js';
import { getCoinBalance } from './coins.service.js';
import { dsSet } from '../lib/data-store.js';
import { ServiceError } from '../lib/errors.js';
import { evaluateGenerationGate } from './nexter/tools.service.js';
import { quoteStreamsetDraft } from './nexter/quotes.service.js';
import {
  exportStreamsetZip,
  getStreamsetDraft,
  previewStreamsetDraft,
  requireOwnedLogoJob,
} from './streamset.service.js';
import { saveUserFile, getUserFile, issueFileDownloadUrl } from './file-cloud.service.js';

process.env.DEV_AUTH_BYPASS = 'true';

const dir = dirname(fileURLToPath(import.meta.url));
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

async function seedCreator(label: string) {
  const id = randomUUID();
  const user = await getOrCreateUser(id, `${label}@streamset-wf.test`, label);
  const dna = await upsertDna({
    userId: user.id,
    name: 'NightWolf',
    mascot: 'Cyber-Wolf',
    styleDirection: 'neon',
    primaryColors: ['#1E40AF', '#111827'],
    accentColors: ['#22D3EE'],
    brandingStyle: 'esports',
    visualLanguage: 'sharp neon edges',
    fonts: [{ name: 'Orbitron', role: 'primary', source: 'google' }],
  });
  const project = await createProject(user.id, {
    name: 'NightWolf Stream',
    type: 'streamset',
    dnaId: dna.id,
  });
  return { user, dna, project };
}

async function seedJob(
  userId: string,
  module: string,
  extra?: { projectId?: string; assetKey?: string; imageUrl?: string }
) {
  const jobId = randomUUID();
  const now = new Date().toISOString();
  await dsSet('generationJobs', jobId, {
    id: jobId,
    userId,
    module,
    status: 'completed',
    imageUrl: extra?.imageUrl ?? PIXEL,
    prompt: `${module} for NightWolf`,
    projectId: extra?.projectId,
    assetKey: extra?.assetKey,
    createdAt: now,
    completedAt: now,
  });
  return jobId;
}

describe('streamset workflow — DNA defaults, logo, cost, isolation', () => {
  it('preview inherits creator DNA and does not generate or charge', async () => {
    const { user, dna } = await seedCreator('dna-default');
    const beforeJobs = (await getJobsByUser(user.id)).length;
    const beforeCoins = await getCoinBalance(user.id);
    const draft = await previewStreamsetDraft(user.id, { platform: 'twitch' });
    assert.equal(draft.generated, false);
    assert.equal(draft.charged, false);
    assert.equal(draft.dna?.name, 'NightWolf');
    assert.deepEqual(draft.dna?.primaryColors.slice(0, 2), ['#1E40AF', '#111827']);
    assert.equal(draft.designConsistency.motif, 'Cyber-Wolf');
    assert.match(draft.designConsistency.style, /neon/i);
    assert.equal((await getJobsByUser(user.id)).length, beforeJobs);
    assert.equal(await getCoinBalance(user.id), beforeCoins);
    const afterDna = await getActiveDna(user.id);
    assert.deepEqual(afterDna?.primaryColors.slice(0, 2), dna.primaryColors.slice(0, 2));
    assert.equal(src('streamset.service.ts').includes('previewStreamsetDraft'), true);
    const previewFn = src('streamset.service.ts').split('export async function previewStreamsetDraft')[1]?.split(
      'export async function'
    )[0];
    assert.equal(previewFn?.includes('runGenerationJob'), false);
    assert.equal(previewFn?.includes('generateStreamsetPack'), false);
    assert.equal(previewFn?.includes('withCoinCharge'), false);
  });

  it('owned logo can be used as streamset basis; foreign logo cannot', async () => {
    const a = await seedCreator('logo-a');
    const b = await seedCreator('logo-b');
    const logoA = await seedJob(a.user.id, 'logo');
    const logoB = await seedJob(b.user.id, 'logo');
    const owned = await requireOwnedLogoJob(a.user.id, logoA);
    assert.equal(owned.id, logoA);
    const draft = await previewStreamsetDraft(a.user.id, { sourceLogoJobId: logoA, platform: 'twitch' });
    assert.equal(draft.sourceLogoJobId, logoA);
    assert.equal(draft.sourceLogoPresent, true);
    await assert.rejects(() => requireOwnedLogoJob(a.user.id, logoB), (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      assert.equal(err.statusCode, 404);
      return true;
    });
    await assert.rejects(
      () => previewStreamsetDraft(a.user.id, { sourceLogoJobId: logoB }),
      (err: unknown) => {
        assert.ok(err instanceof ServiceError);
        assert.equal((err as ServiceError).statusCode, 404);
        return true;
      }
    );
  });

  it('single asset selection stays a single asset', async () => {
    const { user } = await seedCreator('single');
    const draft = await previewStreamsetDraft(user.id, { selectedKeys: ['facecam'] });
    assert.deepEqual(draft.selectedKeys, ['facecam']);
    assert.equal(draft.includedAssets.length, 1);
    assert.equal(draft.estimatedCoins, COIN_COSTS[CoinSpendCategory.FACECAM_GENERATION]);
    assert.equal(resolveStreamsetAssetKey('facecam')?.key, 'facecam');
  });

  it('set selection computes cost from COIN_COSTS and quote does not charge or generate', async () => {
    const { user } = await seedCreator('cost');
    const beforeCoins = await getCoinBalance(user.id);
    const beforeJobs = (await getJobsByUser(user.id)).length;
    const draft = await previewStreamsetDraft(user.id, {
      platform: 'twitch',
      selectedKeys: ['facecam', 'hud', 'starting-soon'],
    });
    const expected =
      COIN_COSTS[CoinSpendCategory.FACECAM_GENERATION] +
      COIN_COSTS[CoinSpendCategory.OVERLAY_GENERATION] +
      COIN_COSTS[CoinSpendCategory.OVERLAY_GENERATION];
    assert.equal(draft.estimatedCoins, expected);
    assert.match(draft.confirmationSummary, /3 Assets/);
    assert.match(draft.confirmationSummary, new RegExp(`${expected} Coins`));
    const quote = await quoteStreamsetDraft(user.id, draft.id);
    assert.equal(quote.status, 'pending');
    assert.equal(quote.coinCost, expected);
    assert.equal(quote.kind, 'streamset');
    assert.equal(await getCoinBalance(user.id), beforeCoins);
    assert.equal((await getJobsByUser(user.id)).length, beforeJobs);
    const gate = evaluateGenerationGate({
      quoteUserId: quote.userId,
      requestUserId: user.id,
      status: quote.status,
      expiresAt: quote.expiresAt,
      coinCost: quote.coinCost,
      coinBalance: beforeCoins,
      hasDna: true,
    });
    assert.ok(gate === 'ok' || gate === 'insufficient_coins');
  });

  it('Twitch and TikTok presets land in the draft', async () => {
    const { user } = await seedCreator('platforms');
    const twitch = await previewStreamsetDraft(user.id, { platform: 'twitch' });
    assert.equal(twitch.platform, 'twitch');
    assert.ok(twitch.selectedKeys.includes('twitch-banner'));
    assert.ok(twitch.selectedKeys.includes('brb'));
    assert.equal(twitch.layoutPreset.aspect, '16:9');
    const tiktok = await previewStreamsetDraft(user.id, { platform: 'tiktok' });
    assert.equal(tiktok.platform, 'tiktok');
    assert.ok(tiktok.selectedKeys.includes('tiktok-banner'));
    assert.equal(tiktok.layoutPreset.aspect, '9:16');
    assert.equal(tiktok.layoutPreset.slots[0].id, 'facecam');
    assert.equal(tiktok.layoutPreset.slots[1].id, 'gameplay');
    assert.equal(tiktok.layoutPreset.slots[2].id, 'chat');
  });

  it('transparent types get the constraint; screens do not', async () => {
    const { user } = await seedCreator('alpha');
    const draft = await previewStreamsetDraft(user.id, {
      selectedKeys: ['facecam', 'hud', 'sticker', 'starting-soon', 'brb', 'twitch-banner'],
    });
    const byKey = Object.fromEntries(draft.includedAssets.map((a) => [a.key, a]));
    assert.equal(byKey.facecam.transparentBackground, true);
    assert.equal(byKey.hud.transparentBackground, true);
    assert.equal(byKey.sticker.transparentBackground, true);
    assert.equal(byKey['starting-soon'].transparentBackground, false);
    assert.equal(byKey.brb.transparentBackground, false);
    assert.equal(byKey['twitch-banner'].transparentBackground, false);
    assert.match(byKey.facecam.transparencyConstraint, /transparent/i);
    assert.match(byKey['starting-soon'].transparencyConstraint, /opaque|do not force/i);
  });

  it('project preview does not rewrite personal creator DNA', async () => {
    const { user, dna, project } = await seedCreator('dna-safe');
    const colors = [...dna.primaryColors];
    await previewStreamsetDraft(user.id, { projectId: project.id, platform: 'youtube' });
    const after = await getActiveDna(user.id);
    assert.deepEqual(after?.primaryColors, colors);
    assert.equal(after?.id, dna.id);
  });

  it('parent/set relationship is user-isolated', async () => {
    const a = await seedCreator('rel-a');
    const b = await seedCreator('rel-b');
    const draft = await previewStreamsetDraft(a.user.id, {
      selectedKeys: ['facecam', 'hud'],
      projectId: a.project.id,
    });
    assert.equal(draft.relationships.parentType, 'streamset');
    assert.equal(draft.relationships.children.length, 2);
    assert.ok(draft.relationships.children.every((c) => c.parentSetId === draft.id));
    assert.equal(await getStreamsetDraft(b.user.id, draft.id), null);
    const attached = await attachAssetToProject(a.user.id, a.project.id, {
      name: 'Facecam',
      type: 'facecam',
      url: PIXEL,
      assetKey: 'facecam',
      parentAssetId: draft.id,
      module: 'facecam',
    });
    assert.equal(attached?.parentAssetId, draft.id);
    const foreign = await attachAssetToProject(b.user.id, a.project.id, {
      name: 'Steal',
      type: 'facecam',
      url: PIXEL,
      parentAssetId: draft.id,
    });
    assert.equal(foreign, null);
  });

  it('insufficient coins is reported without charging', async () => {
    const { user } = await seedCreator('poor');
    const draft = await previewStreamsetDraft(user.id, { platform: 'twitch' });
    assert.equal(draft.estimatedCoins > 0, true);
    if (draft.coinBalance < draft.estimatedCoins) {
      assert.equal(draft.insufficientCoins, true);
      assert.equal(draft.canAfford, false);
    }
    const before = await getCoinBalance(user.id);
    const quote = await quoteStreamsetDraft(user.id, draft.id);
    assert.equal(await getCoinBalance(user.id), before);
    const gate = evaluateGenerationGate({
      quoteUserId: quote.userId,
      requestUserId: user.id,
      status: quote.status,
      expiresAt: quote.expiresAt,
      coinCost: quote.coinCost,
      coinBalance: 0,
      hasDna: true,
    });
    assert.equal(gate, 'insufficient_coins');
  });

  it('export and file-cloud stay owner-protected', async () => {
    const a = await seedCreator('exp-a');
    const b = await seedCreator('exp-b');
    await seedJob(a.user.id, 'facecam', { assetKey: 'facecam', projectId: a.project.id });
    const exported = await exportStreamsetZip(a.user.id, a.project.id);
    assert.ok(exported.files >= 1);
    await assert.rejects(() => exportStreamsetZip(b.user.id, a.project.id), (err: unknown) => {
      assert.ok(err instanceof ServiceError);
      return true;
    });
    const file = await saveUserFile(a.user.id, {
      name: 'facecam.png',
      mimeType: 'image/png',
      category: 'overlay',
      dataUrl: PIXEL,
    });
    const issued = await issueFileDownloadUrl(file.id, a.user.id);
    assert.ok(issued);
    assert.equal(await getUserFile(file.id, b.user.id), null);
    assert.equal(await issueFileDownloadUrl(file.id, b.user.id), null);
  });

  it('older design versions are not deleted by a draft preview', async () => {
    const { user } = await seedCreator('ver');
    const jobId = await seedJob(user.id, 'facecam', { assetKey: 'facecam' });
    const versionId = randomUUID();
    await dsSet('designVersions', versionId, {
      id: versionId,
      userId: user.id,
      jobId,
      version: 1,
      imageUrl: PIXEL,
      createdAt: new Date().toISOString(),
    });
    await previewStreamsetDraft(user.id, { selectedKeys: ['facecam'] });
    const { dsGet } = await import('../lib/data-store.js');
    const kept = await dsGet('designVersions', versionId);
    assert.equal(kept?.id, versionId);
    assert.equal(kept?.imageUrl, PIXEL);
  });
});
