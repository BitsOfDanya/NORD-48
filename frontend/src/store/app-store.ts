import { create } from "zustand";

import type { Scenario } from "@/types/scenario";
import type { RoutingStrategy } from "@/types/simulation";

interface AppState {
  selectedScenarioId: string;
  uploadedScenario: Scenario | null;
  selectedClientId: string | null;
  selectedTimeS: number;
  selectedRunId: string | null;
  routingStrategy: RoutingStrategy;

  selectExampleScenario: (id: string) => void;
  setUploadedScenario: (scenario: Scenario) => void;
  setSelectedClientId: (id: string | null) => void;
  setSelectedTimeS: (t: number) => void;
  setSelectedRunId: (id: string | null) => void;
  setRoutingStrategy: (strategy: RoutingStrategy) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedScenarioId: "01_full_constellation",
  uploadedScenario: null,
  selectedClientId: null,
  selectedTimeS: 0,
  selectedRunId: null,
  routingStrategy: "minimum_hops",

  // Picking a bundled example clears any uploaded scenario — only one can
  // be "active" (about to run) at a time.
  selectExampleScenario: (id) => set({ selectedScenarioId: id, uploadedScenario: null }),
  setUploadedScenario: (scenario) => set({ uploadedScenario: scenario }),
  setSelectedClientId: (id) => set({ selectedClientId: id }),
  setSelectedTimeS: (t) => set({ selectedTimeS: t }),
  setSelectedRunId: (id) => set({ selectedRunId: id }),
  setRoutingStrategy: (strategy) => set({ routingStrategy: strategy }),
}));
