import {
  applyLockedDnaToGeneration,
  COIN_COSTS,
  STREAMSET_PACK_COIN_COST,
  STREAMSET_PACK_ITEMS,
  STREAMSET_PLATFORMS,
  assetRequiresTransparency,
  coinCostForStreamsetSelection,
  streamsetPriceCaption,
  deriveStreamsetBatchStatus,
  getStreamLayoutPreset,
  getStreamsetAsset,
  latestJobsPerAssetKey,
  missingStreamsetLabels,
  optionsForStreamsetItem,
  pickJobForStreamsetAsset,
  refundSharesForSelection,
  resolveStreamsetAssetKey,
  resolveStreamsetSelection,
  streamsetAssetPresent,
  streamsetConsistencyConstraint,
  streamsetDownloadBasename,
  streamsetSharedDesignParams,
  transparencyConstraintForItem,
  type CreatorDNA,
  type StreamsetAssetDef,
  type StreamsetBatchStatus,
  type StreamsetGeneratorKind,
  type StreamsetPlatform,
  type StreamsetPricingSku,
} from '@ucbs/shared';
import { randomUUID } from 'node:crypto';
import { resolveDnaForRequest, getActiveDna } from './dna.service.js';
import {
  buildPromptForStudioModule,
  generateStudioAsset,
  getJob,
  getJobsByUser,
  runGenerationJob,
  saveJob,
  type GenerationJob,
} from './ai.service.js';
import { ServiceError } from '../lib/errors.js';
import { requireImageProvider } from '../lib/media-providers.js';
import { buildZipArchive, sanitizeZipEntryName, zipEntryPath } from '../lib/zip-store.js';
import { uploadAssetFromDataUrl } from '../lib/firebase-storage.js';
import { getCcdPromptContext, appendCcdToPrompt } from './creator-dna-engine/index.js';
import { deductAmount, getCoinBalance, getTransactions, refundOnce } from './coins.service.js';
import { getNexterPreferencesForUser } from './nexter/preferences.service.js';
import { dsGet, dsSet } from '../lib/data-store.js';
import { getBillableCharge, newChargeId, settleBillableCharge } from './billable-charge.service.js';
import { attachAssetToProject } from './project-assets.service.js';
import { assertBillableJobCapacity } from './job-limits.service.js';
import { isAcceptingWork } from '../lib/runtime.js';
import { saveGeneratedAsset, getFileBySourceJobId, getUserFile, mintDownloadUrlForOwnedFile } from './file-cloud.service.js';
import { recordJobVersion, getVersionsForJob } from './change-request.service.js';
import { streamsetRetryLockKey, withDevLock } from '../lib/dev-mutex.js';
import { isDevMode } from '../config/env.js';
import type { CoinTransaction } from '@ucbs/shared';

export { STREAMSET_PACK_ITEMS, STREAMSET_PACK_COIN_COST };

const FAKE_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export interface StreamsetTestHooks {
  results?: Record<string, 'completed' | 'failed'>;
  defaultResult?: 'completed' | 'failed';
  throwOnCreate?: boolean;
}

let streamsetTestHooks: StreamsetTestHooks | null = null;

export function setStreamsetTestHooks(hooks: StreamsetTestHooks | null): void {
  streamsetTestHooks = hooks;
}

async function runCatalogItem(
  userId: string,
  dna: CreatorDNA,
  item: StreamsetAssetDef,
  characterDna: Parameters<typeof appendCcdToPrompt>[1],
    extra?: {
    projectId?: string;
    batchId?: string;
    parentJobId?: string;
    creatorName?: string;
    includeCreatorName?: boolean;
    platform?: string;
    quoteId?: string;
    changeRequest?: string;
  }
): Promise<GenerationJob> {
  const studioOptions = applyLockedDnaToGeneration(
    dna,
    optionsForStreamsetItem(item, dna.styleDirection) as Parameters<typeof applyLockedDnaToGeneration>[1]
  );
  const built = buildPromptForStudioModule(dna, item.module, studioOptions);
  const prompt = [
    built.prompt,
    item.promptHint,
    streamsetConsistencyConstraint(dna),
    transparencyConstraintForItem(item),
        extra?.includeCreatorName !== false && extra?.creatorName
          ? `optional creator name suggestion "${extra.creatorName}" only if this asset uses text`
          : null,
        extra?.platform ? `target platform ${extra.platform}` : null,
        extra?.changeRequest
          ? `variation of the existing set assets (keep format, platform and transparency unless asked otherwise): ${extra.changeRequest}`
          : null,
  ]
    .filter(Boolean)
    .join('. ');
  const enriched = appendCcdToPrompt(prompt, characterDna);

  const fake = streamsetTestHooks?.results?.[item.key] ?? streamsetTestHooks?.defaultResult;
  if (fake === 'completed' || fake === 'failed') {
    const now = new Date().toISOString();
    const job: GenerationJob = {
      id: randomUUID(),
      userId,
      module: item.module,
      status: fake === 'completed' ? 'completed' : 'failed',
      prompt: enriched,
      dnaId: dna.id,
      assetKey: item.key,
      projectId: extra?.projectId,
      batchId: extra?.batchId,
      parentJobId: extra?.parentJobId,
      quoteId: extra?.quoteId,
      imageUrl: fake === 'completed' ? FAKE_PIXEL : undefined,
      error: fake === 'failed' ? 'Generierung fehlgeschlagen. Datei nicht verfügbar.' : undefined,
      createdAt: now,
      completedAt: now,
    };
    await saveJob(job);
    if (fake === 'completed') {
      await persistStreamsetResult(userId, job, item, extra);
    }
    return job;
  }

  const generated = await runGenerationJob(userId, item.module, dna, enriched, {
    size: built.size,
    hd: built.hd,
    assetKey: item.key,
    projectId: extra?.projectId,
    batchId: extra?.batchId,
    parentJobId: extra?.parentJobId,
    quoteId: extra?.quoteId,
  });
  if (generated.status === 'completed' && generated.imageUrl) {
    await persistStreamsetResult(userId, generated, item, extra);
  }
  return generated;
}

