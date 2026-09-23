import { randomUUID } from 'node:crypto';
import {
  NEXTER_QUOTE_TTL_MS,
  STREAMSET_PACK_ITEMS,
  attachRightsSafetyToPayload,
  classifyContentRightsRisk,
  sanitizeSafeAssetReference,
  coinCostForStreamsetSelection,
  generatedVideoDurationFollowUpMessage,
  inspectGeneratedVideoQuoteDuration,
  type NexterQuote,
  type NexterQuoteKind,
} from '@ucbs/shared';
import { dsGet, dsSet, dsList } from '../../lib/data-store.js';
import { omitUndefinedFields } from '../../lib/firestore-payload.js';
import { ServiceError } from '../../lib/errors.js';
import { resolveDnaForRequest } from '../dna.service.js';
import { getCoinBalance } from '../coins.service.js';
import { generateStudioAsset, getJobsByUser, type GenerationJob } from '../ai.service.js';
import { generateLogoAsset } from '../logo.service.js';
import { generateBannerAsset } from '../banner.service.js';
import { generateFacecamAsset } from '../facecam.service.js';
import { generateOverlayAsset } from '../overlay.service.js';
import { generateStickerAsset } from '../sticker.service.js';
import { executeQuotedStreamset, getStreamsetDraft } from '../streamset.service.js';
import { generateLifestyleMockup } from '../mockup.service.js';
import { generateAnimation } from '../animation.service.js';
import { generateAiVideo } from '../ai-video.service.js';
import { generateMusicTrack } from '../music.service.js';
import { generateVoiceTrack } from '../voice.service.js';
import { generateContentPackage, type TextQuotePayload } from '../text.service.js';
import { executeQuotedChangeRequest } from '../change-request.service.js';
import { executeQuotedCaptions } from '../media.service.js';
import { coinCostForKind, evaluateGenerationGate, QUOTE_KIND_CATEGORY, recordOwnedByUser } from './tools.service.js';
import { assertCurrentContentRightsAck } from '../content-rights.service.js';
import { quoteLockKey, withDevLock } from '../../lib/dev-mutex.js';

const COLLECTION = 'nexterQuotes';

function selectedKeysFromPayload(payload?: Record<string, unknown>): string[] | null {
  const raw = payload?.selectedKeys;
  if (Array.isArray(raw) && raw.length > 0 && raw.every((key) => typeof key === 'string' && key.length > 0)) {
    return raw as string[];
  }
  return null;
}

export async function createQuote(
  userId: string,
  kind: NexterQuoteKind,
  projectId?: string,
  payload?: Record<string, unknown>,
  coinCost?: number
): Promise<NexterQuote> {
  const now = Date.now();
  let resolvedPayload = payload;
  if (coinCost !== undefined && (typeof coinCost !== 'number' || !Number.isFinite(coinCost) || !Number.isInteger(coinCost) || coinCost < 0)) {
    throw new ServiceError(400, 'INVALID_INPUT', 'Die Anfrage ist ungültig');
  }
  let resolvedCost: number;
  if (kind === 'streamset') {
    const selectedKeys = selectedKeysFromPayload(payload) ?? STREAMSET_PACK_ITEMS.map((item) => item.key);
    resolvedPayload = { ...(payload ?? {}), selectedKeys };
    resolvedCost = coinCost === undefined ? coinCostForStreamsetSelection(selectedKeys).total : coinCost;
  } else {
    resolvedCost = coinCost === undefined ? coinCostForKind(kind) : coinCost;
  }
  if (!Number.isInteger(resolvedCost) || !Number.isFinite(resolvedCost) || resolvedCost < 0) {
    throw new ServiceError(400, 'INVALID_INPUT', 'Die Anfrage ist ungültig');
  }
  if (kind === 'animation' || kind === 'ai-video') {
    const durationCheck = inspectGeneratedVideoQuoteDuration(resolvedPayload ?? payload);
    if (!durationCheck.ok) {
      throw new ServiceError(400, 'INVALID_DURATION', generatedVideoDurationFollowUpMessage());
    }
  }
  let ownedProjectId: string | undefined;
  if (typeof projectId === 'string' && projectId.trim()) {
    if (kind === 'captions') {
      ownedProjectId = projectId.trim();
    } else {
      const { assertOwnedProjectId } = await import('../project.service.js');
      ownedProjectId = await assertOwnedProjectId(userId, projectId);
    }
  }
  const quote: NexterQuote = {
    id: randomUUID(),
    userId,
    kind,
    coinCost: resolvedCost,
    status: 'pending',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + NEXTER_QUOTE_TTL_MS).toISOString(),
  };
  if (ownedProjectId) quote.projectId = ownedProjectId;
  const classified = classifyContentRightsRisk('', resolvedPayload ?? payload ?? undefined);
  resolvedPayload = attachRightsSafetyToPayload(resolvedPayload ?? payload ?? {}, classified);
  if (resolvedPayload && typeof resolvedPayload === 'object') {
    const next: Record<string, unknown> = { ...resolvedPayload };
    for (const key of Object.keys(next)) {
      if (/(signedUrl|downloadUrl|providerUrl|storagePath)/i.test(key)) delete next[key];
    }
    if (next.assetReference) {
      const ref = sanitizeSafeAssetReference(next.assetReference);
      if (!ref) {
        delete next.assetReference;
      } else {
        const { resolveProjectAssetReference } = await import('../project-memory.service.js');
        const check = await resolveProjectAssetReference(userId, ref.projectId, ref.role, { assetId: ref.assetId });
        if (!check.ok) {
          throw new ServiceError(403, 'ASSET_REFERENCE_DENIED', 'Diese Projektreferenz ist nicht verfügbar.');
        }
        if (ownedProjectId && check.ref.projectId !== ownedProjectId) {
          throw new ServiceError(403, 'ASSET_REFERENCE_DENIED', 'Diese Projektreferenz gehört nicht zum gewählten Projekt.');
        }
        next.assetReference = check.ref;
      }
    }
    resolvedPayload = next;
  }
  quote.payload = omitUndefinedFields(resolvedPayload);
  await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
  return quote;
}

/** Pending cost quote from a streamset draft — no charge, no provider job. */
export async function quoteStreamsetDraft(userId: string, draftId: string): Promise<NexterQuote> {
  const draft = await getStreamsetDraft(userId, draftId);
  if (!draft) throw new ServiceError(404, 'DRAFT_NOT_FOUND', 'Streamset-Entwurf nicht gefunden');
  return createQuote(
    userId,
    'streamset',
    draft.projectId,
    {
      draftId: draft.id,
      selectedKeys: draft.selectedKeys,
      platform: draft.platform,
      sourceLogoJobId: draft.sourceLogoJobId,
      creatorName: draft.creatorName,
      includeCreatorName: draft.includeCreatorName,
      itemCosts: draft.includedAssets.map((asset) => ({ key: asset.key, coinCost: asset.coinCost })),
    },
    draft.estimatedCoins
  );
}

