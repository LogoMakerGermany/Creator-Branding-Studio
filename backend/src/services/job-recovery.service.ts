import { getJobStaleMs } from '../config/env.js';
import { dsGet, dsSet } from '../lib/data-store.js';
import {
  listChargedBillableCharges,
  refundBillableChargeOnce,
  type BillableCharge,
} from './billable-charge.service.js';

export interface RecoveryResult {
  examined: number;
  interrupted: number;
  refunded: number;
  skippedFresh: number;
  alreadyRefunded: number;
}

function isStale(updatedAt: string, now: number, staleMs: number): boolean {
  const ts = Date.parse(updatedAt);
  if (!Number.isFinite(ts)) return true;
  return now - ts >= staleMs;
}

async function markJobInterrupted(jobId: string | undefined): Promise<void> {
  if (!jobId) return;
  const collections = ['generationJobs', 'mediaJobs', 'textJobs', 'mockupJobs'];
  for (const name of collections) {
    const row = await dsGet(name, jobId);
    if (!row) continue;
    const status = String(row.status ?? '');
    if (status === 'completed' || status === 'failed' || status === 'interrupted') return;
    await dsSet(name, jobId, {
      ...row,
      status: 'interrupted',
      error: row.error || 'JOB_INTERRUPTED',
      updatedAt: new Date().toISOString(),
    });
    return;
  }
}

/**
 * Marks stale charged jobs as interrupted and refunds exactly once.
 * Does not re-invoke providers. Fresh processing jobs are left untouched.
 */
export async function recoverStaleJobs(opts?: {
  now?: number;
  staleMs?: number;
}): Promise<RecoveryResult> {
  const now = opts?.now ?? Date.now();
  const staleMs = opts?.staleMs ?? getJobStaleMs();
  const charged = await listChargedBillableCharges();
  const result: RecoveryResult = {
    examined: charged.length,
    interrupted: 0,
    refunded: 0,
    skippedFresh: 0,
    alreadyRefunded: 0,
  };

  for (const charge of charged) {
    const stamp = charge.updatedAt || charge.createdAt;
    if (!isStale(stamp, now, staleMs)) {
      result.skippedFresh += 1;
      continue;
    }
    const refund = await refundBillableChargeOnce(
      charge as BillableCharge,
      'Job unterbrochen (Recovery) — Rückerstattung'
    );
    if (refund.duplicate) result.alreadyRefunded += 1;
    else if (refund.refunded) result.refunded += 1;
    await markJobInterrupted(charge.jobId ?? charge.id);
    result.interrupted += 1;
  }

  return result;
}
