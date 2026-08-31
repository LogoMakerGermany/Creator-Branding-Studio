import { dsList, dsSet } from './data-store.js';
import { randomUUID } from 'node:crypto';

export async function recordApiCost(input: {
  userId: string;
  module: string;
  provider: string;
  internalCostCents: number;
}): Promise<void> {
  const id = randomUUID();
  await dsSet('api_costs', id, {
    id,
    ...input,
    createdAt: new Date().toISOString(),
  });
}

export async function sumApiCosts(): Promise<number> {
  const rows = await dsList('api_costs', { orderBy: 'createdAt', order: 'desc', limit: 1000 });
  return rows.reduce((s, r) => s + Number(r.internalCostCents ?? 0), 0);
}