export async function quoteStreamsetRetry(
  userId: string,
  batchId: string,
  assetKey: string
): Promise<NexterQuote> {
  const existing = ((await dsList(COLLECTION, { userId })) as unknown as NexterQuote[]).find(
    (quote) =>
      quote.kind === 'streamset' &&
      quote.status === 'pending' &&
      quote.payload?.retryBatchId === batchId &&
      Array.isArray(quote.payload?.selectedKeys) &&
      quote.payload.selectedKeys.length === 1 &&
      quote.payload.selectedKeys[0] === assetKey
  );
  if (existing) return existing;

  const jobs = await getJobsByUser(userId);
  const batch = jobs.find((job) => job.id === batchId && job.userId === userId && job.module === 'streamset');
  if (!batch) throw new ServiceError(404, 'BATCH_NOT_FOUND', 'Streamset nicht gefunden');
  const child = jobs.find((job) => job.batchId === batchId && job.assetKey === assetKey);
  if (!child) throw new ServiceError(400, 'RETRY_NOT_ALLOWED', 'Dieses Asset gehört nicht zu diesem Streamset');

  const pricing = coinCostForStreamsetSelection([assetKey]);
  if (!pricing.itemCosts.length) {
    throw new ServiceError(400, 'INVALID_ASSET', 'Unbekanntes Streamset-Asset');
  }
  return createQuote(
    userId,
    'streamset',
    batch.projectId,
    {
      selectedKeys: [assetKey],
      retryBatchId: batchId,
      retryAssetKey: assetKey,
      platform: typeof batch.prompt === 'string' ? undefined : undefined,
    },
    pricing.total
  );
}

export async function getQuote(userId: string, quoteId: string): Promise<NexterQuote | null> {
  const row = await dsGet(COLLECTION, quoteId);
  return recordOwnedByUser(row as unknown as NexterQuote | null, userId);
}

/** Own quotes only. Newest first. Does not charge. */
export async function listOwnedQuotes(userId: string, limit = 20): Promise<NexterQuote[]> {
  const cap = Math.min(50, Math.max(1, Math.floor(limit) || 20));
  const rows = await dsList(COLLECTION, { userId, orderBy: 'createdAt', order: 'desc', limit: cap });
  return (rows as unknown as NexterQuote[]).filter((quote) => quote.userId === userId);
}

export async function cancelQuote(userId: string, quoteId: string): Promise<NexterQuote> {
  const quote = await getQuote(userId, quoteId);
  if (!quote) throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
  if (quote.status !== 'pending') return quote;
  quote.status = 'cancelled';
  await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
  return quote;
}

function selectedKeysFromQuote(quote: NexterQuote): string[] {
  const raw = quote.payload?.selectedKeys;
  if (Array.isArray(raw) && raw.every((key) => typeof key === 'string' && key.length > 0)) {
    return raw as string[];
  }
  return STREAMSET_PACK_ITEMS.map((item) => item.key);
}

async function replayStreamsetConfirm(
  quote: NexterQuote,
  userId: string,
  balance: number
): Promise<{
  quote: NexterQuote;
  coinsSpent: number;
  refundedCoins: number;
  newBalance: number;
  jobIds: string[];
  batchStatus: string;
  jobs: GenerationJob[];
  batch?: GenerationJob;
}> {
  const jobIds = Array.isArray(quote.payload?.jobIds) ? (quote.payload.jobIds as string[]) : [];
  const batchId = typeof quote.payload?.batchId === 'string' ? quote.payload.batchId : undefined;
  const all = await getJobsByUser(userId);
  const jobs = all.filter(
    (job) => jobIds.includes(job.id) || (batchId && job.batchId === batchId && job.module !== 'streamset')
  );
  const batch = all.find((job) => job.id === batchId);
  return {
    quote,
    coinsSpent: typeof quote.payload?.coinsSpent === 'number' ? quote.payload.coinsSpent : quote.coinCost,
    refundedCoins: typeof quote.payload?.refundedCoins === 'number' ? quote.payload.refundedCoins : 0,
    newBalance: balance,
    jobIds,
    batchStatus: typeof quote.payload?.batchStatus === 'string' ? quote.payload.batchStatus : quote.status,
    jobs,
    batch,
  };
}