async function persistStreamsetResult(
  userId: string,
  job: GenerationJob,
  item: StreamsetAssetDef,
  extra?: { projectId?: string; parentJobId?: string; batchId?: string; creatorName?: string }
): Promise<void> {
  if (!job.imageUrl) return;
  const downloadName = streamsetDownloadBasename(extra?.creatorName, item.key);
  let file = job.fileId ? await getUserFile(job.fileId, userId) : await getFileBySourceJobId(userId, job.id);
  if (!file) {
    file = await saveGeneratedAsset(userId, item.module, job.imageUrl, {
      projectId: extra?.projectId ?? job.projectId,
      sourceJobId: job.id,
      name: downloadName,
    });
  }
  if (file) {
    job.fileId = file.id;
    job.imageUrl = file.downloadUrl || job.imageUrl;
    await saveJob(job);
  }
  const version = await recordJobVersion(userId, job.id, job.imageUrl, item.label);
  if (extra?.projectId || job.projectId) {
    await attachAssetToProject(userId, extra?.projectId || job.projectId!, {
      name: item.label,
      type: item.module,
      url: job.imageUrl,
      jobId: job.id,
      fileId: file?.id,
      module: item.module,
      sourceType: 'generation',
      sourceId: job.id,
      mimeType: file?.mimeType || 'image/png',
      assetKey: item.key,
      parentAssetId: extra?.parentJobId ?? extra?.batchId ?? job.parentJobId ?? job.batchId,
      version: version.version,
    }).catch(() => undefined);
  }
}

export interface StreamsetExecutionInput {
  quoteId?: string;
  projectId?: string;
  selectedKeys: string[];
  expectedCost: number;
  platform?: string;
  creatorName?: string;
  includeCreatorName?: boolean;
  chargeAttempt?: number;
  attachToBatchId?: string;
  changeRequest?: string;
}

export interface StreamsetExecutionResult {
  batch: GenerationJob;
  jobs: GenerationJob[];
  coinsSpent: number;
  refundedCoins: number;
  newBalance: number;
  batchStatus: StreamsetBatchStatus;
  chargeId: string;
}

async function jobsForBatch(userId: string, batchId: string): Promise<GenerationJob[]> {
  const all = await getJobsByUser(userId);
  return all.filter((job) => job.batchId === batchId && job.id !== batchId && job.module !== 'streamset');
}

