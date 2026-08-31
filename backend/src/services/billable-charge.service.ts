import { randomUUID } from 'node:crypto';
import { dsGet, dsList, dsListWhere, dsSet } from '../lib/data-store.js';
import { refundOnce } from './coins.service.js';

export const BILLABLE_CHARGES = 'billable_charges';

export type BillableChargeStatus = 'charged' | 'settled' | 'refunded';

export interface BillableCharge {
  id: string;
  userId: string;
  amount: number;
  chargeTransactionId: string;
  refundTransactionId?: string;
  status: BillableChargeStatus;
  category?: string;
  description: string;
  jobId?: string;
  quoteId?: string;
  createdAt: string;
  updatedAt: string;
}

export async function createBillableCharge(input: Omit<BillableCharge, 'createdAt' | 'updatedAt' | 'status'> & {
  status?: BillableChargeStatus;
}): Promise<BillableCharge> {
  const now = new Date().toISOString();
  const row: BillableCharge = {
    ...input,
    status: input.status ?? 'charged',
    createdAt: now,
    updatedAt: now,
  };
  await dsSet(BILLABLE_CHARGES, row.id, row as unknown as Record<string, unknown>);
  return row;
}

export async function getBillableCharge(id: string): Promise<BillableCharge | null> {
  const row = await dsGet(BILLABLE_CHARGES, id);
  return row ? (row as unknown as BillableCharge) : null;
}

export async function listBillableChargesForUser(userId: string): Promise<BillableCharge[]> {
  const rows = await dsListWhere(BILLABLE_CHARGES, { userId }, 'createdAt', 'desc');
  return rows as unknown as BillableCharge[];
}

export async function listChargedBillableCharges(): Promise<BillableCharge[]> {
  const rows = await dsList(BILLABLE_CHARGES, { orderBy: 'createdAt', order: 'asc' });
  return (rows as unknown as BillableCharge[]).filter((c) => c.status === 'charged');
}

export async function settleBillableCharge(id: string, jobId?: string): Promise<void> {
  const row = await getBillableCharge(id);
  if (!row || row.status !== 'charged') return;
  await dsSet(BILLABLE_CHARGES, id, {
    ...row,
    status: 'settled',
    jobId: jobId ?? row.jobId,
    updatedAt: new Date().toISOString(),
  } as unknown as Record<string, unknown>);
}

export async function refundBillableChargeOnce(
  charge: BillableCharge,
  description: string
): Promise<{ refunded: boolean; duplicate: boolean; refundTransactionId?: string }> {
  if (charge.status === 'refunded' && charge.refundTransactionId) {
    return { refunded: true, duplicate: true, refundTransactionId: charge.refundTransactionId };
  }
  if (charge.status === 'settled') {
    return { refunded: false, duplicate: false };
  }

  const result = await refundOnce({
    userId: charge.userId,
    chargeTransactionId: charge.chargeTransactionId,
    amount: charge.amount,
    description,
    jobId: charge.jobId,
  });

  await dsSet(BILLABLE_CHARGES, charge.id, {
    ...charge,
    status: 'refunded',
    refundTransactionId: result.transactionId,
    updatedAt: new Date().toISOString(),
  } as unknown as Record<string, unknown>);

  return {
    refunded: true,
    duplicate: result.duplicate,
    refundTransactionId: result.transactionId,
  };
}

export function newChargeId(): string {
  return randomUUID();
}
