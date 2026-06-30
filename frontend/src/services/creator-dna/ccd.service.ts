import { api } from '@/services/api';
import type { CharacterDNA, CreatorPreferencesDNA, CharacterEvolutionProposal, CcdRecommendation } from '@/types/creator-dna-engine';

export const ccdService = {
  getDashboard: () =>
    api.ccd.getDashboard() as Promise<{
      character: CharacterDNA | null;
      preferences: CreatorPreferencesDNA | null;
      pendingEvolutions: CharacterEvolutionProposal[];
      recommendations: CcdRecommendation[];
    }>,
  getContext: () => api.ccd.getContext(),
  acceptEvolution: (id: string) => api.ccd.acceptEvolution(id),
  rejectEvolution: (id: string) => api.ccd.rejectEvolution(id),
};