export async function executeQuotedStreamset(
  userId: string,
  input: StreamsetExecutionInput
): Promise<StreamsetExecutionResult> {
  if (!isAcceptingWork()) {
    throw new ServiceError(503, 'SERVICE_UNAVAILABLE', 'Server fährt herunter — bitte später erneut versuchen');
  }
  await assertBillableJobCapacity(userId);

  const selectedKeys = [...new Set(input.selectedKeys)].filter((key) => Boolean(getStreamsetAsset(key)));
  if (!selectedKeys.length) {
    throw new ServiceError(400, 'INVALID_SELECTION', 'Keine gültigen Streamset-Assets ausgewählt');
  }

  const pricing = coinCostForStreamsetSelection(selectedKeys);
  if (pricing.total !== input.expectedCost) {
    throw new ServiceError(
      409,
      'PRICE_CHANGED',
      'Der Preis hat sich geändert. Bitte erneut bestätigen.',
      { previousCost: input.expectedCost, currentCost: pricing.total, selectedKeys }
    );
  }

  const { dna } = await resolveDnaForRequest(userId, input.projectId);
  if (!dna) throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');

  /**
   * Streamset package policy:
   * One debit for the selected package, then per-asset jobs.
   * Failed assets refund their share exactly once (refundOnce idempotency keys).
   * Create-level failure refunds the remainder. No silent partial charges.
   * Live image provider (or test hooks) must be available BEFORE debit.
   */
  if (!streamsetTestHooks) {
    requireImageProvider();
  }

  const attempt = Math.max(1, Math.floor(input.chargeAttempt ?? 1));
  const batchId = input.attachToBatchId || input.quoteId || randomUUID();
  const shares = refundSharesForSelection(pricing.itemCosts, pricing.total);
  const refundedFromJobs = (jobs: GenerationJob[]) =>
    jobs
      .filter((job) => job.status === 'failed')
      .reduce((sum, job) => sum + (shares[job.assetKey ?? ''] ?? 0), 0);

  if (input.quoteId) {
    const quotedJobs = (await getJobsByUser(userId)).filter(
      (job) => job.quoteId === input.quoteId && job.module !== 'streamset'
    );
    if (quotedJobs.length) {
      const batchExisting = (await getJobsByUser(userId)).find((j) => j.id === batchId);
      const allChildren = await jobsForBatch(userId, batchId);
      const latest = latestJobsPerAssetKey(allChildren.length ? allChildren : quotedJobs);
      return {
        batch: batchExisting ?? quotedJobs[0],
        jobs: quotedJobs,
        coinsSpent: pricing.total,
        refundedCoins: refundedFromJobs(quotedJobs),
        newBalance: await getCoinBalance(userId),
        batchStatus: deriveStreamsetBatchStatus(latest),
        chargeId: input.quoteId ? `ssq_${input.quoteId}_${attempt}` : batchId,
      };
    }
  }

  if (!input.attachToBatchId) {
    const existingChildren = await jobsForBatch(userId, batchId);
    if (existingChildren.length) {
      const batchExisting = (await getJobsByUser(userId)).find((j) => j.id === batchId);
      const batchStatus = deriveStreamsetBatchStatus(latestJobsPerAssetKey(existingChildren));
      return {
        batch: batchExisting ?? existingChildren[0],
        jobs: existingChildren,
        coinsSpent: pricing.total,
        refundedCoins: refundedFromJobs(existingChildren),
        newBalance: await getCoinBalance(userId),
        batchStatus,
        chargeId: input.quoteId ? `ssq_${input.quoteId}_${attempt}` : batchId,
      };
    }
  } else {
    const parent = await getJob(batchId);
    if (!parent || parent.userId !== userId || parent.module !== 'streamset') {
      throw new ServiceError(404, 'BATCH_NOT_FOUND', 'Streamset nicht gefunden');
    }
  }

  const chargeId = input.quoteId ? `ssq_${input.quoteId}_${attempt}` : newChargeId();
  const idempotencyKey = input.quoteId
    ? `quote-confirm:${input.quoteId}:${attempt}`
    : `charge:${chargeId}`;
  const coinResult = await deductAmount(userId, pricing.total, pricing.ledgerDescription, {
    idempotencyKey,
    sourceType: 'generation',
    sourceId: chargeId,
    quoteId: input.quoteId,
    category: pricing.spendCategory,
    persistCharge: {
      id: chargeId,
      category: pricing.spendCategory,
      description: pricing.ledgerDescription,
      quoteId: input.quoteId,
      jobId: batchId,
    },
  });
  if (!coinResult.success) {
    throw new ServiceError(
      402,
      'INSUFFICIENT_COINS',
      `Nicht genügend Coins. Dieses Angebot kostet ${pricing.total} Coins.`
    );
  }

  if (coinResult.duplicate && !input.attachToBatchId) {
    const children = await jobsForBatch(userId, batchId);
    if (children.length) {
      const batchExisting = (await getJobsByUser(userId)).find((j) => j.id === batchId);
      return {
        batch: batchExisting ?? children[0],
        jobs: children,
        coinsSpent: pricing.total,
        refundedCoins: refundedFromJobs(children),
        newBalance: coinResult.newBalance,
        batchStatus: deriveStreamsetBatchStatus(children),
        chargeId,
      };
    }
  }

  const charge = await getBillableCharge(chargeId);
  const chargeTransactionId = charge?.chargeTransactionId ?? coinResult.transactionId;
  if (!chargeTransactionId) {
    throw new ServiceError(500, 'CHARGE_MISSING', 'Abbuchung ohne Charge-Datensatz');
  }

  const now = new Date().toISOString();
  let batch: GenerationJob;
  if (input.attachToBatchId) {
    const existing = await getJob(batchId);
    if (!existing || existing.userId !== userId) {
      throw new ServiceError(404, 'BATCH_NOT_FOUND', 'Streamset nicht gefunden');
    }
    batch = existing;
    batch.status = 'processing';
    await saveJob(batch);
  } else {
    batch = {
      id: batchId,
      userId,
      module: 'streamset',
      status: 'processing',
      prompt: `streamset batch ${selectedKeys.join(',')}`,
      dnaId: dna.id,
      assetKey: 'streamset',
      projectId: input.projectId,
      batchId,
      createdAt: now,
    };
    await saveJob(batch);
  }

  let refundedCoins = 0;

  const refundKey = async (key: string, amount: number, jobId?: string) => {
    if (amount <= 0) return;
    const result = await refundOnce({
      userId,
      chargeTransactionId,
      amount,
      description: `Streamset ${key} — Rückerstattung`,
      jobId,
      quoteId: input.quoteId,
      idempotencyKey: `refund:streamset:${input.quoteId ?? batchId}:${key}`,
    });
    if (!result.duplicate) refundedCoins += amount;
  };

  try {
    if (streamsetTestHooks?.throwOnCreate) {
      throw new Error('job-create-failure');
    }

    const { characterDna } = await getCcdPromptContext(userId, input.projectId);
    const jobs: GenerationJob[] = [];
    for (const key of selectedKeys) {
      const item = getStreamsetAsset(key)!;
      const job = await runCatalogItem(userId, dna, item, characterDna, {
        projectId: input.projectId,
        batchId,
        parentJobId: batchId,
        creatorName: input.creatorName,
        includeCreatorName: input.includeCreatorName,
        platform: input.platform,
        quoteId: input.quoteId,
        changeRequest: input.changeRequest,
      });
      jobs.push(job);
      if (job.status === 'failed') {
        await refundKey(item.key, shares[item.key] ?? 0, job.id);
      }
    }

    const allChildren = await jobsForBatch(userId, batchId);
    const latest = latestJobsPerAssetKey(allChildren.length ? allChildren : jobs);
    const batchStatus = deriveStreamsetBatchStatus(latest);
    batch.status = batchStatus === 'partial' ? 'partial' : batchStatus;
    batch.completedAt = new Date().toISOString();
    if (batchStatus === 'failed') {
      batch.error = 'Streamset fehlgeschlagen — Coins wurden erstattet';
    } else if (batchStatus === 'partial') {
      batch.error = `${latest.filter((j) => j.status === 'completed').length}/${latest.length} Assets erfolgreich`;
    } else {
      batch.error = undefined;
    }
    await saveJob(batch);
    await settleBillableCharge(chargeId, batchId);

    const newBalance = await getCoinBalance(userId);
    return {
      batch,
      jobs,
      coinsSpent: pricing.total,
      refundedCoins,
      newBalance,
      batchStatus,
      chargeId,
    };
  } catch (err) {
    const remainder = pricing.total - refundedCoins;
    if (remainder > 0) {
      await refundKey('create-failure', remainder);
    }
    if (!input.attachToBatchId) {
      batch.status = 'failed';
      batch.error = err instanceof Error ? err.message : 'Streamset fehlgeschlagen';
      batch.completedAt = new Date().toISOString();
      await saveJob(batch).catch(() => undefined);
    } else {
      const remaining = await jobsForBatch(userId, batchId);
      const latest = latestJobsPerAssetKey(remaining);
      batch.status = deriveStreamsetBatchStatus(latest);
      batch.status = batch.status === 'partial' ? 'partial' : batch.status;
      await saveJob(batch).catch(() => undefined);
    }
    await settleBillableCharge(chargeId, batchId).catch(() => undefined);
    if (err instanceof ServiceError) throw err;
    throw new ServiceError(
      503,
      'AI_GENERATION_FAILED',
      'Streamset fehlgeschlagen — Coins wurden erstattet'
    );
  }
}

