import { create } from 'zustand';
import type { PetWorldState } from '@ecoprompt/shared-types';
import { scoreToState } from '@ecoprompt/scoring-engine';
import type { ScoreEvent, SessionMetrics, StatusEvent } from '@shared/contracts';
import { emaHealth } from './lib/health';

export type Tab = 'world' | 'metrics';

interface EcoState {
  current?: ScoreEvent;
  history: ScoreEvent[];
  /** Smoothed ecosystem health (EMA of scores) that drives the world. */
  health: number;
  petState: PetWorldState;
  status?: StatusEvent;
  metrics?: SessionMetrics;
  tab: Tab;
  rewriteAccepted: boolean;

  pushScore: (e: ScoreEvent) => void;
  setStatus: (s: StatusEvent) => void;
  setMetrics: (m: SessionMetrics) => void;
  setTab: (t: Tab) => void;
  acceptRewrite: () => void;
  reset: () => void;
}

const INITIAL_HEALTH = 80;

export const useEcoStore = create<EcoState>((set) => ({
  history: [],
  health: INITIAL_HEALTH,
  petState: 'thriving',
  tab: 'world',
  rewriteAccepted: false,

  pushScore: (e) =>
    set((st) => {
      const health =
        st.history.length === 0
          ? e.response.overallScore
          : emaHealth(st.health, e.response.overallScore);
      return {
        current: e,
        history: [...st.history, e].slice(-50),
        health,
        petState: scoreToState(Math.round(health)),
        rewriteAccepted: false,
      };
    }),

  setStatus: (s) => set({ status: s }),
  setMetrics: (m) => set({ metrics: m }),
  setTab: (t) => set({ tab: t }),
  acceptRewrite: () => set({ rewriteAccepted: true }),
  reset: () =>
    set({
      history: [],
      current: undefined,
      health: INITIAL_HEALTH,
      petState: 'thriving',
      metrics: undefined,
      rewriteAccepted: false,
    }),
}));
