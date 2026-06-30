import type { MagikAiMemoryEntry, MagikAiMemoryStatus } from '@ucbs/shared';

/** Platzhalter — Gedächtnis (Phase 3). */
export class MagikMemoryService {
  async getStatus(_userId: string): Promise<MagikAiMemoryStatus> {
    return 'empty';
  }

  async listEntries(_userId: string, _limit = 50): Promise<MagikAiMemoryEntry[]> {
    return [];
  }

  async storeEntry(_userId: string, _key: string, _value: string): Promise<MagikAiMemoryEntry | null> {
    return null;
  }
}

export const magikMemoryService = new MagikMemoryService();