export async function generateStreamsetPack(
  userId: string,
  projectId?: string
): Promise<{
  jobs: GenerationJob[];
  coinsSpent: number;
  newBalance: number;
}> {
  const result = await executeQuotedStreamset(userId, {
    projectId,
    selectedKeys: STREAMSET_PACK_ITEMS.map((item) => item.key),
    expectedCost: STREAMSET_PACK_COIN_COST,
  });
  if (result.batchStatus === 'failed') {
    throw new ServiceError(
      503,
      'AI_GENERATION_FAILED',
      'Komplettset fehlgeschlagen — Coins wurden erstattet'
    );
  }
  return {
    jobs: result.jobs,
    coinsSpent: result.coinsSpent,
    newBalance: result.newBalance,
  };
}

export async function generateStreamsetAsset(
  userId: string,
  input: { assetKey?: string; kind?: StreamsetGeneratorKind; projectId?: string }
) {
  const item = resolveStreamsetAssetKey(input.assetKey, input.kind);
  if (!item) {
    throw new ServiceError(400, 'INVALID_ASSET', 'Unbekanntes Streamset-Asset');
  }

  const { dna } = await resolveDnaForRequest(userId, input.projectId);
  if (!dna) throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');

  const studioOptions = optionsForStreamsetItem(item, dna.styleDirection);
  return generateStudioAsset(
    userId,
    item.module,
    item.coinCategory,
    `Streamset ${item.label}`,
    studioOptions,
    { projectId: input.projectId, assetKey: item.key }
  );
}

