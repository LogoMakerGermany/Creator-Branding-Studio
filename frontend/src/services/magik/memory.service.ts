import { api } from '@/services/api';
import type { MagikAiMemoryStatus } from '@ucbs/shared';

/** Platzhalter — Memory Service (Phase 3). */
export const magikMemoryService = {
  async getStatus(): Promise<MagikAiMemoryStatus> {
    const res = await api.magikAi.getMemory();
    return res.status;
  },
  async listEntries() {
    const res = await api.magikAi.getMemory();
    return res.entries;
  },
};
