import type { MagikAiAvatar } from '@ucbs/shared';

/** Platzhalter — Avatar aus Logo-Kontext (Phase 2). */
export class MagikAvatarService {
  async getAvatar(_userId: string): Promise<MagikAiAvatar | null> {
    return null;
  }

  async createFromLogoContext(_userId: string, _logoContextId: string): Promise<MagikAiAvatar | null> {
    return null;
  }

  async updateAvatar(_userId: string, _patch: Partial<MagikAiAvatar>): Promise<MagikAiAvatar | null> {
    return null;
  }
}

export const magikAvatarService = new MagikAvatarService();
