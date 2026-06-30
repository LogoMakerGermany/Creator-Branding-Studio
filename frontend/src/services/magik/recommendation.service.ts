import { api } from '@/services/api';

/** Platzhalter — Recommendation Service (Phase 3). */
export const magikRecommendationService = {
  async list() {
    const res = await api.magikAi.getRecommendations();
    return res.items;
  },
};