export async function getStreamsetStatus(userId: string, projectId?: string) {
  const resolved = await resolveDnaForRequest(userId, projectId);
  const allJobs = await getJobsByUser(userId);
  const jobs = allJobs.filter((j) => !projectId || !j.projectId || j.projectId === projectId);
  const creatorName = resolved.dna?.name;
  const assets = STREAMSET_PACK_ITEMS.map((item) => {
    const job = pickJobForStreamsetAsset(item, jobs);
    return {
      key: item.key,
      label: item.label,
      tab: item.tab,
      module: item.module,
      present: streamsetAssetPresent(item, jobs),
      coinCost: COIN_COSTS[item.coinCategory],
      job: job
        ? {
            id: job.id,
            status: job.status,
            imageUrl: job.imageUrl,
            error: job.error,
            assetKey: job.assetKey,
            module: job.module,
            fileId: job.fileId,
          }
        : undefined,
    };
  });

  const batches = jobs
    .filter((j) => j.module === 'streamset')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const parent = batches[0];
  let latestBatch:
    | {
        id: string;
        status: string;
        batchStatus: string;
        incomplete: boolean;
        selectedCount: number;
        completedCount: number;
        jobs: Array<Record<string, unknown>>;
      }
    | undefined;
  if (parent) {
    const children = jobs.filter((j) => j.batchId === parent.id && j.id !== parent.id);
    const latest = latestJobsPerAssetKey(children);
    const batchStatus = deriveStreamsetBatchStatus(latest.length ? latest : [parent]);
    const resultJobs = [];
    for (const job of latest) {
      resultJobs.push(await describeStreamsetResult(userId, job, children, creatorName));
    }
    latestBatch = {
      id: parent.id,
      status: parent.status,
      batchStatus,
      incomplete: batchStatus !== 'completed',
      selectedCount: latest.length,
      completedCount: latest.filter((j) => j.status === 'completed' && Boolean(j.imageUrl)).length,
      jobs: resultJobs,
    };
  }

  return {
    packCoinCost: STREAMSET_PACK_COIN_COST,
    dna: resolved.dna
      ? {
          id: resolved.dna.id,
          name: resolved.dna.name,
          source: resolved.source,
          primaryColors: resolved.dna.primaryColors,
          locks: resolved.dna.locks,
          styleDirection: resolved.dna.styleDirection,
        }
      : null,
    projectName: resolved.projectName,
    assets,
    missing: missingStreamsetLabels(jobs),
    jobs: jobs.filter(
      (j) => j.assetKey || j.module === 'streamset' || STREAMSET_PACK_ITEMS.some((item) => item.module === j.module)
    ),
    latestBatch,
  };
}

async function describeStreamsetResult(
  userId: string,
  job: GenerationJob,
  siblings: GenerationJob[],
  creatorName?: string
) {
  const key = job.assetKey || job.module;
  const versionsForKey = siblings.filter((row) => row.assetKey === key).length;
  const designVersions = await getVersionsForJob(job.id, userId);
  const file = job.fileId
    ? await getUserFile(job.fileId, userId)
    : await getFileBySourceJobId(userId, job.id);
  let fileMissing = false;
  let previewUrl: string | undefined = job.imageUrl?.startsWith('data:') ? job.imageUrl : undefined;
  if (job.status === 'completed') {
    if (file) {
      try {
        const minted = await mintDownloadUrlForOwnedFile(userId, file);
        if (!minted) fileMissing = true;
        else previewUrl = minted.url;
      } catch {
        fileMissing = true;
      }
    } else if (!job.imageUrl) {
      fileMissing = true;
    } else {
      previewUrl = job.imageUrl;
    }
  }
  const refunded = key ? await streamsetAssetRefunded(userId, job.batchId || job.parentJobId, key) : false;
  const retryPolicy =
    job.status === 'processing' || job.status === 'queued'
      ? 'in_flight'
      : job.status === 'failed' && !refunded
        ? 'technical'
        : job.status === 'failed' && refunded
          ? 'paid_quote'
          : job.status === 'completed'
            ? 'paid_quote'
            : 'not_allowed';
  const coinCost = getStreamsetAsset(key)?.coinCategory
    ? COIN_COSTS[getStreamsetAsset(key)!.coinCategory]
    : 0;
  return {
    id: job.id,
    key,
    label: STREAMSET_PACK_ITEMS.find((item) => item.key === key)?.label ?? key,
    status: job.status,
    imageUrl: previewUrl,
    error: job.status === 'failed' ? (job.error || 'Generierung fehlgeschlagen.') : undefined,
    fileId: file?.id ?? job.fileId,
    fileMissing,
    version: Math.max(versionsForKey, designVersions.length, 1),
    versionCount: Math.max(versionsForKey, designVersions.length),
    downloadName: streamsetDownloadBasename(creatorName, key),
    retryPolicy,
    retryCoinCost: retryPolicy === 'paid_quote' ? coinCost : 0,
    canRetry: retryPolicy === 'technical' || retryPolicy === 'paid_quote',
    canDownload: job.status === 'completed' && !fileMissing && Boolean(file?.id || previewUrl),
  };
}

async function streamsetAssetRefunded(userId: string, batchId: string | undefined, assetKey: string): Promise<boolean> {
  if (!batchId) return false;
  const txs = (await getTransactions(userId, 80)) as CoinTransaction[];
  const needle = `refund:streamset:${batchId}:${assetKey}`;
  return txs.some(
    (tx) =>
      tx.type === 'refund' &&
      (tx.idempotencyKey === needle ||
        tx.idempotencyKey?.startsWith(`${needle}:`) ||
        (tx.description || '').includes(assetKey))
  );
}

/**
 * Retry cost policy:
 * - technical: failed child, no per-asset refund yet → regenerate that key only, no new charge
 * - paid_quote: failed+refunded or new variant of a success → current asset price + quote confirm
 * Never silent unlimited free generations after refund.
 */
