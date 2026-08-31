import { randomUUID } from 'node:crypto';
import {
  NEXTER_QUOTE_TTL_MS,
  applyLockedDnaToGeneration,
  type LogoGenerationOptions,
  type NexterQuote,
  type NexterQuoteKind,
} from '@ucbs/shared';
import { dsGet, dsSet } from '../../lib/data-store.js';
import { ServiceError } from '../../lib/errors.js';
import { resolveDnaForRequest } from '../dna.service.js';
import { getCoinBalance } from '../coins.service.js';
import { generateStudioAsset } from '../ai.service.js';
import { generateStreamsetPack } from '../streamset.service.js';
import { generateLifestyleMockup } from '../mockup.service.js';
import { generateAnimation } from '../animation.service.js';
import { generateContentPackage, type TextQuotePayload } from '../text.service.js';
import { executeQuotedChangeRequest } from '../change-request.service.js';
import {
  coinCostForKind,
  evaluateGenerationGate,
  QUOTE_KIND_CATEGORY,
  recordOwnedByUser,
} from './tools.service.js';

const COLLECTION = 'nexterQuotes';

export async function createQuote(
  userId: string,
  kind: NexterQuoteKind,
  projectId?: string,
  payload?: Record<string, unknown>
): Promise<NexterQuote> {
  const now = Date.now();
  const quote: NexterQuote = {
    id: randomUUID(),
    userId,
    kind,
    coinCost: coinCostForKind(kind),
    status: 'pending',
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + NEXTER_QUOTE_TTL_MS).toISOString(),
    projectId,
    payload,
  };
  await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
  return quote;
}

export async function getQuote(userId: string, quoteId: string): Promise<NexterQuote | null> {
  const row = await dsGet(COLLECTION, quoteId);
  return recordOwnedByUser(row as unknown as NexterQuote | null, userId);
}

export async function cancelQuote(userId: string, quoteId: string): Promise<NexterQuote> {
  const quote = await getQuote(userId, quoteId);
  if (!quote) throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');
  if (quote.status !== 'pending') return quote;
  quote.status = 'cancelled';
  await dsSet(COLLECTION, quote.id, quote as unknown as Record<string, unknown>);
  return quote;
}

export async function confirmQuote(userId: string, quoteId: string): Promise<{
  quote: NexterQuote;
  coinsSpent: number;
  newBalance: number;
  jobIds: string[];
}> {
  const quote = await getQuote(userId, quoteId);
  if (!quote) throw new ServiceError(404, 'QUOTE_NOT_FOUND', 'Angebot nicht gefunden');

  const { dna } = await resolveDnaForRequest(userId, quote.projectId);
  const balance = await getCoinBalance(userId);
  const gate = evaluateGenerationGate({
    quoteUserId: quote.userId,
    requestUserId: userId,
    status: quote.status,
    expiresAt: quote.expiresAt,
    coinCost: quote.coinCost,
    coinBalance: balance,
    hasDna: quote.kind === 'text' ? true : Boolean(dna),
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
  } else if (quote.kind === 'streamset') {
    const pack = await generateStreamsetPack(userId, quote.projectId);
    jobIds.push(...pack.jobs.map((j) => j.id));
    coinsSpent = pack.coinsSpent;
    newBalance = pack.newBalance;
  } else if (quote.kind === 'mockup') {
    const result = await generateLifestyleMockup(userId, quote.projectId, quote.payload);
    jobIds.push(result.job.id);
    coinsSpent = result.coinsSpent;
    newBalance = result.newBalance;
  } else if (quote.kind === 'animation') {
    const result = await generateAnimation(userId, quote.projectId, quote.payload);
    jobIds.push(result.job.id);
    coinsSpent = result.coinsSpent;
    newBalance = result.newBalance;
  } else if (quote.kind === 'text') {
    const result = await generateContentPackage(
      userId,
      quote.projectId,
      (quote.payload ?? {}) as TextQuotePayload
    );
    jobIds.push(result.job.id);
    coinsSpent = result.coinsSpent;
    newBalance = result.newBalance;
  } else {
    const module = quote.kind;
    const category = QUOTE_KIND_CATEGORY[quote.kind];
    const logoOpts: LogoGenerationOptions | undefined =
      quote.kind === 'logo' && dna
        ? applyLockedDnaToGeneration(dna, {
            logoName: dna.name,
            magikMode: 'name' as const,
            selectedColors: dna.primaryColors.length ? dna.primaryColors : ['#7C3AED'],
            primaryColor: dna.primaryColors[0] ?? '#7C3AED',
          })
        : undefined;
    const result = await generateStudioAsset(
      userId,
      module,
      category,
      quote.kind === 'banner' && quote.payload?.socialFormat
        ? `Social ${String(quote.payload.socialFormat)}`
        : `Nexter ${quote.kind}`,
      logoOpts ??
        (quote.kind === 'banner' && typeof quote.payload?.platform === 'string'
          ? { platform: quote.payload.platform as never }
          : undefined),
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
