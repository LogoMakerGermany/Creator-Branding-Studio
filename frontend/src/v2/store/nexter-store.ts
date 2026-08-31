import { create } from 'zustand';
import type { NexterOrbState } from '@ucbs/shared';

interface NexterUiState {
  orbState: NexterOrbState;
  panelOpen: boolean;
  studioHint: string | null;
  audioLevel: number;
  pendingPrompt: string | null;
  setOrbState: (orbState: NexterOrbState) => void;
  setPanelOpen: (panelOpen: boolean) => void;
  setStudioHint: (studioHint: string | null) => void;
  setAudioLevel: (audioLevel: number) => void;
  queueNexterPrompt: (prompt: string) => void;
  consumePendingPrompt: () => void;
  pulse: (orbState: NexterOrbState, ms?: number) => void;
}

let pulseTimer: ReturnType<typeof setTimeout> | null = null;

export const useNexterStore = create<NexterUiState>((set) => ({
  orbState: 'idle',
  panelOpen: true,
  studioHint: null,
  audioLevel: 0,
  pendingPrompt: null,
  setOrbState: (orbState) => set({ orbState }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setStudioHint: (studioHint) => set({ studioHint }),
  setAudioLevel: (audioLevel) => set({ audioLevel }),
  queueNexterPrompt: (prompt) => set({ pendingPrompt: prompt, panelOpen: true }),
  consumePendingPrompt: () => set({ pendingPrompt: null }),
  pulse: (orbState, ms = 1800) => {
    if (pulseTimer) clearTimeout(pulseTimer);
    set({ orbState });
    pulseTimer = setTimeout(() => set({ orbState: 'idle', audioLevel: 0 }), ms);
  },
}));
