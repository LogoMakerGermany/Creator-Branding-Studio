import { randomUUID } from 'node:crypto';
import { dsGet, dsSet } from '../lib/data-store.js';

export const AUDIT_COLLECTION = 'admin_audit_logs';

export interface AdminAuditLog {
  id: string;
  actorUserId: string;
  action: string;
  targetUserId?: string;
  reason?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  createdAt: string;
}

export async function writeAdminAudit(entry: Omit<AdminAuditLog, 'id' | 'createdAt'>): Promise<AdminAuditLog> {
  const row: AdminAuditLog = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    ...entry,
  };
  await dsSet(AUDIT_COLLECTION, row.id, row as unknown as Record<string, unknown>);
  return row;
}

export async function listAdminAudit(limit = 100): Promise<AdminAuditLog[]> {
  const { dsList } = await import('../lib/data-store.js');
  const rows = await dsList(AUDIT_COLLECTION, { orderBy: 'createdAt', order: 'desc', limit });
  return rows as unknown as AdminAuditLog[];
}

export async function listAdminAuditForTarget(targetUserId: string, limit = 50): Promise<AdminAuditLog[]> {
  const { dsListWhere } = await import('../lib/data-store.js');
  const rows = await dsListWhere(AUDIT_COLLECTION, { targetUserId }, 'createdAt', 'desc');
  return (rows as unknown as AdminAuditLog[]).slice(0, limit);
}

export async function getAdminAuditById(id: string): Promise<AdminAuditLog | null> {
  const row = await dsGet(AUDIT_COLLECTION, id);
  return row ? (row as unknown as AdminAuditLog) : null;
}
