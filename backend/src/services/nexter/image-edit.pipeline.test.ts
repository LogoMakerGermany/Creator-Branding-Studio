import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COIN_COSTS,
  CoinSpendCategory,
  UserRole,
  buildImageEditPrompt,
  modificationPriceStatus,
} from '@ucbs/shared';
import { getOrCreateUser, updateCoinBalance } from '../user.service.js';
import { upsertDna } from '../dna.service.js';
import { createProject, listProjects, softDeleteProject } from '../project.service.js';
import { linkAssetToProject, listProjectAssets } from '../project-memory.service.js';
import { getUserFile, saveUserFile, setSaveGeneratedAssetTestHooks } from '../file-cloud.service.js';
import { dsDelete, dsGet, dsList, dsSet } from '../../lib/data-store.js';
import { ServiceError } from '../../lib/errors.js';
import { createQuote, confirmQuote, listOwnedQuotes } from './quotes.service.js';
import { createNexterSession, nexterChat } from './conversation.service.js';
import { getCoinBalance, getTransactions } from '../coins.service.js';
import {
  currentProviderCapabilitySnapshot,
  prepareModificationRequest,
  buildModificationQuotePayload,
} from '../modification.service.js';
import { setOpenAiImageEditFetchForTests, OPENAI_GPT_IMAGE_EDIT_ENDPOINT, OPENAI_GPT_IMAGE_EDIT_MODEL } from '../../lib/openai-image-edit.js';
import { setOpenAiImageFetchForTests, OPENAI_GPT_IMAGE_ENDPOINT } from '../../lib/openai-image.js';
import { hasImageEditProvider, hasVideoAiProvider } from '../../config/env.js';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.NODE_TEST = '1';

const dir = dirname(fileURLToPath(import.meta.url));
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_B64 = PIXEL.split(',')[1]!;

function src(rel: string): string {
  return readFileSync(join(dir, rel), 'utf8');
}

