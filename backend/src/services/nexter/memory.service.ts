import { randomUUID } from 'node:crypto';
import type { NexterMemoryEntry } from '@ucbs/shared';
import { dsList, dsSet } from '../../lib/data-store.js';
import { ServiceError } from '../../lib/errors.js';

const COLLECTION = 'nexterMemory';

export async function listMemory(userId: string): Promise<NexterMemoryEntry[]> {
  const rows = await dsList(COLLECTION, { userId, orderBy: 'createdAt', order: 'desc', limit: 50 });
  return rows as unknown as NexterMemoryEntry[];
}

const BLOCKED = /passwort|password|api[_-]?key|secret|token|bearer /i;

export async function storeMemory(
  userId: string,
  key: string,
  value: string,
  source: NexterMemoryEntry['source']
): Promise<NexterMemoryEntry> {
  if (BLOCKED.test(key) || BLOCKED.test(value)) {
    throw new ServiceError(400, 'MEMORY_SECRET', 'Memory speichert keine Secrets');
  }
  const existing = (await listMemory(userId)).find((e) => e.key === key);
  const entry: NexterMemoryEntry = {
    id: existing?.id ?? randomUUID(),
    userId,
    key,
    value,
    source,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  await dsSet(COLLECTION, entry.id, entry as unknown as Record<string, unknown>);
  return entry;
}

export function memoryAsPrompt(entries: NexterMemoryEntry[]): string {
  if (!entries.length) return 'Noch keine gespeicherten Vorlieben.';
  return entries
    .slice(0, 12)
    .map((e) => `${e.key}: ${e.value}`)
    .join('; ');
}
