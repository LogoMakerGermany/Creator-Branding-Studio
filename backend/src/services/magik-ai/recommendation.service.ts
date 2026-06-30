import type { MagikAiRecommendation } from '@ucbs/shared';

/** Platzhalter — Empfehlungen (Phase 3). */
export class MagikRecommendationService {
  async getRecommendations(_userId: string): Promise<MagikAiRecommendation[]> {
    return [];
  }

  async getLogoRecommendations(_userId: string): Promise<MagikAiRecommendation[]> {
    return [];
  }
}

export const magikRecommendationService = new MagikRecommendationService();
