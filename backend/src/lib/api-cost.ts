import { dsList, dsSet } from './data-store.js';
import { randomUUID } from 'node:crypto';

export const API_COST_KIND_ESTIMATE = 'estimate';
export const API_COST_KIND_ACTUAL = 'actual';

export async function recordApiCost(input: {
  userId: string;
  module: string;
  provider: string;
  internalCostCents: number;
  jobId?: string;
  model?: string;
  durationSec?: number;
  estimatedCredits?: number;
  costKind?: typeof API_COST_KIND_ESTIMATE | typeof API_COST_KIND_ACTUAL;
  actualProviderCostUnknown?: boolean;
  estimatedCreditsNote?: string;
}): Promise<void> {
  const id = randomUUID();
  await dsSet('api_costs', id, {
    id,
    ...input,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Runway does not return consumed credits. Store an estimate-only ledger row
 * (internalCostCents=0 so sumApiCosts is not treated as actual USD).
 */
export async function recordEstimatedRunwayVideoCost(input: {
  userId: string;
  module: string;
  jobId: string;
  durationSec: number;
  estimatedCredits: number;
  model: string;
}): Promise<void> {
  await recordApiCost({
    userId: input.userId,
    module: input.module,
    provider: 'runway',
    model: input.model,
    jobId: input.jobId,
    durationSec: input.durationSec,
    internalCostCents: 0,
    estimatedCredits: input.estimatedCredits,
    costKind: API_COST_KIND_ESTIMATE,
    actualProviderCostUnknown: true,
    estimatedCreditsNote:
      'Runway gen4.5 official list: 12 credits/second. Estimate only — not claimed as actual consumption.',
  });
}

export async function sumApiCosts(): Promise<number> {
  const rows = await dsList('api_costs', { orderBy: 'createdAt', order: 'desc', limit: 1000 });
  return rows.reduce((s, r) => s + Number(r.internalCostCents ?? 0), 0);
}
