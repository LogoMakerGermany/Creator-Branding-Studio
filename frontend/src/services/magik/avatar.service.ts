import { api } from '@/services/api';
import type { MagikAiAvatar } from '@/types/magik';

/** Platzhalter — Avatar Service (Phase 2). */
export const magikAvatarService = {
  async get(): Promise<MagikAiAvatar | null> {
    const res = await api.magikAi.getAvatar();
    return res.avatar;
  },
};