export async function confirmStreamsetQuote(userId: string, quoteId: string): Promise<{
  quote: NexterQuote;
  coinsSpent: number;
  refundedCoins: number;
  newBalance: number;
  jobIds: string[];
  batchStatus: string;
  jobs: GenerationJob[];
  batch?: GenerationJob;
}> {
  const run = async () => {
    const quote = await getQuote(userId, quoteId);
    if (!quote) throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (quote.kind !== 'streamset') {
      throw new ServiceError(400, 'INVALID_QUOTE', 'Dieses Angebot ist kein Streamset');
    }

    const balance = await getCoinBalance(userId);
    if (quote.status === 'completed' || quote.status === 'confirmed' || quote.status === 'failed') {
      return replayStreamsetConfirm(quote, userId, balance);
    }
    if (quote.status === 'cancelled') {
      throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    }
    if (quote.status === 'processing' && Array.isArray(quote.payload?.jobIds) && quote.payload.jobIds.length) {
      return replayStreamsetConfirm(quote, userId, balance);
    }

    const { dna } = await resolveDnaForRequest(userId, quote.projectId);
    const selectedKeys = selectedKeysFromQuote(quote);
    const currentCost = coinCostForStreamsetSelection(selectedKeys).total;
    const gate = evaluateGenerationGate({
      quoteUserId: quote.userId,
      requestUserId: userId,
      status: quote.status === 'processing' ? 'pending' : quote.status,
      expiresAt: quote.expiresAt,
      coinCost: currentCost,
      coinBalance: balance,
      hasDna: Boolean(dna),
    });

    if (gate === 'wrong_user') throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (gate === 'expired') {
      throw new ServiceError(410, 'QUOTE_EXPIRED', 'Das Angebot ist abgelaufen. Bitte neu anfragen.');
    }
    if (gate === 'no_dna') throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');
    if (gate === 'insufficient_coins') {
      throw new ServiceError(
        402,
        'INSUFFICIENT_COINS',
        `Nicht genügend Coins. Dieses Angebot kostet ${currentCost} Coins.`
      );
    }
    if (quote.status !== 'pending' && quote.status !== 'processing') {
      throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    }
    if (currentCost !== quote.coinCost) {
      throw new ServiceError(409, 'PRICE_CHANGED', 'Der Preis hat sich geändert. Bitte erneut bestätigen.', {
        previousCost: quote.coinCost,
        currentCost,
        selectedKeys,
      });
    }

    const chargeAttempt =
      typeof quote.payload?.chargeAttempt === 'number' && quote.payload.chargeAttempt >= 1
        ? Math.floor(quote.payload.chargeAttempt)
        : 1;

    quote.status = 'processing';
    await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);

    try {
      const executed = await executeQuotedStreamset(userId, {
        quoteId: quote.id,
        projectId: quote.projectId,
        selectedKeys,
        expectedCost: quote.coinCost,
        platform: typeof quote.payload?.platform === 'string' ? quote.payload.platform : undefined,
        creatorName: typeof quote.payload?.creatorName === 'string' ? quote.payload.creatorName : undefined,
        includeCreatorName: quote.payload?.includeCreatorName !== false,
        chargeAttempt,
        attachToBatchId:
          typeof quote.payload?.retryBatchId === 'string' ? quote.payload.retryBatchId : undefined,
        changeRequest: typeof quote.payload?.request === 'string' ? quote.payload.request : undefined,
      });
      quote.status =
        executed.batchStatus === 'completed'
          ? 'completed'
          : executed.batchStatus === 'failed'
            ? 'failed'
            : 'confirmed';
      quote.payload = {
        ...(quote.payload ?? {}),
        jobIds: executed.jobs.map((job) => job.id),
        batchId: executed.batch.id,
        chargeId: executed.chargeId,
        coinsSpent: executed.coinsSpent,
        refundedCoins: executed.refundedCoins,
        batchStatus: executed.batchStatus,
        chargeAttempt,
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      return {
        quote,
        coinsSpent: executed.coinsSpent,
        refundedCoins: executed.refundedCoins,
        newBalance: executed.newBalance,
        jobIds: executed.jobs.map((job) => job.id),
        batchStatus: executed.batchStatus,
        jobs: executed.jobs,
        batch: executed.batch,
      };
    } catch (err) {
      if (err instanceof ServiceError && (err.code === 'INSUFFICIENT_COINS' || err.code === 'PRICE_CHANGED' || err.code === 'IMAGE_GENERATION_UNAVAILABLE' || err.code === 'GENERATIONS_DISABLED')) {
        quote.status = 'pending';
        await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
        throw err;
      }
      quote.status = 'pending';
      quote.payload = {
        ...(quote.payload ?? {}),
        chargeAttempt: chargeAttempt + 1,
        lastError: err instanceof Error ? err.message : 'job-create-failure',
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      throw err;
    }
  };

  return withDevLock(quoteLockKey(quoteId), run);
}

async function confirmAnimationQuote(
  userId: string,
  quoteId: string
): Promise<{
  quote: NexterQuote;
  coinsSpent: number;
  newBalance: number;
  jobIds: string[];
  refundedCoins?: number;
}> {
  const run = async () => {
    const quote = await getQuote(userId, quoteId);
    if (!quote) throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (quote.kind !== 'animation') throw new ServiceError(400, 'INVALID_QUOTE', 'Dieses Angebot ist keine Animation');

    const balance = await getCoinBalance(userId);
    if (quote.status === 'confirmed' || quote.status === 'completed') {
      const jobIds = Array.isArray(quote.payload?.jobIds)
        ? quote.payload.jobIds.filter((id): id is string => typeof id === 'string')
        : [];
      return {
        quote,
        coinsSpent: typeof quote.payload?.coinsSpent === 'number' ? quote.payload.coinsSpent : 0,
        newBalance: balance,
        jobIds,
        refundedCoins: typeof quote.payload?.refundedCoins === 'number' ? quote.payload.refundedCoins : 0,
      };
    }
    if (quote.status === 'cancelled') {
      throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    }

    const { dna } = await resolveDnaForRequest(userId, quote.projectId);
    const serverCost = coinCostForKind('animation');
    if (quote.coinCost !== serverCost) {
      throw new ServiceError(409, 'PRICE_CHANGED', 'Der Preis hat sich geändert. Bitte ein neues Angebot bestätigen.');
    }
    const gate = evaluateGenerationGate({
      quoteUserId: quote.userId,
      requestUserId: userId,
      status: quote.status === 'processing' ? 'pending' : quote.status,
      expiresAt: quote.expiresAt,
      coinCost: serverCost,
      coinBalance: balance,
      hasDna: Boolean(dna),
    });
    if (gate === 'wrong_user') throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (gate === 'not_pending') throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    if (gate === 'expired') throw new ServiceError(410, 'QUOTE_EXPIRED', 'Das Angebot ist abgelaufen. Bitte neu anfragen.');
    if (gate === 'no_dna') throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');
    if (gate === 'insufficient_coins') {
      throw new ServiceError(402, 'INSUFFICIENT_COINS', `Nicht genügend Coins. Dieses Angebot kostet ${serverCost} Coins.`);
    }

    quote.status = 'processing';
    await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);

    try {
      const result = await generateAnimation(userId, quote.projectId, {
        ...(quote.payload ?? {}),
        quoteId: quote.id,
      });
      quote.status = 'confirmed';
      quote.payload = {
        ...(quote.payload ?? {}),
        jobIds: [result.job.id],
        coinsSpent: result.coinsSpent,
        refundedCoins: 0,
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      return {
        quote,
        coinsSpent: result.coinsSpent,
        newBalance: result.newBalance,
        jobIds: [result.job.id],
        refundedCoins: 0,
      };
    } catch (err) {
      quote.status = 'pending';
      quote.payload = {
        ...(quote.payload ?? {}),
        lastError: err instanceof Error ? err.message : 'animation-failed',
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      throw err;
    }
  };

  return withDevLock(quoteLockKey(quoteId), run);
}

async function confirmAiVideoQuote(
  userId: string,
  quoteId: string
): Promise<{
  quote: NexterQuote;
  coinsSpent: number;
  newBalance: number;
  jobIds: string[];
  refundedCoins?: number;
}> {
  const run = async () => {
    const quote = await getQuote(userId, quoteId);
    if (!quote) throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (quote.kind !== 'ai-video') throw new ServiceError(400, 'INVALID_QUOTE', 'Dieses Angebot ist kein KI-Video');

    const balance = await getCoinBalance(userId);
    if (quote.status === 'confirmed' || quote.status === 'completed') {
      const jobIds = Array.isArray(quote.payload?.jobIds)
        ? quote.payload.jobIds.filter((id): id is string => typeof id === 'string')
        : [];
      return {
        quote,
        coinsSpent: typeof quote.payload?.coinsSpent === 'number' ? quote.payload.coinsSpent : 0,
        newBalance: balance,
        jobIds,
        refundedCoins: typeof quote.payload?.refundedCoins === 'number' ? quote.payload.refundedCoins : 0,
      };
    }
    if (quote.status === 'cancelled') {
      throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    }

    const { dna } = await resolveDnaForRequest(userId, quote.projectId);
    const serverCost = coinCostForKind('ai-video');
    if (quote.coinCost !== serverCost) {
      throw new ServiceError(409, 'PRICE_CHANGED', 'Der Preis hat sich geändert. Bitte ein neues Angebot bestätigen.');
    }
    const gate = evaluateGenerationGate({
      quoteUserId: quote.userId,
      requestUserId: userId,
      status: quote.status === 'processing' ? 'pending' : quote.status,
      expiresAt: quote.expiresAt,
      coinCost: serverCost,
      coinBalance: balance,
      hasDna: Boolean(dna),
    });
    if (gate === 'wrong_user') throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (gate === 'not_pending') throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    if (gate === 'expired') throw new ServiceError(410, 'QUOTE_EXPIRED', 'Das Angebot ist abgelaufen. Bitte neu anfragen.');
    if (gate === 'no_dna') throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');
    if (gate === 'insufficient_coins') {
      throw new ServiceError(402, 'INSUFFICIENT_COINS', `Nicht genügend Coins. Dieses Angebot kostet ${serverCost} Coins.`);
    }

    quote.status = 'processing';
    await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);

    try {
      const result = await generateAiVideo(userId, quote.projectId, {
        ...(quote.payload ?? {}),
        quoteId: quote.id,
      });
      quote.status = 'confirmed';
      quote.payload = omitUndefinedFields({
        ...(quote.payload ?? {}),
        jobIds: [result.job.id],
        coinsSpent: result.coinsSpent,
        refundedCoins: 0,
      });
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      return {
        quote,
        coinsSpent: result.coinsSpent,
        newBalance: result.newBalance,
        jobIds: [result.job.id],
        refundedCoins: 0,
      };
    } catch (err) {
      quote.status = 'pending';
      quote.payload = omitUndefinedFields({
        ...(quote.payload ?? {}),
        lastError: err instanceof Error ? err.message : 'ai-video-failed',
      });
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      throw err;
    }
  };

  return withDevLock(quoteLockKey(quoteId), run);
}

async function confirmMusicQuote(
  userId: string,
  quoteId: string
): Promise<{
  quote: NexterQuote;
  coinsSpent: number;
  newBalance: number;
  jobIds: string[];
  refundedCoins?: number;
}> {
  const run = async () => {
    const quote = await getQuote(userId, quoteId);
    if (!quote) throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (quote.kind !== 'music') throw new ServiceError(400, 'INVALID_QUOTE', 'Dieses Angebot ist keine Musik');

    const balance = await getCoinBalance(userId);
    if (quote.status === 'confirmed' || quote.status === 'completed') {
      const jobIds = Array.isArray(quote.payload?.jobIds)
        ? quote.payload.jobIds.filter((id): id is string => typeof id === 'string')
        : [];
      return {
        quote,
        coinsSpent: typeof quote.payload?.coinsSpent === 'number' ? quote.payload.coinsSpent : 0,
        newBalance: balance,
        jobIds,
        refundedCoins: typeof quote.payload?.refundedCoins === 'number' ? quote.payload.refundedCoins : 0,
      };
    }
    if (quote.status === 'cancelled') {
      throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    }

    const { dna } = await resolveDnaForRequest(userId, quote.projectId);
    const serverCost = coinCostForKind('music');
    if (quote.coinCost !== serverCost) {
      throw new ServiceError(409, 'PRICE_CHANGED', 'Der Preis hat sich geändert. Bitte ein neues Angebot bestätigen.');
    }
    const gate = evaluateGenerationGate({
      quoteUserId: quote.userId,
      requestUserId: userId,
      status: quote.status === 'processing' ? 'pending' : quote.status,
      expiresAt: quote.expiresAt,
      coinCost: serverCost,
      coinBalance: balance,
      hasDna: Boolean(dna),
    });
    if (gate === 'wrong_user') throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (gate === 'not_pending') throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    if (gate === 'expired') throw new ServiceError(410, 'QUOTE_EXPIRED', 'Das Angebot ist abgelaufen. Bitte neu anfragen.');
    if (gate === 'no_dna') throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');
    if (gate === 'insufficient_coins') {
      throw new ServiceError(402, 'INSUFFICIENT_COINS', `Nicht genügend Coins. Dieses Angebot kostet ${serverCost} Coins.`);
    }

    quote.status = 'processing';
    await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);

    try {
      const result = await generateMusicTrack(userId, quote.projectId, {
        ...(quote.payload ?? {}),
        quoteId: quote.id,
      });
      quote.status = 'confirmed';
      quote.payload = omitUndefinedFields({
        ...(quote.payload ?? {}),
        jobIds: [result.job.id],
        coinsSpent: result.coinsSpent,
        refundedCoins: 0,
      });
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      return {
        quote,
        coinsSpent: result.coinsSpent,
        newBalance: result.newBalance,
        jobIds: [result.job.id],
        refundedCoins: 0,
      };
    } catch (err) {
      quote.status = 'pending';
      quote.payload = omitUndefinedFields({
        ...(quote.payload ?? {}),
        lastError: err instanceof Error ? err.message : 'music-failed',
      });
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      throw err;
    }
  };

  return withDevLock(quoteLockKey(quoteId), run);
}

