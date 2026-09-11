import { create } from "zustand";

import type { Scenario } from "@/types/scenario";
import type { RoutingStrategy } from "@/types/simulation";

export type EarthMode = "atlas" | "network" | "night";
export type PlaybackSpeed = 0.5 | 1 | 2 | 4;

export interface VisualizationLayers {
  satellites: boolean;
  isl: boolean;
  groundLinks: boolean;
  route: boolean;
  showInactive: boolean;
  orbitPlanes: boolean;
}

interface AppState {
  selectedScenarioId: string;
  uploadedScenario: Scenario | null;
  selectedClientId: string | null;
  selectedTimeS: number;
  selectedRunId: string | null;
  routingStrategy: RoutingStrategy;

  // Visualization workspace state — purely presentational, never sent to
  // the backend and never affects calculation.
  earthMode: EarthMode;
  layers: VisualizationLayers;
  selectedSatelliteId: string | null;
  playbackSpeed: PlaybackSpeed;
  calculationInspectorOpen: boolean;
  summaryOpen: boolean;
  /** Bumped to ask the globe to fly to the northern ground sites (see GlobeView). */
  focusNorthernSitesToken: number;

  selectExampleScenario: (id: string) => void;
  setUploadedScenario: (scenario: Scenario) => void;
  setSelectedClientId: (id: string | null) => void;
  setSelectedTimeS: (t: number) => void;
  setSelectedRunId: (id: string | null) => void;
  setRoutingStrategy: (strategy: RoutingStrategy) => void;

  setEarthMode: (mode: EarthMode) => void;
  toggleLayer: (layer: keyof VisualizationLayers) => void;
  setSelectedSatelliteId: (id: string | null) => void;
  setPlaybackSpeed: (speed: PlaybackSpeed) => void;
  setCalculationInspectorOpen: (open: boolean) => void;
  setSummaryOpen: (open: boolean) => void;
  requestFocusNorthernSites: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedScenarioId: "01_full_constellation",
  uploadedScenario: null,
  selectedClientId: null,
  selectedTimeS: 0,
  selectedRunId: null,
  routingStrategy: "minimum_hops",

  earthMode: "network",
  layers: {
    satellites: true,
    isl: true,
    groundLinks: true,
    route: true,
    showInactive: false,
    orbitPlanes: false,
  },
  selectedSatelliteId: null,
  playbackSpeed: 1,
  calculationInspectorOpen: false,
  summaryOpen: false,
  focusNorthernSitesToken: 0,

  // Picking a bundled example clears any uploaded scenario — only one can
  // be "active" (about to run) at a time.
  selectExampleScenario: (id) => set({ selectedScenarioId: id, uploadedScenario: null }),
  setUploadedScenario: (scenario) => set({ uploadedScenario: scenario }),
  setSelectedClientId: (id) => set({ selectedClientId: id, selectedSatelliteId: null }),
  setSelectedTimeS: (t) => set({ selectedTimeS: t }),
  setSelectedRunId: (id) => set({ selectedRunId: id }),
  setRoutingStrategy: (strategy) => set({ routingStrategy: strategy }),

  setEarthMode: (mode) => set({ earthMode: mode }),
  toggleLayer: (layer) =>
    set((s) => ({ layers: { ...s.layers, [layer]: !s.layers[layer] } })),
  setSelectedSatelliteId: (id) => set({ selectedSatelliteId: id }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  setCalculationInspectorOpen: (open) => set({ calculationInspectorOpen: open }),
  setSummaryOpen: (open) => set({ summaryOpen: open }),
  requestFocusNorthernSites: () =>
    set((s) => ({ focusNorthernSitesToken: s.focusNorthernSitesToken + 1 })),
}));
