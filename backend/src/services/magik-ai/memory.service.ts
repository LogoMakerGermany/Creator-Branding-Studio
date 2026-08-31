import type { MagikAiMemoryEntry, MagikAiMemoryStatus } from '@ucbs/shared';
import { listMemory, storeMemory } from '../nexter/memory.service.js';

/** MAGIK-AI-Memory liest/schreibt Nexter-Memory (pro User). */
export class MagikMemoryService {
  async getStatus(userId: string): Promise<MagikAiMemoryStatus> {
    const entries = await listMemory(userId);
    return entries.length ? 'active' : 'empty';
  }

  async listEntries(userId: string, limit = 50): Promise<MagikAiMemoryEntry[]> {
    const entries = await listMemory(userId);
    return entries.slice(0, limit).map((e) => ({
      id: e.id,
      userId: e.userId,
      key: e.key,
      value: e.value,
      source: e.source === 'logo' || e.source === 'interaction' ? e.source : 'preference',
      createdAt: e.createdAt,
    }));
  }

  async storeEntry(userId: string, key: string, value: string): Promise<MagikAiMemoryEntry | null> {
    const entry = await storeMemory(userId, key, value, 'preference');
    return {
      id: entry.id,
      userId: entry.userId,
      key: entry.key,
      value: entry.value,
      source: 'preference',
      createdAt: entry.createdAt,
    };
  }
}

export const magikMemoryService = new MagikMemoryService();