export async function inspectStreamsetRetry(
  userId: string,
  batchId: string,
  assetKey: string,
  variant?: boolean
): Promise<{
  policy: 'technical' | 'paid_quote' | 'in_flight' | 'not_allowed';
  job?: GenerationJob;
  batch: GenerationJob;
  coinCost: number;
  message: string;
}> {
  const batch = await getJob(batchId);
  if (!batch || batch.userId !== userId || batch.module !== 'streamset') {
    throw new ServiceError(404, 'BATCH_NOT_FOUND', 'Streamset nicht gefunden');
  }
  const item = getStreamsetAsset(assetKey);
  if (!item) throw new ServiceError(400, 'INVALID_ASSET', 'Unbekanntes Streamset-Asset');
  const children = await jobsForBatch(userId, batchId);
  const latest = latestJobsPerAssetKey(children).find((job) => job.assetKey === assetKey);
  if (!latest) {
    throw new ServiceError(400, 'RETRY_NOT_ALLOWED', 'Dieses Asset gehört nicht zu diesem Streamset');
  }
  const coinCost = COIN_COSTS[item.coinCategory];
  if (latest.status === 'processing' || latest.status === 'queued') {
    return { policy: 'in_flight', job: latest, batch, coinCost, message: 'Dieses Asset wird bereits erstellt.' };
  }
  if (variant || latest.status === 'completed') {
    return {
      policy: 'paid_quote',
      job: latest,
      batch,
      coinCost,
      message: 'Neue Variante ist kostenpflichtig und braucht eine Bestätigung.',
    };
  }
  if (latest.status === 'failed') {
    const refunded = await streamsetAssetRefunded(userId, batchId, assetKey);
    if (!refunded) {
      return {
        policy: 'technical',
        job: latest,
        batch,
        coinCost: 0,
        message: 'Technischer Retry ohne neue Abbuchung.',
      };
    }
    return {
      policy: 'paid_quote',
      job: latest,
      batch,
      coinCost,
      message: 'Bereits erstattet. Ein neuer Versuch ist kostenpflichtig.',
    };
  }
  return { policy: 'not_allowed', job: latest, batch, coinCost, message: 'Retry nicht möglich.' };
}

export async function runTechnicalStreamsetRetry(
  userId: string,
  batchId: string,
  assetKey: string
): Promise<{ job: GenerationJob; charged: false; policy: 'technical' | 'in_flight' }> {
  const run = async () => {
    const inspected = await inspectStreamsetRetry(userId, batchId, assetKey);
    if (inspected.policy !== 'technical') {
      if (inspected.job) {
        return { job: inspected.job, charged: false as const, policy: 'in_flight' as const };
      }
      throw new ServiceError(409, 'RETRY_REQUIRES_QUOTE', inspected.message);
    }
    const item = getStreamsetAsset(assetKey)!;
    const { dna } = await resolveDnaForRequest(userId, inspected.batch.projectId);
    if (!dna) throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');
    const { characterDna } = await getCcdPromptContext(userId, inspected.batch.projectId);
    const job = await runCatalogItem(userId, dna, item, characterDna, {
      projectId: inspected.batch.projectId,
      batchId,
      parentJobId: batchId,
      platform: undefined,
    });
    const children = await jobsForBatch(userId, batchId);
    const latest = latestJobsPerAssetKey(children);
    inspected.batch.status = deriveStreamsetBatchStatus(latest);
    inspected.batch.completedAt = new Date().toISOString();
    await saveJob(inspected.batch);
    return { job, charged: false as const, policy: 'technical' as const };
  };
  if (isDevMode()) {
    return withDevLock(streamsetRetryLockKey(batchId, assetKey), run);
  }
  return run();
}

export function streamsetCatalogKeys(): string[] {
  return STREAMSET_PACK_ITEMS.map((item) => item.key);
}