async function confirmVoiceQuote(
  userId: string,
  quoteId: string
): Promise<{
  quote: NexterQuote;
  coinsSpent: number;
  newBalance: number;
  jobIds: string[];
  refundedCoins?: number;
}> {
  const run = async () => {
    const quote = await getQuote(userId, quoteId);
    if (!quote) throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (quote.kind !== 'voice') throw new ServiceError(400, 'INVALID_QUOTE', 'Dieses Angebot ist kein Voiceover');

    const balance = await getCoinBalance(userId);
    if (quote.status === 'confirmed' || quote.status === 'completed') {
      const jobIds = Array.isArray(quote.payload?.jobIds)
        ? quote.payload.jobIds.filter((id): id is string => typeof id === 'string')
        : [];
      return {
        quote,
        coinsSpent: typeof quote.payload?.coinsSpent === 'number' ? quote.payload.coinsSpent : 0,
        newBalance: balance,
        jobIds,
        refundedCoins: typeof quote.payload?.refundedCoins === 'number' ? quote.payload.refundedCoins : 0,
      };
    }
    if (quote.status === 'cancelled') {
      throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    }

    const { dna } = await resolveDnaForRequest(userId, quote.projectId);
    const serverCost = coinCostForKind('voice');
    if (quote.coinCost !== serverCost) {
      throw new ServiceError(409, 'PRICE_CHANGED', 'Der Preis hat sich geändert. Bitte ein neues Angebot bestätigen.');
    }
    const gate = evaluateGenerationGate({
      quoteUserId: quote.userId,
      requestUserId: userId,
      status: quote.status === 'processing' ? 'pending' : quote.status,
      expiresAt: quote.expiresAt,
      coinCost: serverCost,
      coinBalance: balance,
      hasDna: Boolean(dna),
    });
    if (gate === 'wrong_user') throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (gate === 'not_pending') throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    if (gate === 'expired') throw new ServiceError(410, 'QUOTE_EXPIRED', 'Das Angebot ist abgelaufen. Bitte neu anfragen.');
    if (gate === 'no_dna') throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');
    if (gate === 'insufficient_coins') {
      throw new ServiceError(402, 'INSUFFICIENT_COINS', `Nicht genügend Coins. Dieses Angebot kostet ${serverCost} Coins.`);
    }

    quote.status = 'processing';
    await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);

    try {
      const result = await generateVoiceTrack(userId, quote.projectId, {
        ...(quote.payload ?? {}),
        quoteId: quote.id,
      });
      quote.status = 'confirmed';
      quote.payload = {
        ...(quote.payload ?? {}),
        jobIds: [result.job.id],
        coinsSpent: result.coinsSpent,
        refundedCoins: 0,
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      return {
        quote,
        coinsSpent: result.coinsSpent,
        newBalance: result.newBalance,
        jobIds: [result.job.id],
        refundedCoins: 0,
      };
    } catch (err) {
      quote.status = 'pending';
      quote.payload = {
        ...(quote.payload ?? {}),
        lastError: 'voice-failed',
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      throw err;
    }
  };

  return withDevLock(quoteLockKey(quoteId), run);
}

async function confirmLogoQuote(
  userId: string,
  quoteId: string
): Promise<{
  quote: NexterQuote;
  coinsSpent: number;
  newBalance: number;
  jobIds: string[];
  refundedCoins?: number;
}> {
  const run = async () => {
    const quote = await getQuote(userId, quoteId);
    if (!quote) throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (quote.kind !== 'logo') throw new ServiceError(400, 'INVALID_QUOTE', 'Dieses Angebot ist kein Logo');

    const balance = await getCoinBalance(userId);
    if (quote.status === 'confirmed' || quote.status === 'completed') {
      const jobIds = Array.isArray(quote.payload?.jobIds)
        ? quote.payload.jobIds.filter((id): id is string => typeof id === 'string')
        : [];
      return {
        quote,
        coinsSpent: typeof quote.payload?.coinsSpent === 'number' ? quote.payload.coinsSpent : 0,
        newBalance: balance,
        jobIds,
        refundedCoins: typeof quote.payload?.refundedCoins === 'number' ? quote.payload.refundedCoins : 0,
      };
    }
    if (quote.status === 'cancelled') {
      throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    }

    const { dna } = await resolveDnaForRequest(userId, quote.projectId);
    const serverCost = coinCostForKind('logo');
    if (quote.coinCost !== serverCost) {
      throw new ServiceError(409, 'PRICE_CHANGED', 'Der Preis hat sich geändert. Bitte ein neues Angebot bestätigen.');
    }
    const payloadName =
      typeof quote.payload?.logoName === 'string'
        ? quote.payload.logoName
        : typeof quote.payload?.name === 'string'
          ? quote.payload.name
          : '';
    const hasNameOrDna = Boolean(dna) || Boolean(String(payloadName).trim());
    const gate = evaluateGenerationGate({
      quoteUserId: quote.userId,
      requestUserId: userId,
      status: quote.status === 'processing' ? 'pending' : quote.status,
      expiresAt: quote.expiresAt,
      coinCost: serverCost,
      coinBalance: balance,
      hasDna: hasNameOrDna,
    });
    if (gate === 'wrong_user') throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (gate === 'not_pending') throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    if (gate === 'expired') throw new ServiceError(410, 'QUOTE_EXPIRED', 'Das Angebot ist abgelaufen. Bitte neu anfragen.');
    if (gate === 'no_dna') throw new ServiceError(400, 'LOGO_NAME_REQUIRED', 'Für ein Logo brauche ich mindestens den Namen');
    if (gate === 'insufficient_coins') {
      throw new ServiceError(402, 'INSUFFICIENT_COINS', `Nicht genügend Coins. Dieses Angebot kostet ${serverCost} Coins.`);
    }

    if (quote.payload?.changeRequest && typeof quote.payload.jobId === 'string' && !quote.payload.parentJobId) {
      try {
        const result = await executeQuotedChangeRequest(
          userId,
          quote.payload.jobId,
          typeof quote.payload.request === 'string' ? quote.payload.request : 'Variante',
          quote.projectId
        );
        quote.status = 'confirmed';
        quote.payload = {
          ...(quote.payload ?? {}),
          jobIds: result.jobIds,
          coinsSpent: result.coinsSpent,
          refundedCoins: 0,
        };
        await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
        return {
          quote,
          coinsSpent: result.coinsSpent,
          newBalance: result.newBalance,
          jobIds: result.jobIds,
          refundedCoins: 0,
        };
      } catch (err) {
        quote.status = 'cancelled';
        await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
        throw err;
      }
    }

    quote.status = 'processing';
    await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);

    try {
      const result = await generateLogoAsset(userId, quote.projectId, {
        ...(quote.payload ?? {}),
        quoteId: quote.id,
      });
      quote.status = 'confirmed';
      quote.payload = {
        ...(quote.payload ?? {}),
        jobIds: [result.job.id],
        coinsSpent: result.coinsSpent,
        refundedCoins: 0,
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      return {
        quote,
        coinsSpent: result.coinsSpent,
        newBalance: result.newBalance,
        jobIds: [result.job.id],
        refundedCoins: 0,
      };
    } catch (err) {
      quote.status = 'pending';
      quote.payload = {
        ...(quote.payload ?? {}),
        lastError: err instanceof Error ? err.message : 'logo-failed',
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      throw err;
    }
  };

  return withDevLock(quoteLockKey(quoteId), run);
}

async function confirmBannerQuote(
  userId: string,
  quoteId: string
): Promise<{
  quote: NexterQuote;
  coinsSpent: number;
  newBalance: number;
  jobIds: string[];
  refundedCoins?: number;
}> {
  const run = async () => {
    const quote = await getQuote(userId, quoteId);
    if (!quote) throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (quote.kind !== 'banner') throw new ServiceError(400, 'INVALID_QUOTE', 'Dieses Angebot ist kein Banner');

    const balance = await getCoinBalance(userId);
    if (quote.status === 'confirmed' || quote.status === 'completed') {
      const jobIds = Array.isArray(quote.payload?.jobIds)
        ? quote.payload.jobIds.filter((id): id is string => typeof id === 'string')
        : [];
      return {
        quote,
        coinsSpent: typeof quote.payload?.coinsSpent === 'number' ? quote.payload.coinsSpent : 0,
        newBalance: balance,
        jobIds,
        refundedCoins: typeof quote.payload?.refundedCoins === 'number' ? quote.payload.refundedCoins : 0,
      };
    }
    if (quote.status === 'cancelled') {
      throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    }

    const { dna } = await resolveDnaForRequest(userId, quote.projectId);
    const serverCost = coinCostForKind('banner');
    if (quote.coinCost !== serverCost) {
      throw new ServiceError(409, 'PRICE_CHANGED', 'Der Preis hat sich geändert. Bitte ein neues Angebot bestätigen.');
    }
    const payloadTitle =
      typeof quote.payload?.title === 'string'
        ? quote.payload.title
        : typeof quote.payload?.name === 'string'
          ? quote.payload.name
          : '';
    const payloadPlatform = typeof quote.payload?.platform === 'string' ? quote.payload.platform : '';
    const hasBannerContext = Boolean(dna) || Boolean(String(payloadTitle).trim()) || Boolean(payloadPlatform);
    const gate = evaluateGenerationGate({
      quoteUserId: quote.userId,
      requestUserId: userId,
      status: quote.status === 'processing' ? 'pending' : quote.status,
      expiresAt: quote.expiresAt,
      coinCost: serverCost,
      coinBalance: balance,
      hasDna: hasBannerContext,
    });
    if (gate === 'wrong_user') throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (gate === 'not_pending') throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    if (gate === 'expired') throw new ServiceError(410, 'QUOTE_EXPIRED', 'Das Angebot ist abgelaufen. Bitte neu anfragen.');
    if (gate === 'no_dna') throw new ServiceError(400, 'BANNER_CONTEXT_REQUIRED', 'Für ein Banner brauche ich mindestens die Plattform oder einen Titel');
    if (gate === 'insufficient_coins') {
      throw new ServiceError(402, 'INSUFFICIENT_COINS', `Nicht genügend Coins. Dieses Angebot kostet ${serverCost} Coins.`);
    }

    if (quote.payload?.changeRequest && typeof quote.payload.jobId === 'string' && !quote.payload.parentJobId) {
      try {
        const result = await executeQuotedChangeRequest(
          userId,
          quote.payload.jobId,
          typeof quote.payload.request === 'string' ? quote.payload.request : 'Variante',
          quote.projectId
        );
        quote.status = 'confirmed';
        quote.payload = {
          ...(quote.payload ?? {}),
          jobIds: result.jobIds,
          coinsSpent: result.coinsSpent,
          refundedCoins: 0,
        };
        await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
        return {
          quote,
          coinsSpent: result.coinsSpent,
          newBalance: result.newBalance,
          jobIds: result.jobIds,
          refundedCoins: 0,
        };
      } catch (err) {
        quote.status = 'cancelled';
        await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
        throw err;
      }
    }

    quote.status = 'processing';
    await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);

    try {
      const result = await generateBannerAsset(userId, quote.projectId, {
        ...(quote.payload ?? {}),
        quoteId: quote.id,
      });
      quote.status = 'confirmed';
      quote.payload = {
        ...(quote.payload ?? {}),
        jobIds: [result.job.id],
        coinsSpent: result.coinsSpent,
        refundedCoins: 0,
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      return {
        quote,
        coinsSpent: result.coinsSpent,
        newBalance: result.newBalance,
        jobIds: [result.job.id],
        refundedCoins: 0,
      };
    } catch (err) {
      quote.status = 'pending';
      quote.payload = {
        ...(quote.payload ?? {}),
        lastError: err instanceof Error ? err.message : 'banner-failed',
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      throw err;
    }
  };

  return withDevLock(quoteLockKey(quoteId), run);
}

async function confirmFacecamQuote(
  userId: string,
  quoteId: string
): Promise<{
  quote: NexterQuote;
  coinsSpent: number;
  newBalance: number;
  jobIds: string[];
  refundedCoins?: number;
}> {
  const run = async () => {
    const quote = await getQuote(userId, quoteId);
    if (!quote) throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (quote.kind !== 'facecam') throw new ServiceError(400, 'INVALID_QUOTE', 'Dieses Angebot ist keine Facecam');

    const balance = await getCoinBalance(userId);
    if (quote.status === 'confirmed' || quote.status === 'completed') {
      const jobIds = Array.isArray(quote.payload?.jobIds)
        ? quote.payload.jobIds.filter((id): id is string => typeof id === 'string')
        : [];
      return {
        quote,
        coinsSpent: typeof quote.payload?.coinsSpent === 'number' ? quote.payload.coinsSpent : 0,
        newBalance: balance,
        jobIds,
        refundedCoins: typeof quote.payload?.refundedCoins === 'number' ? quote.payload.refundedCoins : 0,
      };
    }
    if (quote.status === 'cancelled') {
      throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    }

    const { dna } = await resolveDnaForRequest(userId, quote.projectId);
    const serverCost = coinCostForKind('facecam');
    if (quote.coinCost !== serverCost) {
      throw new ServiceError(409, 'PRICE_CHANGED', 'Der Preis hat sich geändert. Bitte ein neues Angebot bestätigen.');
    }
    const payloadPlatform = typeof quote.payload?.platform === 'string' ? quote.payload.platform : '';
    const hasFacecamContext = Boolean(dna) || Boolean(payloadPlatform);
    const gate = evaluateGenerationGate({
      quoteUserId: quote.userId,
      requestUserId: userId,
      status: quote.status === 'processing' ? 'pending' : quote.status,
      expiresAt: quote.expiresAt,
      coinCost: serverCost,
      coinBalance: balance,
      hasDna: hasFacecamContext,
    });
    if (gate === 'wrong_user') throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (gate === 'not_pending') throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    if (gate === 'expired') throw new ServiceError(410, 'QUOTE_EXPIRED', 'Das Angebot ist abgelaufen. Bitte neu anfragen.');
    if (gate === 'no_dna') throw new ServiceError(400, 'FACECAM_CONTEXT_REQUIRED', 'Für eine Facecam brauche ich mindestens die Plattform');
    if (gate === 'insufficient_coins') {
      throw new ServiceError(402, 'INSUFFICIENT_COINS', `Nicht genügend Coins. Dieses Angebot kostet ${serverCost} Coins.`);
    }

    if (quote.payload?.changeRequest && typeof quote.payload.jobId === 'string' && !quote.payload.parentJobId) {
      try {
        const result = await executeQuotedChangeRequest(
          userId,
          quote.payload.jobId,
          typeof quote.payload.request === 'string' ? quote.payload.request : 'Variante',
          quote.projectId
        );
        quote.status = 'confirmed';
        quote.payload = {
          ...(quote.payload ?? {}),
          jobIds: result.jobIds,
          coinsSpent: result.coinsSpent,
          refundedCoins: 0,
        };
        await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
        return {
          quote,
          coinsSpent: result.coinsSpent,
          newBalance: result.newBalance,
          jobIds: result.jobIds,
          refundedCoins: 0,
        };
      } catch (err) {
        quote.status = 'cancelled';
        await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
        throw err;
      }
    }

    quote.status = 'processing';
    await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);

    try {
      const result = await generateFacecamAsset(userId, quote.projectId, {
        ...(quote.payload ?? {}),
        quoteId: quote.id,
      });
      quote.status = 'confirmed';
      quote.payload = {
        ...(quote.payload ?? {}),
        jobIds: [result.job.id],
        coinsSpent: result.coinsSpent,
        refundedCoins: 0,
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      return {
        quote,
        coinsSpent: result.coinsSpent,
        newBalance: result.newBalance,
        jobIds: [result.job.id],
        refundedCoins: 0,
      };
    } catch (err) {
      quote.status = 'pending';
      quote.payload = {
        ...(quote.payload ?? {}),
        lastError: err instanceof Error ? err.message : 'facecam-failed',
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      throw err;
    }
  };

  return withDevLock(quoteLockKey(quoteId), run);
}

async function confirmOverlayQuote(
  userId: string,
  quoteId: string
): Promise<{
  quote: NexterQuote;
  coinsSpent: number;
  newBalance: number;
  jobIds: string[];
  refundedCoins?: number;
}> {
  const run = async () => {
    const quote = await getQuote(userId, quoteId);
    if (!quote) throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (quote.kind !== 'overlay') throw new ServiceError(400, 'INVALID_QUOTE', 'Dieses Angebot ist kein Overlay');

    const balance = await getCoinBalance(userId);
    if (quote.status === 'confirmed' || quote.status === 'completed') {
      const jobIds = Array.isArray(quote.payload?.jobIds)
        ? quote.payload.jobIds.filter((id): id is string => typeof id === 'string')
        : [];
      return {
        quote,
        coinsSpent: typeof quote.payload?.coinsSpent === 'number' ? quote.payload.coinsSpent : 0,
        newBalance: balance,
        jobIds,
        refundedCoins: typeof quote.payload?.refundedCoins === 'number' ? quote.payload.refundedCoins : 0,
      };
    }
    if (quote.status === 'cancelled') {
      throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    }

    const { dna } = await resolveDnaForRequest(userId, quote.projectId);
    const serverCost = coinCostForKind('overlay');
    if (quote.coinCost !== serverCost) {
      throw new ServiceError(409, 'PRICE_CHANGED', 'Der Preis hat sich geändert. Bitte ein neues Angebot bestätigen.');
    }
    const payloadPlatform = typeof quote.payload?.platform === 'string' ? quote.payload.platform : '';
    const hasOverlayContext = Boolean(dna) || Boolean(payloadPlatform);
    const gate = evaluateGenerationGate({
      quoteUserId: quote.userId,
      requestUserId: userId,
      status: quote.status === 'processing' ? 'pending' : quote.status,
      expiresAt: quote.expiresAt,
      coinCost: serverCost,
      coinBalance: balance,
      hasDna: hasOverlayContext,
    });
    if (gate === 'wrong_user') throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (gate === 'not_pending') throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    if (gate === 'expired') throw new ServiceError(410, 'QUOTE_EXPIRED', 'Das Angebot ist abgelaufen. Bitte neu anfragen.');
    if (gate === 'no_dna') throw new ServiceError(400, 'OVERLAY_CONTEXT_REQUIRED', 'Für ein Overlay brauche ich mindestens die Plattform');
    if (gate === 'insufficient_coins') {
      throw new ServiceError(402, 'INSUFFICIENT_COINS', `Nicht genügend Coins. Dieses Angebot kostet ${serverCost} Coins.`);
    }

    if (quote.payload?.changeRequest && typeof quote.payload.jobId === 'string' && !quote.payload.parentJobId) {
      try {
        const result = await executeQuotedChangeRequest(
          userId,
          quote.payload.jobId,
          typeof quote.payload.request === 'string' ? quote.payload.request : 'Variante',
          quote.projectId
        );
        quote.status = 'confirmed';
        quote.payload = {
          ...(quote.payload ?? {}),
          jobIds: result.jobIds,
          coinsSpent: result.coinsSpent,
          refundedCoins: 0,
        };
        await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
        return {
          quote,
          coinsSpent: result.coinsSpent,
          newBalance: result.newBalance,
          jobIds: result.jobIds,
          refundedCoins: 0,
        };
      } catch (err) {
        quote.status = 'cancelled';
        await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
        throw err;
      }
    }

    quote.status = 'processing';
    await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);

    try {
      const result = await generateOverlayAsset(userId, quote.projectId, {
        ...(quote.payload ?? {}),
        quoteId: quote.id,
      });
      quote.status = 'confirmed';
      quote.payload = {
        ...(quote.payload ?? {}),
        jobIds: [result.job.id],
        coinsSpent: result.coinsSpent,
        refundedCoins: 0,
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      return {
        quote,
        coinsSpent: result.coinsSpent,
        newBalance: result.newBalance,
        jobIds: [result.job.id],
        refundedCoins: 0,
      };
    } catch (err) {
      quote.status = 'pending';
      quote.payload = {
        ...(quote.payload ?? {}),
        lastError: err instanceof Error ? err.message : 'overlay-failed',
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      throw err;
    }
  };

  return withDevLock(quoteLockKey(quoteId), run);
}

async function confirmStickerQuote(
  userId: string,
  quoteId: string
): Promise<{
  quote: NexterQuote;
  coinsSpent: number;
  newBalance: number;
  jobIds: string[];
  refundedCoins?: number;
}> {
  const run = async () => {
    const quote = await getQuote(userId, quoteId);
    if (!quote) throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (quote.kind !== 'sticker') throw new ServiceError(400, 'INVALID_QUOTE', 'Dieses Angebot ist kein Sticker');

    const balance = await getCoinBalance(userId);
    if (quote.status === 'confirmed' || quote.status === 'completed') {
      const jobIds = Array.isArray(quote.payload?.jobIds)
        ? quote.payload.jobIds.filter((id): id is string => typeof id === 'string')
        : [];
      return {
        quote,
        coinsSpent: typeof quote.payload?.coinsSpent === 'number' ? quote.payload.coinsSpent : 0,
        newBalance: balance,
        jobIds,
        refundedCoins: typeof quote.payload?.refundedCoins === 'number' ? quote.payload.refundedCoins : 0,
      };
    }
    if (quote.status === 'cancelled') {
      throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    }

    const { dna } = await resolveDnaForRequest(userId, quote.projectId);
    const serverCost = coinCostForKind('sticker');
    if (quote.coinCost !== serverCost) {
      throw new ServiceError(409, 'PRICE_CHANGED', 'Der Preis hat sich geändert. Bitte ein neues Angebot bestätigen.');
    }
    const payloadPlatform = typeof quote.payload?.platform === 'string' ? quote.payload.platform : '';
    const hasStickerContext =
      Boolean(dna) || Boolean(payloadPlatform) || typeof quote.payload?.parentJobId === 'string';
    const gate = evaluateGenerationGate({
      quoteUserId: quote.userId,
      requestUserId: userId,
      status: quote.status === 'processing' ? 'pending' : quote.status,
      expiresAt: quote.expiresAt,
      coinCost: serverCost,
      coinBalance: balance,
      hasDna: hasStickerContext,
    });
    if (gate === 'wrong_user') throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (gate === 'not_pending') throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    if (gate === 'expired') throw new ServiceError(410, 'QUOTE_EXPIRED', 'Das Angebot ist abgelaufen. Bitte neu anfragen.');
    if (gate === 'no_dna') throw new ServiceError(400, 'STICKER_CONTEXT_REQUIRED', 'Für einen Sticker brauche ich mindestens die Plattform');
    if (gate === 'insufficient_coins') {
      throw new ServiceError(402, 'INSUFFICIENT_COINS', `Nicht genügend Coins. Dieses Angebot kostet ${serverCost} Coins.`);
    }

    if (quote.payload?.changeRequest && typeof quote.payload.jobId === 'string' && !quote.payload.parentJobId) {
      try {
        const result = await executeQuotedChangeRequest(
          userId,
          quote.payload.jobId,
          typeof quote.payload.request === 'string' ? quote.payload.request : 'Variante',
          quote.projectId
        );
        quote.status = 'confirmed';
        quote.payload = {
          ...(quote.payload ?? {}),
          jobIds: result.jobIds,
          coinsSpent: result.coinsSpent,
          refundedCoins: 0,
        };
        await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
        return {
          quote,
          coinsSpent: result.coinsSpent,
          newBalance: result.newBalance,
          jobIds: result.jobIds,
          refundedCoins: 0,
        };
      } catch (err) {
        quote.status = 'cancelled';
        await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
        throw err;
      }
    }

    quote.status = 'processing';
    await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);

    try {
      const result = await generateStickerAsset(userId, quote.projectId, {
        ...(quote.payload ?? {}),
        quoteId: quote.id,
      });
      quote.status = 'confirmed';
      quote.payload = {
        ...(quote.payload ?? {}),
        jobIds: [result.job.id],
        coinsSpent: result.coinsSpent,
        refundedCoins: 0,
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      return {
        quote,
        coinsSpent: result.coinsSpent,
        newBalance: result.newBalance,
        jobIds: [result.job.id],
        refundedCoins: 0,
      };
    } catch (err) {
      quote.status = 'pending';
      quote.payload = {
        ...(quote.payload ?? {}),
        lastError: err instanceof Error ? err.message : 'sticker-failed',
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      throw err;
    }
  };

  return withDevLock(quoteLockKey(quoteId), run);
}

async function confirmMockupQuote(
  userId: string,
  quoteId: string
): Promise<{
  quote: NexterQuote;
  coinsSpent: number;
  newBalance: number;
  jobIds: string[];
  refundedCoins?: number;
}> {
  const run = async () => {
    const quote = await getQuote(userId, quoteId);
    if (!quote) throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (quote.kind !== 'mockup') throw new ServiceError(400, 'INVALID_QUOTE', 'Dieses Angebot ist kein Mockup');

    const balance = await getCoinBalance(userId);
    if (quote.status === 'confirmed' || quote.status === 'completed') {
      const jobIds = Array.isArray(quote.payload?.jobIds)
        ? quote.payload.jobIds.filter((id): id is string => typeof id === 'string')
        : [];
      return {
        quote,
        coinsSpent: typeof quote.payload?.coinsSpent === 'number' ? quote.payload.coinsSpent : 0,
        newBalance: balance,
        jobIds,
        refundedCoins: typeof quote.payload?.refundedCoins === 'number' ? quote.payload.refundedCoins : 0,
      };
    }
    if (quote.status === 'cancelled') {
      throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    }

    const { dna } = await resolveDnaForRequest(userId, quote.projectId);
    const serverCost = coinCostForKind('mockup');
    if (quote.coinCost !== serverCost) {
      throw new ServiceError(409, 'PRICE_CHANGED', 'Der Preis hat sich geändert. Bitte ein neues Angebot bestätigen.');
    }
    const payloadPlatform = typeof quote.payload?.category === 'string' ? quote.payload.category : '';
    const hasContext = Boolean(dna) || Boolean(payloadPlatform) || typeof quote.payload?.parentJobId === 'string';
    const gate = evaluateGenerationGate({
      quoteUserId: quote.userId,
      requestUserId: userId,
      status: quote.status === 'processing' ? 'pending' : quote.status,
      expiresAt: quote.expiresAt,
      coinCost: serverCost,
      coinBalance: balance,
      hasDna: hasContext,
    });
    if (gate === 'wrong_user') throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (gate === 'not_pending') throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    if (gate === 'expired') throw new ServiceError(410, 'QUOTE_EXPIRED', 'Das Angebot ist abgelaufen. Bitte neu anfragen.');
    if (gate === 'no_dna') throw new ServiceError(400, 'MOCKUP_CONTEXT_REQUIRED', 'Für ein Lifestyle-Mockup brauche ich mindestens das Produkt');
    if (gate === 'insufficient_coins') {
      throw new ServiceError(402, 'INSUFFICIENT_COINS', `Nicht genügend Coins. Dieses Angebot kostet ${serverCost} Coins.`);
    }

    quote.status = 'processing';
    await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);

    try {
      const result = await generateLifestyleMockup(userId, quote.projectId, {
        ...(quote.payload ?? {}),
        quoteId: quote.id,
      });
      quote.status = 'confirmed';
      quote.payload = {
        ...(quote.payload ?? {}),
        jobIds: [result.job.id],
        coinsSpent: result.coinsSpent,
        refundedCoins: 0,
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      return {
        quote,
        coinsSpent: result.coinsSpent,
        newBalance: result.newBalance,
        jobIds: [result.job.id],
        refundedCoins: 0,
      };
    } catch (err) {
      quote.status = 'pending';
      quote.payload = {
        ...(quote.payload ?? {}),
        lastError: err instanceof Error ? err.message : 'mockup-failed',
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      throw err;
    }
  };

  return withDevLock(quoteLockKey(quoteId), run);
}

async function confirmTextQuote(
  userId: string,
  quoteId: string
): Promise<{
  quote: NexterQuote;
  coinsSpent: number;
  newBalance: number;
  jobIds: string[];
  refundedCoins?: number;
}> {
  const run = async () => {
    const quote = await getQuote(userId, quoteId);
    if (!quote) throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (quote.kind !== 'text') throw new ServiceError(400, 'INVALID_QUOTE', 'Dieses Angebot ist kein Text');

    const balance = await getCoinBalance(userId);
    if (quote.status === 'confirmed' || quote.status === 'completed') {
      const jobIds = Array.isArray(quote.payload?.jobIds)
        ? quote.payload.jobIds.filter((id): id is string => typeof id === 'string')
        : [];
      return {
        quote,
        coinsSpent: typeof quote.payload?.coinsSpent === 'number' ? quote.payload.coinsSpent : 0,
        newBalance: balance,
        jobIds,
        refundedCoins: typeof quote.payload?.refundedCoins === 'number' ? quote.payload.refundedCoins : 0,
      };
    }
    if (quote.status === 'cancelled') {
      throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    }

    const serverCost = coinCostForKind('text');
    if (quote.coinCost !== serverCost) {
      throw new ServiceError(409, 'PRICE_CHANGED', 'Der Preis hat sich geändert. Bitte ein neues Angebot bestätigen.');
    }
    const gate = evaluateGenerationGate({
      quoteUserId: quote.userId,
      requestUserId: userId,
      status: quote.status === 'processing' ? 'pending' : quote.status,
      expiresAt: quote.expiresAt,
      coinCost: serverCost,
      coinBalance: balance,
      hasDna: true,
    });
    if (gate === 'wrong_user') throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
    if (gate === 'not_pending') throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
    if (gate === 'expired') throw new ServiceError(410, 'QUOTE_EXPIRED', 'Das Angebot ist abgelaufen. Bitte neu anfragen.');
    if (gate === 'insufficient_coins') {
      throw new ServiceError(402, 'INSUFFICIENT_COINS', `Nicht genügend Coins. Dieses Angebot kostet ${serverCost} Coins.`);
    }

    quote.status = 'processing';
    await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);

    try {
      const result = await generateContentPackage(userId, quote.projectId, {
        ...((quote.payload ?? {}) as TextQuotePayload),
        quoteId: quote.id,
      });
      quote.status = 'confirmed';
      quote.payload = {
        ...(quote.payload ?? {}),
        jobIds: [result.job.id],
        coinsSpent: result.coinsSpent,
        refundedCoins: 0,
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      return {
        quote,
        coinsSpent: result.coinsSpent,
        newBalance: result.newBalance,
        jobIds: [result.job.id],
        refundedCoins: 0,
      };
    } catch (err) {
      quote.status = 'pending';
      quote.payload = {
        ...(quote.payload ?? {}),
        lastError: err instanceof Error ? err.message : 'text-failed',
      };
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      throw err;
    }
  };

  return withDevLock(quoteLockKey(quoteId), run);
}

export async function confirmQuote(userId: string, quoteId: string): Promise<{
  quote: NexterQuote;
  coinsSpent: number;
  newBalance: number;
  jobIds: string[];
  refundedCoins?: number;
  batchStatus?: string;
  jobs?: GenerationJob[];
}> {
  return withDevLock(quoteLockKey(quoteId), () => confirmQuoteUnlocked(userId, quoteId));
}

async function confirmQuoteUnlocked(userId: string, quoteId: string): Promise<{
  quote: NexterQuote;
  coinsSpent: number;
  newBalance: number;
  jobIds: string[];
  refundedCoins?: number;
  batchStatus?: string;
  jobs?: GenerationJob[];
}> {
  const quote = await getQuote(userId, quoteId);
  if (!quote) throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
  await assertCurrentContentRightsAck(userId);
  if (quote.projectId && quote.kind !== 'captions') {
    const { assertOwnedProjectId } = await import('../project.service.js');
    await assertOwnedProjectId(userId, quote.projectId);
  }

  if (quote.kind === 'streamset') {
    return confirmStreamsetQuote(userId, quoteId);
  }

  if (quote.kind === 'animation') {
    return confirmAnimationQuote(userId, quoteId);
  }

  if (quote.kind === 'ai-video') {
    return confirmAiVideoQuote(userId, quoteId);
  }

  if (quote.kind === 'music') {
    return confirmMusicQuote(userId, quoteId);
  }

  if (quote.kind === 'voice') {
    return confirmVoiceQuote(userId, quoteId);
  }

  if (quote.kind === 'logo') {
    return confirmLogoQuote(userId, quoteId);
  }

  if (quote.kind === 'banner') {
    return confirmBannerQuote(userId, quoteId);
  }

  if (quote.kind === 'facecam') {
    return confirmFacecamQuote(userId, quoteId);
  }

  if (quote.kind === 'overlay') {
    return confirmOverlayQuote(userId, quoteId);
  }

  if (quote.kind === 'sticker') {
    return confirmStickerQuote(userId, quoteId);
  }

  if (quote.kind === 'mockup') {
    return confirmMockupQuote(userId, quoteId);
  }

  if (quote.kind === 'text') {
    return confirmTextQuote(userId, quoteId);
  }

  const { dna } = await resolveDnaForRequest(userId, quote.projectId);
  const balance = await getCoinBalance(userId);
  const gate = evaluateGenerationGate({
    quoteUserId: quote.userId,
    requestUserId: userId,
    status: quote.status,
    expiresAt: quote.expiresAt,
    coinCost: quote.coinCost,
    coinBalance: balance,
    hasDna: quote.kind === 'captions' ? true : Boolean(dna),
  });

  if (gate === 'wrong_user') throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
  if (gate === 'not_pending') throw new ServiceError(409, 'QUOTE_USED', 'Dieses Angebot wurde bereits verwendet oder abgebrochen.');
  if (gate === 'expired') throw new ServiceError(410, 'QUOTE_EXPIRED', 'Das Angebot ist abgelaufen. Bitte neu anfragen.');
  if (gate === 'no_dna') throw new ServiceError(400, 'NO_DNA', 'Erstelle zuerst eine Creator DNA');
  if (gate === 'insufficient_coins') {
    throw new ServiceError(402, 'INSUFFICIENT_COINS', `Nicht genügend Coins. Dieses Angebot kostet ${quote.coinCost} Coins.`);
  }

  const jobIds: string[] = [];
  let coinsSpent = quote.coinCost;
  let newBalance = balance - quote.coinCost;

  if (quote.payload?.changeRequest && typeof quote.payload.jobId === 'string') {
    try {
      const result = await executeQuotedChangeRequest(
        userId,
        quote.payload.jobId,
        typeof quote.payload.request === 'string' ? quote.payload.request : 'Variante',
        quote.projectId
      );
      jobIds.push(...result.jobIds);
      coinsSpent = result.coinsSpent;
      newBalance = result.newBalance;
    } catch (err) {
      quote.status = 'cancelled';
      await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
      throw err;
    }
  } else if (quote.kind === 'captions') {
    const videoProjectId =
      typeof quote.payload?.videoProjectId === 'string'
        ? quote.payload.videoProjectId
        : typeof quote.projectId === 'string'
          ? quote.projectId
          : '';
    if (!videoProjectId) {
      throw new ServiceError(400, 'NO_SOURCE', 'Kein Video-Projekt für Captions');
    }
    const result = await executeQuotedCaptions(userId, videoProjectId, { quoteId: quote.id });
    jobIds.push(result.job.id);
    coinsSpent = result.coinsSpent;
    newBalance = result.newBalance;
  } else {
    const module = quote.kind;
    const category = QUOTE_KIND_CATEGORY[quote.kind];
    const result = await generateStudioAsset(
      userId,
      module,
      category,
      `Nexter ${quote.kind}`,
      undefined,
      { projectId: quote.projectId }
    );
    jobIds.push(result.job.id);
    coinsSpent = result.coinsSpent;
    newBalance = result.newBalance;
  }

  quote.status = 'confirmed';
  await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
  return { quote, coinsSpent, newBalance, jobIds };
}