async function withEnv<T>(patch: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> {
  const keys = Object.keys(patch);
  const prev: Record<string, string | undefined> = {};
  for (const key of keys) {
    prev[key] = process.env[key];
    const value = patch[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

async function seed(prefix: string, extra?: { skipContentRightsAck?: boolean }) {
  return getOrCreateUser(`${prefix}-${randomUUID()}`, `${randomUUID()}@v1.test`, prefix, {
    role: UserRole.USER,
    skipContentRightsAck: extra?.skipContentRightsAck,
  });
}

async function ownedFile(userId: string, name: string, projectId?: string) {
  return saveUserFile(userId, {
    name,
    mimeType: 'image/png',
    category: 'logo',
    dataUrl: PIXEL,
    projectId,
  });
}

function mockEditOk() {
  let calls = 0;
  let lastUrl = '';
  let lastPrompt = '';
  setOpenAiImageFetchForTests(async () => {
    throw new Error('CREATE adapter must not run during IMAGE_EDIT');
  });
  setOpenAiImageEditFetchForTests(async (input, init) => {
    calls += 1;
    lastUrl = String(input);
    const body = init?.body as FormData | undefined;
    lastPrompt = String(body?.get('prompt') ?? '');
    return new Response(
      JSON.stringify({ data: [{ b64_json: PNG_B64 }], usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  });
  return {
    calls: () => calls,
    lastUrl: () => lastUrl,
    lastPrompt: () => lastPrompt,
  };
}

afterEach(() => {
  setOpenAiImageEditFetchForTests(null);
  setOpenAiImageFetchForTests(null);
  setSaveGeneratedAssetTestHooks(null);
});

describe('V.1 price, flag, and prompt source of truth', () => {
  it('IMAGE_EDIT is 15, distinct from Logo/Video, and frontend does not hardcode it', () => {
    assert.equal(COIN_COSTS[CoinSpendCategory.IMAGE_EDIT], 15);
    assert.equal(modificationPriceStatus().defined, true);
    assert.equal(COIN_COSTS[CoinSpendCategory.LOGO_GENERATION], 15);
    assert.equal(COIN_COSTS[CoinSpendCategory.VIDEO_EDIT], 20);
    assert.equal(COIN_COSTS[CoinSpendCategory.AI_VIDEO], 25);
    const panel = readFileSync(join(dir, '../../../../frontend/src/components/nexter/NexterPanel.tsx'), 'utf8');
    assert.match(panel, /modificationPrep\.coinCost/);
    assert.doesNotMatch(panel, /COIN_COSTS\[.IMAGE_EDIT.\]\s*=\s*15|imageEditCost\s*=\s*15/);
    const tools = src('tools.service.ts');
    assert.match(tools, /'image-edit': CoinSpendCategory.IMAGE_EDIT/);
  });

  it('prompt preserves requested changes and does not inject DNA unless asked', () => {
    const prompt = buildImageEditPrompt({
      userText: 'Change only the text to TreffNix. Keep the wolf, colors and layout unchanged.',
      changes: [{ kind: 'TEXT_REPLACE', to: 'TreffNix' }],
      preserve: [
        { kind: 'element', element: 'wolf' },
        { kind: 'colors' },
        { kind: 'layout' },
      ],
    });
    assert.match(prompt, /TreffNix/);
    assert.match(prompt, /wolf/i);
    assert.match(prompt, /CHANGE ONLY|Apply ONLY/i);
    assert.doesNotMatch(prompt, /#1E40AF|neon|Cyber-Wolf/);
    const withDna = buildImageEditPrompt({
      userText: 'Match my Creator DNA',
      changes: [{ kind: 'TEXT_REPLACE', to: 'TreffNix' }],
      preserve: [],
      matchDna: true,
      dnaStyleHint: 'neon #00FFAA',
    });
    assert.match(withDna, /#00FFAA/);
    const withProject = buildImageEditPrompt({
      userText: 'Match this project',
      changes: [{ kind: 'COLOR_CHANGE', value: 'gold' }],
      preserve: [],
      matchProject: true,
      projectStyleHint: 'project "TreffNix Twitch"',
    });
    assert.match(withProject, /TreffNix Twitch/);
  });
});

describe('V.1 quote/confirm/debit/lineage with mocked provider', () => {
  it('executes owned current and historical assets, project-free uploads, and rejects foreign/deleted targets', async () => {
    await withEnv(
      {
        OPENAI_API_KEY: 'sk-test-not-real-openai',
        IMAGE_EDITS_ENABLED: 'true',
        GENERATIONS_ENABLED: 'true',
      },
      async () => {
        assert.equal(hasImageEditProvider(), true);
        assert.equal(currentProviderCapabilitySnapshot().IMAGE_EDIT, true);
        assert.equal(currentProviderCapabilitySnapshot().VIDEO_EDIT, false);
        assert.equal(hasVideoAiProvider(), false);

        const user = await seed('v1ok');
        const other = await seed('v1fr');
        const project = await createProject(user.id, { name: 'TreffNix Twitch', type: 'streamset' });
        const v1file = await ownedFile(user.id, 'logo v1', project.id);
        const v1 = await linkAssetToProject(user.id, project.id, {
          name: 'logo v1',
          fileId: v1file.id,
          role: 'logo',
          makeCurrent: true,
        });
        const v2file = await ownedFile(user.id, 'logo v2', project.id);
        const v2 = await linkAssetToProject(user.id, project.id, {
          name: 'logo v2',
          fileId: v2file.id,
          role: 'logo',
          makeCurrent: true,
        });
        const upload = await ownedFile(user.id, 'upload.png');
        const foreign = await ownedFile(other.id, 'foreign.png');
        const mock = mockEditOk();
        const before = await getCoinBalance(user.id);
        const projectsBefore = (await listProjects(user.id)).length;

        const currentPrep = await prepareModificationRequest({
          userId: user.id,
          message: 'Change only the text to TreffNix on the current logo. Keep the wolf, colors and layout unchanged.',
          projectId: project.id,
        });
        assert.equal(currentPrep.request.executable, true);
        assert.equal(currentPrep.request.target?.assetId, v2.id);
        const currentQuote = await createQuote(user.id, 'image-edit', project.id, buildModificationQuotePayload(currentPrep.request));
        assert.equal(currentQuote.coinCost, 15);
        assert.equal(currentQuote.payload?.operation, 'MODIFY_ASSET');
        assert.equal(currentQuote.payload?.replaceCurrent, false);
        assert.equal(mock.calls(), 0);
        assert.equal(JSON.stringify(currentQuote.payload).includes('signedUrl'), false);

        const confirmed = await confirmQuote(user.id, currentQuote.id);
        assert.equal(confirmed.coinsSpent, 15);
        assert.equal(confirmed.newBalance, before - 15);
        assert.equal(mock.calls(), 1);
        assert.equal(mock.lastUrl(), OPENAI_GPT_IMAGE_EDIT_ENDPOINT);
        assert.match(mock.lastPrompt(), /TreffNix/);
        assert.match(mock.lastPrompt(), /wolf/i);
        assert.doesNotMatch(mock.lastPrompt(), /images\/generations/);
        const original = await getUserFile(v2file.id, user.id);
        assert.ok(original);
        const resultFileId = String(confirmed.quote.payload?.resultFileId);
        assert.ok(resultFileId);
        assert.notEqual(resultFileId, v2file.id);
        const created = await getUserFile(resultFileId, user.id);
        assert.ok(created);
        const assets = await listProjectAssets(user.id, project.id);
        const currentLogo = assets.find((a) => a.role === 'logo' && a.isCurrent);
        assert.equal(currentLogo?.id, v2.id);
        const child = assets.find((a) => a.fileId === resultFileId);
        assert.ok(child);
        assert.equal(child.parentAssetId, v2.id);
        assert.notEqual(child.id, v2.id);

        const histPayload = {
          operation: 'MODIFY_ASSET',
          executable: true,
          providerCapability: 'IMAGE_EDIT',
          projectId: project.id,
          target: {
            assetId: v1.id,
            fileId: v1file.id,
            role: 'logo',
            source: 'explicit_version',
            projectId: project.id,
            name: 'logo v1',
          },
          changes: [{ kind: 'TEXT_REPLACE', to: 'TreffNix' }],
          preserve: [],
          replaceCurrent: false,
          userText: 'Change only the text to TreffNix on the old logo.',
        };
        const histQuote = await createQuote(user.id, 'image-edit', project.id, histPayload);
        const hist = await confirmQuote(user.id, histQuote.id);
        assert.equal(hist.coinsSpent, 15);
        const stillCurrent = (await listProjectAssets(user.id, project.id)).find((a) => a.role === 'logo' && a.isCurrent);
        assert.equal(stillCurrent?.id, v2.id);

        const upPrep = await prepareModificationRequest({
          userId: user.id,
          message: 'Change only the text to TreffNix.',
          attachedFileId: upload.id,
        });
        assert.equal(upPrep.request.projectId, undefined);
        const upQuote = await createQuote(user.id, 'image-edit', undefined, buildModificationQuotePayload(upPrep.request));
        const up = await confirmQuote(user.id, upQuote.id);
        assert.equal(up.coinsSpent, 15);
        assert.notEqual(String(up.quote.payload?.resultFileId), upload.id);
        assert.equal((await listProjects(user.id)).length, projectsBefore);
        assert.equal(up.quote.projectId, undefined);

        await assert.rejects(
          () =>
            createQuote(user.id, 'image-edit', undefined, {
              operation: 'MODIFY_ASSET',
              executable: true,
              providerCapability: 'IMAGE_EDIT',
              target: { fileId: foreign.id, source: 'upload' },
            }),
          (err: unknown) => err instanceof ServiceError && (err.code === 'FOREIGN_FILE' || err.code === 'FOREIGN_ASSET')
        );

        const gone = await ownedFile(user.id, 'gone.png');
        const goneQuote = await createQuote(user.id, 'image-edit', undefined, {
          operation: 'MODIFY_ASSET',
          executable: true,
          providerCapability: 'IMAGE_EDIT',
          target: { fileId: gone.id, source: 'upload' },
          changes: [{ kind: 'TEXT_REPLACE', to: 'X' }],
          preserve: [],
          userText: 'Change the text to X',
        });
        await dsDelete('files', gone.id);
        const callsBeforeGone = mock.calls();
        await assert.rejects(() => confirmQuote(user.id, goneQuote.id), (err: unknown) => err instanceof ServiceError);
        assert.equal(mock.calls(), callsBeforeGone);

        const txs = await getTransactions(user.id, 50);
        const spends = txs.filter((t) => t.category === CoinSpendCategory.IMAGE_EDIT && t.type === 'spend');
        assert.ok(spends.length >= 1);
        assert.ok(spends.every((t) => Math.abs(t.amount) === 15));
      }
    );
  });

  it('replaceCurrent updates exactly one current asset and keeps history', async () => {
    await withEnv(
      {
        OPENAI_API_KEY: 'sk-test-not-real-openai',
        IMAGE_EDITS_ENABLED: 'true',
        GENERATIONS_ENABLED: 'true',
      },
      async () => {
        const user = await seed('v1rc');
        const project = await createProject(user.id, { name: 'Replace Project', type: 'streamset' });
        const file = await ownedFile(user.id, 'banner.png', project.id);
        const current = await linkAssetToProject(user.id, project.id, {
          name: 'banner v1',
          fileId: file.id,
          role: 'banner',
          makeCurrent: true,
        });
        mockEditOk();
        const prep = await prepareModificationRequest({
          userId: user.id,
          message: 'Change the current banner text to TreffNix and replace the current version.',
          projectId: project.id,
        });
        const payload = buildModificationQuotePayload({ ...prep.request, replaceCurrent: true });
        const quote = await createQuote(user.id, 'image-edit', project.id, payload);
        const result = await confirmQuote(user.id, quote.id);
        const assets = await listProjectAssets(user.id, project.id);
        const currents = assets.filter((a) => a.role === 'banner' && a.isCurrent);
        assert.equal(currents.length, 1);
        assert.notEqual(currents[0]!.id, current.id);
        assert.ok(assets.some((a) => a.id === current.id));
        assert.equal(result.coinsSpent, 15);
      }
    );
  });

  it('TOCTOU, insufficient balance, rights, concurrency, refund, and capability gates', async () => {
    await withEnv(
      {
        OPENAI_API_KEY: 'sk-test-not-real-openai',
        IMAGE_EDITS_ENABLED: 'true',
        GENERATIONS_ENABLED: 'true',
      },
      async () => {
        const user = await seed('v1to');
        const project = await createProject(user.id, { name: 'Gate Project', type: 'branding' });
        const file = await ownedFile(user.id, 'live.png', project.id);
        await linkAssetToProject(user.id, project.id, { name: 'live logo', fileId: file.id, role: 'logo', makeCurrent: true });
        const mock = mockEditOk();
        const prep = await prepareModificationRequest({
          userId: user.id,
          message: 'Change only the text to TreffNix on the current logo.',
          projectId: project.id,
        });
        const payload = buildModificationQuotePayload(prep.request);

        const priceQuote = await createQuote(user.id, 'image-edit', project.id, payload);
        const stored = (await dsGet('nexterQuotes', priceQuote.id)) as Record<string, unknown>;
        stored.coinCost = 99;
        await dsSet('nexterQuotes', priceQuote.id, stored);
        const beforePrice = mock.calls();
        await assert.rejects(() => confirmQuote(user.id, priceQuote.id), (err: unknown) => {
          return err instanceof ServiceError && err.code === 'PRICE_CHANGED';
        });
        assert.equal(mock.calls(), beforePrice);

        const capQuote = await createQuote(user.id, 'image-edit', project.id, payload);
        await withEnv({ IMAGE_EDITS_ENABLED: undefined }, async () => {
          assert.equal(hasImageEditProvider(), false);
          const beforeCap = mock.calls();
          await assert.rejects(() => confirmQuote(user.id, capQuote.id), (err: unknown) => {
            return err instanceof ServiceError && err.code === 'MODIFICATION_UNAVAILABLE';
          });
          assert.equal(mock.calls(), beforeCap);
        });

        const projFile = await ownedFile(user.id, 'proj.png', project.id);
        await linkAssetToProject(user.id, project.id, { name: 'proj logo', fileId: projFile.id, role: 'sticker', makeCurrent: true });
        const doomedPrep = await prepareModificationRequest({
          userId: user.id,
          message: 'Change only the text to TreffNix on the current sticker.',
          projectId: project.id,
        });
        const doomedQuote = await createQuote(user.id, 'image-edit', project.id, buildModificationQuotePayload(doomedPrep.request));
        await softDeleteProject(project.id, user.id);
        const beforeProj = mock.calls();
        await assert.rejects(() => confirmQuote(user.id, doomedQuote.id), (err: unknown) => err instanceof ServiceError);
        assert.equal(mock.calls(), beforeProj);

        const broke = await seed('v1br');
        await updateCoinBalance(broke.id, 10);
        const brokeFile = await ownedFile(broke.id, 'broke.png');
        const brokeQuote = await createQuote(broke.id, 'image-edit', undefined, {
          operation: 'MODIFY_ASSET',
          executable: true,
          providerCapability: 'IMAGE_EDIT',
          target: { fileId: brokeFile.id, source: 'upload' },
          changes: [{ kind: 'TEXT_REPLACE', to: 'X' }],
          preserve: [],
          userText: 'Change the text to X',
        });
        const beforeBroke = mock.calls();
        const brokeBal = await getCoinBalance(broke.id);
        await assert.rejects(() => confirmQuote(broke.id, brokeQuote.id), (err: unknown) => {
          return err instanceof ServiceError && err.code === 'INSUFFICIENT_COINS';
        });
        assert.equal(mock.calls(), beforeBroke);
        assert.equal(await getCoinBalance(broke.id), brokeBal);

        const noRights = await seed('v1nr', { skipContentRightsAck: true });
        const nrFile = await ownedFile(noRights.id, 'nr.png');
        const nrQuote = await createQuote(noRights.id, 'image-edit', undefined, {
          operation: 'MODIFY_ASSET',
          executable: true,
          providerCapability: 'IMAGE_EDIT',
          target: { fileId: nrFile.id, source: 'upload' },
          changes: [{ kind: 'TEXT_REPLACE', to: 'X' }],
          preserve: [],
          userText: 'Change the text to X',
        });
        await assert.rejects(() => confirmQuote(noRights.id, nrQuote.id), (err: unknown) => err instanceof ServiceError);

        const raceUser = await seed('v1race');
        const raceFile = await ownedFile(raceUser.id, 'race.png');
        const raceQuote = await createQuote(raceUser.id, 'image-edit', undefined, {
          operation: 'MODIFY_ASSET',
          executable: true,
          providerCapability: 'IMAGE_EDIT',
          target: { fileId: raceFile.id, source: 'upload' },
          changes: [{ kind: 'TEXT_REPLACE', to: 'X' }],
          preserve: [],
          userText: 'Change the text to X',
        });
        const raceBefore = await getCoinBalance(raceUser.id);
        const raceCalls = mock.calls();
        const [first, second] = await Promise.all([confirmQuote(raceUser.id, raceQuote.id), confirmQuote(raceUser.id, raceQuote.id)]);
        assert.equal(await getCoinBalance(raceUser.id), raceBefore - 15);
        assert.equal(mock.calls(), raceCalls + 1);
        const jobIds = new Set([...(first.jobIds ?? []), ...(second.jobIds ?? [])]);
        assert.equal(jobIds.size, 1);

        setOpenAiImageEditFetchForTests(async () => new Response(JSON.stringify({ error: 'moderation' }), { status: 400 }));
        const failUser = await seed('v1fail');
        const failFile = await ownedFile(failUser.id, 'fail.png');
        const failQuote = await createQuote(failUser.id, 'image-edit', undefined, {
          operation: 'MODIFY_ASSET',
          executable: true,
          providerCapability: 'IMAGE_EDIT',
          target: { fileId: failFile.id, source: 'upload' },
          changes: [{ kind: 'TEXT_REPLACE', to: 'X' }],
          preserve: [],
          userText: 'Change the text to X',
        });
        const failBefore = await getCoinBalance(failUser.id);
        await assert.rejects(() => confirmQuote(failUser.id, failQuote.id));
        assert.equal(await getCoinBalance(failUser.id), failBefore);
        const failTx = await getTransactions(failUser.id, 20);
        const refunds = failTx.filter((t) => t.type === 'refund');
        assert.equal(refunds.length, 1);

        setSaveGeneratedAssetTestHooks({ fail: true });
        mockEditOk();
        const persistUser = await seed('v1ps');
        const persistFile = await ownedFile(persistUser.id, 'persist.png');
        const persistQuote = await createQuote(persistUser.id, 'image-edit', undefined, {
          operation: 'MODIFY_ASSET',
          executable: true,
          providerCapability: 'IMAGE_EDIT',
          target: { fileId: persistFile.id, source: 'upload' },
          changes: [{ kind: 'TEXT_REPLACE', to: 'X' }],
          preserve: [],
          userText: 'Change the text to X',
        });
        const persistBefore = await getCoinBalance(persistUser.id);
        await assert.rejects(() => confirmQuote(persistUser.id, persistQuote.id));
        assert.equal(await getCoinBalance(persistUser.id), persistBefore);
        setSaveGeneratedAssetTestHooks(null);

        const costs = (await dsList('api_costs', { orderBy: 'createdAt', order: 'desc', limit: 20 })) as Array<Record<string, unknown>>;
        const imageEditCosts = costs.filter((row) => row.module === 'image-edit');
        for (const row of imageEditCosts) {
          assert.equal(row.internalCostCents, 0);
          assert.equal(row.costKind, 'estimate');
          assert.equal(row.actualProviderCostUnknown, true);
        }
      }
    );
  });

  it('masks are optional, malformed/path masks rejected, conversation quotes only when enabled', async () => {
    await withEnv(
      {
        OPENAI_API_KEY: 'sk-test-not-real-openai',
        IMAGE_EDITS_ENABLED: 'true',
        GENERATIONS_ENABLED: 'true',
      },
      async () => {
        const user = await seed('v1mask');
        await createNexterSession(user.id);
        const file = await ownedFile(user.id, 'mask-source.png');
        const mask = await ownedFile(user.id, 'mask.png');
        mockEditOk();
        const ok = await createQuote(user.id, 'image-edit', undefined, {
          operation: 'MODIFY_ASSET',
          executable: true,
          providerCapability: 'IMAGE_EDIT',
          target: { fileId: file.id, source: 'upload' },
          maskFileId: mask.id,
          changes: [{ kind: 'TEXT_REPLACE', to: 'X' }],
          preserve: [],
          userText: 'Change the text to X',
        });
        const confirmed = await confirmQuote(user.id, ok.id);
        assert.equal(confirmed.coinsSpent, 15);

        await assert.rejects(
          () =>
            createQuote(user.id, 'image-edit', undefined, {
              operation: 'MODIFY_ASSET',
              executable: true,
              providerCapability: 'IMAGE_EDIT',
              target: { fileId: file.id, source: 'upload' },
              maskFileId: '../etc/passwd',
              changes: [{ kind: 'TEXT_REPLACE', to: 'X' }],
              preserve: [],
              userText: 'Change the text to X',
            }),
          (err: unknown) => err instanceof ServiceError && err.code === 'INVALID_MASK'
        );

        const chat = await nexterChat(user.id, 'Change only the text to TreffNix.', { fileId: file.id });
        const last = chat.messages.at(-1);
        assert.ok(last?.actions?.some((a) => a.tool === 'start_generation' && a.requiresConfirmation && a.coinCost === 15));
        assert.equal(last?.modificationPrep?.executionAvailable, true);
        assert.equal(last?.modificationPrep?.coinCost, 15);
        assert.doesNotMatch(last?.content ?? '', /assetId|fileId|MODIFY_ASSET/);
      }
    );

    await withEnv({ IMAGE_EDITS_ENABLED: undefined, OPENAI_API_KEY: 'sk-test-not-real-openai' }, async () => {
      const user = await seed('v1off');
      await createNexterSession(user.id);
      const file = await ownedFile(user.id, 'off.png');
      const quotesBefore = (await listOwnedQuotes(user.id)).length;
      const chat = await nexterChat(user.id, 'Change only the text to TreffNix.', { fileId: file.id });
      const last = chat.messages.at(-1);
      assert.equal(
        last?.actions?.some((a) => a.tool === 'start_generation' || a.tool === 'confirm_quote' || a.tool === 'quote_generation') ?? false,
        false
      );
      assert.equal((await listOwnedQuotes(user.id)).length, quotesBefore);
    });
  });
});

describe('V.1 source safety / secret scan', () => {
  it('does not persist signed URLs or leak secrets, and CREATE stays on generations', () => {
    const edit = readFileSync(join(dir, '../../lib/openai-image-edit.ts'), 'utf8');
    const create = readFileSync(join(dir, '../../lib/openai-image.ts'), 'utf8');
    const quotes = src('quotes.service.ts');
    const mod = readFileSync(join(dir, '../modification.service.ts'), 'utf8');
    assert.match(edit, /gpt-image-2.5-sunburst/);
    assert.match(edit, /images\/edits/);
    assert.doesNotMatch(edit, /OPENAI_GPT_IMAGE_ENDPOINT|images\/generations'/);
    assert.match(create, /images\/generations/);
    assert.doesNotMatch(create, /images\/edits/);
    assert.match(mod, /editGptImage/);
    assert.doesNotMatch(mod, /generateGptImage/);
    assert.match(quotes, /kind === 'image-edit'/);
    assert.doesNotMatch(`${edit}${mod}${quotes}`, /sk-live|whsec_|BEGIN PRIVATE KEY/);
    assert.equal(OPENAI_GPT_IMAGE_EDIT_ENDPOINT.includes('/edits'), true);
    assert.equal(OPENAI_GPT_IMAGE_ENDPOINT.includes('/generations'), true);
    assert.equal(OPENAI_GPT_IMAGE_EDIT_MODEL, 'gpt-image-2.5-sunburst');
  });
});