export function requireStreamsetAsset(key: string): StreamsetAssetDef {
  const item = getStreamsetAsset(key);
  if (!item) throw new ServiceError(400, 'INVALID_ASSET', 'Unbekanntes Streamset-Asset');
  return item;
}

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith('data:')) {
      const base64 = url.split(',')[1];
      if (!base64) return null;
      return Buffer.from(base64, 'base64');
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** ZIP of successful owned streamset binaries only. Missing parts are listed, not faked. */
export async function exportStreamsetZip(
  userId: string,
  projectId?: string
): Promise<{
  exportUrl: string;
  files: number;
  missing: string[];
  exportedAt: string;
  incomplete: boolean;
  fileName: string;
  completeLabel: string;
}> {
  const status = await getStreamsetStatus(userId, projectId);
  const exportedAt = new Date().toISOString();
  const entries: { name: string; data: Buffer }[] = [];
  const packed: { key: string; filename: string; missing: boolean }[] = [];
  const seen = new Set<string>();
  const creatorName = status.dna?.name;
  const selected: Array<{ key: string; imageUrl?: string; status?: string; fileMissing?: boolean }> =
    status.latestBatch?.jobs?.length
      ? status.latestBatch.jobs.map((job) => ({
          key: String(job.key || ''),
          imageUrl: typeof job.imageUrl === 'string' ? job.imageUrl : undefined,
          status: typeof job.status === 'string' ? job.status : undefined,
          fileMissing: Boolean(job.fileMissing),
        }))
      : status.assets
          .filter((asset) => asset.job?.status === 'completed')
          .map((asset) => ({
            key: asset.key,
            imageUrl: asset.job?.imageUrl,
            status: asset.job?.status,
            fileMissing: false,
          }));

  for (const asset of selected) {
    const key = asset.key;
    const url = asset.imageUrl;
    const ok = asset.status === 'completed';
    const fileMissing = Boolean(asset.fileMissing);
    if (!ok || !url || fileMissing) {
      packed.push({ key, filename: '', missing: true });
      continue;
    }
    if (seen.has(url)) {
      packed.push({ key, filename: '(duplikat übersprungen)', missing: false });
      continue;
    }
    const buf = await fetchBuffer(url);
    if (!buf) {
      packed.push({ key, filename: '', missing: true });
      continue;
    }
    seen.add(url);
    const filename = sanitizeZipEntryName(streamsetDownloadBasename(creatorName, key));
    entries.push({ name: zipEntryPath('streamset', filename), data: buf });
    packed.push({ key, filename, missing: false });
  }

  const files = packed.filter((p) => !p.missing && p.filename && !p.filename.startsWith('(')).length;
  if (!files) {
    throw new ServiceError(400, 'STREAMSET_EXPORT_EMPTY', 'Keine erfolgreichen Streamset-Dateien zum Packen.');
  }

  const incomplete = packed.some((p) => p.missing) || status.latestBatch?.incomplete === true;
  const fileName = sanitizeZipEntryName(streamsetDownloadBasename(creatorName, 'streamset', 'zip'));

  entries.unshift({
    name: 'manifest.json',
    data: Buffer.from(
      JSON.stringify(
        {
          exportVersion: 1,
          kind: 'streamset',
          projectId: projectId ?? null,
          exportedAt,
          incomplete,
          assets: packed,
        },
        null,
        2
      ),
      'utf8'
    ),
  });

  const zipBuffer = buildZipArchive(entries);
  const dataUrl = `data:application/zip;base64,${zipBuffer.toString('base64')}`;
  const exportUrl = await uploadAssetFromDataUrl(userId, dataUrl, {
    folder: 'streamset-exports',
    fileName,
  });
  return {
    exportUrl,
    files,
    missing: packed.filter((p) => p.missing).map((p) => p.key),
    exportedAt,
    incomplete,
    fileName,
    completeLabel: incomplete ? 'Unvollständiges Streamset' : 'Streamset',
  };
}

const DRAFT_COLLECTION = 'streamsetDrafts';

export interface StreamsetDraftInput {
  projectId?: string;
  platform?: string;
  selectedKeys?: string[];
  selectedSlotIds?: string[];
  sourceLogoJobId?: string;
  creatorName?: string;
  includeCreatorName?: boolean;
}

export interface StreamsetDraft {
  id: string;
  userId: string;
  projectId?: string;
  platform: StreamsetPlatform;
  sourceLogoJobId: string | null;
  sourceLogoPresent: boolean;
  dna: {
    id: string;
    name: string;
    source: string;
    primaryColors: string[];
    secondaryColors: string[];
    accentColors: string[];
    styleDirection?: string;
    mascot?: string;
    visualLanguage?: string;
    brandingStyle?: string;
    fonts: string[];
    version?: number;
  } | null;
  creatorName: string;
  includeCreatorName: boolean;
  selectedKeys: string[];
  includedAssets: Array<{
    key: string;
    label: string;
    module: string;
    catalogType?: string;
    coinCost: number;
    transparentBackground: boolean;
    transparencyConstraint: string;
    formatPreset?: { width: number; height: number; aspect: string; label: string };
  }>;
  layoutPreset: ReturnType<typeof getStreamLayoutPreset>;
  designConsistency: ReturnType<typeof streamsetSharedDesignParams>;
  estimatedCoins: number;
  packDiscountApplied: boolean;
  pricingSku: StreamsetPricingSku;
  coinBalance: number;
  canAfford: boolean;
  insufficientCoins: boolean;
  confirmationSummary: string;
  generated: false;
  charged: false;
  relationships: {
    setId: string;
    parentType: 'streamset';
    children: Array<{ assetKey: string; parentSetId: string }>;
  };
  createdAt: string;
  personalDnaId?: string;
}

function parsePlatform(raw?: string): StreamsetPlatform {
  const value = (raw ?? '').toLowerCase();
  if ((STREAMSET_PLATFORMS as string[]).includes(value)) return value as StreamsetPlatform;
  return 'twitch';
}

export async function requireOwnedLogoJob(userId: string, jobId: string): Promise<GenerationJob> {
  const job = await getJob(jobId);
  if (!job || job.userId !== userId || job.module !== 'logo') {
    throw new ServiceError(404, 'LOGO_NOT_FOUND', 'Logo nicht gefunden');
  }
  return job;
}

export async function getStreamsetDraft(userId: string, draftId: string): Promise<StreamsetDraft | null> {
  const row = await dsGet(DRAFT_COLLECTION, draftId);
  if (!row || row.userId !== userId) return null;
  return row as unknown as StreamsetDraft;
}

/** Preview only — no coin charge, no provider job, no DNA write. */
export async function previewStreamsetDraft(
  userId: string,
  input: StreamsetDraftInput = {}
): Promise<StreamsetDraft> {
  const platform = parsePlatform(input.platform);
  const selectedKeys = resolveStreamsetSelection(platform, input.selectedKeys, input.selectedSlotIds);
  if (!selectedKeys.length) {
    throw new ServiceError(400, 'INVALID_SELECTION', 'Keine gültigen Streamset-Assets ausgewählt');
  }

  const resolved = await resolveDnaForRequest(userId, input.projectId);
  const personalDna = await getActiveDna(userId);
  const prefs = await getNexterPreferencesForUser(userId);
  const balance = await getCoinBalance(userId);

  let sourceLogoJobId: string | null = null;
  let sourceLogoPresent = false;
  if (input.sourceLogoJobId) {
    const logo = await requireOwnedLogoJob(userId, input.sourceLogoJobId);
    sourceLogoJobId = logo.id;
    sourceLogoPresent = Boolean(logo.imageUrl);
  } else {
    const jobs = await getJobsByUser(userId);
    const ownedLogo = jobs.find((job) => job.module === 'logo' && job.status === 'completed' && job.imageUrl);
    if (ownedLogo) {
      sourceLogoJobId = ownedLogo.id;
      sourceLogoPresent = true;
    }
  }

  const pricing = coinCostForStreamsetSelection(selectedKeys);
  const layoutPreset = getStreamLayoutPreset(platform);
  const includeCreatorName = input.includeCreatorName !== false;
  const creatorName =
    (input.creatorName && input.creatorName.trim()) ||
    prefs.addressAs ||
    resolved.dna?.name ||
    '';

  const includedAssets = selectedKeys.map((key) => {
    const item = getStreamsetAsset(key)!;
    const banner =
      item.module === 'banner'
        ? {
            width: layoutPreset.width,
            height: layoutPreset.height,
            aspect: layoutPreset.aspect,
            label: item.label,
          }
        : item.tab === 'screens'
          ? { width: layoutPreset.width, height: layoutPreset.height, aspect: layoutPreset.aspect, label: layoutPreset.label }
          : item.module === 'facecam'
            ? { width: 512, height: 512, aspect: '1:1', label: 'Facecam' }
            : undefined;
    return {
      key: item.key,
      label: item.label,
      module: item.module,
      catalogType: catalogTypeForItem(item),
      coinCost: COIN_COSTS[item.coinCategory],
      transparentBackground: assetRequiresTransparency(item),
      transparencyConstraint: transparencyConstraintForItem(item),
      formatPreset: banner,
    };
  });

  const id = randomUUID();
  const confirmationSummary =
    pricing.pricingSku === 'a_la_carte'
      ? `Ausgewählte Einzelteile: ${includedAssets.length} Assets für ${pricing.total} Coins.`
      : `${streamsetPriceCaption(pricing.pricingSku, pricing.total)}.`;
  const draft: StreamsetDraft = {
    id,
    userId,
    projectId: input.projectId,
    platform,
    sourceLogoJobId,
    sourceLogoPresent,
    dna: resolved.dna
      ? {
          id: resolved.dna.id,
          name: resolved.dna.name,
          source: resolved.source,
          primaryColors: resolved.dna.primaryColors,
          secondaryColors: resolved.dna.secondaryColors,
          accentColors: resolved.dna.accentColors,
          styleDirection: resolved.dna.styleDirection,
          mascot: resolved.dna.mascot,
          visualLanguage: resolved.dna.visualLanguage,
          brandingStyle: resolved.dna.brandingStyle,
          fonts: (resolved.dna.fonts ?? []).map((f) => f.name).filter(Boolean),
          version: resolved.dna.version,
        }
      : null,
    creatorName,
    includeCreatorName,
    selectedKeys,
    includedAssets,
    layoutPreset,
    designConsistency: streamsetSharedDesignParams(resolved.dna ?? {}),
    estimatedCoins: pricing.total,
    packDiscountApplied: pricing.packDiscountApplied,
    pricingSku: pricing.pricingSku,
    coinBalance: balance,
    canAfford: balance >= pricing.total,
    insufficientCoins: balance < pricing.total,
    confirmationSummary,
    generated: false,
    charged: false,
    relationships: {
      setId: id,
      parentType: 'streamset',
      children: selectedKeys.map((assetKey) => ({ assetKey, parentSetId: id })),
    },
    createdAt: new Date().toISOString(),
    personalDnaId: personalDna?.id,
  };
  await dsSet(DRAFT_COLLECTION, draft.id, draft as unknown as Record<string, unknown>);
  return draft;
}

function catalogTypeForItem(item: StreamsetAssetDef): string {
  if (item.key === 'starting-soon') return 'starting-screen';
  if (item.key === 'brb') return 'brb-screen';
  if (item.key === 'ending') return 'ending-screen';
  if (item.module === 'facecam') return 'facecam';
  if (item.module === 'banner') return 'banner';
  if (item.module === 'sticker') return 'sticker';
  if (item.key === 'hud') return 'overlay';
  return 'overlay';
}

export async function assertDraftOwned(userId: string, draftId: string): Promise<StreamsetDraft> {
  const draft = await getStreamsetDraft(userId, draftId);
  if (!draft) throw new ServiceError(404, 'DRAFT_NOT_FOUND', 'Streamset-Entwurf nicht gefunden');
  return draft;
}
